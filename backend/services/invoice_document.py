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
from services.invoice_service import invoice_money_state, invoice_payments
from services.invoice_mail import (INVOICE_BANK_GBP, INVOICE_BANK_PKR, account_title, button_colours,
                                   company_logo, invoice_accounts, invoice_links, payment_methods)
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
        'due_date': format_uk_date(invoice.get('due_date')) if invoice.get('due_date') else '',
        'paid': money['amount_due'] <= 0.004 and money['status'] == 'Paid',
        'part_paid': money['display_status'] == 'Partial Paid',
        'pakistan_fx': pakistan_fx_note(fx_pounds) if client_is_in_pakistan(invoice) else None,
        # Each payment with its day and method (part payments too), listed under the totals
        'payments': [{'date': format_uk_date(p.get('paid_on')), 'method': p.get('method') or '',
                      'amount': ('-' if float(p.get('amount') or 0) < 0 else '')
                                + format_money(abs(float(p.get('amount') or 0)))}
                     for p in invoice_payments(invoice_id) if abs(float(p.get('amount') or 0)) > 0.004],
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


def _round_rect(pdf, x, y, w, h, r, op='f'):
    """A rectangle with round corners (radius r) in the current fill colour, curves written out directly."""
    k, page_h = pdf.k, pdf.h
    r = min(r, h / 2, w / 2)
    c = 0.5523 * r  # Bezier handle for a quarter circle

    def point(px, py):
        return f'{px * k:.2f} {(page_h - py) * k:.2f}'

    pdf._out(' '.join([
        f'{point(x + r, y)} m', f'{point(x + w - r, y)} l',
        f'{point(x + w - r + c, y)} {point(x + w, y + r - c)} {point(x + w, y + r)} c',
        f'{point(x + w, y + h - r)} l',
        f'{point(x + w, y + h - r + c)} {point(x + w - r + c, y + h)} {point(x + w - r, y + h)} c',
        f'{point(x + r, y + h)} l',
        f'{point(x + r - c, y + h)} {point(x, y + h - r + c)} {point(x, y + h - r)} c',
        f'{point(x, y + r)} l',
        f'{point(x, y + r - c)} {point(x + r - c, y)} {point(x + r, y)} c', op]))


def _draw_company_logo(pdf, x, y, s):
    """A Finstap company's logo (Settings > Branding) at the top left, up to 62 x 22 mm; False when it has
    none that a PDF can show."""
    logo = company_logo()
    if not logo:
        return False
    try:
        import io
        from PIL import Image
        with Image.open(io.BytesIO(logo[0])) as image:
            ratio = image.width / max(image.height, 1)
        max_w, max_h = (62, 22) if s >= 0.8 else (52, 18)
        w = min(max_w, max_h * ratio)
        pdf.image(io.BytesIO(logo[0]), x=x, y=y, w=w, h=w / ratio)
        return True
    except Exception as exc:
        print(f"[Invoice PDF] Company logo not drawn: {exc}")
        return False


