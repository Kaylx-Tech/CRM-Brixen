"""Invoice PDF (ported from app.py invoice_document_payload / render_invoice_document_pdf, Tide-style layout).

The PDF shows the Brixen company details, the bill-to block, the order's line items (re-scaled to the price
charged), totals, what was paid, and the GBP / PKR payment details. Customers paying from Pakistan also see the
amount in rupees at today's GBP -> PKR rate.
"""
from __future__ import annotations

import datetime
import json
import os
import re
import urllib.parse
import urllib.request

from db import query_db
from services.invoice_service import invoice_money_state
from services.invoice_mail import INVOICE_BANK_GBP, INVOICE_BANK_PKR, payment_methods
from services.portal_compat import _workspace_name, brand_settings

LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'static', 'img', 'brixen-logo.png')

# Brixen's registered company details, printed on Brixen's own invoices (app.py brand_settings)
COMPANY_DETAILS = {
    'legal_name': 'Brixen Consultants Ltd',
    'company_number': '17314564',
    'registered_office': '57 Wellesley Road, Ilford, United Kingdom, IG1 4JZ',
    'ico_number': 'ZB941411',
}


def company_details():
    """Who the invoice is from. A Finstap company: its own Settings (legal name, company number, registered
    office, ICO number); lines it has not filled in are left out. Brixen's database: Brixen's details."""
    if not _workspace_name():
        return dict(COMPANY_DETAILS)
    from services.settings_service import get_setting
    brand = brand_settings()
    return {
        'legal_name': brand.get('legal_name') or brand.get('company_name') or '',
        'company_number': get_setting('company_number') or '',
        'registered_office': get_setting('registered_office') or '',
        'ico_number': get_setting('ico_number') or '',
    }

_PAKISTAN_RE = re.compile(
    r'\b(pakistan|pakistani|islamabad|lahore|karachi|rawalpindi|faisalabad|peshawar|'
    r'multan|quetta|sialkot|gujranwala|hyderabad|punjab|sindh|balochistan)\b', re.I)
_FX_CACHE = {'rate': None, 'fetched_at': 0.0}


def format_money(amount):
    try:
        value = float(amount or 0)
    except (TypeError, ValueError):
        value = 0.0
    return f"£{value:,.2f}"


def format_uk_date(raw):
    text = str(raw or '').strip()
    if not text:
        return datetime.date.today().strftime('%d/%m/%Y')
    for candidate, fmt in ((text[:19], '%Y-%m-%d %H:%M:%S'), (text[:10], '%Y-%m-%d'), (text[:10], '%d/%m/%Y')):
        try:
            return datetime.datetime.strptime(candidate, fmt).strftime('%d/%m/%Y')
        except ValueError:
            continue
    return text


def _phone_display(brand):
    digits = re.sub(r'\D', '', str((brand or {}).get('support_phone') or ''))
    return f"+{digits}" if digits else ''


def download_filename(invoice_number):
    return f"Invoice {invoice_number}.pdf"


def load_invoice(invoice_id):
    row = query_db("""
        SELECT i.*, o.order_number, o.service_name, o.company_id, o.owner_name, o.owner_form_email,
               o.price AS order_price, o.total AS order_total,
               c.name AS company_name, c.reg_office AS company_address,
               u.full_name AS client_name, u.email AS client_email, u.country AS client_country,
               u.address AS client_address,
               (SELECT co.address FROM company_owners co WHERE co.order_id = o.id LIMIT 1) AS owner_address,
               (SELECT co.nationality FROM company_owners co WHERE co.order_id = o.id LIMIT 1) AS owner_nationality
        FROM invoices i
        LEFT JOIN orders o ON o.id = i.order_id
        LEFT JOIN companies c ON c.id = o.company_id
        LEFT JOIN users u ON u.id = i.user_id
        WHERE i.id = ? LIMIT 1;
    """, (invoice_id,), one=True)
    return dict(row) if row else None


def _looks_like_pakistan(value):
    text = str(value or '').strip()
    if not text:
        return False
    if text.lower() in ('pk', 'pak', 'pakistan', 'islamic republic of pakistan'):
        return True
    return bool(_PAKISTAN_RE.search(text))


