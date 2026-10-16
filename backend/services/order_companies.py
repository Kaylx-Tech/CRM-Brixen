"""Companies picked on an order form: Companies House details for the form, and linking them to the order.

* company_ch_details(number): official profile + active directors (name, role, month/year of birth,
  nationality, appointed date) shown in the order wizard once a registered company is selected.
* link_order_companies(order_id, client_id, entries): every company on the order form is found in the CRM
  (by number, or by name for a not-yet-registered one) or created for the customer, and the order is
  linked to it (orders.company_id = the first one; all of them are listed in the order's form values).
"""
import calendar
import datetime
import json
import re
import secrets

from db import query_db, execute_db
from services.companies_house_service import fetch_company_profile, fetch_company_officers
from services.webfiling_import import canonical_company_number

DIRECTOR_ROLES = ('director', 'corporate-director', 'nominee-director', 'corporate-nominee-director')


def _officer_name(name):
    text = str(name or '').strip()
    if ',' in text:
        last, first = text.split(',', 1)
        text = f"{first.strip()} {last.strip().title()}".strip()
    return text


def _dob_text(dob):
    if not isinstance(dob, dict) or not dob.get('year'):
        return ''
    try:
        month = int(dob.get('month') or 0)
    except (TypeError, ValueError):
        month = 0
    return f"{calendar.month_name[month]} {dob['year']}" if 1 <= month <= 12 else str(dob['year'])


def _address_text(addr):
    addr = addr if isinstance(addr, dict) else {}
    keys = ('care_of', 'po_box', 'premises', 'address_line_1', 'address_line_2', 'locality', 'region',
            'postal_code', 'country')
    return ', '.join(str(addr.get(k)).strip() for k in keys if str(addr.get(k) or '').strip())


def _in_crm(number):
    row = query_db("""
        SELECT c.id, c.name, c.user_id, u.full_name AS owner_name
        FROM companies c LEFT JOIN users u ON u.id = c.user_id
        WHERE UPPER(c.company_number) = ? LIMIT 1;
    """, (number.upper(),), one=True)
    return {'id': row['id'], 'name': row['name'], 'user_id': row.get('user_id'),
            'owner_name': row.get('owner_name') or ''} if row else None


def company_ch_details(number):
    number = canonical_company_number(number)
    if not number:
        return None, 'Enter a company number'
    prof = fetch_company_profile(number)
    if not prof.get('success') or not prof.get('data'):
        return None, prof.get('error') or 'Company not found at Companies House'
    p = prof['data']
    directors = []
    officers = fetch_company_officers(number)
    for o in (officers.get('officers') or []) if officers.get('success') else []:
        if o.get('resigned_on') or str(o.get('officer_role') or '').lower() not in DIRECTOR_ROLES:
            continue
        directors.append({
            'name': _officer_name(o.get('name')),
            'role': str(o.get('officer_role') or 'director').replace('-', ' ').capitalize(),
            'dob': _dob_text(o.get('date_of_birth')),
            'nationality': o.get('nationality') or '',
            'occupation': o.get('occupation') or '',
            'residence': o.get('country_of_residence') or '',
            'appointed': o.get('appointed_on') or '',
        })
    accounts = p.get('accounts') or {}
    confirmation = p.get('confirmation_statement') or {}
    return {
        'name': p.get('company_name') or '',
        'number': p.get('company_number') or number,
        'status': (p.get('company_status') or '').replace('-', ' ').capitalize(),
        'incorporated': p.get('date_of_creation') or '',
        'address': _address_text(p.get('registered_office_address')),
        'sic_codes': ', '.join(p.get('sic_codes') or []),
        'accounts_next_due': accounts.get('next_due') or '',
        'confirmation_next_due': confirmation.get('next_due') or '',
        'directors': directors,
        'officers_error': '' if officers.get('success') else (officers.get('error') or 'Directors could not be loaded'),
        'in_crm': _in_crm(p.get('company_number') or number),
    }, None


