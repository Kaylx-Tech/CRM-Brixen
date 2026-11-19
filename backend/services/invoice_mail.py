"""Invoice payment emails — mirrors app.py send_payment_details behaviour.

Payment request (bank details): only when staff click Send.
Payment received thank-you: when staff click Send on a paid invoice, and on its own when an invoice becomes
Paid (send_payment_received_later), naming the amount, date and method of the payment.
Recipient: order owner_form_email, then client email.
"""
from __future__ import annotations

import datetime
from html import escape as html_escape

from db import query_db
from services.email_service import send_email
from services import email_engine as eng
from services.portal_compat import brand_settings

INVOICE_BANK_GBP = {
    'currency': 'GBP',
    'account_name': 'Brixen Consultants LTD',
    'account_number': '01108984',
    'sort_code': '04-19-19',
    # Card payment link (Stripe, to come); empty = no "Pay now" button on the invoice PDF or client portal
    'pay_url': '',
}
INVOICE_BANK_PKR = {
    'currency': 'PKR',
    'account_name': 'BRIXEN CONSULTANTS',
    'bank_name': 'UBL',
    'iban': 'PK42UNIL0109000343170125',
}

PAYMENT_REQUEST_COPY = (
    'Thank you for your order with Brixen Consultants.\n\n'
    'Your invoice details are below.\n\n'
    'You can pay by card, or by bank transfer using the GBP or PKR details below.'
)


