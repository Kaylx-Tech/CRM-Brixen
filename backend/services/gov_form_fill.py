"""Fill a Gov Form from what the client wrote on the order form (services/gov_forms.py calls fill()).

The order form's questions are the company's own, so they are matched by their words: "New registered office
address", "Postcode", "Director's full name", "Date of birth", "Director to remove: Jane Smith", the company's
authentication code and the director's personal code. Only empty fields are filled; what Companies House says
stays. Returns the keys it filled, so the screen can show them as "from the order".
"""
import datetime
import re

from services.gov_forms_templates import UK_COUNTRIES

POSTCODE_ANY = re.compile(r'\b(GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})\b', re.I)

# Address parts (as in gov_forms_templates._address) and the questions that ask for them
ADDRESS_PARTS = {
    'premises': ('building', 'house number', 'house name', 'premises', 'flat', 'unit', 'property'),
    'line_1': ('address line 1', 'address 1', 'line 1', 'street', 'road'),
    'line_2': ('address line 2', 'address 2', 'line 2', 'area', 'locality'),
    'town': ('town', 'city', 'post town'),
    'region': ('county', 'region', 'state', 'province'),
    'postcode': ('postcode', 'post code', 'postal code', 'zip'),
    'country': ('country',),
}
# Which words point an address question at which address on the form
ADDRESS_HINTS = {
    'new': ('registered office', 'office', 'new', 'company address', 'business address'),
    'service': ('service', 'correspondence', 'director'),
    'home': ('home', 'residential', 'usual residential', 'residence'),
    'applicant': ('applicant', 'your address', 'contact address'),
}
# Other fields and the questions that answer them (field key -> words)
FIELD_WORDS = {
    'first_names': ('first name', 'forename', 'given name'),
    'surname': ('surname', 'last name', 'family name'),
    'former_names': ('former name', 'previous name'),
    'date_of_birth': ('date of birth', 'dob', 'birth date', 'birthday'),
    'nationality': ('nationality',),
    'country_of_residence': ('country of residence', 'usual residence', 'resident in', 'country you live'),
    'occupation': ('occupation', 'profession', 'job'),
    'appointment_date': ('appointment date', 'date of appointment', 'appointed on', 'start date'),
    'termination_date': ('resignation date', 'date of resignation', 'termination date', 'removal date', 'leaving date'),
    'change_date': ('date of change', 'change date', 'effective date'),
    'new_name': ('new name', 'new full name'),
    'new_nationality': ('new nationality',),
    'new_occupation': ('new occupation',),
    'new_residence': ('new country of residence',),
    'notified_date': ('date they became', 'became a psc', 'psc date'),
    'ceased_date': ('date they stopped', 'ceased', 'cessation date'),
    'new_end': ('new year end', 'new accounting', 'new period end', 'year end date', 'new financial year'),
    'made_up_to': ('made up to', 'confirmation date', 'review date'),
    'sic_codes': ('sic', 'nature of business', 'business activity'),
    'applicant_name': ('applicant name', 'your name', 'applicant full name'),
    'dissolved_on': ('dissolved on', 'date of dissolution', 'dissolution date', 'struck off on'),
}
FULL_NAME_WORDS = ('full name', 'director name', 'name of director', 'director s name', 'new director', 'psc name',
                   'person name', 'officer name')


def _norm(text):
    return ' '.join(re.findall(r'[a-z0-9]+', str(text or '').lower()))


def _has(label, words):
    label = f' {_norm(label)} '
    return any(f' {_norm(w)} ' in label for w in words)


def _iso_date(text):
    text = str(text or '').strip()
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%d.%m.%Y', '%d %B %Y', '%d %b %Y', '%B %d, %Y', '%d/%m/%y'):
        try:
            return datetime.datetime.strptime(text[:30], fmt).date().isoformat()
        except ValueError:
            continue
    return ''


def _split_name(text):
    parts = [p for p in re.split(r'\s+', str(text or '').strip()) if p]
    if len(parts) < 2:
        return '', ''
    return ' '.join(parts[:-1]).title(), parts[-1].upper() if parts[-1].isupper() else parts[-1].title()


