"""The person an order is for (the applicant): the order form's person ("Person to Verify", "KYC owner",
"Full name", a director…) first, then the order's owner details, then the customer account, which is very
often someone else (who placed the order). KYC always uses the applicant."""
import json
import re


# Order form labels for the person being verified, best first: "Person to Verify", "KYC owner", "Applicant",
# then "Full name", then a director or signatory, then any other name that is not a company's
_PERSON_LABELS = (
    r'verif|kyc|applicant|owner|holder',
    r'full\s*name|legal name|your name|client name|customer name',
    r'director|signatory|shareholder|contact person|person',
    r'name',
)
# Emails that are not the person's own ("Email address" is fine)
_NOT_EMAIL = r'company|business|trading|access|notification|work|partner|referr|forwarding'
_NOT_PERSON = r'company|business|trading|bank|account|access|notification|work|partner|referr|sort code|address'


def _person_name(text):
    """Companies House writes "NAQVI, Syed Khilat Mehdi": as "Syed Khilat Mehdi Naqvi"."""
    if ',' in text:
        last, first = [s.strip() for s in text.split(',', 1)]
        text = f"{first} {last.title() if last.isupper() else last}".strip()
    return text


def _answers(raw, out=None, services=()):
    """Every (label, answer, services) in an order's saved form: {"Label": answer}, the services' own questions
    ({"service_fields": [{label, value, services}]}, services = the products the question is for) and website
    checkout data ([{key|display_key, value}])."""
    out = [] if out is None else out
    if isinstance(raw, str):
        try:
            raw = json.loads(raw or '{}')
        except ValueError:
            return out
    if isinstance(raw, list):
        for item in raw:
            _answers(item, out, services)
    elif isinstance(raw, dict):
        if isinstance(raw.get('services'), list):
            services = tuple(str(s) for s in raw['services'])
        # A company picked from Companies House: only its directors (the person to verify when no name was
        # asked); the company's own name, number and office are never the applicant
        company = raw.get('company') if isinstance(raw.get('company'), dict) else None
        if company is not None or ('directors' in raw and 'company_number' in raw):
            for director in (company or raw).get('directors') or []:
                person = director.get('name') if isinstance(director, dict) else director
                if person:
                    out.append(('director name', _person_name(str(person)), services))
            raw = {k: v for k, v in raw.items() if k != 'company'} if company is not None else {}
            if not raw:
                return out
        label = raw.get('label') or raw.get('display_key') or raw.get('key') or raw.get('name')
        value = raw.get('value') if 'value' in raw else raw.get('display_value')
        if label and isinstance(value, (str, int, float)) and not isinstance(value, bool):
            out.append((str(label), str(value), services))
        for key, value in raw.items():
            # The buyer's own billing/shipping/account details are not the applicant's
            if str(key).lower() in ('billing', 'shipping', 'customer', 'user', 'account'):
                continue
            if key == 'services':
                continue
            if isinstance(value, (dict, list)):
                _answers(value, out, services)
            elif isinstance(value, str) and key not in ('label', 'value', 'display_key', 'display_value', 'key',
                                                          'name', 'type', 'id'):
                out.append((str(key), value, services))
    return out


def form_contact(*form_jsons, product='kyc'):
    """(name, email) of the person the order is for, from the order form ("Person to Verify", "Full name",
    "First name" + "Last name", "Email"…) and the website checkout. Questions asked for the product (e.g. the
    "KYC Verification" ones) come first; the other products' questions only fill what they leave open."""
    pairs = []
    for raw in form_jsons:
        _answers(raw, pairs)
    want = str(product or '').lower()
    mine = [(l, v) for l, v, s in pairs if want and any(want in x.lower() for x in s)]
    rest = [(l, v) for l, v, s in pairs if not (want and any(want in x.lower() for x in s))]
    name_a, email_a = _contact(mine)
    name_b, email_b = _contact(rest)
    return name_a or name_b, email_a or email_b


def _contact(pairs):
    email = first = last = ''
    found = {}
    for label, value in pairs:
        # Only the question itself counts: "Company already registered: No › Director name" is "director name"
        key = re.split(r'\s*[›>]\s*', str(label).lower())[-1].split(':')[-1].strip()
        text = str(value or '').strip()
        if not text:
            continue
        if not email and 'mail' in key and '@' in text and not re.search(_NOT_EMAIL, key):
            email = text
            continue
        if re.search(r'first\s*name|given name|forename', key):
            first = first or text
            continue
        if re.search(r'last\s*name|surname|family name', key):
            last = last or text
            continue
        # A person's name: letters (and . ' -), not a company's, not an email or a number
        if re.search(_NOT_PERSON, key) or not re.fullmatch(r"[^\W\d_][^\W\d_ .'-]*(?:[ .'-]+[^\W\d_][^\W\d_.'-]*)*", text) \
                or len(text) > 80:
            continue
        for rank, pattern in enumerate(_PERSON_LABELS):
            if re.search(pattern, key):
                found.setdefault(rank, text)
                break
    name = f"{first} {last}".strip() or next((found[r] for r in sorted(found)), '')
    return name, email


def applicant(order):
    """The person the order is for: the order form's person (e.g. "Person to Verify") first, then the order's
    owner details, then the customer account (which can be someone else, e.g. who placed the order)."""
    form_name, form_email = form_contact(order.get('order_form_values_json'), order.get('checkout_form_json'))
    name = (form_name or order.get('owner_name') or order.get('full_name') or '').strip()
    email = (form_email or order.get('owner_form_email') or order.get('email') or '').strip()
    return name, email
