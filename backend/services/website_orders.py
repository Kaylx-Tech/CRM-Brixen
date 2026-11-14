"""Company formation orders placed on the new website (Next.js, website/ in this repo), paid by card on Stripe.

The website's "File Details" form (step 3 of an order) posts here; the customer then pays on Stripe Checkout
(step 4). No WooCommerce in between.

  1. create_formation_order(): checks the form, finds or adds the customer (CLIENT, like the WooCommerce webhook),
     saves the order as a draft (Pending + is_draft = 1, "awaiting card payment") with the form details
     (checkout_form_json, shown under the order's form fields), the mailbox login (access_email /
     access_email_password) and the ID / proof of address files (documents, Pending Review), then opens a Stripe
     Checkout for the package price. The price comes from PACKAGES here, never from the browser.
  2. Stripe's webhook (POST /api/webhooks/stripe, services/address_billing.handle_event) calls
     handle_paid_session() when the payment is through: the draft becomes a placed order, gets its paid invoice
     (which emails the customer the receipt), its Pending company card, and the team is told.

A customer who leaves Stripe without paying leaves a draft order the team can see and follow up.
Nothing here deletes data.
"""
import datetime
import hashlib
import json
import re

from db import query_db, execute_db, unusable_password_hash

# The three formation packages on the website (website/src/lib/home.js PACKAGES): service name and price
PACKAGES = {
    'digital': ('Digital Package', 170.00),
    'professional': ('Professional Package', 300.00),
    'all-inclusive': ('All Inclusive Package', 450.00),
}
ROLES = {'director': 'Director', 'psc': 'PSC (Person with Significant Control)', 'both': 'Director & PSC'}
FILE_FIELDS = (('photo_id', 'Director Photo ID'), ('address_proof', 'Proof of Address'))
MAX_FILES_PER_FIELD = 5
MAX_FILE_BYTES = 15 * 1024 * 1024
FILE_TYPES = {'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png'}
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
CARD = 'Credit Card (Stripe)'


class OrderError(ValueError):
    """Shown to the customer as it is."""


def _text(fields, key, limit=200):
    return re.sub(r'\s+', ' ', str(fields.get(key) or '')).strip()[:limit]


def _check(fields, files):
    """The form's values, checked. Raises OrderError with what to fix."""
    slug = _text(fields, 'package', 40)
    if slug not in PACKAGES:
        raise OrderError("Please choose a company formation package.")
    v = {'package': slug}
    required = {
        'company_name': 'Desired company name', 'director_name': 'Director full name', 'date_of_birth': 'Date of birth',
        'nationality': 'Nationality', 'passport_cnic': 'Passport / CNIC number',
        'issuance_country': 'Country of issuance', 'uk_contact_number': 'UK contact number', 'email': 'Email',
        'email_password': 'Email password', 'company_role': 'Role in company',
        'address_street': 'Home street address', 'address_city': 'Home city', 'address_state': 'Home province / state',
        'address_zip': 'Home postal code', 'address_country': 'Home country',
        'registered_address_zip': 'Registered office postcode', 'registered_address_street': 'Registered office street',
        'registered_address_city': 'Registered office city', 'registered_address_state': 'Registered office county',
        'sic_code': 'Business activity (SIC)',
    }
    for key in list(required) + ['address_line2', 'registered_address_line2', 'sic_description',
                                 'business_description']:
        v[key] = _text(fields, key, 1000 if key == 'business_description' else 200)
    missing = [label for key, label in required.items() if not v[key]]
    if missing:
        raise OrderError(f"Please fill in: {', '.join(missing)}.")
    if len(v['company_name']) < 3:
        raise OrderError("Please enter the company name you want to register.")
    if not EMAIL_RE.match(v['email']):
        raise OrderError("Please enter a valid email address.")
    try:
        born = datetime.date.fromisoformat(v['date_of_birth'])
    except ValueError:
        raise OrderError("Please enter the date of birth as a date.")
    today = datetime.date.today()
    age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    if age < 16 or age > 120:
        raise OrderError("A company director must be at least 16 years old. Please check the date of birth.")
    if v['company_role'] not in ROLES:
        raise OrderError("Please choose your role in the company.")
    if not re.fullmatch(r'\d{4,5}', v['sic_code']):
        raise OrderError("Please choose the business activity from the list.")
    if str(fields.get('non_refund_ack') or '') not in ('1', 'true', 'on', 'yes'):
        raise OrderError("Please confirm that you understand the refund terms.")

    uploads = {}
    for field, label in FILE_FIELDS:
        chosen = [files[k] for k in sorted(files) if k == field or k.startswith(f'{field}_')]
        if not chosen:
            raise OrderError(f"Please upload your {label}.")
        if len(chosen) > MAX_FILES_PER_FIELD:
            raise OrderError(f"Upload at most {MAX_FILES_PER_FIELD} files for {label}.")
        for f in chosen:
            name = str(f.get('filename') or 'document').strip()[:200]
            ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
            data = f.get('bytes') or b''
            if ext not in FILE_TYPES:
                raise OrderError(f"{label}: upload PDF, JPG or PNG files ({name} is not one).")
            if not data:
                raise OrderError(f"{label}: {name} is empty.")
            if len(data) > MAX_FILE_BYTES:
                raise OrderError(f"{label}: {name} is larger than 15 MB.")
        uploads[field] = chosen
    return v, uploads