def _create_registered_company(client_id, details):
    first_director = (details.get('directors') or [{}])[0].get('name') or 'Director'
    company_id = execute_db("""
        INSERT INTO companies (user_id, name, company_number, status, inc_date, director, reg_office, sic_codes,
                               accounts_next_due, confirmation_next_due, package, account_status, data_locked,
                               created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Order form', 'Good Standing', 1, datetime('now', 'localtime'));
    """, (client_id, details['name'], details['number'], details.get('status') or 'Active',
          details.get('incorporated') or datetime.date.today().isoformat(), first_director, details.get('address') or 'United Kingdom',
          details.get('sic_codes') or None, details.get('accounts_next_due') or None,
          details.get('confirmation_next_due') or None))
    for d in details.get('directors') or []:
        execute_db("""
            INSERT INTO company_directors (company_id, name, role, nationality, appointed_date)
            VALUES (?, ?, ?, ?, ?);
        """, (company_id, d['name'], d.get('role') or 'Director', d.get('nationality') or None,
              d.get('appointed') or None))
    return company_id


def link_order_companies(order_id, client_id, entries):
    """Find or create each company and link it to the order. Returns [{company_id, name, number, created}]."""
    linked, seen = [], set()
    for entry in entries if isinstance(entries, list) else []:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get('name') or '').strip()[:200]
        number = canonical_company_number(entry.get('number')) if entry.get('registered') else ''
        key = number or name.lower()
        if not key or key in seen:
            continue
        seen.add(key)
        try:
            linked.append(_link_one(client_id, name, number))
        except Exception as exc:  # one bad company must not stop the others
            print(f"[order companies] {name or number}: {exc}")
            linked.append({'company_id': None, 'name': name, 'number': number, 'error': str(exc)})

    ids = [c['company_id'] for c in linked if c.get('company_id')]
    if ids:
        execute_db("UPDATE orders SET company_id = COALESCE(company_id, ?) WHERE id = ?;", (ids[0], order_id))
        row = query_db("SELECT order_form_values_json FROM orders WHERE id = ?;", (order_id,), one=True) or {}
        try:
            values = json.loads(row.get('order_form_values_json') or '{}')
        except (TypeError, ValueError):
            values = {}
        if not isinstance(values, dict):
            values = {}
        values['linked_companies'] = [c for c in linked if c.get('company_id')]
        execute_db("UPDATE orders SET order_form_values_json = ? WHERE id = ?;", (json.dumps(values), order_id))
    return linked


def _link_one(client_id, name, number):
    """Find or create one company. Returns {company_id, name, number, created} (company_id None + error on failure)."""
    if number:
        found = _in_crm(number)
        if found:
            if not found.get('user_id') and client_id:
                execute_db("UPDATE companies SET user_id = ? WHERE id = ?;", (client_id, found['id']))
            return {'company_id': found['id'], 'name': found['name'], 'number': number, 'created': False}
        # Server-side lookup: never trust company data sent by the browser
        details, error = company_ch_details(number)
        if error or not details:
            return {'company_id': None, 'name': name, 'number': number, 'error': error}
        company_id = _create_registered_company(client_id, details)
        return {'company_id': company_id, 'name': details['name'], 'number': number, 'created': True}

    row = query_db("SELECT id FROM companies WHERE user_id = ? AND LOWER(TRIM(name)) = LOWER(?) LIMIT 1;",
                   (client_id, name), one=True)
    if row:
        return {'company_id': row['id'], 'name': name, 'number': '', 'created': False}
    # A proposed company (not registered yet): kept as a pending company for the customer
    company_id = execute_db("""
        INSERT INTO companies (user_id, name, company_number, status, inc_date, director, reg_office,
                               package, created_at)
        VALUES (?, ?, ?, 'Pending', DATE('now'), 'Director', 'United Kingdom', 'Order form',
                datetime('now', 'localtime'));
    """, (client_id, name, f"REG-{secrets.token_hex(4).upper()}"))
    return {'company_id': company_id, 'name': name, 'number': '', 'created': True}


# ── Company formation orders ─────────────────────────────────────────────────
# A formation (incorporation) order gets a Pending company card straight away, so the team sees it under
# Companies > Not registered until it is registered; "Mark as registered" then turns it into the live company.

FORMATION_HINTS = (
    'formation', 'incorporat', 'company registration', 'register company', 'register a company',
    'company register', 'new company', 'set up a company', 'setup company', 'company set up', 'company setup',
    'company package', 'digital package', 'professional package', 'all inclusive package',
)

NAME_KEYS = ('proposed_company_name', 'desired_company_name', 'company_name', 'new_company_name', 'proposed_name')


def is_formation_order(*names):
    text = ' '.join(str(n or '') for n in names).lower()
    return any(hint in text for hint in FORMATION_HINTS)


