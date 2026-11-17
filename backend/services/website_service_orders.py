"""Service orders from the new website (Next.js, website/): every service page's order form ("details" page), paid
by card on Stripe. Company formation packages have their own form (services/website_orders.py).

The form shown is the service's own order form from the CRM catalogue (Services > order form) when the service is in
the CRM with a form (crm_form() below; the website reads them from GET /api/public/service-forms); otherwise the
WordPress-style form in website/src/lib/service-forms.js. It posts:
  service          the service key below (the price is set here, never by the browser)
  fields_json      [{label, value}, ...] what the customer filled in, as shown under the order's form fields
  email, name, phone, company_name, company_number   the customer and company, for the CRM record
  opt_<name>       choices that change the price (OPTIONS below)
  file_<name>_<n>  uploads, with file_label_<name> as their name (REQUIRED_FILES below)
  service_fields_json   with a CRM form: [{id, label, type, value}] the answers to its questions, checked against
                   the form here (required questions, uploads) and saved like an order made in the CRM
                   (order_form_values_json.service_fields)
The order is saved as a draft (Pending + is_draft) until Stripe's webhook reports the payment
(services/website_orders.handle_paid_session, the same as formation orders).
"""
import hashlib
import json
import re

from db import query_db, execute_db

# key: (service name in the CRM, price in £). WooCommerce prices, rounded to whole pounds as the website shows them.
SERVICES = {
    'kyc-verification': ('KYC Verification', 30.00),
    'companies-house-id-verification': ('Identity Verification', 20.00),
    'confirmation-statement': ('Confirmation Statement Service', 100.00),
    'company-dissolution': ('Company Dissolution Service', 90.00),
    'company-name-change': ('Company Name Change Service', 90.00),
    'dormant-company-accounts': ('Dormant Company Accounts Service', 100.00),
    'directors-appointment-or-resignation': ('Directors Appointment or Resignation', 50.00),
    'company-secretary': ('Company Secretary Service', 150.00),
    'certification-of-good-standing': ('Certification of Good Standing Service', 80.00),
    'apostilled-documents': ('Apostilled Documents Service', 100.00),
    'business-website': ('Business Website', 200.00),
    'vat-registration': ('VAT Registration', 250.00),
    'registered-office-address': ('Registered Office Address', 70.00),
    'business-mail-forwarding-address': ('Business Mail Forwarding Address', 100.00),
    'directors-service-address': ('Directors Service Address', 30.00),
    'tide-business-bank': ('Tide Business Bank', 50.00),
    'zempler-business-bank': ('Zempler Business Bank', 100.00),
    'wise-business-bank': ('Wise Business Bank', 100.00),
    'countingup-business-bank': ('Countingup Business Bank', 200.00),
    'ifast-business-bank': ('Ifast Business Bank', 100.00),
    'monzo-business-bank': ('Monzo Business Bank', 200.00),
    'transwap-business-bank': ('Transwap Business Bank', 200.00),
}
# The CRM service whose order form the website shows, when its name differs from SERVICES (matched without case)
CRM_NAMES = {
    'registered-office-address': ('Registered Office Address', 'Registered Business Address'),
}
# Choices that add to the price: service -> option -> value -> extra £
OPTIONS = {
    'certification-of-good-standing': {'delivery_option': {'dhl_delivery': 50.00}},
}
# Uploads a service cannot go without: service -> [(file field, label)]
REQUIRED_FILES = {
    'tide-business-bank': [('valid_passport', 'Valid Passport'), ('bank_statement', 'Local Bank Statement')],
    'companies-house-id-verification': [('photo_id', 'Director Photo ID'), ('address_proof', 'Proof of Address')],
}
# Where the customer goes back to when they leave Stripe without paying
DETAILS_PAGE = {
    'kyc-verification': '/kyc-service-details/',
    'companies-house-id-verification': '/companies-house-id-verification/',
    'confirmation-statement': '/confirmation-statement-service-details/',
    'company-dissolution': '/company-dissolution-service-details/',
    'company-name-change': '/company-name-change-details/',
    'dormant-company-accounts': '/dormant-company-accounts-service-details/',
    'directors-appointment-or-resignation': '/directors-appointment-or-resignation-details/',
    'company-secretary': '/company-secretary-service-details/',
    'certification-of-good-standing': '/certification-good-standing-service-details/',
    'apostilled-documents': '/apostilled-documents-service-details/',
    'business-website': '/business-website-service-details/',
    'vat-registration': '/vat-registration-service-details/',
    'registered-office-address': '/registered-office-address-details/',
    'business-mail-forwarding-address': '/business-mail-forwarding-address-details/',
    'directors-service-address': '/directors-service-address-details/',
    **{f'{b}-business-bank': f'/{b}-business-bank-details/' for b in
       ('tide', 'zempler', 'wise', 'countingup', 'ifast', 'monzo', 'transwap')},
}
MAX_FIELDS = 150
MAX_FILES = 12
MAX_FILE_BYTES = 15 * 1024 * 1024
FILE_TYPES = {'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
              'doc': 'application/msword',
              'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def _norm(name):
    return re.sub(r'[^a-z0-9]+', ' ', str(name or '').lower()).strip()


def crm_form(service):
    """(CRM service row, its order-form fields) for a website service key, or None when the service is not in the
    CRM (Active) or has no form."""
    from routes.catalog_routes import form_fields_of
    if service not in SERVICES:
        return None
    names = {_norm(n) for n in (SERVICES[service][0], *CRM_NAMES.get(service, ()))}
    rows = query_db("SELECT id, name, form_config_json FROM services WHERE status = 'Active' ORDER BY id;") or []
    for row in rows:
        if _norm(row['name']) in names:
            fields = form_fields_of(dict(row))
            if fields:
                return dict(row), fields
    return None


def crm_forms():
    """{website service key: {'service': CRM name, 'fields': [...]}} for every service that has a CRM form."""
    out = {}
    for key in SERVICES:
        found = crm_form(key)
        if found:
            out[key] = {'service': found[0]['name'], 'fields': found[1]}
    return out


def _crm_answers(service, raw, uploads):
    """The answers to the CRM form, checked: every required question that applies has an answer and every required
    upload is there. Returns (CRM service row, service_fields as the CRM saves them)."""
    from services.website_orders import OrderError
    found = crm_form(service)
    if not found:
        raise OrderError("This order form was updated. Please refresh the page and fill it in again.")
    row, fields = found
    try:
        items = json.loads(raw or '[]')
    except (TypeError, ValueError):
        items = None
    if not isinstance(items, list):
        raise OrderError("The form could not be read. Please refresh the page and try again.")
    answers = {}
    for item in items[:MAX_FIELDS]:
        if isinstance(item, dict) and item.get('id'):
            answers[str(item['id'])] = str(item.get('value') or '').strip()[:2000]

    out, missing = [], []

    def walk(level):
        for f in level:
            value = answers.get(f['id'], '')
            if f['type'] == 'file':
                if f.get('required') and f'crm_{f["id"]}' not in uploads:
                    missing.append(f['label'])
            elif f.get('required') and f['type'] != 'checkbox' and not value:
                missing.append(f['label'])
            if value:
                out.append({'label': f['label'], 'type': f['type'], 'value': value, 'services': [row['name']]})
            if f['type'] == 'radio':
                for option, branch in zip(f.get('options') or [], f.get('option_fields') or []):
                    if value == option:
                        walk(branch or [])
            if f['type'] == 'checkbox' and value.lower() in ('yes', 'true', '1', 'on'):
                walk(f.get('fields') or [])

    walk(fields)
    if missing:
        raise OrderError(f"Please fill in: {', '.join(missing[:6])}.")
    from utils.validation import check_service_fields
    bad = check_service_fields(out)
    if bad:
        label, message = next(iter(bad.items()))
        raise OrderError(f"{label}: {message}")
    return row, out


def _text(fields, key, limit=200):
    return re.sub(r'\s+', ' ', str(fields.get(key) or '')).strip()[:limit]


def _check(fields, files):
    from services.website_orders import OrderError
    service = _text(fields, 'service', 80)
    if service not in SERVICES:
        raise OrderError("Please choose a service.")
    v = {k: _text(fields, k) for k in ('email', 'name', 'phone', 'company_name', 'company_number')}
    v['service'] = service
    missing = [label for key, label in (('name', 'your name'), ('email', 'your email'), ('phone', 'your phone number'))
               if not v[key]]
    if missing:
        raise OrderError(f"Please fill in {', '.join(missing)}.")
    if not EMAIL_RE.match(v['email']):
        raise OrderError("Please enter a valid email address.")
    try:
        rows = json.loads(fields.get('fields_json') or '[]')
    except (TypeError, ValueError):
        rows = None
    if not isinstance(rows, list) or not rows:
        raise OrderError("The form could not be read. Please refresh the page and try again.")
    form = []
    for row in rows[:MAX_FIELDS]:
        if not isinstance(row, dict):
            continue
        label = re.sub(r'\s+', ' ', str(row.get('label') or '')).strip()[:200]
        value = str(row.get('value') or '').strip()[:2000]
        if label and value:
            form.append({'label': label, 'value': value})

    price = SERVICES[service][1]
    for option, values in OPTIONS.get(service, {}).items():
        price += values.get(_text(fields, f'opt_{option}', 80), 0)

    uploads = {}
    for key, f in sorted((files or {}).items()):
        m = re.fullmatch(r'file_([a-z0-9_]+)_(\d+)', key)
        if not m:
            continue
        name = str(f.get('filename') or 'document').strip()[:200]
        ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
        data = f.get('bytes') or b''
        if ext not in FILE_TYPES:
            raise OrderError(f"{name}: upload PDF, JPG, PNG or Word files.")
        if not data:
            raise OrderError(f"{name} is empty.")
        if len(data) > MAX_FILE_BYTES:
            raise OrderError(f"{name} is larger than 15 MB.")
        label = _text(fields, f'file_label_{m.group(1)}', 120) or m.group(1).replace('_', ' ').capitalize()
        uploads.setdefault(m.group(1), {'label': label, 'files': []})['files'].append((name, ext, data))
    if sum(len(u['files']) for u in uploads.values()) > MAX_FILES:
        raise OrderError(f"Upload at most {MAX_FILES} files.")
    crm = None
    if fields.get('service_fields_json'):
        crm = _crm_answers(service, fields.get('service_fields_json'), uploads)
    else:
        for field, label in REQUIRED_FILES.get(service, []):
            if field not in uploads:
                raise OrderError(f"Please upload your {label}.")
    v['crm'] = crm
    return v, form, round(price, 2), uploads


def _save_documents(user_id, order_id, order_number, customer_name, uploads):
    from services.storage_service import save_client_file
    from services.website_orders import OrderError
    for field, item in uploads.items():
        for i, (name, ext, data) in enumerate(item['files'], start=1):
            res = save_client_file(client_id=user_id, customer_name=customer_name, filename=name, file_bytes=data,
                                   order_id=order_id, mime_type=FILE_TYPES[ext], order_name=f"Order {order_number}")
            if not res.get('success'):
                raise OrderError("Your documents could not be saved. Please try again in a minute or contact us.")
            doc_name = item['label'] if len(item['files']) == 1 else f"{item['label']} ({i})"
            execute_db("""
                INSERT INTO documents (
                    name, category, file_path, file_type, file_size, user_id, order_id, uploaded_by,
                    drive_file_id, drive_web_link, lifecycle_status, is_posted, client_visible, status, review_notes,
                    file_hash, uploaded_at, created_at
                ) VALUES (?, 'Checkout Upload', ?, ?, ?, ?, ?, 'Customer Upload', ?, ?, 'REVIEW_REQUIRED', 0, 0,
                          'Pending Review', ?, ?, CURRENT_TIMESTAMP, datetime('now'));
            """, (doc_name[:200], res.get('file_path'), FILE_TYPES[ext], str(res.get('file_size') or len(data)), user_id,
                  order_id, res.get('drive_file_id'), res.get('drive_web_link'),
                  f"Uploaded with the website order form ({name}). Awaiting staff review.",
                  hashlib.sha256(data).hexdigest()))


def create_service_order(fields, files, website_url):
    """Save a website service order as a draft and open Stripe Checkout. Returns {order_number, checkout_url}."""
    from services import address_billing
    from services.audit_service import log_order_timeline
    from services.order_numbers import next_order_number
    from services.website_orders import CARD, OrderError, _customer

    v, form, price, uploads = _check(fields if isinstance(fields, dict) else {}, files if isinstance(files, dict) else {})
    if not address_billing.configured():
        raise OrderError("Card payment is not available right now. Please contact us and we will help you order.")
    service_name = SERVICES[v['service']][0]
    user_id, _new = _customer({'email': v['email'], 'director_name': v['name'], 'uk_contact_number': v['phone'],
                               'address_country': ''})

    rows = [{'label': 'Service', 'value': service_name}] + form + [
        {'label': 'Placed on', 'value': 'New website (card payment on Stripe)'}]
    order_number = next_order_number()
    order_id = execute_db("""
        INSERT INTO orders (
            order_number, user_id, service_name, price, vat, total, status, notes, payment_mode,
            owner_name, owner_form_email, checkout_phone, checkout_form_json, order_form_values_json,
            is_draft, current_step, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 0, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'));
    """, (order_number, user_id, service_name, price, price, 'Website order: awaiting card payment on Stripe.', CARD,
          v['name'], v['email'], v['phone'], json.dumps(rows),
          json.dumps({'source': 'website', 'service': v['service'], 'company_name': v['company_name'],
                      'company_number': v['company_number'],
                      **({'service_fields': v['crm'][1], 'crm_service_id': v['crm'][0]['id']} if v['crm'] else {})})))
    what = f" for {v['company_name']}" if v['company_name'] else ''
    log_order_timeline(order_id, 'Pending', 'Order form sent from the website',
                       f"{service_name}{what}: waiting for the card payment.")
    if uploads:
        try:
            _save_documents(user_id, order_id, order_number, v['name'] or v['email'], uploads)
        except OrderError:
            log_order_timeline(order_id, 'Pending', 'Documents not saved', 'The upload failed; the customer was asked to try again.')
            raise

    site = website_url.rstrip('/')
    meta = {'kind': 'website_order', 'order_id': order_id, 'order_number': order_number}
    line_name = f"{service_name} · {v['company_name']}" if v['company_name'] else service_name
    try:
        session = address_billing._api('POST', '/checkout/sessions', {
            'mode': 'payment',
            'customer_email': v['email'],
            'client_reference_id': str(order_id),
            'line_items': [{'quantity': 1, 'price_data': {
                'currency': address_billing.CURRENCY, 'unit_amount': int(round(price * 100)),
                'product_data': {'name': line_name[:250]}}}],
            'success_url': f"{site}/order-complete/?order={order_number.lstrip('#')}",
            'cancel_url': f"{site}{DETAILS_PAGE.get(v['service'], '/')}?payment=cancelled",
            'metadata': meta,
            'payment_intent_data': {'metadata': meta},
        })
    except address_billing.StripeError:
        raise OrderError("We could not open the card payment page. Please try again in a minute or contact us.")
    log_order_timeline(order_id, 'Pending', 'Sent to card payment', f"Stripe Checkout {session.get('id')}.")
    return {'order_number': order_number, 'checkout_url': session['url'], 'total': price}
