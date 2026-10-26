"""Invoice payment emails — mirrors app.py send_payment_details behaviour.

Staff must explicitly click Send. Pending / due → payment request (bank details).
Paid / nothing due → payment received thank-you.
Recipient: order owner_form_email, then client email.
"""
from __future__ import annotations

from html import escape as html_escape

from db import query_db
from services.email_service import send_email
from services import email_engine as eng
from services.portal_compat import brand_name, brand_settings

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

def payment_methods():
    """How invoices say to pay: ('custom', text) from Settings > Payment details on invoices,
    ('brixen', '') Brixen's own bank accounts (Brixen's database only), or ('none', '') for a Finstap company
    that has not added its details yet. A Finstap company never sees Brixen's bank accounts."""
    from services.settings_service import get_setting
    from services.portal_compat import _workspace_name
    text = str(get_setting('invoice_payment_details') or '').strip()
    if text or invoice_accounts() or invoice_links():
        return 'custom', text
    return ('none', '') if _workspace_name() else ('brixen', '')


def invoice_accounts():
    """Settings > Invoices bank accounts, one per country: [{country, currency, fields: [{label, value}]}]."""
    from services.settings_service import invoice_list
    return invoice_list('invoice_bank_accounts')


def invoice_links():
    """Settings > Invoices links (payment page, website, terms…): [{label, url}]."""
    from services.settings_service import invoice_list
    return invoice_list('invoice_links')


def account_title(account):
    """'United Kingdom (GBP)' heading for a saved bank account."""
    currency = account.get('currency')
    return f"{account['country']} ({currency})" if currency else account['country']


def company_logo():
    """The company's logo for the invoice PDF (email_engine.company_logo_image)."""
    return eng.company_logo_image()


def button_colours():
    """(fill, text) hex colours of pay buttons: the company's accent colour (Brixen navy otherwise)."""
    accent = eng.brand_accent()
    return accent, eng.text_on(accent)


def payment_request_copy(attached=False):
    if attached:
        # Short email: the bank details are in the attached PDF
        return f'Thank you for your order with {brand_name()}. Your invoice is attached.'
    mode, _text = payment_methods()
    lines = [f'Thank you for your order with {brand_name()}.', '', 'Your invoice details are below.']
    if mode == 'brixen':
        lines += ['', 'You may settle this invoice using either the GBP or PKR payment details provided below.']
    elif mode == 'custom':
        lines += ['', 'Payment details are below.']
    return '\n'.join(lines)


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
        f'text-transform:uppercase;color:{eng.brand_accent()};">{html_escape(title)}</p>'
        f'{_rows_html(rows)}'
        f'</div>'
    )


def invoice_view_url(invoice_id):
    """The "View invoice" link: in a Finstap workspace a private no-login link to this invoice's PDF
    (services/invoice_share.py), in Brixen the client portal's invoices; '' when unknown."""
    from tenancy import current_tenant, workspace_url
    from services.portal_compat import _workspace_name, portal_base_url
    if _workspace_name():
        slug = (current_tenant() or {}).get('slug')
        if not workspace_url(slug):
            return ''
        from services.invoice_share import create_share_token
        return workspace_url(slug, f'/invoice/{create_share_token(invoice_id)}')
    base = portal_base_url()
    return f'{base}/portal/invoices' if base else ''


def _links_html(links):
    """Links as glossy pill buttons in the company's colour (the same buttons as every email)."""
    return eng.email_buttons_html([(link['url'], link['label']) for link in links])


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
    mode, text = payment_methods()
    if include_bank and mode == 'custom':
        # Settings > Invoices: each country's bank account, the free-text notes, then the links
        accounts = invoice_accounts()
        for account in accounts:
            sections.append(_section_html(f"Pay in {account_title(account)}",
                                          [(f['label'], f['value']) for f in account['fields']]))
        if text:
            sections.append(_section_html('Other payment notes' if accounts else 'How to pay', [
                (line.split(':', 1)[0].strip(), line.split(':', 1)[1].strip()) if ':' in line else ('', line.strip())
                for line in text.splitlines() if line.strip()
            ]))
        links = invoice_links()
        if links:
            sections.append(_links_html(links))
    elif include_bank and mode == 'brixen':
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


