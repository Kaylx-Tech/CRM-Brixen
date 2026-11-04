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
_NOT_PERSON = r'company|business|trading|bank|account|access|notification|work|partner|referr|sort code|address'


def form_contact(form_json):
    """(name, email) of the person the order is for, from the order form ("Person to Verify", "Full name",
    "First name" + "Last name", "Email"…)."""
    try:
        values = json.loads(form_json or '{}') or {}
    except ValueError:
        return '', ''
    if not isinstance(values, dict):
        return '', ''
    email = first = last = ''
    found = {}
    for label, value in values.items():
        if isinstance(value, (dict, list)):
            continue
        key, text = str(label).lower(), str(value or '').strip()
        if not text:
            continue
        if not email and 'mail' in key and '@' in text and not re.search(_NOT_PERSON, key):
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
    form_name, form_email = form_contact(order.get('order_form_values_json'))
    name = (form_name or order.get('owner_name') or order.get('full_name') or '').strip()
    email = (form_email or order.get('owner_form_email') or order.get('email') or '').strip()
    return name, email
