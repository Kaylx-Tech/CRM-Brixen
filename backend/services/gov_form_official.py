"""Companies House's own form PDFs, filled in from a Gov Form (services/gov_forms.py uses official_pdf()).

The PDFs are Companies House's fillable forms, kept as they come in services/gov_form_pdfs/<CODE>.pdf (CS01's
optional parts as CS01-part-<n>.pdf). The boxes are found by what Companies House labels them ("Company number",
"Post town", "Date of termination of appointment" ...), not by their internal names, which differ in every form;
boxes of one character (company number, postcodes, dates, codes) are filled left to right, row by row.
The presenter boxes are the client the form is for: the order's client (else the company's account holder), the
company, their address, and their phone only when it is a UK number. A form without its PDF gets the Filing Sheet instead.
"""
import io
import os
import re

PDF_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gov_form_pdfs')


class _Pdf:
    """One PDF's boxes and what to put in them."""

    def __init__(self, path):
        from pypdf import PdfReader
        self.reader = PdfReader(path)
        self.boxes, self.texts, self.checks = [], {}, {}
        for page_no, page in enumerate(self.reader.pages):
            for annot in page.get('/Annots') or []:
                box = annot.get_object()
                if box.get('/Subtype') != '/Widget':
                    continue
                parent = box.get('/Parent')
                parent = parent.get_object() if parent else {}
                rect = [float(x) for x in box['/Rect']]
                self.boxes.append({
                    'page': page_no, 'name': str(box.get('/T') or parent.get('/T') or ''),
                    'label': ' '.join(str(box.get('/TU') or parent.get('/TU') or '').split()),
                    'kind': str(box.get('/FT') or parent.get('/FT') or ''),
                    'one': (box.get('/MaxLen') or parent.get('/MaxLen')) in (1, 2) or rect[2] - rect[0] < 24,
                    'x': rect[0], 'y': rect[1],
                })
        self.last = len(self.reader.pages) - 1

    def find(self, label, page=None, one=None, kind='/Tx'):
        found = [b for b in self.boxes if re.search(label, b['label'], re.I) and b['kind'] == kind
                 and (page is None or b['page'] == page) and (one is None or b['one'] == one)]
        return sorted(found, key=lambda b: (b['page'], -round(b['y']), b['x']))

    def rows(self, label, page=None):
        """Boxes of one character, as rows (top to bottom), each left to right."""
        rows = []
        for b in self.find(label, page, one=True):
            row = next((r for r in rows if r[0]['page'] == b['page'] and abs(r[0]['y'] - b['y']) < 5), None)
            if row is None:
                rows.append([b])
            else:
                row.append(b)
        rows = [sorted(r, key=lambda b: b['x']) for r in rows]
        return sorted(rows, key=lambda r: (r[0]['page'], -r[0]['y']))

    def row_near(self, label, page=None):
        """Every one-character box on the same line as the first box labelled `label` (some forms label a
        date's day, month and year boxes differently)."""
        first = self.find(label, page, one=True)
        if not first:
            return []
        b0 = first[0]
        return sorted([b for b in self.boxes if b['page'] == b0['page'] and b['one'] and b['kind'] == '/Tx'
                       and abs(b['y'] - b0['y']) < 5], key=lambda b: b['x'])

    # ── putting answers in ──
    def lines(self, label, text, width=40, page=None):
        boxes = self.find(label, page, one=False)
        if boxes:
            for b, part in zip(boxes, _lines(text, width, len(boxes))):
                self.texts[b['name']] = part

    def text(self, label, value, page=None, nth=0):
        boxes = self.find(label, page, one=False)
        if len(boxes) > nth and value not in (None, ''):
            self.texts[boxes[nth]['name']] = str(value)

    def chars(self, rows, value, keep_spaces=False):
        """A run of characters over rows of one-character boxes, left to right."""
        text = str(value or '').upper()
        chars = list(re.sub(r'\s+', ' ' if keep_spaces else '', text).strip())
        for row in rows:
            for b in row:
                self.texts[b['name']] = chars.pop(0) if chars else ''

    def date(self, label, value, page=None, row=0):
        """dd mm yyyy (8 boxes) or mm yyyy (6 boxes), from 2026-11-24 or 11/2026."""
        rows = self.rows(label, page)
        if len(rows) <= row or not value:
            return
        digits = _dmy(value) if len(rows[row]) >= 8 else _my(value)
        if digits:
            self.chars([rows[row]], digits)

    def tick(self, label, on=True, page=None, nth=0):
        boxes = self.find(label, page, kind='/Btn')
        if len(boxes) > nth:
            b = boxes[nth]
            self.checks[f"{b['name']}@{b['page']}:{round(b['y'])}"] = bool(on)

    def address(self, values, prefix, page, label_prefix=''):
        """Building, street (2 lines), town, county, postcode boxes, country: one address block on a page."""
        lp = label_prefix
        self.text(rf'^{lp}building', values.get(f'{prefix}_premises'), page)
        streets = self.find(rf'^{lp}street', page, one=False)
        for b, part in zip(streets, (values.get(f'{prefix}_line_1'), values.get(f'{prefix}_line_2'))):
            if part:
                self.texts[b['name']] = str(part)
        self.text(rf'^{lp}post ?town', values.get(f'{prefix}_town'), page)
        self.text(rf'^{lp}county', values.get(f'{prefix}_region'), page)
        self.text(rf'^{lp}country$', values.get(f'{prefix}_country'), page)
        self.chars(self.rows(rf'^{lp}postcode', page), _postcode(values.get(f'{prefix}_postcode')), True)

    def company(self, values, ctx):
        self.chars(self.rows(r'^company number', 0), values.get('company_number') or ctx['company']['number'])
        self.lines(r'^company name', values.get('company_name') or ctx['company']['name'], 42, 0)

    def presenter(self, who):
        p, last = r'^(presenter information\s*-?\s*)?', self.last
        self.text(p + r'contact name', who['contact'], last)
        self.lines(p + r'company name', who['company'], 34, last)
        street = ' '.join(x for x in (who['premises'], who['line_1']) if x)
        for i, part in enumerate((street, who['line_2'])):
            self.text(p + r'address', part, last, i)
        self.text(p + r'post ?town', who['town'], last)
        self.text(p + r'country', who['country'], last)
        self.text(p + r'telephone', who['phone'], last)
        self.chars(self.rows(p + r'postcode', last), _postcode(who['postcode']), True)

    def output(self):
        from pypdf import PdfWriter
        from pypdf.generic import BooleanObject, NameObject
        writer = PdfWriter(clone_from=self.reader)
        for page_no, page in enumerate(writer.pages):
            names = {str(a.get_object().get('/T') or '') for a in page.get('/Annots') or []}
            page_texts = {k: v for k, v in self.texts.items() if k in names}
            if page_texts:
                writer.update_page_form_field_values(page, page_texts, auto_regenerate=False)
            for annot in page.get('/Annots') or []:
                box = annot.get_object()
                key = f"{box.get('/T') or ''}@{page_no}:{round(float(box['/Rect'][1]))}"
                if key in self.checks:
                    on = next((k for k in (box.get('/AP') or {}).get('/N', {}).keys() if k != '/Off'), '/Yes')
                    state = NameObject(on if self.checks[key] else '/Off')
                    box[NameObject('/V')] = state
                    box[NameObject('/AS')] = state
        writer.set_need_appearances_writer(True)
        if '/AcroForm' in writer._root_object:
            writer._root_object['/AcroForm'][NameObject('/NeedAppearances')] = BooleanObject(True)
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()


