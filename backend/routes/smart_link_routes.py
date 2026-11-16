"""Smart Operations (/api/admin/smart-links): the team's quick links, grouped by company or provider
(Tide, TapTap, Wise …): partner portals, referral links, forms. Every team member can open and copy them;
admins and managers add, edit and remove them.

GET    /api/admin/smart-links            all links (+ the list of categories)
POST   /api/admin/smart-links            {category, title, url, note}
PUT    /api/admin/smart-links/<id>       any of {category, title, url, note, sort_order}
DELETE /api/admin/smart-links/<id>
GET    /api/admin/smart-links/id-verification   orders with a KYC product (ID Verification tab)
GET    /api/admin/smart-links/company-formation formation orders and their companies (Company Formation tab)
GET    /api/admin/smart-links/registered-addresses  every registered office address service (Registered Address tab)
"""
import json
import re

from db import query_db, execute_db
from utils.response import success_response, error_response

TEAM_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
MANAGE_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER')


def _clean(body, partial=False):
    """Validated fields from the request. Returns (fields, error)."""
    body = body if isinstance(body, dict) else {}
    out = {}
    for key, limit in (('category', 80), ('title', 160), ('url', 2000), ('note', 1000)):
        if key in body or not partial:
            out[key] = str(body.get(key) or '').strip()[:limit]
    for key in ('category', 'title', 'url'):
        if key in out and not out[key]:
            return None, f"{key.capitalize()} is required"
    if 'url' in out:
        if not re.match(r'^https?://', out['url'], re.I):
            out['url'] = f"https://{out['url']}"
        if not re.match(r'^https?://[^\s/$.?#][^\s]*$', out['url'], re.I):
            return None, "Enter a valid link, e.g. https://www.tide.co/…"
    if 'sort_order' in body:
        try:
            out['sort_order'] = int(body.get('sort_order') or 0)
        except (TypeError, ValueError):
            return None, "Sort order must be a number"
    return out, None


def _row(link_id):
    row = query_db("""
        SELECT l.*, u.full_name AS created_by_name FROM smart_links l
        LEFT JOIN users u ON u.id = l.created_by WHERE l.id = ?;
    """, (link_id,), one=True)
    return dict(row) if row else None


def _kyc_orders(user):
    """ID Verification: every order with a KYC product, as the service name or as one of its line items
    (newest first). STAFF only see the orders they added, as on the Orders page; no money is returned."""
    clauses = ["COALESCE(o.is_draft, 0) = 0",
               "(o.service_name LIKE '%kyc%' OR EXISTS (SELECT 1 FROM order_line_items li "
               "WHERE li.order_id = o.id AND li.product_name LIKE '%kyc%'))"]
    params = []
    if user.get('role') == 'STAFF':
        clauses.append("o.created_by_id = ?")
        params.append(user.get('id'))
    rows = query_db(f"""
        SELECT o.id, o.order_number, o.service_name, o.status, o.created_at, o.owner_name, o.owner_form_email,
               o.order_form_values_json, o.checkout_form_json,
               u.full_name AS customer_name, u.email AS customer_email,
               c.name AS company_name, c.company_number, cb.full_name AS created_by_name,
               (SELECT GROUP_CONCAT(li.product_name, ', ') FROM order_line_items li
                 WHERE li.order_id = o.id AND li.product_name LIKE '%kyc%') AS kyc_products
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN companies c ON c.id = o.company_id
        LEFT JOIN users cb ON cb.id = o.created_by_id
        WHERE {' AND '.join(clauses)}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 500;
    """, tuple(params)) or []
    orders = [dict(r) for r in rows]
    # Company not registered yet ("Company already registered: No"): the desired name from the order form
    # stands in for the company, marked as not registered; the form answers themselves are not sent
    from services.order_companies import proposed_company_name
    for o in orders:
        raw = o.pop('order_form_values_json', None)
        number = str(o.get('company_number') or '').upper()
        o['company_registered'] = bool(o.get('company_name')) and not number.startswith(('REG-', 'PENDING'))
        if number.startswith(('REG-', 'PENDING')):
            o['company_number'] = None
        if not o.get('company_name'):
            try:
                values = json.loads(raw or '{}')
            except (TypeError, ValueError):
                values = {}
            o['company_name'] = proposed_company_name(values) or None
    # The applicant (the order form's person, e.g. "Director name"), not the account that placed the order
    from services.order_applicant import applicant
    for o in orders:
        o['applicant_name'], o['applicant_email'] = applicant(
            {**o, 'full_name': o.get('customer_name'), 'email': o.get('customer_email')})
        o.pop('checkout_form_json', None)
        # The people to verify on each order, with their Didit status
    from routes.id_verification_routes import people_for_orders
    people = people_for_orders([o['id'] for o in orders])
    for o in orders:
        o['people'] = people.get(o['id'], [])
    return orders