def _form_fields(v):
    """The details as the order popup shows them (label / value list in checkout_form_json)."""
    home = ', '.join(x for x in (v['address_street'], v['address_line2'], v['address_city'], v['address_state'],
                                 v['address_zip'], v['address_country']) if x)
    office = ', '.join(x for x in (v['registered_address_street'], v['registered_address_line2'],
                                   v['registered_address_city'], v['registered_address_state'],
                                   v['registered_address_zip'], 'United Kingdom') if x)
    sic = v['sic_code'] + (f" · {v['sic_description']}" if v['sic_description'] else '')
    rows = [
        ('Package', PACKAGES[v['package']][0]),
        ('Desired company name', v['company_name']),
        ('Director full name', v['director_name']),
        ('Date of birth', v['date_of_birth']),
        ('Nationality', v['nationality']),
        ('Passport / CNIC number', v['passport_cnic']),
        ('Country of issuance', v['issuance_country']),
        ('UK contact number', v['uk_contact_number']),
        ('Email', v['email']),
        ('Role in company', ROLES[v['company_role']]),
        ('Director home address', home),
        ('Registered office address', office),
        ('Business activity (SIC)', sic),
        ('Description of business activities', v['business_description']),
        ('Refund terms', 'Accepted on the website'),
        ('Placed on', 'New website (card payment on Stripe)'),
    ]
    return [{'label': label, 'value': value} for label, value in rows if value]


def _customer(v):
    """(user id, is new) for the order's email; a new email gets a CLIENT account (no password yet)."""
    try:
        from services.permanent_purge import is_purged_email
        if is_purged_email(v['email']):
            raise OrderError("We cannot take an order for this email address. Please contact us.")
    except ImportError:
        pass
    row = query_db("SELECT id, role FROM users WHERE lower(email) = ? LIMIT 1;", (v['email'].lower(),), one=True)
    if row:
        if row.get('role') != 'CLIENT':
            # A team account: the order still needs a customer of its own
            raise OrderError("This email belongs to a Brixen team account. Please use your own email address.")
        return row['id'], False
    user_id = execute_db("""
        INSERT INTO users (email, password_hash, full_name, phone, country, role, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'CLIENT', 'Active', datetime('now'));
    """, (v['email'].lower(), unusable_password_hash(), v['director_name'], v['uk_contact_number'],
          v['address_country']))
    return user_id, True


def _save_documents(user_id, order_id, order_number, v, uploads):
    from services.storage_service import save_client_file
    saved_names = []
    for field, label in FILE_FIELDS:
        for i, f in enumerate(uploads[field], start=1):
            name = str(f.get('filename') or 'document').strip()[:200]
            ext = name.rsplit('.', 1)[-1].lower()
            data = f['bytes']
            res = save_client_file(client_id=user_id, customer_name=v['director_name'] or v['email'],
                                   filename=name, file_bytes=data, order_id=order_id, mime_type=FILE_TYPES[ext],
                                   order_name=f"Order {order_number}")
            if not res.get('success'):
                raise OrderError("Your documents could not be saved. Please try again in a minute or contact us.")
            doc_name = label if len(uploads[field]) == 1 else f"{label} ({i})"
            execute_db("""
                INSERT INTO documents (
                    name, category, file_path, file_type, file_size, user_id, order_id, uploaded_by,
                    drive_file_id, drive_web_link, lifecycle_status, is_posted, client_visible, status, review_notes,
                    file_hash, uploaded_at, created_at
                ) VALUES (?, 'Checkout Upload', ?, ?, ?, ?, ?, 'Customer Upload', ?, ?, 'REVIEW_REQUIRED', 0, 0,
                          'Pending Review', ?, ?, CURRENT_TIMESTAMP, datetime('now'));
            """, (doc_name, res.get('file_path'), FILE_TYPES[ext], str(res.get('file_size') or len(data)), user_id,
                  order_id, res.get('drive_file_id'), res.get('drive_web_link'),
                  f"Uploaded with the website order form ({name}). Awaiting staff review.",
                  hashlib.sha256(data).hexdigest()))
            saved_names.append(doc_name)
    return saved_names