def _invoice_pdf(invoice):
    """(filename, pdf bytes, document payload) to attach, or None when the PDF cannot be drawn."""
    try:
        from services.invoice_document import document_payload, download_filename, render_pdf
        payload = document_payload(invoice['id'])
        if not payload:
            return None
        number = str(payload['invoice'].get('invoice_number') or f"INV-{invoice['id']}")
        return download_filename(number), render_pdf(payload), payload
    except Exception as exc:
        print(f"[Invoice Mail] Could not attach the invoice PDF: {exc}")
        return None


def _short_sections(invoice, order, payload):
    """Short payment email: invoice, amount due and the pay links; bank details stay in the attached PDF."""
    rows = [('Invoice', str(invoice.get('invoice_number') or '').strip()),
            ('Service', str(order.get('service_name') or '').strip()),
            ('Amount due', payload.get('amount_due_display') or '')]
    sections = [_section_html('Invoice', [(label, value) for label, value in rows if value])]
    # One button to the client's invoices in the portal; pay links (Settings > Invoices) stay on the PDF
    mode, _text = payment_methods()
    view_url = invoice_view_url(invoice['id'])
    if view_url:
        sections.append(_links_html([{'label': 'View invoice', 'url': view_url}]))
    if mode != 'none':
        sections.append('<p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">'
                        'Bank details for payment are in the attached invoice (PDF).</p>')
    return ''.join(sections)


def _compose_email(*, subject, greeting, intro, sections_html, category):
    brand = brand_settings()
    brand_for_sig = {
        **brand,
        'legal_name': brand.get('legal_name') or brand.get('company_name'),
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
    # The company's logo above the headline (email_engine; email_service attaches the image)
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

    company = brand_name()
    invoice_number = str(invoice.get('invoice_number') or '').strip()
    order_number = str(order.get('order_number') or '').strip()
    if invoice_number:
        subject = f"Invoice {invoice_number} — {company}"
    elif order_number:
        subject = f"Invoice {order_number} — {company}"
    else:
        subject = f"Invoice — {company}"

    # The invoice PDF goes with the email; without it the email carries the full bank details
    pdf = _invoice_pdf(invoice)
    subject, text, html = _compose_email(
        subject=subject,
        greeting=_greeting_name(invoice, order),
        intro=payment_request_copy(attached=bool(pdf)),
        sections_html=(_short_sections(invoice, order, pdf[2]) if pdf
                       else _build_sections(invoice, order, include_bank=True)),
        category='INVOICE',
    )
    ok = send_email(to, subject, html, text_content=text, category='INVOICE',
                    user_id=invoice.get('user_id'), order_id=invoice.get('order_id'),
                    attachments=[(pdf[0], pdf[1], 'application/pdf')] if pdf else None)
    return {
        'email_sent': bool(ok),
        'email_status': 'sent' if ok else 'SMTP send failed or not configured',
        'email_to': to,
        'kind': 'payment_requested',
    }


def send_payment_received(invoice, order):
    to = _recipient_email(invoice, order)
    if not to:
        return {'email_sent': False, 'email_status': 'No recipient email'}

    total = _money(invoice.get('total') or invoice.get('amount'))
    paid = _money(invoice.get('amount_paid')) or total
    due = max(total - paid, 0.0)
    if due > 0.004:
        title = 'Deposit received'
        intro = (
            'Thank you. Your deposit is in. The remaining balance is due when the work is done.'
        )
    else:
        title = 'Thank you for your complete payment'
        intro = (
            'We’ve received the full amount for this invoice. Thank you — this payment is now complete.'
        )

    company = brand_name()
    invoice_number = str(invoice.get('invoice_number') or '').strip()
    order_number = str(order.get('order_number') or '').strip()
    service = str(order.get('service_name') or '').strip()
    ref = invoice_number or order_number or service or 'invoice'
    subject = f"{title} — {ref} — {company}"

    subject, text, html = _compose_email(
        subject=subject,
        greeting=_greeting_name(invoice, order),
        intro=intro,
        sections_html=_build_sections(invoice, order, include_bank=False),
        category='PAYMENT',
    )
    # The paid invoice goes with the thank-you as a receipt
    pdf = _invoice_pdf(invoice)
    ok = send_email(to, subject, html, text_content=text, category='INVOICE',
                    user_id=invoice.get('user_id'), order_id=invoice.get('order_id'),
                    attachments=[(pdf[0], pdf[1], 'application/pdf')] if pdf else None)
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