def _formation_orders(user):
    """Company Formation: every placed order with an incorporation / formation product (service name or a
    line item), newest first, with the companies being formed (the order's Pending company and any linked
    new company). STAFF only see the orders they added, as on the Orders page; no money is returned."""
    from services.order_companies import FORMATION_HINTS, proposed_company_name
    from services.order_applicant import applicant
    likes = ' OR '.join(['LOWER(o.service_name) LIKE ?'] * len(FORMATION_HINTS))
    item_likes = ' OR '.join(["LOWER(COALESCE(li.product_name, '') || ' ' || COALESCE(li.category_name, '')) LIKE ?"]
                             * len(FORMATION_HINTS))
    clauses = ["COALESCE(o.is_draft, 0) = 0",
               f"(({likes}) OR EXISTS (SELECT 1 FROM order_line_items li WHERE li.order_id = o.id AND ({item_likes})))"]
    params = [f"%{h}%" for h in FORMATION_HINTS] * 2
    if user.get('role') == 'STAFF':
        clauses.append("o.created_by_id = ?")
        params.append(user.get('id'))
    rows = query_db(f"""
        SELECT o.id, o.order_number, o.service_name, o.status, o.created_at, o.owner_name, o.owner_form_email,
               o.company_id, o.order_form_values_json, o.checkout_form_json,
               u.full_name AS customer_name, u.email AS customer_email, cb.full_name AS created_by_name,
               (SELECT GROUP_CONCAT(li.product_name, ', ') FROM order_line_items li
                 WHERE li.order_id = o.id) AS products
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN users cb ON cb.id = o.created_by_id
        WHERE {' AND '.join(clauses)}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT 500;
    """, tuple(params)) or []
    orders = [dict(r) for r in rows]  # the SQL matched a formation hint on the service or a line item

    # The companies on each order: its own company plus the "Linked companies" of the order form
    values_by_order, company_ids = {}, set()
    for o in orders:
        try:
            values = json.loads(o.pop('order_form_values_json', None) or '{}')
        except (TypeError, ValueError):
            values = {}
        values = values if isinstance(values, dict) else {}
        values_by_order[o['id']] = values
        ids = [o.get('company_id')] + [c.get('company_id') for c in (values.get('linked_companies') or [])
                                       if isinstance(c, dict)]
        o['_company_ids'] = [i for i in dict.fromkeys(ids) if isinstance(i, int)]
        company_ids.update(o['_company_ids'])
    companies = {}
    if company_ids:
        marks = ','.join('?' * len(company_ids))
        for c in query_db(f"""SELECT id, name, company_number, status, inc_date FROM companies
                              WHERE id IN ({marks});""", tuple(company_ids)) or []:
            number = str(c.get('company_number') or '').upper()
            pending = not number or number.startswith(('REG-', 'PENDING'))
            companies[c['id']] = {'id': c['id'], 'name': c.get('name'), 'registered': not pending,
                                  'company_number': None if pending else c.get('company_number'),
                                  'status': c.get('status'), 'inc_date': None if pending else c.get('inc_date')}

    for o in orders:
        listed = [companies[i] for i in o.pop('_company_ids') if i in companies]
        # A registered company picked for another service on the same order is not being formed
        forming = [c for c in listed if not c['registered']]
        formed = [c for c in listed if c['registered'] and c['id'] != o.get('company_id')]
        if not forming and not formed and listed:
            formed = listed  # the order's own company, already registered (formation done)
        o['companies'] = forming + formed
        o['proposed_name'] = proposed_company_name(values_by_order[o['id']]) or None
        o['formation_status'] = ('Registered' if o['companies'] and all(c['registered'] for c in o['companies'])
                                 else 'Pending' if o['companies'] else 'No company')
        o['applicant_name'], o['applicant_email'] = applicant(
            {**o, 'full_name': o.get('customer_name'), 'email': o.get('customer_email')})
        o.pop('checkout_form_json', None)
    return orders