def _postcode(text):
    code = re.sub(r'\s+', '', str(text or '').upper())
    return f"{code[:-3]} {code[-3:]}" if len(code) >= 5 else code


def _lines(text, width, count):
    """Text split over `count` lines of about `width` characters, at spaces."""
    words, lines, line = str(text or '').split(), [], ''
    for word in words:
        if line and len(line) + 1 + len(word) > width:
            lines.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    lines.append(line)
    if len(lines) > count:
        lines = lines[:count - 1] + [' '.join(lines[count - 1:])]
    return lines + [''] * (count - len(lines))


def _split(name):
    parts = str(name or '').split()
    return (' '.join(parts[:-1]), parts[-1]) if len(parts) > 1 else ('', ' '.join(parts))


def _dmy(value):
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', str(value or ''))
    return f"{m.group(3)}{m.group(2)}{m.group(1)}" if m else ''


def _my(value):
    text = str(value or '')
    m = re.match(r'^(\d{1,2})/(\d{4})$', text)
    if m:
        return f"{int(m.group(1)):02d}{m.group(2)}"
    m = re.match(r'^(\d{4})-(\d{2})', text)
    return f"{m.group(2)}{m.group(1)}" if m else ''


def uk_phone(text):
    """The number as written when it is a UK one, else ''. Without +44 only 01, 02 and 07 numbers count (a
    Pakistani mobile is written 03..., like the UK's 03 numbers few people have as their own)."""
    raw = str(text or '').strip()
    digits = re.sub(r'[^\d+]', '', raw)
    if re.fullmatch(r'(\+44|0044)\d{9,10}', digits) or re.fullmatch(r'0[127]\d{9}', digits) \
            or re.fullmatch(r'44[1237]\d{9}', digits):
        return raw
    return ''


