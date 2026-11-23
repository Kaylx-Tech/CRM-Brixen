"""Smart Intake document checks: does an uploaded passport look genuine?

These are checks on the text the OCR read, not a forensic test of the image. A passport's machine-readable
lines (MRZ, the two lines of <<< at the bottom) carry check digits: a number computed from the passport
number, the date of birth, the expiry date and the whole line. When someone edits a number or a date in a
photo, the check digits no longer add up. The page itself (name, dates) must also agree with the MRZ.

The result is a label for staff, never a block: "Looks Good", "Needs Review" or "Could Not Check".
Admins can turn the checks off in Settings › Compliance (setting intake_document_checks).
"""
import datetime
import re

SETTING_KEY = 'intake_document_checks'

# Published sample passports (ICAO 9303, government specimens): never a real customer's passport
SPECIMEN_NUMBERS = frozenset({'L898902C3', 'L898902C', 'D23145890', '123456789', '000000000', '999999999'})
SPECIMEN_WORDS = re.compile(r'\b(?:specimen|sample|muster|sp[eé]cimen|void)\b', re.I)

_MONTHS = {m: i for i, m in enumerate(
    ('jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'), start=1)}

# MRZ line 2 of a passport (TD3, 44 characters)
_TD3_LINE2 = re.compile(
    r'([A-Z0-9<]{9})([0-9<])([A-Z<]{3})(\d{6})(\d)([MFX<])(\d{6})(\d)([A-Z0-9<]{14})([0-9<])(\d)'
)
_TD3_LINE1 = re.compile(r'P[A-Z<]([A-Z<]{3})([A-Z]+(?:<[A-Z]+)*)<<([A-Z<]*)')


def checks_enabled():
    """On unless an admin turned it off (Settings › Compliance)."""
    try:
        from services.settings_service import get_setting
        value = str(get_setting(SETTING_KEY, '1') or '1').strip().lower()
    except Exception:
        return True
    return value not in ('0', 'false', 'no', 'off')


def mrz_check_digit(field):
    """ICAO 9303 check digit: weights 7, 3, 1; digits as themselves, A-Z as 10-35, < as 0."""
    total = 0
    for i, ch in enumerate(field):
        if ch.isdigit():
            value = int(ch)
        elif 'A' <= ch <= 'Z':
            value = ord(ch) - 55
        else:
            value = 0
        total += value * (7, 3, 1)[i % 3]
    return total % 10


def _digit_ok(field, digit):
    # A field that is all fillers may carry < as its check digit
    if digit == '<':
        return set(field) <= {'<'}
    return digit.isdigit() and mrz_check_digit(field) == int(digit)


def _mrz_lines(text):
    """Text lines made of MRZ characters only (spaces OCR put inside them removed)."""
    lines = []
    for raw in str(text or '').upper().replace('«', '<').replace('£', '<').splitlines():
        compact = re.sub(r'[^A-Z0-9<]', '', raw)
        if len(compact) >= 30 and '<' in compact:
            lines.append(compact)
    return lines


def _visual_text(text):
    """The page above the MRZ: every line that is not an MRZ line."""
    keep = []
    for raw in str(text or '').splitlines():
        compact = re.sub(r'[^A-Z0-9<]', '', raw.upper())
        if len(compact) >= 30 and compact.count('<') >= 3:
            continue
        keep.append(raw)
    return '\n'.join(keep)


def _yymmdd(value, future=False):
    try:
        yy, mm, dd = int(value[0:2]), int(value[2:4]), int(value[4:6])
        if future:
            year = 2000 + yy if yy < 70 else 1900 + yy
        else:
            year = 1900 + yy if yy > datetime.date.today().year % 100 else 2000 + yy
        return datetime.date(year, mm, dd)
    except (ValueError, TypeError):
        return None


def _page_dates(text):
    """Dates written on the page (14 MAR 1985, 14/03/1985, 14.03.1985, 1985-03-14)."""
    found = set()
    for d, mon, y in re.findall(r'\b(\d{1,2})\s*[ /.\-]?\s*([A-Za-z]{3})[A-Za-z]*\.?\s*[/ .\-]?\s*(\d{2,4})\b', text):
        month = _MONTHS.get(mon.lower())
        if month:
            found.add(_safe_date(y, month, d))
    for d, m, y in re.findall(r'\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b', text):
        found.add(_safe_date(y, m, d))
    for y, m, d in re.findall(r'\b(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})\b', text):
        found.add(_safe_date(y, m, d))
    found.discard(None)
    return found