def _registered_addresses(user):
    """Registered Address: every company whose registered office is at one of Brixen's addresses, as the
    yearly address service the client portal shows (paid from incorporation, a year more per paid renewal;
    Renews soon / Renewal due / Expired / Auto-renew / Payment failed), plus addresses added by hand
    (addresses table). STAFF only see the companies of the orders they added; no prices are returned."""
    from routes.client_portal_routes import _company_address_service, _is_brixen_address
    company_clauses, params = ["TRIM(COALESCE(c.reg_office, '')) <> ''"], []
    if user.get('role') == 'STAFF':
        company_clauses.append("c.id IN (SELECT company_id FROM orders WHERE created_by_id = ?)")
        params.append(user.get('id'))
    companies = query_db(f"""
        SELECT c.id, c.name, c.company_number, c.reg_office, c.inc_date, c.created_at, c.status AS company_status,
               u.id AS customer_id, u.full_name AS customer_name, u.email AS customer_email
        FROM companies c LEFT JOIN users u ON u.id = c.user_id
        WHERE {' AND '.join(company_clauses)}
        ORDER BY datetime(c.created_at) DESC LIMIT 2000;
    """, tuple(params)) or []

    hand_clauses, hand_params = ["1 = 1"], []
    if user.get('role') == 'STAFF':
        hand_clauses.append("a.company_id IN (SELECT company_id FROM orders WHERE created_by_id = ?)")
        hand_params.append(user.get('id'))
    by_hand = query_db(f"""
        SELECT a.*, c.name AS company_name, c.company_number, u.id AS customer_id, u.full_name AS customer_name,
               u.email AS customer_email
        FROM addresses a LEFT JOIN companies c ON c.id = a.company_id LEFT JOIN users u ON u.id = a.user_id
        WHERE {' AND '.join(hand_clauses)} ORDER BY a.created_at DESC;
    """, tuple(hand_params)) or []
    listed = {a.get('company_id') for a in by_hand if a.get('company_id')}

    rows = []
    for a in by_hand:
        line = ', '.join(x for x in (a.get('line1'), a.get('line2'), a.get('city'), a.get('postal_code')) if x)
        rows.append({'id': f"address-{a['id']}", 'company_id': a.get('company_id'), 'company_name': a.get('company_name'),
                     'company_number': a.get('company_number'), 'customer_id': a.get('customer_id'),
                     'customer_name': a.get('customer_name'), 'customer_email': a.get('customer_email'),
                     'address': line, 'type': a.get('type'), 'start_date': a.get('start_date'),
                     'expiry_date': a.get('expiry_date'), 'status': a.get('status'), 'auto_renew': None,
                     'renewal_invoice': None, 'source': 'Added by hand'})
    for c in companies:
        if c['id'] in listed or not _is_brixen_address(c.get('reg_office')):
            continue
        s = _company_address_service(c)
        invoice = s.get('renewal_invoice') or None
        rows.append({'id': s['id'], 'company_id': c['id'], 'company_name': c.get('name'),
                     'company_number': c.get('company_number'), 'customer_id': c.get('customer_id'),
                     'customer_name': c.get('customer_name'), 'customer_email': c.get('customer_email'),
                     'address': s.get('line1'), 'type': 'Registered Office', 'start_date': s.get('start_date'),
                     'expiry_date': s.get('expiry_date'), 'status': s.get('status'), 'auto_renew': s.get('auto_renew'),
                     'renewal_invoice': {'invoice_number': invoice.get('invoice_number'), 'status': invoice.get('status')}
                     if invoice else None, 'source': 'Company registered office'})
    # Soonest renewal first; addresses without a date last
    rows.sort(key=lambda r: (r.get('expiry_date') is None, str(r.get('expiry_date') or '')))
    return rows