def proposed_company_name(values, extra_name=''):
    """The new company's name from the order form: a name-availability field first, then the usual keys."""
    values = values if isinstance(values, dict) else {}
    fields = [f for f in values.get('service_fields') or [] if isinstance(f, dict)]
    for item in fields:
        check = item.get('name_check')
        if isinstance(check, dict) and str(check.get('name') or '').strip():
            return str(check['name']).strip()[:200]
    # A plain text question such as "Desired Company Name" / "Proposed company name"
    for item in fields:
        label = str(item.get('label') or '').lower()
        value = str(item.get('value') or '').strip()
        if item.get('type') in ('text', 'company_name') and value and re.search(
                r'(desired|proposed|new|preferred)\s+(company\s+)?name|company\s+name', label) \
                and not re.search(r'number|registered|house', label.split('›')[-1]):
            return re.sub(r'\s+·\s+(Available|Not available|Availability not checked)$', '', value)[:200]
    for key in NAME_KEYS:
        if str(values.get(key) or '').strip():
            return str(values[key]).strip()[:200]
    return str(extra_name or '').strip()[:200]


def website_company_name(payload):
    """Proposed company name on a WooCommerce order (checkout fields, order meta or line item meta; app.py)."""
    payload = payload if isinstance(payload, dict) else {}
    preferred = ('_cfs_company_name', 'proposed_company_name', 'company_name', 'billing_company', '_billing_company')
    meta = payload.get('meta_data') or payload.get('meta') or []
    if isinstance(meta, dict):
        meta = [{'key': k, 'value': v} for k, v in meta.items()]
    for key in preferred:
        for item in meta if isinstance(meta, list) else []:
            if isinstance(item, dict) and str(item.get('key') or '') == key and str(item.get('value') or '').strip():
                return str(item['value']).strip()[:200]
    billing = payload.get('billing') or {}
    for value in (payload.get('proposed_company_name'), payload.get('company_name'), billing.get('company')):
        if str(value or '').strip():
            return str(value).strip()[:200]
    for line in payload.get('line_items') or []:
        for item in (line or {}).get('meta_data') or [] if isinstance(line, dict) else []:
            key = str((item or {}).get('key') or '').lower() if isinstance(item, dict) else ''
            value = item.get('value') if isinstance(item, dict) else None
            if isinstance(value, str) and value.strip() and ('company' in key or 'proposed' in key):
                return value.strip()[:200]
    return ''


def ensure_formation_company(order_id, company_name=''):
    """Give a formation order its Pending company card. Returns the company id or None.

    No company on the order yet: the Pending company becomes the order's company. The order already has a
    registered company (e.g. picked for a bank account in the same order) but the form names a different new
    company to incorporate: that new company is still added as Pending and listed with the order's companies.
    """
    order = query_db("""
        SELECT o.id, o.order_number, o.user_id, o.company_id, o.service_name, o.order_form_values_json,
               COALESCE(o.is_draft, 0) AS is_draft, u.email,
               c.name AS company_name, c.company_number
        FROM orders o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN companies c ON c.id = o.company_id
        WHERE o.id = ?;
    """, (order_id,), one=True)
    if not order or order.get('is_draft') or not order.get('user_id'):
        return None
    linked_number = str(order.get('company_number') or '').upper()
    if order.get('company_id') and (not linked_number or linked_number.startswith(('REG-', 'PENDING'))):
        return None  # already linked to a not-registered company
    # Website orders from unknown emails sit on the shared guest account until staff verify them
    if str(order.get('email') or '').lower() == 'guest.unlinked@brixenconsultants.com':
        return None
    items = query_db("SELECT product_name, category_name FROM order_line_items WHERE order_id = ?;", (order_id,))
    if not is_formation_order(order.get('service_name'),
                              *[f"{i.get('product_name') or ''} {i.get('category_name') or ''}" for i in items]):
        return None
    try:
        values = json.loads(order.get('order_form_values_json') or '{}')
    except (TypeError, ValueError):
        values = {}
    values = values if isinstance(values, dict) else {}
    proposed = proposed_company_name(values, company_name)
    if order.get('company_id'):
        # A registered company is on the order: only a differently named new company is added
        if not proposed or proposed.strip().lower() == str(order.get('company_name') or '').strip().lower():
            return None
    name = proposed or f"New company (order {order.get('order_number') or order_id})"

    row = query_db("""
        SELECT id FROM companies
        WHERE user_id = ? AND LOWER(TRIM(name)) = LOWER(?)
          AND (company_number IS NULL OR company_number = '' OR company_number LIKE 'REG-%' OR company_number LIKE 'PENDING%')
        LIMIT 1;
    """, (order['user_id'], name), one=True)
    if row:
        company_id = row['id']
    else:
        company_id = execute_db("""
            INSERT INTO companies (user_id, name, company_number, status, inc_date, director, reg_office,
                                   package, created_at)
            VALUES (?, ?, ?, 'Pending', DATE('now'), 'Director', 'United Kingdom', ?, datetime('now', 'localtime'));
        """, (order['user_id'], name, f"REG-{secrets.token_hex(4).upper()}", (order.get('service_name') or 'Formation')[:120]))
    if not order.get('company_id'):
        execute_db("UPDATE orders SET company_id = ? WHERE id = ? AND company_id IS NULL;", (company_id, order_id))
    # Listed with the order's companies (order popup "Linked companies")
    linked = values.get('linked_companies') if isinstance(values.get('linked_companies'), list) else []
    if not any(isinstance(c, dict) and c.get('company_id') == company_id for c in linked):
        linked.append({'company_id': company_id, 'name': name, 'number': '', 'created': not row})
        values['linked_companies'] = linked
        execute_db("UPDATE orders SET order_form_values_json = ? WHERE id = ?;", (json.dumps(values), order_id))
    return company_id