def presenter(company_id=None, order_id=None, company_name=''):
    """Who presents the form: the client it is for (the order's client, else the company's account holder) with
    their address, and their phone only when it is a UK number."""
    from db import query_db
    from services.gov_form_fill import parse_address
    order = query_db("SELECT user_id, end_client_name, end_client_phone, order_form_values_json FROM orders "
                     "WHERE id = ?;", (order_id,), one=True) if order_id else None
    order = dict(order or {})
    user_id = order.get('user_id')
    if not user_id and company_id:
        user_id = (query_db("SELECT user_id FROM companies WHERE id = ?;", (company_id,), one=True) or {}).get('user_id')
    user = dict(query_db("SELECT full_name, phone, address, country FROM users WHERE id = ?;", (user_id,),
                         one=True) or {}) \
        if user_id else {}
    phones = [order.get('end_client_phone')]
    if order.get('order_form_values_json'):
        from services.order_applicant import _answers
        phones += [value for label, value, _s in _answers(order['order_form_values_json'])
                   if re.search(r'phone|mobile|telephone|contact number|whatsapp', str(label), re.I)]
    phones.append(user.get('phone'))
    office = parse_address(user.get('address') or '')
    return {
        'contact': order.get('end_client_name') or user.get('full_name') or '',
        'company': company_name or '',
        'premises': office.get('premises', ''), 'line_1': office.get('line_1', ''), 'line_2': office.get('line_2', ''),
        'town': office.get('town', ''), 'postcode': office.get('postcode', ''),
        'country': office.get('country', '') or (user.get('country') or '' if office.get('postcode') else ''),
        'phone': next((uk_phone(p) for p in phones if uk_phone(p)), ''),
    }


# ── each form: which answer goes where ──────────────────────────────────────

def _ad01(f, v, ctx):
    f.company(v, ctx)
    f.address(v, 'new', 0)
    f.tick(r'appropriate address', v.get('appropriate_address'), 0)
    f.text(r'^authentication', v.get('signer_name'))


def _tm01(f, v, ctx):
    f.company(v, ctx)
    first, surname = _split(v.get('officer_name'))
    f.date(r'month/year of birth', v.get('officer_dob'), 0)
    f.text(r'^full forename', first, 0)
    f.text(r'^surname', surname, 0)
    f.date(r'date of termination', v.get('termination_date'), 0)
    f.text(r'^authentication', v.get('signer_name'))


def _ch01(f, v, ctx):
    f.company(v, ctx)
    first, surname = _split(v.get('officer_name'))
    f.chars([f.row_near(r'^month of birth', 0)], _my(v.get('officer_dob')))
    f.text(r'^forename', first, 0, 0)
    f.text(r'^surname', surname, 0, 0)
    f.chars([f.row_near(r'^appointment', 0)], _dmy(v.get('change_date')))  # section 3: date of change
    if v.get('new_name'):
        new_first, new_surname = _split(v['new_name'])
        f.text(r'^forename', new_first, 0, 1)
        f.text(r'^surname', new_surname, 0, 1)
    if v.get('address_changed'):
        f.address(v, 'service', 0, 'service address ')
    f.text(r'change of country', v.get('new_residence'))
    f.text(r'change of nationality', v.get('new_nationality'))
    f.text(r'^authentication', v.get('signer_name'))


def _psc01(f, v, ctx):
    f.company(v, ctx)
    f.date(r'became a registrable person', v.get('notified_date'), 0)
    f.text(r'^title', v.get('title'), 0)
    f.text(r'^full forename', v.get('first_names'), 0)
    f.text(r'^surname', v.get('surname'), 0)
    f.text(r'^country/state of residence', v.get('country_of_residence'), 0)
    f.text(r'^nationality', v.get('nationality'), 0)
    f.date(r'month/year of birth', v.get('date_of_birth'), 0)
    f.address(v, 'service', 0)
    f.date(r'^date of birth', v.get('date_of_birth'), 1)
    f.address(v, 'home', 1)
    if v.get('personal_code'):
        f.tick(r'verified identity', True)
        f.chars(f.rows(r'personal code'), v['personal_code'])
    from services.gov_forms_templates import CONTROL_OPTIONS
    for i, (key, _label) in enumerate(CONTROL_OPTIONS):
        if key in (v.get('control') or []):
            f.tick(r'^nature of control for an individual', True, nth=i)
    f.text(r'^authentication', v.get('signer_name'))


def _psc07(f, v, ctx):
    f.company(v, ctx)
    f.date(r'date of change of details|month/year of birth', v.get('psc_dob'), 0)
    f.text(r'^title', v.get('psc_title'), 0)
    first, surname = v.get('psc_first_names'), v.get('psc_surname')
    if not surname:
        first, surname = _split(v.get('psc_name'))
    f.text(r'^full forename', first, 0)
    f.text(r'^surname', surname, 0)
    f.date(r'date ceased', v.get('ceased_date'), 0)
    f.date(r'register entry date', v.get('register_date'))
    f.text(r'^authentication', v.get('signer_name'))