def _render_pdf(payload, s=1.0):
    """Draw the invoice like an Apple receipt: the logo, a large amount and status, quiet grey labels,
    hairline rules, the payments received, then how to pay in a soft grey panel. s scales vertical
    spacing (1 = normal). Returns (pdf bytes, page count)."""
    from fpdf import FPDF

    brand = payload.get('brand') or {}
    invoice = payload.get('invoice') or {}
    gbp, pkr = INVOICE_BANK_GBP, INVOICE_BANK_PKR
    # Apple's label colours: near-black ink, grey secondary text, light hairlines and panel fill
    ink, muted, rule, panel = (29, 29, 31), (110, 110, 115), (229, 229, 234), (245, 245, 247)
    L, R, W = 18, 192, 174

    def latin(text):
        # Core PDF fonts are Latin-1 only (the £ sign is in it)
        return str(text or '').encode('latin-1', 'replace').decode('latin-1')

    def money(value):
        return latin(str(value or ''))

    def hairline(y):
        pdf.set_draw_color(*rule)
        pdf.set_line_width(0.2)
        pdf.line(L, y, R, y)

    def label(p, text, x, y, w, align='L'):
        p.set_xy(x, y)
        p.set_font('Helvetica', '', 8)
        p.set_text_color(*muted)
        p.cell(w, 4, latin(text), align=align)

    def status_pill(x, y, text, fill, colour):
        pdf.set_font('Helvetica', 'B', 8.5)
        w, h = pdf.get_string_width(text) + 7, 5.6
        pdf.set_fill_color(*fill)
        _round_rect(pdf, x, y, w, h, h / 2)
        pdf.set_text_color(*colour)
        pdf.set_xy(x, y + 0.2)
        pdf.cell(w, h - 0.4, text, align='C')

    contact = ' · '.join(filter(None, [brand.get('support_email') or '', _phone_display(brand)]))
    legal = ' · '.join(filter(None, [
        brand.get('legal_name', ''),
        f"Company No {brand['company_number']}" if brand.get('company_number') else '',
        f"ICO {brand['ico_number']}" if brand.get('ico_number') else '']))

    class InvoicePDF(FPDF):
        def footer(self):
            self.set_y(-16)
            self.set_font('Helvetica', '', 8)
            self.set_text_color(*muted)
            thanks = 'Thank you for your business.' + (f" Questions? {contact}" if contact else '')
            self.cell(0, 4, latin(thanks), align='C', new_x='LMARGIN', new_y='NEXT')
            if legal:
                self.cell(0, 4, latin(legal), align='C')

    pdf = InvoicePDF(orientation='P', unit='mm', format='A4')
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()
    pdf.set_margins(L, 18, 210 - R)
    pdf.set_title(latin(f"Invoice {invoice.get('invoice_number') or ''}"))

    # ── Logo and who it is from ──────────────────────────────────────────────────────────────────
    top = 18
    if payload.get('own_logo') and os.path.exists(LOGO_PATH):
        try:
            pdf.image(LOGO_PATH, x=L, y=top, w=40 if s >= 0.8 else 34)
        except Exception:
            pass
    elif not payload.get('own_logo') and _draw_company_logo(pdf, L, top, s):
        pass
    elif not payload.get('own_logo'):
        # A Finstap company without a logo it can print: its name instead
        pdf.set_xy(L, top)
        pdf.set_font('Helvetica', 'B', 16)
        pdf.set_text_color(*ink)
        pdf.multi_cell(90, 7, latin(brand.get('company_name') or brand.get('legal_name') or ''), align='L')
    pdf.set_xy(R - 80, top)
    pdf.set_font('Helvetica', 'B', 9)
    pdf.set_text_color(*ink)
    pdf.cell(80, 4.4, latin(brand.get('legal_name', '')), align='R', new_x='LEFT', new_y='NEXT')
    pdf.set_font('Helvetica', '', 8.5)
    pdf.set_text_color(*muted)
    pdf.set_x(R - 80)
    pdf.multi_cell(80, 4.2, latin('\n'.join(filter(None, [
        brand.get('registered_office', ''), brand.get('support_email') or '', _phone_display(brand)]))), align='R')

    # ── Title, amount and status ─────────────────────────────────────────────────────────────────
    y = max(pdf.get_y(), top + 22) + 10 * s
    pdf.set_xy(L, y)
    pdf.set_font('Helvetica', 'B', 24 if s >= 0.8 else 20)
    pdf.set_text_color(*ink)
    pdf.cell(80, 10, 'Invoice')
    paid, part_paid = payload.get('paid'), payload.get('part_paid')
    status = ('Paid', (232, 245, 236), (36, 138, 61)) if paid else \
        ('Part paid', (255, 244, 222), (178, 104, 0)) if part_paid else \
        ('Cancelled', (242, 242, 247), (110, 110, 115)) if invoice.get('status') == 'Cancelled' else \
        ('Due', (230, 240, 255), (0, 102, 204))
    pdf.set_font('Helvetica', 'B', 24 if s >= 0.8 else 20)
    status_pill(L + pdf.get_string_width('Invoice') + 4, y + 2.4, status[0], status[1], status[2])

    big = payload.get('total_display') if paid else payload.get('amount_due_display')
    pdf.set_text_color(*ink)
    pdf.set_xy(R - 90, y - 1)
    pdf.set_font('Helvetica', 'B', 22 if s >= 0.8 else 19)
    pdf.cell(90, 9, money(big), align='R', new_x='LEFT', new_y='NEXT')
    pdf.set_x(R - 90)
    pdf.set_font('Helvetica', '', 8.5)
    pdf.set_text_color(*muted)
    due_line = 'Paid in full' if paid else (f"Due by {payload['due_date']}" if payload.get('due_date') else 'Amount due')
    pdf.cell(90, 4.5, latin(due_line), align='R')

    # ── Details: number, dates, order, billed to ────────────────────────────────────────────────
    y += 18 * s
    hairline(y)
    y += 5 * s
    cols = [('Invoice number', invoice.get('invoice_number') or ''), ('Invoice date', payload.get('invoice_date') or ''),
            ('Order', invoice.get('order_number') or '')]
    for i, (name, value) in enumerate(cols):
        label(pdf, name, L + i * 36, y, 34)
        pdf.set_xy(L + i * 36, y + 4.5)
        pdf.set_font('Helvetica', '', 9.5)
        pdf.set_text_color(*ink)
        pdf.multi_cell(34, 4.6, latin(value or '-'), align='L')
    label(pdf, 'Billed to', L + 112, y, 62)
    lines = []
    for field in (payload.get('owner_name'), payload.get('company_name'), payload.get('company_address'),
                  payload.get('owner_email')):
        text = str(field or '').strip()
        if text and text not in lines:
            lines.append(text)
    pdf.set_xy(L + 112, y + 4.5)
    pdf.set_font('Helvetica', '', 9.5)
    pdf.set_text_color(*ink)
    pdf.multi_cell(62, 4.6, latin('\n'.join(lines) or '-'), align='L')
    y = max(pdf.get_y(), y + 16) + 7 * s

    # ── Items ────────────────────────────────────────────────────────────────────────────────────
    label(pdf, 'Description', L, y, 120)
    label(pdf, 'Qty', L + 120, y, 20, 'R')
    label(pdf, 'Amount', L + 140, y, 34, 'R')
    y += 5.5
    hairline(y)
    row_h = max(7.5 * s, 5.5)
    pdf.set_y(y)
    pdf.set_font('Helvetica', '', 10 if s >= 0.8 else 9.5)
    pdf.set_text_color(*ink)
    for item in payload.get('line_items') or []:
        y0 = pdf.get_y() + 1.2
        pdf.set_xy(L, y0)
        pdf.multi_cell(120, row_h - 2.4, latin(item.get('description') or 'Professional services'), align='L')
        h = max(pdf.get_y() - y0, row_h - 2.4)
        pdf.set_xy(L + 120, y0)
        pdf.cell(20, row_h - 2.4, str(item.get('quantity') or 1), align='R')
        pdf.cell(34, row_h - 2.4, money(format_money(item.get('amount'))), align='R')
        pdf.set_y(y0 + h + 1.2)
        hairline(pdf.get_y())

    # ── Totals, then each payment received ──────────────────────────────────────────────────────
    pdf.ln(3 * s)
    totals = [('Subtotal', payload.get('total_display'), False)]
    if payload.get('timing') == 'Deposit' and payload.get('deposit_display') and not paid:
        totals.append(('Deposit now', payload.get('deposit_display'), False))
    if float(invoice.get('amount_paid') or 0) > 0.004 or paid or payload.get('payments'):
        totals.append(('Paid', f"-{payload.get('paid_display')}", False))
    totals.append(('Amount due', payload.get('amount_due_display'), True))
    for name, value, strong in totals:
        if strong:
            pdf.set_draw_color(*rule)
            pdf.line(L + 100, pdf.get_y() + 1, R, pdf.get_y() + 1)
            pdf.ln(2.5)
        pdf.set_x(L + 100)
        pdf.set_font('Helvetica', 'B' if strong else '', 11 if strong else 9.5)
        pdf.set_text_color(*(ink if strong else muted))
        pdf.cell(40, max(6 * s, 5), name, align='L')
        pdf.set_text_color(*ink)
        pdf.cell(34, max(6 * s, 5), money(value), align='R', new_x='LMARGIN', new_y='NEXT')

    payments = payload.get('payments') or []
    if payments:
        pdf.ln(3 * s)
        label(pdf, 'Payments received', L, pdf.get_y(), 120)
        pdf.ln(5)
        pdf.set_font('Helvetica', '', 9)
        for p in payments:
            pdf.set_text_color(*ink)
            pdf.set_x(L)
            pdf.cell(40, 5, latin(p['date']))
            pdf.set_text_color(*muted)
            pdf.cell(100, 5, latin(p['method']))
            pdf.set_text_color(*ink)
            pdf.cell(34, 5, money(p['amount']), align='R', new_x='LMARGIN', new_y='NEXT')

    # ── How to pay: a soft grey panel (nothing when paid, or when the company has no payment details) ──
    mode, details = payment_methods()
    if paid or mode == 'none':
        return bytes(pdf.output()), pdf.page_no()

    def pill(p, x, y, text, url):
        """A pill button in the company's colour linking to url; returns its width."""
        fill, colour = button_colours()
        rgb = tuple(int(fill[i:i + 2], 16) for i in (1, 3, 5))
        p.set_font('Helvetica', 'B', 9.5)
        w, h = p.get_string_width(text) + 12, 7.5
        p.set_fill_color(*rgb)
        _round_rect(p, x, y, w, h, h / 2)
        p.set_text_color(*(int(colour[i:i + 2], 16) for i in (1, 3, 5)))
        p.set_xy(x, y + 0.5)
        p.cell(w, h - 1, latin(text), align='C', link=url)
        return w

    def field_row(p, fields, y, x0, col_w):
        """Up to three grey labels with their values in a row; returns the row's bottom."""
        bottom = y + 8.5
        for i, (name, value) in enumerate(fields):
            x = x0 + i * col_w
            label(p, name, x, y - 0.2, col_w - 2)
            p.set_xy(x, y + 3.8)
            p.set_font('Helvetica', '', 9)
            p.set_text_color(*ink)
            p.multi_cell(col_w - 2, 4.4, latin(value), align='L')
            bottom = max(bottom, p.get_y())
        return bottom

    def pay_content(p, top):
        p.set_xy(L + 6, top + 5)
        p.set_font('Helvetica', 'B', 11)
        p.set_text_color(*ink)
        p.cell(0, 5, 'How to pay', new_x='LMARGIN', new_y='NEXT')
        y = top + 13
        if mode == 'custom':
            # Settings > Invoices: each country's bank account, the free-text notes, then the links
            for account in invoice_accounts():
                p.set_xy(L + 6, y)
                p.set_font('Helvetica', 'B', 9)
                p.set_text_color(*ink)
                p.cell(0, 4.6, latin(account_title(account)))
                y += 5.5
                fields = [(f['label'], f['value']) for f in account['fields']]
                for start in range(0, len(fields), 3):
                    y = field_row(p, fields[start:start + 3], y, L + 6, 54) + 2
            if details:
                p.set_xy(L + 6, y)
                p.set_font('Helvetica', '', 9)
                p.set_text_color(*muted)
                p.multi_cell(W - 12, 4.6, latin(details), align='L')
                y = p.get_y() + 2
            x = L + 6
            links = invoice_links()
            for link in links:
                p.set_font('Helvetica', 'B', 9.5)
                if x > L + 6 and x + p.get_string_width(latin(link['label'])) + 12 > R - 6:
                    x, y = L + 6, y + 10
                x += pill(p, x, y, link['label'], link['url']) + 4
            if links:
                y += 10
        else:
            for title, fields in (
                    ('GBP', (('Account title', gbp['account_name']), ('Account number', gbp['account_number']),
                             ('Sort code', gbp['sort_code']))),
                    ('PKR', (('Account title', pkr['account_name']), ('Bank name', pkr['bank_name']),
                             ('IBAN', pkr['iban'])))):
                p.set_xy(L + 6, y)
                p.set_font('Helvetica', 'B', 9)
                p.set_text_color(*ink)
                p.cell(20, 4.6, title)
                y = field_row(p, fields, y, L + 26, 48) + 2.5
            if gbp.get('pay_url'):
                pill(p, L + 6, y, 'Pay now in GBP', gbp['pay_url'])
                y += 10.5
            fx = payload.get('pakistan_fx') or {}
            if fx.get('math'):
                p.set_xy(L + 6, y)
                p.set_font('Helvetica', 'B', 9)
                p.set_text_color(*ink)
                p.cell(0, 4.6, latin(f"From Pakistan: {fx['math']}"), new_x='LMARGIN', new_y='NEXT')
                p.set_x(L + 6)
                p.set_font('Helvetica', '', 8.5)
                p.set_text_color(*muted)
                p.multi_cell(W - 12, 4.2, align='L', text=money(
                    f"Send {fx['pkr_display']} to the UBL account. That is {fx['gbp_display']} at today's GBP to PKR rate."))
                y = p.get_y()
        return y

    # Measure the panel's content first, then draw the grey panel and the content on top of it
    pdf.ln(7 * s)
    box_y = pdf.get_y()
    with pdf.offset_rendering() as dummy:
        box_end = pay_content(dummy, box_y)
    pdf.set_fill_color(*panel)
    _round_rect(pdf, L, box_y, W, box_end - box_y + 4, 4)
    pay_content(pdf, box_y)
    pdf.set_y(box_end + 4)

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