def client_is_in_pakistan(invoice):
    if str(invoice.get('payment_method') or '').startswith('PKR'):
        return True
    return any(_looks_like_pakistan(invoice.get(k)) for k in
               ('client_country', 'client_address', 'owner_address', 'owner_nationality'))


def gbp_to_pkr_rate():
    now = datetime.datetime.now().timestamp()
    if _FX_CACHE['rate'] and now - _FX_CACHE['fetched_at'] < 3600:
        return _FX_CACHE['rate']
    for url in ('https://open.er-api.com/v6/latest/GBP', 'https://api.exchangerate.host/latest?base=GBP&symbols=PKR'):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'BrixenConsultantsCRM/1.0'})
            with urllib.request.urlopen(req, timeout=4) as resp:
                rate = float((json.loads(resp.read().decode('utf-8')).get('rates') or {}).get('PKR') or 0)
            if rate > 50:
                _FX_CACHE.update(rate=round(rate, 4), fetched_at=now)
                return _FX_CACHE['rate']
        except Exception:
            continue
    return _FX_CACHE['rate']


def pakistan_fx_note(pounds):
    rate = gbp_to_pkr_rate()
    try:
        gbp = float(pounds or 0)
    except (TypeError, ValueError):
        gbp = 0.0
    if not rate or gbp <= 0:
        return None
    rupees = round(gbp * float(rate), 2)
    return {
        'gbp_display': format_money(gbp),
        'pkr_display': f"Rs {rupees:,.2f}",
        'math': f"{format_money(gbp)} x {float(rate):,.2f} = Rs {rupees:,.2f}",
    }


def _charged_total(invoice):
    for key in ('total', 'amount', 'order_total', 'order_price'):
        raw = invoice.get(key)
        if raw not in (None, ''):
            try:
                return round(float(raw), 2)
            except (TypeError, ValueError):
                continue
    return 0.0


def _reconcile(items, charged):
    """Scale the line amounts so they add up to the price charged on the order (app.py parity)."""
    current = round(sum(float(i.get('amount') or 0) for i in items), 2)
    if not items or abs(current - charged) < 0.02:
        return items
    remaining = charged
    for index, item in enumerate(items):
        qty = int(item.get('quantity') or 1) or 1
        if index == len(items) - 1 or current <= 0.004:
            amount = remaining
        else:
            amount = round(charged * (float(item.get('amount') or 0) / current), 2)
            remaining = round(remaining - amount, 2)
        item['amount'] = amount
        item['unit_price'] = round(amount / qty, 2)
    return items


def line_items(invoice):
    rows = []
    if invoice.get('order_id'):
        rows = query_db("""
            SELECT product_name, quantity, unit_price, line_total FROM order_line_items
            WHERE order_id = ? ORDER BY sort_order ASC, id ASC;
        """, (invoice['order_id'],)) or []
    items = []
    for r in rows:
        name = str(r.get('product_name') or '').strip()
        if not name:
            continue
        qty = int(r.get('quantity') or 1) or 1
        amount = r.get('line_total')
        if amount is None and r.get('unit_price') is not None:
            amount = float(r.get('unit_price') or 0) * qty
        items.append({'description': name, 'quantity': qty, 'unit_price': r.get('unit_price'),
                      'amount': float(amount or 0)})
    charged = _charged_total(invoice)
    if not items:
        name = str(invoice.get('service_name') or 'Professional services').strip() or 'Professional services'
        return [{'description': name, 'quantity': 1, 'unit_price': charged, 'amount': charged}]
    return _reconcile(items, charged)