def _safe_date(year, month, day):
    try:
        year = int(year)
        if year < 100:
            year += 2000 if year < 50 else 1900
        return datetime.date(year, int(month), int(day))
    except (ValueError, TypeError):
        return None


def check_passport(text, today=None):
    """Checks a passport's OCR text. Returns
    {status: passed | review | not_checked, label, summary, checks: [{key, label, ok, message}]}.
    """
    today = today or datetime.date.today()
    lines = _mrz_lines(text)
    line2 = None
    for line in lines:
        m = _TD3_LINE2.search(line)
        if m:
            line2 = m
            break
    if not line2:
        # Some OCR runs split line 2: try the lines joined together
        m = _TD3_LINE2.search(''.join(lines))
        line2 = m
    if not line2:
        return {
            'status': 'not_checked',
            'label': 'Could Not Check',
            'summary': 'The machine-readable lines at the bottom of the passport could not be read. '
                       'Check the passport by eye, or upload a clearer photo.',
            'checks': [],
        }

    number, number_cd, nat, dob, dob_cd, sex, expiry, expiry_cd, personal, personal_cd, final_cd = line2.groups()
    checks = []

    def add(key, label, ok, message):
        checks.append({'key': key, 'label': label, 'ok': bool(ok), 'message': message})

    add('number_digit', 'Passport Number Check Digit', _digit_ok(number, number_cd),
        'Matches.' if _digit_ok(number, number_cd)
        else 'Does not add up: the passport number may have been changed or misread.')
    add('dob_digit', 'Date of Birth Check Digit', _digit_ok(dob, dob_cd),
        'Matches.' if _digit_ok(dob, dob_cd)
        else 'Does not add up: the date of birth may have been changed or misread.')
    add('expiry_digit', 'Expiry Date Check Digit', _digit_ok(expiry, expiry_cd),
        'Matches.' if _digit_ok(expiry, expiry_cd)
        else 'Does not add up: the expiry date may have been changed or misread.')
    composite = number + number_cd + dob + dob_cd + expiry + expiry_cd + personal + personal_cd
    add('line_digit', 'Whole Line Check Digit', _digit_ok(composite, final_cd),
        'Matches.' if _digit_ok(composite, final_cd)
        else 'Does not add up: part of the bottom line may have been changed or misread.')

    dob_date = _yymmdd(dob)
    expiry_date = _yymmdd(expiry, future=True)
    if not dob_date or dob_date > today:
        add('dob_valid', 'Date of Birth', False, 'Not a real date of birth.')
    if expiry_date:
        expired = expiry_date < today
        add('not_expired', 'Not Expired', not expired,
            f"Valid until {expiry_date.strftime('%d/%m/%Y')}." if not expired
            else f"Expired on {expiry_date.strftime('%d/%m/%Y')}.")
    else:
        add('not_expired', 'Not Expired', False, 'The expiry date is not a real date.')

    # The page above the MRZ must agree with it
    visual = _visual_text(text)
    page_dates = _page_dates(visual)
    if dob_date and len(page_dates) >= 2:
        same = dob_date in page_dates
        add('page_dob', 'Date of Birth on the Page', same,
            'Same as the bottom lines.' if same
            else 'The date of birth printed on the page is not the one in the bottom lines.')
    surname = None
    for line in lines:
        m1 = _TD3_LINE1.search(line)
        if m1:
            surname = m1.group(2).replace('<', ' ').strip()
            break
    letters = re.sub(r'[^A-Za-z]', '', visual)
    if surname and len(surname) >= 3 and len(letters) >= 40:
        on_page = re.sub(r'[^A-Z]', '', surname.upper()) in re.sub(r'[^A-Z]', '', visual.upper())
        add('page_name', 'Name on the Page', on_page,
            'Same as the bottom lines.' if on_page
            else f'The surname in the bottom lines ({surname.title()}) is not printed on the page.')

    clean_number = number.replace('<', '')
    specimen = clean_number in SPECIMEN_NUMBERS or bool(SPECIMEN_WORDS.search(str(text or '')))
    add('not_specimen', 'Not a Sample Passport', not specimen,
        'No sign of a sample.' if not specimen
        else 'This looks like a published sample (specimen) passport, not a real one.')

    problems = [c for c in checks if not c['ok']]
    if problems:
        return {
            'status': 'review',
            'label': 'Needs Review',
            'summary': ' '.join(f"{c['label']}: {c['message']}" for c in problems),
            'checks': checks,
        }
    return {
        'status': 'passed',
        'label': 'Looks Good',
        'summary': 'The passport number, dates and bottom lines agree with each other.',
        'checks': checks,
    }
