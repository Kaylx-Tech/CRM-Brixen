"""Rebuild backend/services/starter_catalog.json. No prices.

Source: scripts/starter_catalog_source.json — the order forms built in the live CRM (names, categories and
form fields only). Services the live CRM does not have get the live form of the closest service.

Run: python backend/scripts/build_starter_catalog.py
"""
import copy
import json
import os
import re
import sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
from routes.catalog_routes import _date_of_birth_to_date, clean_form_fields  # noqa: E402

SOURCE = os.path.join(BACKEND, 'scripts', 'starter_catalog_source.json')
OUTPUT = os.path.join(BACKEND, 'services', 'starter_catalog.json')

# Description, delivery time, duration and renewal for each service (the live ones only repeat the name)
DETAILS = {
    "Incorporation": ("Register a new UK limited company with Companies House.", "24-48 Hours", "One-off", "One-off"),
    "Same Day Incorporation": ("Register a new UK limited company with Companies House on the same working day.", "Same Day", "One-off", "One-off"),
    "Professional Package": ("Company formation with registered office, director service address and business bank support.", "24-48 Hours", "12 Months", "Annual"),
    "All Inclusive": ("Complete company formation package: addresses, bank account, website, email and compliance setup.", "24-48 Hours", "12 Months", "Annual"),
    "Registered Office Address": ("A registered office address for Companies House, with official mail scanned and forwarded.", "24-48 Hours", "12 Months", "Annual"),
    "Directors Service Address": ("A service address for directors so their home address stays off the public register.", "24-48 Hours", "12 Months", "Annual"),
    "Business Mail Forwarding Address": ("A business mailing address with letters scanned or forwarded to the client.", "24-48 Hours", "12 Months", "Annual"),
    "AD01 Form": ("Change the company's registered office address at Companies House (form AD01).", "24-48 Hours", "One-off", "One-off"),
    "Company Secretary Service": ("Ongoing company secretarial support: statutory registers, filings and Companies House updates.", "24-48 Hours", "12 Months", "Annual"),
    "Confirmation Statement Service": ("Prepare and file the company's annual confirmation statement with Companies House.", "24-48 Hours", "One-off", "Annual"),
    "Dormant company accounts service": ("Prepare and file dormant company accounts with Companies House.", "3-5 Working Days", "One-off", "Annual"),
    "Directors Appointment or Resignation": ("Appoint a new director or file a director's resignation at Companies House.", "24-48 Hours", "One-off", "One-off"),
    "Company name change service": ("Change the company's registered name at Companies House.", "24-48 Hours", "One-off", "One-off"),
    "Company Dissolution Service": ("Apply to strike off and close a company that is no longer needed.", "3-5 Working Days", "One-off", "One-off"),
    "Certification of Good Standing Service": ("Obtain an official certificate of good standing for the company from Companies House.", "3-5 Working Days", "One-off", "One-off"),
    "Apostilled Documents Service": ("Get company documents certified and apostilled for use abroad.", "5-7 Working Days", "One-off", "One-off"),
    "VAT Registration": ("Register the business for VAT with HMRC.", "5-10 Working Days", "One-off", "One-off"),
    "Identity Verification": ("Companies House identity verification for directors and people with significant control.", "24-48 Hours", "One-off", "One-off"),
    "KYC Verification": ("Know-your-customer checks on the client's identity and address documents.", "24-48 Hours", "One-off", "One-off"),
    "Tide Business Bank": ("Help opening a Tide business bank account for the company.", "24-48 Hours", "One-off", "One-off"),
    "Tide Sole Trade": ("Help opening a Tide sole trader account.", "24-48 Hours", "One-off", "One-off"),
    "TapTap Business Bank": ("Help opening a TapTap business bank account for the company.", "24-48 Hours", "One-off", "One-off"),
    "Wise Business Bank": ("Help opening a Wise business account for the company.", "24-48 Hours", "One-off", "One-off"),
    "Monzo Business Bank": ("Help opening a Monzo business bank account for the company.", "24-48 Hours", "One-off", "One-off"),
    "Zempler Business Bank": ("Help opening a Zempler business bank account for the company.", "24-48 Hours", "One-off", "One-off"),
    "Countingup Business Bank": ("Help opening a Countingup business account for the company.", "24-48 Hours", "One-off", "One-off"),
    "Ifast Business Bank": ("Help opening an iFAST business bank account for the company.", "24-48 Hours", "One-off", "One-off"),
    "Transwap Business Bank": ("Help opening a Transwap business account for the company.", "24-48 Hours", "One-off", "One-off"),
    "Airwallex": ("Help opening an Airwallex business account for the company.", "24-48 Hours", "One-off", "One-off"),
    "PayPal Business": ("Help opening a PayPal business account for the company.", "24-48 Hours", "One-off", "One-off"),
    "Personal Physical Banks": ("Help opening a personal high-street bank account (e.g. Lloyds, Bank of Scotland).", "24-48 Hours", "One-off", "One-off"),
    "Business Website": ("Design and build a business website on the client's domain.", "5-7 Working Days", "One-off", "One-off"),
    "Business Email and Website": ("A business website plus professional email addresses on the client's domain.", "5-7 Working Days", "12 Months", "Annual"),
    "Business Telephone Services": ("A business phone number with call forwarding or call answering.", "24-48 Hours", "12 Months", "Annual"),
    "Accountancy Services": ("Bookkeeping, year-end accounts and tax returns for the company.", "Ongoing", "12 Months", "Annual"),
    "Company Seal": ("A company seal (common seal) engraved with the company name and number.", "3-5 Working Days", "One-off", "One-off"),
}