def document_payload(invoice_id):
    invoice = load_invoice(invoice_id)
    if not invoice:
        return None
    money = invoice_money_state(invoice)
    fx_pounds = money['amount_due'] if money['amount_due'] > 0.004 else money['total']
    return {
        'invoice': invoice,
        'brand': {**brand_settings(), **company_details()},
        'own_logo': not _workspace_name(),
        'owner_name': invoice.get('owner_name') or invoice.get('client_name') or '',
        'owner_email': invoice.get('owner_form_email') or invoice.get('client_email') or '',
        'company_name': invoice.get('company_name') or '',
        'company_address': invoice.get('company_address') or '',
        'line_items': line_items(invoice),
        'total_display': format_money(money['total']),
        'paid_display': format_money(money['amount_paid']),
        'amount_due_display': format_money(money['amount_due']),
        'deposit_display': (format_money(money['deposit_amount'])
                            if money['timing'] == 'Deposit' and money['deposit_amount'] else ''),
        'timing': money['timing'],
        'invoice_date': format_uk_date(invoice.get('created_at')),
        'paid': money['amount_due'] <= 0.004 and money['status'] == 'Paid',
        'part_paid': money['display_status'] == 'Partial Paid',
        'pakistan_fx': pakistan_fx_note(fx_pounds) if client_is_in_pakistan(invoice) else None,
    }


def render_pdf(payload):
    """Professional Tide-style invoice PDF (app.py render_invoice_document_pdf), always on one A4 page:
    a long invoice (several products, part payments, the Pakistan rupee note) is drawn more compactly."""
    for spacing in (1.0, 0.82, 0.68, 0.56):
        body, pages = _render_pdf(payload, spacing)
        if pages == 1:
            return body
    # Very long orders: the last products are combined into one "Other services" line (same total)
    items = list(payload.get('line_items') or [])
    for keep in range(len(items) - 2, 0, -1):
        rest = items[keep:]
        merged = items[:keep] + [{
            'description': f"Other services ({len(rest)} more)",
            'quantity': 1,
            'amount': round(sum(float(i.get('amount') or 0) for i in rest), 2),
        }]
        body, pages = _render_pdf({**payload, 'line_items': merged}, 0.56)
        if pages == 1:
            return body
    return body