def _aa01(f, v, ctx):
    f.company(v, ctx)
    f.chars([f.row_near(r'^accounting period', 0)], _dmy(v.get('current_end')))
    new, current = str(v.get('new_end') or ''), str(v.get('current_end') or '')
    label = r'^new shortened' if new and current and new < current else r'^new extended'
    if new:
        f.chars([f.row_near(label, 0)], _dmy(new))
    # Section 5 is a signature: it is signed on paper


def _ds01(f, v, ctx):
    f.company(v, ctx)
    names = {d['id']: d for d in ctx.get('directors') or []}
    for i, signer in enumerate((v.get('signers') or [])[:4]):
        person = names.get(signer) or {}
        f.text(r'^forename', person.get('first_names'), 1, i)
        f.text(r'^surname', person.get('surname'), 1, i)
    # Each director signs and dates it on paper


def _rt01(f, v, ctx):
    f.company(v, ctx)
    f.text(r'^authentication', v.get('applicant_name'))


def _cs01(f, v, ctx):
    f.company(v, ctx)
    f.date(r'confirmation date', v.get('made_up_to'), 0)
    f.tick(r'lawful purpose', v.get('lawful_purpose'), 0)
    f.text(r'^printed name', v.get('signer_name'))


def _sic(text):
    return re.findall(r'\b\d{5}\b', str(text or ''))


def _cs01_part1(f, v, ctx):
    """New SIC codes (rows 1-4) and the ones removed (rows 5-8), compared with Companies House."""
    now, before = _sic(v.get('sic_codes')), _sic(ctx['company'].get('sic_text'))
    rows = f.rows(r'classifi')
    for i, code in enumerate([c for c in now if c not in before][:4]):
        f.chars([rows[i]], code)
    for i, code in enumerate([c for c in before if c not in now][:4]):
        if len(rows) > 4 + i:
            f.chars([rows[4 + i]], code)


def _cs01_part6(f, v, ctx):
    f.text(r'^forename', v.get('id_first_names'), 0)
    f.text(r'^surname', v.get('id_surname'), 0)
    f.chars([f.row_near(r'^date of birth', 0)], _dmy(v.get('id_date_of_birth')))
    f.chars(f.rows(r'personal code', 0), v.get('personal_code'))
    f.tick(r'verified', True, 0)


MAPS = {'AD01': _ad01, 'TM01': _tm01, 'CH01': _ch01, 'PSC01': _psc01, 'PSC07': _psc07, 'AA01': _aa01,
        'DS01': _ds01, 'RT01': _rt01, 'CS01': _cs01}


def _cs01_parts(v, ctx):
    """The CS01 parts this statement needs: SIC changes, capital and shareholder changes (left for the team to
    complete on the form), the director's identity verification."""
    parts = []
    now, before = set(_sic(v.get('sic_codes'))), set(_sic(ctx['company'].get('sic_text')))
    if now and now != before:
        parts.append(('CS01-part-1', _cs01_part1))
    if not v.get('no_capital_change'):
        parts.append(('CS01-part-2', None))
    if not v.get('no_shareholder_change'):
        parts.append(('CS01-part-4', None))
    if v.get('personal_code'):
        parts.append(('CS01-part-6', _cs01_part6))
    return parts


def has_official(code):
    code = str(code or '').upper()
    return code in MAPS and os.path.isfile(os.path.join(PDF_DIR, f'{code}.pdf'))


def _filled(name, fill, values, ctx, who):
    pdf = _Pdf(os.path.join(PDF_DIR, f'{name}.pdf'))
    if fill:
        fill(pdf, values, ctx)
    if who is not None:
        pdf.presenter(who)
    return pdf.output()


def official_pdf(code, values, ctx, order_id=None):
    """Companies House's PDF for `code` with every box we know filled in (still editable). None without one."""
    code = str(code or '').upper()
    if not has_official(code):
        return None
    values = values or {}
    who = presenter(ctx['company'].get('id'), order_id, values.get('company_name') or ctx['company'].get('name'))
    main = _filled(code, MAPS[code], values, ctx, who)
    if code != 'CS01':
        return main
    parts = [(n, fill) for n, fill in _cs01_parts(values, ctx) if os.path.isfile(os.path.join(PDF_DIR, f'{n}.pdf'))]
    if not parts:
        return main
    from pypdf import PdfReader, PdfWriter
    writer = PdfWriter()
    writer.append(PdfReader(io.BytesIO(main)))
    for name, fill in parts:
        writer.append(PdfReader(io.BytesIO(_filled(name, fill, values, ctx, None))))
    writer.set_need_appearances_writer(True)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
