"""Rebuild backend/services/starter_catalog.json from the order-form templates. No prices.

Run: python backend/scripts/build_starter_catalog.py
"""
import json, os, re, sys

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
from services.product_catalog_config import get_product_form_config  # noqa: E402
from routes.catalog_routes import clean_form_fields  # noqa: E402

# name, category, delivery, duration, renewal, description
SERVICES = [
    ("Same Day Incorporation", "Solutions", "Same Day", "One-off", "One-off",
     "Register a new UK limited company with Companies House on the same working day."),
    ("Digital Package", "Digital", "24-48 Hours", "12 Months", "Annual",
     "Company formation with a business bank account and a digital starter setup."),
    ("Professional Package", "Professional", "24-48 Hours", "12 Months", "Annual",
     "Company formation with registered office, director service address and business bank support."),
    ("All Inclusive", "Professional", "24-48 Hours", "12 Months", "Annual",
     "Complete company formation package: addresses, bank account, website, email and compliance setup."),
    ("Registered Office Address", "Forms", "24-48 Hours", "12 Months", "Annual",
     "A registered office address for Companies House, with official mail scanned and forwarded."),
    ("Directors Service Address", "Forms", "24-48 Hours", "12 Months", "Annual",
     "A service address for directors so their home address stays off the public register."),
    ("Business Mail Forwarding Address", "Forms", "24-48 Hours", "12 Months", "Annual",
     "A business mailing address with letters scanned or forwarded to the client."),
    ("Company Secretary Service", "Forms", "24-48 Hours", "12 Months", "Annual",
     "Ongoing company secretarial support: statutory registers, filings and Companies House updates."),
    ("Confirmation Statement Service", "Forms", "24-48 Hours", "One-off", "Annual",
     "Prepare and file the company's annual confirmation statement with Companies House."),
    ("Dormant company accounts service", "Forms", "3-5 Working Days", "One-off", "Annual",
     "Prepare and file dormant company accounts with Companies House."),
    ("Directors Appointment or Resignation", "Forms", "24-48 Hours", "One-off", "One-off",
     "Appoint a new director or file a director's resignation at Companies House."),
    ("Company name change service", "Forms", "24-48 Hours", "One-off", "One-off",
     "Change the company's registered name at Companies House."),
    ("Company Dissolution Service", "Forms", "3-5 Working Days", "One-off", "One-off",
     "Apply to strike off and close a company that is no longer needed."),
    ("Certification of Good Standing Service", "Forms", "3-5 Working Days", "One-off", "One-off",
     "Obtain an official certificate of good standing for the company from Companies House."),
    ("Apostilled Documents Service", "Forms", "5-7 Working Days", "One-off", "One-off",
     "Get company documents certified and apostilled for use abroad."),
    ("VAT Registration", "Forms", "5-10 Working Days", "One-off", "One-off",
     "Register the business for VAT with HMRC."),
    ("Identity Verification", "Forms", "24-48 Hours", "One-off", "One-off",
     "Companies House identity verification for directors and people with significant control."),
    ("KYC Verification", "Forms", "24-48 Hours", "One-off", "One-off",
     "Know-your-customer checks on the client's identity and address documents."),
    ("Tide Business Bank", "Forms", "24-48 Hours", "One-off", "One-off",
     "Help opening a Tide business bank account for the company."),
    ("TapTap Business Bank", "Forms", "24-48 Hours", "One-off", "One-off",
     "Help opening a TapTap business bank account for the company."),
    ("Wise Business Bank", "Forms", "24-48 Hours", "One-off", "One-off",
     "Help opening a Wise business account for the company."),
    ("Monzo Business Bank", "Forms", "24-48 Hours", "One-off", "One-off",
     "Help opening a Monzo business bank account for the company."),
    ("Zempler Business Bank", "Forms", "24-48 Hours", "One-off", "One-off",
     "Help opening a Zempler business bank account for the company."),
    ("Countingup Business Bank", "Forms", "24-48 Hours", "One-off", "One-off",
     "Help opening a Countingup business account for the company."),
    ("Ifast Business Bank", "Forms", "24-48 Hours", "One-off", "One-off",
     "Help opening an iFAST business bank account for the company."),
    ("Transwap Business Bank", "Forms", "24-48 Hours", "One-off", "One-off",
     "Help opening a Transwap business account for the company."),
    ("Business Website", "Forms", "5-7 Working Days", "One-off", "One-off",
     "Design and build a business website on the client's domain."),
    ("Business Email and Website", "Solutions", "5-7 Working Days", "12 Months", "Annual",
     "A business website plus professional email addresses on the client's domain."),
    ("Business Telephone Services", "Solutions", "24-48 Hours", "12 Months", "Annual",
     "A business phone number with call forwarding or call answering."),
    ("Accountancy Services", "Solutions", "Ongoing", "12 Months", "Annual",
     "Bookkeeping, year-end accounts and tax returns for the company."),
    ("Company Seal", "Solutions", "3-5 Working Days", "One-off", "One-off",
     "A company seal (common seal) engraved with the company name and number."),
]