def _money(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _format_gbp(amount):
    return f"£{_money(amount):,.2f}"


def _greeting_name(invoice, order=None):
    for candidate in (
        (order or {}).get('owner_name'),
        invoice.get('client_name'),
        (order or {}).get('client_name'),
    ):
        text = str(candidate or '').strip()
        if not text:
            continue
        # First name only for greeting
        return text.split()[0]
    return 'there'


def _recipient_email(invoice, order=None):
    for candidate in (
        (order or {}).get('owner_form_email'),
        invoice.get('owner_form_email'),
        invoice.get('client_email'),
        (order or {}).get('client_email'),
        (order or {}).get('email'),
    ):
        email = str(candidate or '').strip().lower()
        if email and '@' in email and not email.endswith('@brixen-pending.local'):
            return email
    return ''


def _load_invoice_context(invoice_id):
    row = query_db(
        """
        SELECT i.*,
               u.full_name as client_name, u.email as client_email,
               o.order_number, o.service_name, o.owner_name, o.owner_form_email,
               o.user_id as order_user_id
        FROM invoices i
        LEFT JOIN users u ON i.user_id = u.id
        LEFT JOIN orders o ON i.order_id = o.id
        WHERE i.id = ?
        LIMIT 1;
        """,
        (invoice_id,),
        one=True,
    )
    if not row:
        return None, None
    invoice = dict(row)
    order = {
        'id': invoice.get('order_id'),
        'order_number': invoice.get('order_number'),
        'service_name': invoice.get('service_name'),
        'owner_name': invoice.get('owner_name'),
        'owner_form_email': invoice.get('owner_form_email'),
        'client_name': invoice.get('client_name'),
        'client_email': invoice.get('client_email'),
        'email': invoice.get('client_email'),
    }
    return invoice, order


def invoice_send_email_kind(invoice):
    """Same rules as app.py invoice_send_email_kind (without received_more)."""
    total = _money(invoice.get('total') or invoice.get('amount'))
    paid = _money(invoice.get('amount_paid'))
    status = str(invoice.get('status') or '')
    due = max(total - paid, 0.0)
    if due <= 0.004 and status == 'Paid':
        return 'payment_received'
    if status == 'Paid':
        return 'payment_received'
    return 'payment_requested'


def _rows_html(rows):
    bits = []
    for label, value in rows:
        bits.append(
            f'<tr>'
            f'<td style="padding:6px 0;color:#6e6e73;font-size:14px;vertical-align:top;">{html_escape(str(label))}</td>'
            f'<td style="padding:6px 0 6px 16px;color:#1d1d1f;font-size:14px;font-weight:500;text-align:right;">'
            f'{html_escape(str(value))}</td>'
            f'</tr>'
        )
    return (
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
        'style="width:100%;border-collapse:collapse;margin:12px 0 0;">'
        + ''.join(bits)
        + '</table>'
    )


def _section_html(title, rows):
    return (
        f'<div style="margin:20px 0 0;padding:16px 18px;background:#f5f5f7;border-radius:12px;">'
        f'<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.04em;'
        f'text-transform:uppercase;color:#003971;">{html_escape(title)}</p>'
        f'{_rows_html(rows)}'
        f'</div>'
    )


def _invoice_pdf(invoice_id):
    """The invoice PDF as an email attachment [(filename, bytes, 'pdf')], or [] when it cannot be made (the email
    still goes, with the invoice in its text)."""
    try:
        from services.invoice_document import document_payload, download_filename, render_pdf
        payload = document_payload(invoice_id)
        if not payload:
            return []
        number = str(payload['invoice'].get('invoice_number') or f"INV-{invoice_id}")
        return [(download_filename(number), render_pdf(payload), 'pdf')]
    except Exception as exc:
        print(f"[Invoice mail] PDF for invoice #{invoice_id} not attached: {exc}")
        return []


def _invoice_document_html(invoice_id, *, include_pay):
    """The whole invoice inside the email (as on the PDF), so nothing needs downloading: number, dates, billed
    to, every product, the totals, the payments received, then how to pay. (html, text) or (None, None)."""
    try:
        from services.invoice_document import document_payload
        p = document_payload(invoice_id)
    except Exception as exc:
        print(f"[Invoice mail] invoice #{invoice_id}: {exc}")
        return None, None
    if not p:
        return None, None
    inv = p['invoice']
    esc = html_escape
    cell = 'padding:7px 0;font-size:14px;line-height:1.4;color:#1d1d1f;border-bottom:1px solid #e5e5ea;'
    head = 'padding:0 0 6px;font-size:12px;color:#6e6e73;font-weight:600;border-bottom:1px solid #e5e5ea;'

    facts = [('Invoice Number', inv.get('invoice_number')), ('Invoice Date', p.get('invoice_date')),
             ('Due Date', p.get('due_date')), ('Order', inv.get('order_number'))]
    facts_html = ''.join(
        f'<td style="padding:0 12px 0 0;vertical-align:top;"><p style="margin:0;font-size:11px;color:#6e6e73;">'
        f'{esc(k)}</p><p style="margin:2px 0 0;font-size:14px;font-weight:600;color:#1d1d1f;">{esc(str(v))}</p></td>'
        for k, v in facts if v)
    billed = []
    for field in (p.get('owner_name'), p.get('company_name'), p.get('company_address'), p.get('owner_email')):
        text = str(field or '').strip()
        if text and text not in billed:
            billed.append(text)
    billed_html = (f'<p style="margin:14px 0 0;font-size:11px;color:#6e6e73;">Billed To</p>'
                   f'<p style="margin:2px 0 0;font-size:14px;line-height:1.45;color:#1d1d1f;">'
                   f'{"<br>".join(esc(b) for b in billed)}</p>') if billed else ''

    items_html = ''.join(
        f'<tr><td style="{cell}">{esc(str(i.get("description") or ""))}</td>'
        f'<td style="{cell}text-align:center;width:40px;">{esc(str(i.get("quantity") or 1))}</td>'
        f'<td style="{cell}text-align:right;width:90px;white-space:nowrap;">£{float(i.get("amount") or 0):,.2f}</td></tr>'
        for i in p.get('line_items') or [])
    totals = [('Subtotal', p['total_display'], False)]
    paid_before = float(inv.get('amount_paid') or 0) > 0.004 or p.get('payments')
    if paid_before:
        totals.append(('Paid', f"-{p['paid_display']}", False))
    totals.append(('Amount Due', p['amount_due_display'], True))
    totals_html = ''.join(
        f'<tr><td style="padding:{8 if strong else 4}px 0 0;font-size:{15 if strong else 14}px;'
        f'color:{"#1d1d1f" if strong else "#6e6e73"};font-weight:{700 if strong else 400};text-align:right;">{esc(k)}</td>'
        f'<td style="padding:{8 if strong else 4}px 0 0 16px;font-size:{15 if strong else 14}px;color:#1d1d1f;'
        f'font-weight:{700 if strong else 500};text-align:right;width:90px;white-space:nowrap;">{esc(v)}</td></tr>'
        for k, v, strong in totals)
    pays = p.get('payments') or []
    pays_html = ''
    if pays:
        pays_html = (f'<p style="margin:16px 0 4px;font-size:12px;color:#6e6e73;font-weight:600;">Payments Received</p>'
                     + ''.join(f'<p style="margin:2px 0;font-size:13px;color:#1d1d1f;">{esc(x["date"])} · '
                               f'{esc(x["method"] or "Payment")} · {esc(x["amount"])}</p>' for x in pays))
    status = 'Paid' if p.get('paid') else 'Part Paid' if p.get('part_paid') else 'Due'
    colour = {'Paid': ('#e8f5ec', '#248a3d'), 'Part Paid': ('#fff4de', '#b26800'), 'Due': ('#e6f0ff', '#0066cc')}[status]
    html = (
        f'<div style="margin:20px 0 0;padding:18px 18px 16px;background:#f5f5f7;border-radius:12px;">'
        f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>'
        f'<td style="vertical-align:middle;"><span style="font-size:20px;font-weight:700;color:#1d1d1f;">Invoice</span>'
        f'<span style="display:inline-block;margin-left:8px;padding:2px 10px;border-radius:999px;font-size:12px;'
        f'font-weight:700;background:{colour[0]};color:{colour[1]};">{status}</span></td>'
        f'<td style="text-align:right;vertical-align:middle;font-size:20px;font-weight:700;color:#1d1d1f;">'
        f'{esc(p["total_display"] if p.get("paid") else p["amount_due_display"])}</td></tr></table>'
        f'<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:14px 0 0;"><tr>'
        f'{facts_html}</tr></table>{billed_html}'
        f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
        f'style="width:100%;border-collapse:collapse;margin:18px 0 0;">'
        f'<tr><td style="{head}">Description</td><td style="{head}text-align:center;">Qty</td>'
        f'<td style="{head}text-align:right;">Amount</td></tr>{items_html}</table>'
        f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 0;">'
        f'{totals_html}</table>{pays_html}</div>'
    )
    text = ['', f"Invoice {inv.get('invoice_number') or ''} ({status})"]
    text += [f"{k}: {v}" for k, v in facts if v]
    text += [f"- {i.get('description')} x{i.get('quantity') or 1}: £{float(i.get('amount') or 0):,.2f}"
             for i in p.get('line_items') or []]
    text += [f"{k}: {v}" for k, v, _ in totals]

    if include_pay and not p.get('paid'):
        if p.get('pay_url'):
            html += (f'<p style="margin:20px 0 0;"><a href="{esc(p["pay_url"])}" '
                     'style="display:inline-block;padding:10px 22px;background:#003971;color:#ffffff;'
                     'text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;line-height:1.3;">'
                     'Pay by Card</a></p>'
                     '<p style="margin:6px 0 0;font-size:12px;line-height:1.45;color:#6e6e73;">'
                     'Secure card payment by Stripe. Or pay by bank transfer below.</p>')
            text += ['', f"Pay by card: {p['pay_url']}"]
        gbp, pkr = INVOICE_BANK_GBP, INVOICE_BANK_PKR
        html += _section_html('Pay in GBP', [('Account Name', gbp['account_name']),
                                            ('Account Number', gbp['account_number']), ('Sort Code', gbp['sort_code'])])
        html += _section_html('Pay in PKR', [('Account Name', pkr['account_name']), ('Bank Name', pkr['bank_name']),
                                            ('IBAN', pkr['iban'])])
        fx = p.get('pakistan_fx') or {}
        if fx.get('math'):
            html += (f'<p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#1d1d1f;">'
                     f'<strong>From Pakistan:</strong> {esc(fx["math"])}. Send {esc(fx["pkr_display"])} to the UBL '
                     f'account ({esc(fx["gbp_display"])} at today\'s GBP to PKR rate).</p>')
        text += ['', f"Pay in GBP: {gbp['account_name']}, account {gbp['account_number']}, sort code {gbp['sort_code']}",
                 f"Pay in PKR: {pkr['account_name']}, {pkr['bank_name']}, IBAN {pkr['iban']}"]
    return html, '\n'.join(text)


def _build_sections(invoice, order, *, include_bank):
    invoice_number = str(invoice.get('invoice_number') or '').strip()
    service = str(order.get('service_name') or 'Your order').strip()
    number = str(order.get('order_number') or '').strip()

    summary = []
    if invoice_number:
        summary.append(('Invoice', invoice_number))
    if service:
        summary.append(('Service', service))
    if number:
        summary.append(('Order', number))

    sections = [_section_html('Invoice', summary)]
    if include_bank:
        # Pay by card (Stripe Checkout for what is due), above the bank details
        card_url = None
        try:
            from services.invoice_card import pay_link
            card_url = pay_link(invoice['id']) if invoice.get('id') else None
        except Exception:
            card_url = None
        if card_url:
            sections.append(
                f'<p style="margin:20px 0 0;"><a href="{html_escape(card_url)}" '
                'style="display:inline-block;padding:10px 22px;background:#003971;color:#ffffff;'
                'text-decoration:none;border-radius:999px;font-size:14px;font-weight:600;line-height:1.3;">'
                'Pay by Card</a></p>'
                '<p style="margin:6px 0 0;font-size:12px;line-height:1.45;color:#6e6e73;">'
                'Secure card payment by Stripe. Or pay by bank transfer below.</p>')
        gbp = INVOICE_BANK_GBP
        pkr = INVOICE_BANK_PKR
        sections.append(_section_html('Pay in GBP', [
            ('Account name', gbp['account_name']),
            ('Account number', gbp['account_number']),
            ('Sort code', gbp['sort_code']),
        ]))
        sections.append(_section_html('Pay in PKR', [
            ('Account name', pkr['account_name']),
            ('Bank name', pkr['bank_name']),
            ('IBAN', pkr['iban']),
        ]))
    return ''.join(sections)


def _compose_email(*, subject, greeting, intro, sections_html, category, extra_text=''):
    brand = brand_settings()
    brand_for_sig = {
        **brand,
        'legal_name': brand.get('legal_name') or 'Brixen Consultants Ltd',
    }
    intro_html = html_escape(intro).replace('\n', '<br>')
    body_inner = (
        f'<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#1d1d1f;">'
        f'Hello {html_escape(greeting)},</p>'
        f'<p style="margin:0;font-size:15px;line-height:1.55;color:#424245;">{intro_html}</p>'
        f'{sections_html}'
    )
    head = (
        f'<head><meta charset="utf-8"><title>{html_escape(subject)}</title></head>'
    )
    hero = eng.email_brand_header_html(brand, subject.split(" — ")[0])
    disclaimer = eng.category_disclaimer(category)
    html = eng.build_transactional_shell_html(
        subject=subject,
        head_html=head,
        hero_html=hero,
        body_inner_html=body_inner,
        signature_html=eng.email_signature_html(brand_for_sig),
        disclaimer_html=eng.email_disclaimer_html(disclaimer),
    )
    text = f"Hello {greeting},\n\n{intro}\n\n{subject}\n{extra_text}"
    return subject, text, html


def send_payment_requested(invoice, order):
    total = _money(invoice.get('total') or invoice.get('amount'))
    paid = _money(invoice.get('amount_paid'))
    due = max(total - paid, 0.0)
    if due <= 0.004:
        return {'email_sent': False, 'email_status': 'Nothing due'}

    to = _recipient_email(invoice, order)
    if not to:
        return {'email_sent': False, 'email_status': 'No recipient email'}

    company = brand_settings().get('company_name') or 'Brixen Consultants'
    invoice_number = str(invoice.get('invoice_number') or '').strip()
    order_number = str(order.get('order_number') or '').strip()
    if invoice_number:
        subject = f"Invoice {invoice_number} — {company}"
    elif order_number:
        subject = f"Invoice {order_number} — {company}"
    else:
        subject = f"Invoice — {company}"

    # The whole invoice in the email (products, totals, how to pay): no PDF to download
    doc_html, doc_text = _invoice_document_html(invoice.get('id'), include_pay=True)
    subject, text, html = _compose_email(
        subject=subject,
        greeting=_greeting_name(invoice, order),
        intro=PAYMENT_REQUEST_COPY,
        sections_html=doc_html or _build_sections(invoice, order, include_bank=True),
        category='INVOICE',
        extra_text=doc_text or '',
    )
    ok = send_email(to, subject, html, text_content=text, category='INVOICE',
                    user_id=invoice.get('user_id'), order_id=invoice.get('order_id'),
                    attachments=_invoice_pdf(invoice.get('id')))
    return {
        'email_sent': bool(ok),
        'email_status': 'sent' if ok else 'SMTP send failed or not configured',
        'email_to': to,
        'kind': 'payment_requested',
    }


def _payment_date(invoice):
    """"1 November 2026" from paid_at (today when it is missing). No %-d: it fails on Windows."""
    raw = str(invoice.get('paid_at') or '').strip()
    try:
        when = datetime.datetime.strptime(raw[:10], '%Y-%m-%d') if raw else datetime.datetime.now()
    except ValueError:
        when = datetime.datetime.now()
    return f"{when.day} {when.strftime('%B %Y')}"


def _payment_rows(invoice, paid, due):
    rows = [('Amount received', _format_gbp(paid)), ('Received on', _payment_date(invoice))]
    method = str(invoice.get('payment_method') or '').strip()
    if method:
        rows.append(('Payment method', method))
    rows.append(('Balance', _format_gbp(due) + ' still due' if due > 0.004 else 'Nothing left to pay'))
    return rows


def send_payment_received(invoice, order):
    to = _recipient_email(invoice, order)
    if not to:
        return {'email_sent': False, 'email_status': 'No recipient email'}

    total = _money(invoice.get('total') or invoice.get('amount'))
    paid = _money(invoice.get('amount_paid')) or total
    due = max(total - paid, 0.0)

    company = brand_settings().get('company_name') or 'Brixen Consultants'
    invoice_number = str(invoice.get('invoice_number') or '').strip()
    order_number = str(order.get('order_number') or '').strip()
    service = str(order.get('service_name') or '').strip()
    ref = invoice_number or order_number or service or 'invoice'

    if due > 0.004:
        title = 'Deposit received'
        intro = (
            f'Thank you for your payment of {_format_gbp(paid)} towards invoice {ref}. '
            f'Your deposit is in; the remaining {_format_gbp(due)} is due when the work is done.'
        )
    else:
        title = 'Thank you for your payment'
        intro = (
            f'Thank you for your payment of {_format_gbp(paid)}. We’ve received the full amount for '
            f'invoice {ref}, so it is now fully paid. The payment details are below for your records.'
        )
    subject = f"{title} — {ref} — {company}"

    # The paid invoice in the email (products, payments received)
    doc_html, doc_text = _invoice_document_html(invoice.get('id'), include_pay=False)
    subject, text, html = _compose_email(
        subject=subject,
        greeting=_greeting_name(invoice, order),
        intro=intro,
        sections_html=doc_html or (
            _build_sections(invoice, order, include_bank=False)
            + _section_html('Payment', _payment_rows(invoice, paid, due))
        ),
        category='PAYMENT',
        extra_text=doc_text or '',
    )
    ok = send_email(to, subject, html, text_content=text, category='INVOICE',
                    user_id=invoice.get('user_id'), order_id=invoice.get('order_id'),
                    attachments=_invoice_pdf(invoice.get('id')))
    return {
        'email_sent': bool(ok),
        'email_status': 'sent' if ok else 'SMTP send failed or not configured',
        'email_to': to,
        'kind': 'payment_received',
    }


def send_invoice_email(invoice_id):
    """Explicit staff Send — same gate as app.py send_payment_details."""
    invoice, order = _load_invoice_context(invoice_id)
    if not invoice:
        return {'email_sent': False, 'email_status': 'Invoice not found'}
    if str(invoice.get('status') or '') == 'Cancelled':
        return {'email_sent': False, 'email_status': 'Cancelled invoices are not emailed'}
    if not invoice.get('order_id'):
        return {'email_sent': False, 'email_status': 'Invoice has no linked order'}

    kind = invoice_send_email_kind(invoice)
    if kind == 'payment_received':
        return send_payment_received(invoice, order)
    return send_payment_requested(invoice, order)


def send_payment_received_later(invoice_id):
    """The thank-you for a payment, sent in the background when an invoice becomes Paid (by staff, the
    website or Stripe), so marking it paid does not wait for the email server."""
    if not invoice_id:
        return
    try:
        from tenancy import run_in_thread  # Finstap: keep the request's workspace database
    except ImportError:
        import threading

        def run_in_thread(target, *args):
            threading.Thread(target=target, args=args, daemon=True).start()

    def _send(iid):
        try:
            invoice, order = _load_invoice_context(iid)
            if invoice and invoice.get('order_id') and str(invoice.get('status') or '') == 'Paid':
                send_payment_received(invoice, order)
        except Exception as exc:  # emails must never break anything
            print(f"[Invoice mail] Payment received for invoice #{iid}: {exc}")

    run_in_thread(_send, invoice_id)