def create_formation_order(fields, files, website_url):
    """Save the website form as a draft order and open Stripe Checkout. Returns {order_number, checkout_url}.

    website_url is where Stripe sends the customer back (the website the form was sent from)."""
    from services import address_billing
    from services.audit_service import log_order_timeline
    from services.order_numbers import next_order_number

    v, uploads = _check(fields if isinstance(fields, dict) else {}, files if isinstance(files, dict) else {})
    if not address_billing.configured():
        raise OrderError("Card payment is not available right now. Please contact us and we will help you order.")
    service_name, price = PACKAGES[v['package']]
    user_id, _new = _customer(v)

    order_number = next_order_number()
    order_id = execute_db("""
        INSERT INTO orders (
            order_number, user_id, service_name, price, vat, total, status, notes, payment_mode,
            owner_name, owner_form_email, checkout_phone, checkout_dob, access_email, access_email_password,
            checkout_form_json, order_form_values_json, is_draft, current_step, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 0, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'));
    """, (order_number, user_id, service_name, price, price,
          'Website order: awaiting card payment on Stripe.', CARD,
          v['director_name'], v['email'], v['uk_contact_number'], v['date_of_birth'], v['email'], v['email_password'],
          json.dumps(_form_fields(v)), json.dumps({'proposed_company_name': v['company_name'], 'source': 'website'})))
    log_order_timeline(order_id, 'Pending', 'Order form sent from the website',
                       f"{service_name} for {v['company_name']}: waiting for the card payment.")

    try:
        _save_documents(user_id, order_id, order_number, v, uploads)
    except OrderError:
        log_order_timeline(order_id, 'Pending', 'Documents not saved', 'The upload failed; the customer was asked to try again.')
        raise

    site = website_url.rstrip('/')
    try:
        session = address_billing._api('POST', '/checkout/sessions', {
            'mode': 'payment',
            'customer_email': v['email'],
            'client_reference_id': str(order_id),
            'line_items': [{'quantity': 1, 'price_data': {
                'currency': address_billing.CURRENCY, 'unit_amount': int(round(price * 100)),
                'product_data': {'name': f"{service_name} · {v['company_name']}"}}}],
            'success_url': f"{site}/order-complete/?order={order_number.lstrip('#')}",
            'cancel_url': f"{site}/{v['package']}-package-company-registration/?payment=cancelled",
            'metadata': {'kind': 'formation', 'order_id': order_id, 'order_number': order_number},
            'payment_intent_data': {'metadata': {'kind': 'formation', 'order_id': order_id,
                                                 'order_number': order_number}},
        })
    except address_billing.StripeError:
        raise OrderError("We could not open the card payment page. Please try again in a minute or contact us.")
    log_order_timeline(order_id, 'Pending', 'Sent to card payment', f"Stripe Checkout {session.get('id')}.")
    return {'order_number': order_number, 'checkout_url': session['url']}


def handle_paid_session(session):
    """Stripe Checkout for a website formation order is paid: place the order. Returns a note for the log."""
    meta = session.get('metadata') or {}
    order_id = str(meta.get('order_id') or '')
    if not order_id.isdigit():
        return 'formation order without an order id'
    if session.get('payment_status') not in ('paid', 'no_payment_required'):
        return 'formation payment not finished yet'
    order = query_db("SELECT o.*, u.email, u.full_name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?;",
                     (int(order_id),), one=True)
    if not order:
        return 'unknown formation order'
    if not int(order.get('is_draft') or 0):
        return 'formation order already placed'

    from services.audit_service import log_order_timeline
    from services.invoice_service import ensure_invoice_for_order
    from services.notification_service import notify_staff
    from services.client_mail import email_team

    paid = round((session.get('amount_total') or 0) / 100, 2)
    note = f"Paid £{paid:.2f} by card on Stripe ({session.get('payment_intent') or session.get('id')})."
    if paid + 0.005 < float(order.get('total') or 0):
        # Never expected (the price is set here), but do not treat a short payment as paid in full
        log_order_timeline(order['id'], 'Pending', 'Card payment lower than the order total', note)
        notify_staff('Website payment does not match', f"Order {order['order_number']}: {note}",
                     'payment_failed', '/admin/orders')
        return 'formation payment lower than the total'

    execute_db("UPDATE orders SET is_draft = 0, status = 'Pending', notes = ?, updated_at = datetime('now') "
               "WHERE id = ? AND is_draft = 1;", (f"Website order. {note}", order['id']))
    log_order_timeline(order['id'], 'Pending', 'Paid on the website', note)
    try:
        from services.order_companies import ensure_formation_company
        values = json.loads(order.get('order_form_values_json') or '{}')
        ensure_formation_company(order['id'], (values or {}).get('proposed_company_name') or '')
    except Exception as exc:
        from services.error_tracking import report_problem
        report_problem('formation_company', exc, level='error', order_id=order['id'])
    # Paid invoice; creating it paid also emails the customer the receipt
    ensure_invoice_for_order(order['id'], paid=True)
    who = order.get('owner_name') or order.get('full_name') or order.get('email')
    notify_staff('New website order (paid)', f"Order {order['order_number']} from {who}: {order['service_name']}, "
                 f"£{paid:.2f} paid by card.", 'order_update', '/admin/orders')
    email_team(f"New website order {order['order_number']} (paid) — Brixen Consultants",
               f"A new paid website order is in the CRM.\nOrder: {order['order_number']}\nClient: {who}\n"
               f"Package: {order['service_name']}\n{note}", link_path='/admin/orders', order_id=order['id'])
    return 'formation order placed'