# Services not in the live CRM: (category, live service whose form they use)
EXTRA = {
    "Same Day Incorporation": ("Solutions", "Incorporation"),
    "All Inclusive": ("Professional", "Incorporation"),
    "Identity Verification": ("Forms", "KYC Verification"),
    "Company Secretary Service": ("Forms", "Company name change service"),
    "Certification of Good Standing Service": ("Forms", "Company name change service"),
    "Apostilled Documents Service": ("Forms", "Company name change service"),
    "Business Telephone Services": ("Solutions", "Business Email and Website"),
    "Company Seal": ("Solutions", "Company name change service"),
}

# Spelling fixes in the live labels, hints and options
FIXES = [
    (r"\bLIink\b", "Link"), (r"Website of Store Front", "Website or Store Front"),
    (r"\bMore then\b", "More than"), (r"\bLess then\b", "Less than"),
    (r"^if have Please Put there$", "If you have one"), (r"^Id Document$", "ID Document"),
    (r"^Proof of address$", "Proof of Address"),
]


def tidy(text):
    for pattern, repl in FIXES:
        text = re.sub(pattern, repl, text)
    return text


def tidy_fields(fields):
    for f in fields:
        f['label'] = tidy(f.get('label') or '')
        if f.get('placeholder'):
            f['placeholder'] = tidy(f['placeholder'])
        if f.get('options'):
            f['options'] = [tidy(o) for o in f['options']]
        for branch in f.get('option_fields') or []:
            tidy_fields(branch)
        tidy_fields(f.get('fields') or [])
    return fields


def main():
    live = {s['name']: s for s in json.load(open(SOURCE, encoding='utf-8'))}
    services = [dict(s) for s in live.values()]
    for name, (category, form_from) in EXTRA.items():
        services.append({'name': name, 'category': category, 'form_fields': live[form_from]['form_fields']})

    out = []
    for s in services:
        desc, delivery, duration, renewal = DETAILS[s['name']]
        raw = tidy_fields(copy.deepcopy(s['form_fields']))
        _date_of_birth_to_date(raw)   # date of birth questions use the calendar
        fields, err = clean_form_fields(raw)
        if err:
            raise SystemExit(f"{s['name']}: {err}")
        # The documents the form asks for (its upload fields)
        docs = [{'id': f['id'], 'name': f['label'], 'required': f['required']} for f in fields if f['type'] == 'file']
        out.append({
            'name': s['name'], 'category': s['category'], 'description': desc,
            'estimated_delivery_time': delivery, 'duration': duration, 'renewal_period': renewal,
            'form_fields': fields, 'document_requirements': docs,
        })
    text = json.dumps(out, indent=2, ensure_ascii=False)
    for m in re.finditer(r".{0,40}(brixen|price|£\s*\d|@).{0,40}", text, re.I):
        print("CHECK:", m.group(0))
    with open(OUTPUT, 'w', encoding='utf-8') as fh:
        fh.write(text + '\n')
    print(len(out), 'services written')


main()