def parse_address(text):
    """One-line address -> its parts (premises, line_1, line_2, town, postcode, country)."""
    text = str(text or '').strip()
    out = {}
    match = POSTCODE_ANY.search(text)
    if match:
        code = match.group(0).upper().replace(' ', '')
        out['postcode'] = f"{code[:-3]} {code[-3:]}"
        text = (text[:match.start()] + text[match.end():])
    parts = [p.strip(' .') for p in re.split(r'[,\n;]+', text) if p.strip(' .')]
    if parts and parts[-1].lower() in [c.lower() for c in UK_COUNTRIES] + ['uk', 'united kingdom', 'great britain', 'gb']:
        last = parts.pop()
        if last.lower() in [c.lower() for c in UK_COUNTRIES]:
            out['country'] = last.title()
    if not parts:
        return out
    first = parts.pop(0)
    number = re.match(r'^((?:flat|unit|suite)\s+\S+|\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)\s+(.+)$', first, re.I)
    if number:
        out['premises'], out['line_1'] = number.group(1), number.group(2)
    elif parts:
        out['premises'], out['line_1'] = first, parts.pop(0)
    else:
        out['line_1'] = first
    if parts:
        out['town'] = parts.pop()
    if parts:
        out['line_2'] = ', '.join(parts)
    return out


def _address_prefixes(form):
    """{prefix: section title} for every address on the form."""
    found = {}
    for section in form['sections']:
        for field in section['fields']:
            if field['key'].endswith('_postcode'):
                found[field['key'][:-len('_postcode')]] = section['title']
    return found


def _fill_address(prefix, title, answers, values, filled):
    """Separate questions (Postcode, City, ...) first; else one whole-address answer."""
    keys = {part: f"{prefix}_{part}" for part in ADDRESS_PARTS}
    hint_words = ADDRESS_HINTS.get(prefix, ()) + (title,)
    several_addresses = None

    def wanted(label):
        # When the form has more than one address, a question must point at this one
        nonlocal several_addresses
        return not several_addresses or _has(label, hint_words)

    several_addresses = sum(1 for a in answers if _has(a['label'], ('address',))) > 1
    got = {}
    for a in answers:
        for part, words in ADDRESS_PARTS.items():
            if part not in got and _has(a['label'], words) and not _has(a['label'], ('email',)) and wanted(a['label']):
                if part == 'line_1' and _has(a['label'], ('address line 2', 'line 2')):
                    continue
                got[part] = a['value']
    if not ({'line_1', 'postcode'} & set(got)):
        whole = [a for a in answers if _has(a['label'], ('address',)) and not _has(a['label'], ('email',))]
        whole = [a for a in whole if _has(a['label'], hint_words)] or (whole if len(whole) == 1 else [])
        if whole:
            got = {**parse_address(whole[0]['value']), **got}
    if got.get('postcode'):
        code = re.sub(r'\s+', '', str(got['postcode'])).upper()
        if POSTCODE_ANY.fullmatch(code):
            got['postcode'] = f"{code[:-3]} {code[-3:]}"
    if got.get('line_1') and not got.get('premises'):  # "10 Downing St" -> 10 / Downing St
        number = re.match(r'^(\d+[a-zA-Z]?(?:[-/]\d+[a-zA-Z]?)?)\s+(.+)$', str(got['line_1']).strip())
        if number:
            got['premises'], got['line_1'] = number.group(1), number.group(2)
    for part, value in got.items():
        key = keys[part]
        if key in values and not str(values.get(key) or '').strip() and str(value).strip():
            values[key] = str(value).strip()
            filled.append(key)


def _pick_person(field, ctx, answers, values, filled):
    """"Director to remove: Jane Smith" -> that director picked (and their details filled in)."""
    people = ctx.get(field.get('pick')) or []
    for a in answers:
        # only questions about the person (not the client's own name or the company)
        if not _has(a['label'], ('director', 'psc', 'person', 'officer', 'resign', 'remove', 'leaving', 'shareholder')) \
                or _has(a['label'], ('new director', 'appoint', 'company')):
            continue
        said = set(_norm(a['value']).split())
        if len(said) < 2:
            continue
        for p in people:
            name = set(_norm(p.get('name')).split())
            if len(name & said) >= 2:
                values[field['key']] = p['id']
                for key, attr in (field.get('fill') or {}).items():
                    values[key] = p.get(attr) or ''
                filled.append(field['key'])
                return