def backfill_formation_companies():
    """Every placed formation order gets its Pending company (orders from before this was automatic).

    Returns [{order_id, order_number, company_id}] for the orders that got one.
    """
    done = []
    rows = query_db("""
        SELECT o.id, o.order_number FROM orders o
        WHERE COALESCE(o.is_draft, 0) = 0 AND o.status NOT IN ('Cancelled', 'Refunded')
        ORDER BY o.id;
    """) or []
    for row in rows:
        before = query_db("SELECT COUNT(*) AS n FROM companies;", one=True)['n']
        company_id = ensure_formation_company(row['id'])
        after = query_db("SELECT COUNT(*) AS n FROM companies;", one=True)['n']
        if company_id and after > before:
            done.append({'order_id': row['id'], 'order_number': row['order_number'], 'company_id': company_id})
    return done


def register_pending_company(company_id, number):
    """Turn a Pending company card into the registered company from Companies House.

    Returns (company_id, None) or (None, error). The card keeps its id, customer and linked orders.
    """
    comp = query_db("SELECT id, name, company_number, user_id FROM companies WHERE id = ?;", (company_id,), one=True)
    if not comp:
        return None, 'Company not found'
    current = str(comp.get('company_number') or '').strip().upper()
    if current and not (current.startswith('REG-') or current.startswith('PENDING')):
        return None, 'This company is already registered'
    number = canonical_company_number(number)
    if not number:
        return None, 'Enter the company number from Companies House'
    clash = _in_crm(number)
    if clash and clash['id'] != comp['id']:
        return None, (f"{number} is already in the CRM as {clash['name']} (company #{clash['id']}). "
                      f"Open that company instead.")
    details, error = company_ch_details(number)
    if error or not details:
        return None, error or 'Company not found at Companies House'

    first_director = (details.get('directors') or [{}])[0].get('name') or 'Director'
    execute_db("""
        UPDATE companies SET name = ?, company_number = ?, status = ?, inc_date = ?, director = ?, reg_office = ?,
               sic_codes = ?, accounts_next_due = ?, confirmation_next_due = ?, account_status = 'Good Standing',
               data_locked = 1
        WHERE id = ?;
    """, (details['name'] or comp['name'], details['number'], details.get('status') or 'Active',
          details.get('incorporated') or datetime.date.today().isoformat(), first_director,
          details.get('address') or 'United Kingdom', details.get('sic_codes') or None,
          details.get('accounts_next_due') or None, details.get('confirmation_next_due') or None, comp['id']))
    if details.get('directors') and not query_db(
            "SELECT 1 FROM company_directors WHERE company_id = ? LIMIT 1;", (comp['id'],), one=True):
        for d in details['directors']:
            execute_db("""
                INSERT INTO company_directors (company_id, name, role, nationality, appointed_date)
                VALUES (?, ?, ?, ?, ?);
            """, (comp['id'], d['name'], d.get('role') or 'Director', d.get('nationality') or None,
                  d.get('appointed') or None))
    return comp['id'], None
