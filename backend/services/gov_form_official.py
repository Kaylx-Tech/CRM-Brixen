"""Companies House's own form PDFs, filled in from a Gov Form (services/gov_forms.py uses form_pdf()).

The PDFs are Companies House's fillable forms, kept as they come in services/gov_form_pdfs/<CODE>.pdf. Each form
here has a map: which box of the PDF gets which answer. A form without a PDF or a map gets the Filing Sheet.
The presenter boxes (who sends the form) are the workspace's own details: Settings › legal name and registered
office, the person preparing it, and the support phone.
"""
import io
import os
import re

PDF_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gov_form_pdfs')


def _boxes(names, text):
    """One character per box (company number, postcode), left to right."""
    chars = list(re.sub(r'\s+', '', str(text or '').upper()))
    return {name: chars[i] if i < len(chars) else '' for i, name in enumerate(names)}


def _postcode_boxes(names, text):
    code = re.sub(r'\s+', '', str(text or '').upper())
    if len(code) >= 5:  # outward code, a space, inward code: as written on paper
        code = f"{code[:-3]} {code[-3:]}"
    return {name: code[i] if i < len(code) else '' for i, name in enumerate(names)}


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


def presenter(user=None):
    """Who presents the form: the workspace (Settings), else nothing (the boxes are optional)."""
    from services.settings_service import get_setting
    from services.gov_form_fill import parse_address
    name = get_setting('legal_name') or get_setting('company_name') or ''
    office = parse_address(get_setting('registered_office') or '')
    return {
        'contact': (user or {}).get('full_name') or '',
        'company': name,
        'premises': office.get('premises', ''), 'line_1': office.get('line_1', ''), 'line_2': office.get('line_2', ''),
        'town': office.get('town', ''), 'postcode': office.get('postcode', ''),
        'country': office.get('country', '') or ('United Kingdom' if office.get('postcode') else ''),
        'phone': get_setting('support_phone') or '',
    }


def _ad01(values, ctx, who):
    v = values
    name_1, name_2 = _lines(v.get('company_name') or ctx['company']['name'], 42, 2)
    street = ' '.join(x for x in (v.get('new_line_1'),) if x)
    p_name_1, p_name_2 = _lines(who['company'], 34, 2)
    out = {
        'Text Field 9': name_1, 'Text Field 10': name_2,
        'Text Field 11': v.get('new_premises') or '',
        'Text Field 12': street,
        'Text Field 13': v.get('new_line_2') or '',
        'Text Field 14': v.get('new_town') or '',
        'Text Field 15': v.get('new_region') or '',
        'Text Field 24': v.get('new_country') or '',
        'Text Field 25': v.get('signer_name') or '',
        # Presenter information (page 3)
        'Text Field 26': who['contact'], 'Text Field 27': p_name_1, 'Text Field 28': p_name_2,
        'Text Field 29': ' '.join(x for x in (who['premises'], who['line_1']) if x),
        'Text Field 30': who['line_2'], 'Text Field 31': '',
        'Text Field 32': who['town'], 'Text Field 33': '', 'Text Field 42': who['country'],
        'Text Field 43': '', 'Text Field 44': who['phone'],
    }
    out.update(_boxes([f'Text Field {i}' for i in range(1, 9)], v.get('company_number') or ctx['company']['number']))
    out.update(_postcode_boxes([f'Text Field {i}' for i in range(16, 24)], v.get('new_postcode')))
    out.update(_postcode_boxes([f'Text Field {i}' for i in range(34, 42)], who['postcode']))
    checks = {'Check Box 1': bool(v.get('appropriate_address'))}
    return out, checks


MAPS = {'AD01': _ad01}


def has_official(code):
    code = str(code or '').upper()
    return code in MAPS and os.path.isfile(os.path.join(PDF_DIR, f'{code}.pdf'))


def official_pdf(code, values, ctx, user=None):
    """Companies House's PDF for `code` with every box filled in (still editable). None when there is none."""
    code = str(code or '').upper()
    if not has_official(code):
        return None
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import NameObject, BooleanObject
    texts, checks = MAPS[code](values or {}, ctx, presenter(user))
    writer = PdfWriter(clone_from=PdfReader(os.path.join(PDF_DIR, f'{code}.pdf')))
    for page in writer.pages:
        names = {str((a.get_object().get('/T') or '')) for a in page.get('/Annots') or []}
        page_texts = {k: str(val) for k, val in texts.items() if k in names}
        if page_texts:
            writer.update_page_form_field_values(page, page_texts, auto_regenerate=False)
        for annot in page.get('/Annots') or []:
            box = annot.get_object()
            name = str(box.get('/T') or '')
            if name in checks:
                on = next((k for k in (box.get('/AP') or {}).get('/N', {}).keys() if k != '/Off'), '/Yes')
                state = NameObject(on if checks[name] else '/Off')
                box[NameObject('/V')] = state
                box[NameObject('/AS')] = state
    writer.set_need_appearances_writer(True)
    if '/AcroForm' in writer._root_object:
        writer._root_object['/AcroForm'][NameObject('/NeedAppearances')] = BooleanObject(True)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