def mark_relevant(form, answers, values, filled):
    """Each answer gets `used`: it filled a field of this form, or its question is one this form asks."""
    keys = {f['key'] for s in form['sections'] for f in s['fields']}
    words = [w for key, ws in FIELD_WORDS.items() if key in keys for w in ws]
    if _address_prefixes(form):
        words += ['address', 'postcode', 'post code'] + [w for ws in ADDRESS_PARTS.values() for w in ws]
    if 'first_names' in keys:
        words += list(FULL_NAME_WORDS)
    if any(f.get('type') == 'pick' for s in form['sections'] for f in s['fields']):
        words += ['director', 'psc', 'person with significant control', 'resign', 'remove', 'shareholder']
    if 'auth_code' in keys:
        words += ['authentication', 'auth code']
    if 'personal_code' in keys:
        words += ['personal code', 'verification code', 'identity code']
    got = [str(values.get(k) or '').strip().lower() for k in filled if isinstance(values.get(k), str)]
    got = [g for g in got if len(g) >= 2]
    for a in answers:
        value = str(a.get('value') or '').strip().lower()
        day = _iso_date(a.get('value'))
        a['used'] = bool(
            any(g in value or value == g for g in got)
            or (day and day in got)
            or (_has(a.get('label'), words) and not _has(a.get('label'), ('email',)))
        )


def fill(form, values, ctx, order):
    """Fill empty fields of `values` from the order's answers. Returns the keys filled."""
    answers = [a for a in (order or {}).get('answers') or [] if str(a.get('value') or '').strip()]
    filled = []
    if not answers:
        return filled
    for section in form['sections']:  # every field has a slot to fill
        for field in section['fields']:
            values.setdefault(field['key'], False if field['type'] == 'checkbox' else
                              [] if field['type'] == 'checks' else '')
    for prefix, title in _address_prefixes(form).items():
        _fill_address(prefix, title, answers, values, filled)
    fields = [f for s in form['sections'] for f in s['fields']]
    keys = {f['key']: f for f in fields}
    for f in fields:
        if f['type'] == 'pick' and not values.get(f['key']):
            _pick_person(f, ctx, answers, values, filled)
    for key, words in FIELD_WORDS.items():
        field = keys.get(key)
        if not field or field.get('readonly') or str(values.get(key) or '').strip():
            continue
        for a in answers:
            if _has(a['label'], words):
                value = a['value']
                if field['type'] == 'date':
                    value = _iso_date(value)
                elif key == 'sic_codes':
                    value = ', '.join(re.findall(r'\b\d{5}\b', value)[:4])
                if value:
                    values[key] = value
                    filled.append(key)
                    break
    # One "full name" answer -> first names and surname
    if 'first_names' in keys and not values.get('first_names') and not values.get('surname'):
        for a in answers:
            if _has(a['label'], FULL_NAME_WORDS):
                first, last = _split_name(a['value'])
                if first:
                    values['first_names'], values['surname'] = first, last
                    filled += ['first_names', 'surname']
                    break
    if 'applicant_name' in keys and not values.get('applicant_name'):
        for a in answers:
            if _has(a['label'], ('full name', 'your name', 'name')) and not _has(a['label'], ('company', 'business')) \
                    and len(_norm(a['value']).split()) >= 2:
                values['applicant_name'] = a['value'].strip()
                filled.append('applicant_name')
                break
    # The company's codes typed on the order form
    from services.order_company_codes import codes_from_form
    auth, personal = codes_from_form([{'label': a['label'], 'value': a['value']} for a in answers])
    if auth and 'auth_code' in keys and values.get('auth_code') != auth:
        values['auth_code'] = auth
        filled.append('auth_code')
    if personal and 'personal_code' in keys and values.get('personal_code') != personal:
        values['personal_code'] = personal
        filled.append('personal_code')
    return filled
