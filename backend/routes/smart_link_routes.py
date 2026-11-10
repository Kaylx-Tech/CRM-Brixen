"""Smart Operations (/api/admin/smart-links): the team's quick links, grouped by company or provider
(Tide, TapTap, Wise …): partner portals, referral links, forms. Every team member can open and copy them;
admins and managers add, edit and remove them.

GET    /api/admin/smart-links            all links (+ the list of categories)
POST   /api/admin/smart-links            {category, title, url, note}
PUT    /api/admin/smart-links/<id>       any of {category, title, url, note, sort_order}
DELETE /api/admin/smart-links/<id>
GET    /api/admin/smart-links/id-verification   orders with a KYC product (ID Verification tab)
GET    /api/admin/smart-links/company-formation formation orders and their companies (Company Formation tab)
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


def handle_smart_link_routes(environ, start_response, path, method, user, body, query):
    if not path.startswith('/api/admin/smart-links'):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    role = user.get('role')
    if role not in TEAM_ROLES:
        return error_response(start_response, "Smart Operations is for the team only.", status_code=403)

    if path == '/api/admin/smart-links' and method == 'GET':
        rows = query_db("""
            SELECT l.*, u.full_name AS created_by_name FROM smart_links l
            LEFT JOIN users u ON u.id = l.created_by
            ORDER BY LOWER(l.category), l.sort_order, LOWER(l.title);
        """) or []
        links = [dict(r) for r in rows]
        # Finstap's Partner Perks (set in admin.finstap.com) for every workspace, read only
        try:
            from services.partner_perks import for_workspace
            links = for_workspace() + links
        except ImportError:
            pass
        categories = sorted({l['category'] for l in links}, key=str.lower)
        return success_response(start_response, data={
            'links': links, 'categories': categories, 'can_manage': role in MANAGE_ROLES,
        })

    if path == '/api/admin/smart-links/id-verification' and method == 'GET':
        from routes.id_verification_routes import kyc_off_reason
        try:
            from tenancy import current_tenant
            from services.autoallot import kyc_credits
            credits = kyc_credits(current_tenant())
        except ImportError:
            credits = None
        # Checks started on the workspace's own KYC link (no order), and that link while the service is on
        link_checks, kyc_link = [], None
        try:
            from services import kyc_billing, kyc_form
            from routes.id_verification_routes import serialize
            kyc_form.ensure()
            link_checks = [serialize(r) for r in query_db(
                "SELECT * FROM id_verifications WHERE source = 'link' ORDER BY id DESC LIMIT 500;") or []]
            if not kyc_off_reason():
                kyc_link = kyc_billing.link_url(current_tenant())
        except ImportError:
            pass
        # 'didit_configured' keeps its old name for the page: false = the paid KYC service is off
        return success_response(start_response, data={'orders': _kyc_orders(user),
                                                      'didit_configured': not kyc_off_reason(), 'credits': credits,
                                                      'link_checks': link_checks, 'kyc_link': kyc_link})

    if path == '/api/admin/smart-links/company-formation' and method == 'GET':
        return success_response(start_response, data={'orders': _formation_orders(user)})

    if role not in MANAGE_ROLES:
        return error_response(start_response, "Only admins and managers can change Smart Operations links.",
                              status_code=403)

    # The default partner and referral links (the ones a new workspace starts with)
    if path == '/api/admin/smart-links/import-starter' and method == 'POST':
        from services.starter_links import import_starter_links
        added, skipped = import_starter_links(user.get('id'))
        message = f"Added {added} default link(s)." if added else "You already have every default link."
        return success_response(start_response, data={'added': added, 'skipped': skipped}, message=message)

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