TEXT_HINTS = {
    "date": "DD/MM/YYYY",
    "email": "name@example.com",
    "phone": "e.g. +44 7700 900000",
    "number": "Numbers only",
    "address": "Address line 1, city, postcode, country",
    "country": "e.g. United Kingdom",
}
COMPANY_LABEL = re.compile(r"company (registered )?name|registered company name|company (registration )?number|"
                           r"companies house company number|business / trading name|client company name", re.I)
COMPANY_NUMBER_ONLY = re.compile(r"number", re.I)


def placeholder_for(f):
    ph = str(f.get("placeholder") or "").strip()
    if not ph and f.get("default_value"):
        ph = f"e.g. {f['default_value']}"
    if not ph:
        ph = TEXT_HINTS.get(f.get("type"), "")
    if not ph and f.get("help_text"):
        ph = f["help_text"]
    return ph[:160]


def convert_field(f, prefix=""):
    ftype = str(f.get("type") or "text").lower()
    label = str(f.get("label") or "").strip()
    noun = prefix.split(" ")[0]
    if noun and label.lower().startswith(noun.lower() + " "):
        label = label[len(noun) + 1:]
    label = (prefix + label[:1].upper() + label[1:]).strip()
    out = {"id": f.get("id") or label, "label": label, "required": bool(f.get("required"))}
    if ftype in ("dropdown", "select", "radio") and len(f.get("options") or []) >= 2:
        out.update(type="radio", options=list(f["options"]))
    elif ftype == "file":
        out.update(type="file")
    else:
        out.update(type="text", placeholder=placeholder_for(f))
    return out


def convert(cfg, is_formation):
    fields, has_company = [], False
    raw = cfg.get("fields") or []
    dependants = {}
    for f in raw:
        if f.get("depends_on"):
            dependants.setdefault(f["depends_on"], []).append(f)
    for f in raw:
        if f.get("depends_on"):
            continue
        label = str(f.get("label") or "")
        if is_formation and f.get("id") == "proposed_company_name":
            fields.append({"id": "proposed_company_name", "label": "Proposed company name", "type": "company_name",
                           "required": True, "placeholder": placeholder_for(f)})
            continue
        if not is_formation and f.get("type") in ("text", None) and COMPANY_LABEL.search(label):
            if has_company:
                continue   # one Companies House lookup covers both the name and the number
            has_company = True
            fields.append({"id": "company", "label": "Company name or number", "type": "company",
                           "required": bool(f.get("required")), "placeholder": "Search Companies House"})
            continue
        out = convert_field(f)
        if out["type"] == "radio" and f.get("id") in dependants:
            branches = []
            for opt in out["options"]:
                branches.append([convert_field(d) for d in dependants[f["id"]]
                                 if str(d.get("condition_value")) == str(opt)])
            out["option_fields"] = branches
        fields.append(out)

    # Repeatable sections (directors, shareholders) -> first person on the form, a tick box for a second
    for sec in cfg.get("repeatable_sections") or []:
        title = str(sec.get("title") or sec.get("id") or "Person")
        noun = "Director" if "director" in title.lower() else ("Shareholder" if "share" in title.lower() else "Person")
        fields.extend(convert_field(sf, f"{noun} 1 – ") for sf in sec.get("fields") or [])
        fields.append({"id": f"add_second_{noun.lower()}", "label": f"Add a second {noun.lower()}", "type": "checkbox",
                       "required": False,
                       "fields": [convert_field(sf, f"{noun} 2 – ") for sf in sec.get("fields") or []]})

    for doc in cfg.get("document_requirements") or []:
        fields.append({"id": doc.get("id") or doc.get("name"), "label": doc.get("name"), "type": "file",
                       "required": bool(doc.get("required"))})
    # Drop a second file field that asks for the same document as an existing one (e.g. Company logo)
    seen, uniq = set(), []
    for f in fields:
        key = (f["type"], re.sub(r"[^a-z]", "", f["label"].lower()))
        if f["type"] == "file" and key in seen:
            continue
        seen.add(key)
        uniq.append(f)
    return uniq


def main():
    out = []
    for name, cat, delivery, duration, renewal, desc in SERVICES:
        cfg = get_product_form_config(name, "")
        fields, err = clean_form_fields(convert(cfg, cfg.get("form_profile") == "formation"))
        if err:
            raise SystemExit(f"{name}: {err}")
        docs = [{k: d[k] for k in ("id", "name", "description", "required", "allowed_extensions") if k in d}
                for d in cfg.get("document_requirements") or []]
        out.append({
            "name": name, "category": cat, "description": desc,
            "estimated_delivery_time": delivery, "duration": duration, "renewal_period": renewal,
            "form_fields": fields, "document_requirements": docs,
        })
    text = json.dumps(out, indent=2, ensure_ascii=False)
    if re.search(r"brixen|price|£\s*\d", text, re.I):
        for m in re.finditer(r".{0,40}(brixen|price|£\s*\d).{0,40}", text, re.I):
            print("CHECK:", m.group(0))
    with open(os.path.join(BACKEND, "services", "starter_catalog.json"), "w", encoding="utf-8") as fh:
        fh.write(text + "\n")
    print(len(out), "services written")


main()