def handle_smart_link_routes(environ, start_response, path, method, user, body, query):
    if not path.startswith('/api/admin/smart-links'):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    role = user.get('role')
    if role not in TEAM_ROLES:
        return error_response(start_response, "Smart Operations is for the Brixen team.", status_code=403)

    if path == '/api/admin/smart-links' and method == 'GET':
        rows = query_db("""
            SELECT l.*, u.full_name AS created_by_name FROM smart_links l
            LEFT JOIN users u ON u.id = l.created_by
            ORDER BY LOWER(l.category), l.sort_order, LOWER(l.title);
        """) or []
        links = [dict(r) for r in rows]
        categories = sorted({l['category'] for l in links}, key=str.lower)
        return success_response(start_response, data={
            'links': links, 'categories': categories, 'can_manage': role in MANAGE_ROLES,
        })

    if path == '/api/admin/smart-links/id-verification' and method == 'GET':
        from services.didit_service import is_configured
        return success_response(start_response, data={'orders': _kyc_orders(user),
                                                      'didit_configured': is_configured()})

    if path == '/api/admin/smart-links/company-formation' and method == 'GET':
        return success_response(start_response, data={'orders': _formation_orders(user)})

    if path == '/api/admin/smart-links/registered-addresses' and method == 'GET':
        from services import address_reminders
        rows = _registered_addresses(user)
        last = address_reminders.last_reminders()
        for r in rows:
            r['last_reminder'] = last.get(r.get('company_id')) if r.get('company_id') else None
        return success_response(start_response, data={
            'addresses': rows, 'auto_reminders': address_reminders.auto_enabled(),
            'auto_days': address_reminders.AUTO_DAYS_BEFORE, 'can_manage': role in MANAGE_ROLES})

    # Reminder button: email the customer to renew now (any team member)
    remind = re.match(r'^/api/admin/smart-links/registered-addresses/(\d+)/remind$', path)
    if remind and method == 'POST':
        from services import address_reminders
        try:
            sent = address_reminders.send(int(remind.group(1)), 'manual', user.get('full_name') or user.get('email'))
        except address_reminders.ReminderError as exc:
            return error_response(start_response, str(exc), status_code=400)
        message = (f"Reminder emailed to {sent['sent_to']}." if sent['emailed']
                   else f"Reminder saved, but the email to {sent['sent_to']} could not be sent (check the email settings).")
        return success_response(start_response, data=sent, message=message)

    # Auto reminders on / off (admins and managers)
    if path == '/api/admin/smart-links/registered-addresses/auto-reminders' and method == 'POST':
        if role not in MANAGE_ROLES:
            return error_response(start_response, "Only admins and managers can change auto reminders.", status_code=403)
        from services import address_reminders
        on = address_reminders.set_auto(bool((body or {}).get('enabled')))
        return success_response(start_response, data={'auto_reminders': on}, message=(
            f"Auto reminders are on: one email a day in the last {address_reminders.AUTO_DAYS_BEFORE} days."
            if on else "Auto reminders are off."))

    if role not in MANAGE_ROLES:
        return error_response(start_response, "Only admins and managers can change Smart Operations links.",
                              status_code=403)

    if path == '/api/admin/smart-links' and method == 'POST':
        fields, err = _clean(body)
        if err:
            return error_response(start_response, err, status_code=400)
        link_id = execute_db("""
            INSERT INTO smart_links (category, title, url, note, sort_order, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) + 1 FROM smart_links WHERE category = ?), 0), ?,
                    datetime('now'), datetime('now'));
        """, (fields['category'], fields['title'], fields['url'], fields['note'] or None, fields['category'],
              user.get('id')))
        return success_response(start_response, data=_row(link_id), message="Link added.", status_code=201)

    match = re.match(r'^/api/admin/smart-links/(\d+)$', path)
    if match:
        link_id = int(match.group(1))
        if not _row(link_id):
            return error_response(start_response, "Link not found", status_code=404)
        if method in ('PUT', 'PATCH'):
            fields, err = _clean(body, partial=True)
            if err:
                return error_response(start_response, err, status_code=400)
            if fields:
                sets = ', '.join(f"{k} = ?" for k in fields)
                params = [(v or None) if k == 'note' else v for k, v in fields.items()]
                execute_db(f"UPDATE smart_links SET {sets}, updated_at = datetime('now') WHERE id = ?;",
                           tuple(params + [link_id]))
            return success_response(start_response, data=_row(link_id), message="Link updated.")
        if method == 'DELETE':
            execute_db("DELETE FROM smart_links WHERE id = ?;", (link_id,))
            return success_response(start_response, message="Link removed.")

    return error_response(start_response, "Not found", status_code=404)
