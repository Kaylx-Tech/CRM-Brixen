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
