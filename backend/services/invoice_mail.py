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
    'account_number': '32546658',
    'sort_code': '04-06-05',
    'pay_url': 'https://pay.tide.co/pay/f2dfe046-691c-49a5-8b58-340c6c23453c',
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
    'You may settle this invoice using either the GBP or PKR payment details provided below.'
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
            f'<td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">{html_escape(str(label))}</td>'
            f'<td style="padding:6px 0 6px 16px;color:#111827;font-size:13px;font-weight:600;text-align:right;">'
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
        f'<div style="margin:16px 0 0;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">'
        f'<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.04em;'
        f'text-transform:uppercase;color:#003971;">{html_escape(title)}</p>'
        f'{_rows_html(rows)}'
        f'</div>'
    )


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


def _compose_email(*, subject, greeting, intro, sections_html, category):
    brand = brand_settings()
    brand_for_sig = {
        **brand,
        'legal_name': brand.get('legal_name') or 'Brixen Consultants Ltd',
    }
    intro_html = html_escape(intro).replace('\n', '<br>')
    body_inner = (
        f'<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#111827;">'
        f'Hello {html_escape(greeting)},</p>'
        f'<p style="margin:0;font-size:15px;line-height:1.55;color:#374151;">{intro_html}</p>'
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
    text = f"Hello {greeting},\n\n{intro}\n\n{subject}\n"
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

    subject, text, html = _compose_email(
        subject=subject,
        greeting=_greeting_name(invoice, order),
        intro=PAYMENT_REQUEST_COPY,
        sections_html=_build_sections(invoice, order, include_bank=True),
        category='INVOICE',
    )
    ok = send_email(to, subject, html, text_content=text, category='INVOICE',
                    user_id=invoice.get('user_id'), order_id=invoice.get('order_id'))
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

    subject, text, html = _compose_email(
        subject=subject,
        greeting=_greeting_name(invoice, order),
        intro=intro,
        sections_html=(
            _build_sections(invoice, order, include_bank=False)
            + _section_html('Payment', _payment_rows(invoice, paid, due))
        ),
        category='PAYMENT',
    )
    ok = send_email(to, subject, html, text_content=text, category='INVOICE',
                    user_id=invoice.get('user_id'), order_id=invoice.get('order_id'))
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