def _render_pdf(payload, s=1.0):
    """Draw the invoice; s scales vertical spacing (1 = normal). Returns (pdf bytes, page count)."""
    from fpdf import FPDF

    brand = payload.get('brand') or {}
    invoice = payload.get('invoice') or {}
    gbp, pkr = INVOICE_BANK_GBP, INVOICE_BANK_PKR
    navy, ink, muted, rule = (0, 57, 113), (31, 41, 55), (107, 114, 128), (212, 212, 216)

    def latin(text):
        # Core PDF fonts are Latin-1 only
        return str(text or '').encode('latin-1', 'replace').decode('latin-1')

    def money(value):
        return latin(str(value or '').replace('£', 'GBP '))

    class InvoicePDF(FPDF):
        def footer(self):
            self.set_y(-14)
            self.set_font('Helvetica', '', 9)
            self.set_text_color(*muted)
            self.cell(0, 8, 'Page 1 of 1', align='R')

    pdf = InvoicePDF(orientation='P', unit='mm', format='A4')
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()
    pdf.set_margins(16, 16, 16)
    pdf.set_title(latin(f"Invoice {invoice.get('invoice_number') or ''}"))

    left, top = pdf.get_x(), pdf.get_y()
    if payload.get('own_logo') and os.path.exists(LOGO_PATH):
        try:
            pdf.image(LOGO_PATH, x=left, y=top, w=48 if s >= 0.8 else 40)
        except Exception:
            pass
    elif not payload.get('own_logo'):
        # A Finstap company: its name in place of a logo
        pdf.set_xy(left, top)
        pdf.set_font('Helvetica', 'B', 16)
        pdf.set_text_color(*ink)
        pdf.multi_cell(90, 7, latin(brand.get('company_name') or brand.get('legal_name') or ''), align='L')

    pdf.set_xy(left + 100, top)
    pdf.set_font('Helvetica', 'B', 9)
    pdf.set_text_color(*ink)
    pdf.multi_cell(78, 4.2, latin('Registered Business name\n' + brand.get('legal_name', '').upper()), align='R')
    pdf.set_font('Helvetica', '', 9)
    pdf.set_x(left + 100)
    pdf.multi_cell(78, 4.2, latin('\n'.join(line for line in [
        brand.get('registered_office', ''),
        brand.get('support_email') or '',
        _phone_display(brand),
        f"Company No - {brand['company_number']}" if brand.get('company_number') else '',
        f"ICO Reg No - {brand['ico_number']}" if brand.get('ico_number') else '',
    ] if line)), align='R')

    pdf.set_y(max(pdf.get_y(), top + 36 * s) + 4 * s)
    pdf.set_draw_color(*rule)
    pdf.line(16, pdf.get_y(), 194, pdf.get_y())
    pdf.ln(6 * s)

    pdf.set_font('Helvetica', 'B', 22 if s >= 0.8 else 18)
    pdf.set_text_color(*ink)
    pdf.cell(0, 10 * s, 'INVOICE', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(2 * s)

    meta = [('Reference', invoice.get('invoice_number') or ''), ('Amount due', money(payload.get('amount_due_display'))),
            ('Invoice Date', payload.get('invoice_date') or ''), ('To', '')]
    # Reference / Amount due / Date stay narrow so the "To" block has room for long names and addresses
    widths, y0 = (38, 40, 34, 66), pdf.get_y()
    bottom = y0
    x = 16
    for (label, value), col_w in zip(meta, widths):
        pdf.set_xy(x, y0)
        pdf.set_font('Helvetica', 'B', 9)
        pdf.cell(col_w - 2, 5, label)
        pdf.set_xy(x, y0 + 5)
        pdf.set_font('Helvetica', '', 10)
        if label == 'To':
            lines = []
            for field in (payload.get('owner_name'), payload.get('company_name'), payload.get('company_address'),
                          payload.get('owner_email')):
                text = str(field or '').strip()
                if text and text not in lines:
                    lines.append(text)
            pdf.multi_cell(col_w - 2, 4.5, latin('\n'.join(lines) or '-'), align='L')
        else:
            mark = '  Paid' if label == 'Amount due' and payload.get('paid') else ''
            pdf.multi_cell(col_w - 2, 4.5, latin(f"{value}{mark}"), align='L')
        bottom = max(bottom, pdf.get_y())
        x += col_w

    pdf.set_y(max(bottom, y0 + 28 * s) + 6 * s)
    row_h = max(8 * s, 5.5)
    pdf.set_font('Helvetica', '', 9)
    pdf.set_text_color(*muted)
    pdf.cell(110, max(7 * s, 5.5), 'Description', border='B')
    pdf.cell(30, max(7 * s, 5.5), 'Qty', border='B', align='R')
    pdf.cell(38, max(7 * s, 5.5), 'Amount', border='B', align='R', new_x='LMARGIN', new_y='NEXT')
    pdf.set_text_color(*ink)
    pdf.set_font('Helvetica', '', 11 if s >= 0.8 else 10)
    for item in payload.get('line_items') or []:
        y = pdf.get_y()
        pdf.multi_cell(110, row_h, latin(item.get('description') or 'Professional services'), border="B", align="L")
        h = pdf.get_y() - y
        pdf.set_xy(16 + 110, y)
        pdf.cell(30, max(h, row_h), str(item.get('quantity') or 1), border='B', align='R')
        pdf.cell(38, max(h, row_h), money(format_money(item.get('amount'))), border='B', align='R',
                 new_x='LMARGIN', new_y='NEXT')

    pdf.ln(2 * s)
    totals = [('Total', payload.get('total_display'))]
    if payload.get('timing') == 'Deposit' and payload.get('deposit_display'):
        totals.append(('Deposit now', payload.get('deposit_display')))
    if float(invoice.get('amount_paid') or 0) > 0.004 or payload.get('paid'):
        totals.append(('Paid so far', payload.get('paid_display')))
    totals.append(('Amount due', payload.get('amount_due_display')))
    for label, value in totals:
        pdf.set_font('Helvetica', 'B', 11 if s >= 0.8 else 10)
        pdf.cell(140, max(7 * s, 5), label, align='R')
        pdf.cell(38, max(7 * s, 5), money(value), align='R', new_x='LMARGIN', new_y='NEXT')

    mode, details = payment_methods()
    if mode == 'none':
        # A Finstap company that has not added its payment details: no payment section at all
        return bytes(pdf.output()), pdf.page_no()

    pdf.ln(4 * s)
    pdf.line(16, pdf.get_y(), 194, pdf.get_y())
    pdf.ln(6 * s)
    pdf.set_font('Helvetica', 'B', 16 if s >= 0.8 else 13)
    pdf.cell(0, 8 * s, 'PAYMENT METHODS' if mode == 'brixen' else 'HOW TO PAY', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(2 * s)

    if mode == 'custom':
        # The company's own payment details (Settings), one line each
        pdf.set_font('Helvetica', '', 10)
        pdf.multi_cell(0, 5.5, latin(details), align='L')
        return bytes(pdf.output()), pdf.page_no()

    def bank_block(title, fields):
        pdf.set_font('Helvetica', 'B', 10)
        pdf.cell(0, max(6 * s, 4.5), title, new_x='LMARGIN', new_y='NEXT')
        pay_y = pdf.get_y()
        for index, (label, value) in enumerate(fields):
            x = 16 + index * 60
            pdf.set_xy(x, pay_y)
            pdf.set_font('Helvetica', 'B', 9)
            pdf.cell(58, 5, label, new_x='LMARGIN', new_y='NEXT')
            pdf.set_x(x)
            pdf.set_font('Helvetica', '', 10)
            pdf.multi_cell(58, 5, latin(value), align="L")
        pdf.set_y(max(pdf.get_y(), pay_y + 10) + 4 * s)

    bank_block('GBP', (('Account title', gbp['account_name']), ('Account number', gbp['account_number']),
                       ('Sort code', gbp['sort_code'])))
    # "Pay now" pill linking to the Tide payment page
    label = 'Pay now in GBP'
    pdf.set_font('Helvetica', 'B', 10)
    pill_w, pill_h, pill_y = pdf.get_string_width(label) + 10, 7.5, pdf.get_y()
    pdf.set_fill_color(*navy)
    try:
        pdf.rounded_rect(16, pill_y, pill_w, pill_h, pill_h / 2, style='F')
    except Exception:
        pdf.rect(16, pill_y, pill_w, pill_h, style='F')
    pdf.set_text_color(255, 255, 255)
    pdf.set_xy(16, pill_y + 0.6)
    pdf.cell(pill_w, pill_h - 1.2, label, align='C', link=gbp['pay_url'])
    pdf.set_text_color(*ink)
    pdf.set_y(pill_y + pill_h + 8 * s)

    bank_block('PKR', (('Account title', pkr['account_name']), ('Bank name', pkr['bank_name']), ('IBAN', pkr['iban'])))

    fx = payload.get('pakistan_fx') or {}
    if fx.get('math'):
        pdf.set_font('Helvetica', 'B', 10)
        pdf.cell(0, max(6 * s, 4.5), 'If you pay from Pakistan', new_x='LMARGIN', new_y='NEXT')
        pdf.set_font('Helvetica', 'B', 12 if s >= 0.8 else 11)
        pdf.cell(0, max(6 * s, 5), money(fx['math']), new_x='LMARGIN', new_y='NEXT')
        pdf.set_font('Helvetica', '', 9)
        pdf.multi_cell(0, 5, align="L", text=money(f"Send {fx['pkr_display']} to the UBL account. "
                                   f"That is {fx['gbp_display']} at today's GBP to PKR rate."))

    pages = pdf.page_no()
    return bytes(pdf.output()), pages


def pdf_response(start_response, invoice_id, *, inline=True):
    """Serve the invoice PDF (inline to view in the browser, or as a download)."""
    from utils.response import error_response
    payload = document_payload(invoice_id)
    if not payload:
        return error_response(start_response, "Invoice not found", status_code=404)
    body = render_pdf(payload)
    number = str(payload['invoice'].get('invoice_number') or f"INV-{invoice_id}")
    name = re.sub(r'[\x00-\x1f\x7f<>:"/\\|?*]+', '', download_filename(number)).strip(' .') or 'invoice.pdf'
    ascii_name = name.encode('ascii', 'replace').decode('ascii')
    disposition = 'inline' if inline else 'attachment'
    start_response('200 OK', [
        ('Content-Type', 'application/pdf'),
        ('Content-Length', str(len(body))),
        ('Content-Disposition', f"{disposition}; filename*=UTF-8''{urllib.parse.quote(name)}; filename=\"{ascii_name}\""),
        ('Cache-Control', 'private, no-store'),
        ('X-Content-Type-Options', 'nosniff'),
    ])
    return [body]
