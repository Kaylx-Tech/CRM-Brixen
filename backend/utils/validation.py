"""Shared form validation (same rules as frontend/src/lib/validation.js).

    errors = validate(body, {
        'full_name': {'label': 'Full name', 'required': True},
        'email': {'label': 'Email', 'required': True, 'type': 'email'},
        'phone': {'label': 'Phone', 'type': 'phone'},
    })
    if errors:
        return validation_error(start_response, errors)

The 400 answer is {"success": false, "error": "<first message>", "fields": {"email": "..."}} so the
form can show each message next to its field.
"""
import datetime
import re

from utils.response import json_response

EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')
UK_POSTCODE_RE = re.compile(r'^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$')
COMPANY_NUMBER_RE = re.compile(r'^(\d{8}|[A-Z]{2}\d{6}|R\d{7})$')
PERSONAL_CODE_RE = re.compile(r'^[A-Z0-9]{11}$')
URL_RE = re.compile(r'^https?://[^\s/$.?#][^\s]*\.[^\s]{2,}$', re.I)


def _blank(value):
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, tuple, dict)):
        return not value
    return False


def clean_phone(value):
    return re.sub(r'[\s\-().]', '', str(value or '').replace('(0)', ''))


def format_postcode(value):
    compact = re.sub(r'\s+', '', str(value or '').upper())
    return f'{compact[:-3]} {compact[-3:]}' if len(compact) > 3 else compact


def format_company_number(value):
    """'123456' -> '00123456', 'sc12345' -> 'SC012345'."""
    compact = re.sub(r'\s+', '', str(value or '').upper())
    m = re.fullmatch(r'([A-Z]{2})?(\d{1,8})', compact)
    if not m:
        return compact
    return (m.group(1) + m.group(2).zfill(6)) if m.group(1) else m.group(2).zfill(8)


def clean_personal_code(value):
    return re.sub(r'[\s-]', '', str(value or '').upper())


def parse_date(value):
    """'DD/MM/YYYY' or 'YYYY-MM-DD' (optionally with a time) as a date, or None."""
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    text = str(value or '').strip()
    for fmt, part in (('%Y-%m-%d', text[:10]), ('%d/%m/%Y', text)):
        try:
            d = datetime.datetime.strptime(part, fmt).date()
        except ValueError:
            continue
        return d if 1900 <= d.year <= 2200 else None
    return None


def check_field(value, rule, values=None):
    """One value against one rule: the error message, or ''."""
    values = values or {}
    label = rule.get('label') or 'This field'
    required = rule.get('required')
    if callable(required):
        required = required(values)
    when = rule.get('when')
    if when and not when(values):
        return ''
    kind = rule.get('type')
    if _blank(value):
        if not required:
            return ''
        return f'{label} must be ticked.' if kind == 'checkbox' else f'{label} is required.'
    if kind == 'checkbox':
        return f'{label} must be ticked.' if required and value is not True else ''

    text = value.strip() if isinstance(value, str) else value
    if kind == 'email':
        if not EMAIL_RE.match(str(text)):
            return 'Enter a valid email address, like name@example.com.'
    elif kind == 'emails':
        for e in [x for x in re.split(r'[,;\s]+', str(text)) if x]:
            if not EMAIL_RE.match(e):
                return f'"{e}" is not a valid email address.'
    elif kind == 'phone':
        p = clean_phone(text)
        # UK 07700 900123, +44 7700 900123, or international digits without + (447700900123)
        if p.startswith('+'):
            ok = re.fullmatch(r'\+[1-9]\d{6,14}', p)
        elif p.startswith('0'):
            ok = re.fullmatch(r'0\d{9,10}', p)
        else:
            ok = re.fullmatch(r'[1-9]\d{9,14}', p)
        if not ok:
            return 'Enter a valid phone number, like 07700 900123 or +44 7700 900123.'
    elif kind == 'postcode':
        if not UK_POSTCODE_RE.match(format_postcode(text)):
            return 'Enter a valid UK postcode, like SW1A 1AA.'
    elif kind == 'company_number':
        if not COMPANY_NUMBER_RE.match(format_company_number(text)):
            return 'Company number must be 8 characters, like 01234567 or SC123456.'
    elif kind == 'personal_code':
        if not PERSONAL_CODE_RE.match(clean_personal_code(text)):
            return 'Personal code must be 11 letters and numbers.'
    elif kind == 'date':
        d = parse_date(text)
        if not d:
            return 'Enter a valid date as DD/MM/YYYY.'
        if rule.get('past') and d > datetime.date.today():
            return f'{label} cannot be in the future.'
    elif kind == 'amount':
        s = re.sub(r'[£,\s]', '', str(text))
        if not re.fullmatch(r'-?\d+(\.\d{1,2})?', s):
            return 'Enter an amount like 120 or 120.50.'
        n = float(s)
        lo = rule.get('min', 0)
        if n < lo:
            return f'{label} cannot be negative.' if lo == 0 else f'{label} must be at least {lo}.'
        if rule.get('max') is not None and n > rule['max']:
            return f"{label} cannot be more than {rule['max']}."
    elif kind == 'integer':
        if not re.fullmatch(r'-?\d+', str(text)):
            return f'{label} must be a whole number.'
        n = int(str(text))
        if rule.get('min') is not None and n < rule['min']:
            return f"{label} must be at least {rule['min']}."
        if rule.get('max') is not None and n > rule['max']:
            return f"{label} cannot be more than {rule['max']}."
    elif kind == 'url':
        if not URL_RE.match(str(text)):
            return 'Enter a full web address starting with https://.'
    elif kind == 'choice':
        if text not in (rule.get('choices') or ()):
            return f'Choose a valid {label.lower()}.'

    if isinstance(text, str):
        if rule.get('min_length') and len(text) < rule['min_length']:
            return f"{label} must be at least {rule['min_length']} characters."
        if rule.get('max_length') and len(text) > rule['max_length']:
            return f"{label} must be {rule['max_length']} characters or fewer."
    custom = rule.get('validate')
    if custom:
        return custom(value, values) or ''
    return ''


def validate(values, schema):
    """{field: message} for every failing field (empty dict when all is well)."""
    values = values if isinstance(values, dict) else {}
    errors = {}
    for key, rule in schema.items():
        msg = check_field(values.get(key), rule, values)
        if msg:
            errors[key] = msg
    return errors


def validation_error(start_response, errors, status_code=400):
    """400 with the first message as `error` (for toasts) and every field in `fields`."""
    first = next(iter(errors.values()), 'Please check the form.')
    return json_response(start_response, {'success': False, 'error': first, 'fields': errors},
                         status_code=status_code)


def rule_from_label(label):
    """Format rule for a free-text order-form question, read from its label (same as ruleFromLabel in JS)."""
    lab = str(label or '').lower()
    if re.search(r'e-?mail', lab):
        return {'type': 'email'}
    if re.search(r'\b(phone|mobile|telephone|tel\.?|whatsapp|contact number)\b', lab):
        return {'type': 'phone'}
    if re.search(r'post ?code', lab):
        return {'type': 'postcode'}
    if re.search(r'personal code|identity code|verification code \(11', lab):
        return {'type': 'personal_code'}
    if re.search(r'\b(company|registration|crn) (registration )?(number|no\.?)\b|\bcrn\b', lab):
        return {'type': 'company_number'}
    if re.search(r'\b(website|web address|url)\b', lab):
        return {'type': 'url'}
    if re.search(r'\butr\b', lab):
        return {'validate': lambda v, _: '' if re.fullmatch(r'\d{10}', re.sub(r'\s', '', str(v))) else 'UTR must be 10 digits.'}
    return None


def check_service_fields(items):
    """Answers to a service's order form ([{label, type, value}]): {label: message} for wrong formats."""
    errors = {}
    for item in items or []:
        if not isinstance(item, dict):
            continue
        value, label, kind = item.get('value'), item.get('label') or 'Answer', item.get('type')
        if not isinstance(value, str) or not value.strip():
            continue
        if kind == 'date':
            rule = {'type': 'date'}
        elif kind == 'text':
            rule = rule_from_label(label)
        else:
            rule = None
        msg = check_field(value, {'label': label, **rule}) if rule else ''
        if msg:
            errors[label] = msg
    return errors
