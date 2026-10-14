"""Company Management Routes (/api/companies, /api/admin/companies)
Matches original app.py build_companies_payload and Companies House live sync with 100% precision.
"""
import re
import os
import json
import time
import datetime
import threading
from db import query_db, execute_db, unusable_password_hash
from utils.response import json_response, success_response, error_response
from services.companies_house_service import (
    fetch_company_profile,
    fetch_company_officers,
    search_companies_house,
    get_ch_api_key,
)
from services.ch_attention import company_attention_issues, issues_from_profile
from services.data_protection import (
    looks_like_official_company_number,
    is_pending_placeholder_number,
    can_force_delete_genuine,
    refuse_company_purge,
)

_CH_LIST_SYNC_LAST = 0.0
_CH_LIST_SYNC_LOCK = threading.Lock()

def is_pending_company_number(company_number):
    num = str(company_number or '').strip().upper()
    return not num or num.startswith('REG-') or num.startswith('PENDING')

def company_list_order_sql():
    return (
        "datetime(c.created_at) DESC, "
        "CASE "
        "WHEN c.inc_date IS NOT NULL AND length(trim(c.inc_date)) >= 10 THEN date(c.inc_date) "
        "ELSE date('1970-01-01') END DESC, "
        "c.id DESC"
    )

def company_country_label(row):
    return 'United Kingdom'

def registered_address_from_company_row(row):
    if is_pending_company_number((row or {}).get('company_number')):
        return None
    reg_office = str((row or {}).get('reg_office') or '').strip()
    if reg_office and reg_office.lower() not in ('united kingdom', 'uk', 'none', 'n/a'):
        return reg_office
    return None

def format_deadline_text(row):
    acc_due = row.get('accounts_next_due')
    acc_overdue = int(row.get('accounts_overdue') or 0)
    conf_due = row.get('confirmation_next_due')
    conf_overdue = int(row.get('confirmation_overdue') or 0)

    if acc_overdue:
        return f"Accounts OVERDUE: {acc_due}" if acc_due else "Accounts Overdue"
    if conf_overdue:
        return f"Confirmation Statement OVERDUE: {conf_due}" if conf_due else "Confirmation Overdue"
    if acc_due:
        return f"Accounts due: {acc_due}"
    if conf_due:
        return f"Confirmation due: {conf_due}"
    return "No upcoming deadlines"

def public_client_company(row, for_staff=True):
    if not row:
        return None
    src = dict(row)
    number = str(src.get('company_number') or '').strip()
    is_reg = not is_pending_company_number(number)
    is_gen = looks_like_official_company_number(number)

    inc_date = src.get('inc_date') or src.get('incorporation_date')
    if inc_date and len(str(inc_date)) >= 10:
        inc_date_str = str(inc_date)[:10]
    else:
        inc_date_str = None

    reg_addr = registered_address_from_company_row(src) or src.get('reg_office') or 'United Kingdom'
    deadline_str = format_deadline_text(src)
    attention = company_attention_issues(src)

    return {
        'id': src.get('id'),
        'name': src.get('name') or src.get('company_name') or 'Unnamed Company',
        'company_name': src.get('name') or src.get('company_name') or 'Unnamed Company',
        'company_number': number or '#00000000',
        'number': number or '#00000000',
        'status': src.get('status') or 'Active',
        'inc_date': inc_date_str,
        'incorporation_date': inc_date_str,
        'incDate': inc_date_str,
        'director': src.get('director') or 'Director',
        'director_name': src.get('director') or 'Director',
        'reg_office': reg_addr,
        'registered_office_address': reg_addr,
        'registered_address': reg_addr,
        'address': reg_addr,
        'is_registered': is_reg,
        'is_genuine': is_gen,
        'data_locked': int(src.get('data_locked') or (1 if is_gen else 0)),
        'package': src.get('package') or 'Standard Corporate',
        'account_status': src.get('account_status') or 'Good Standing',
        'country': company_country_label(src),
        'countryFlag': '🇬🇧',
        'countryName': 'UK',
        'created_at': src.get('created_at'),
        'user_id': src.get('user_id'),
        'client_name': src.get('client_name') or '',
        'client_email': src.get('client_email') or '',
        'utr_number': str(src.get('utr_number') or '').strip(),
        'authentication_code': str(src.get('authentication_code') or '').strip(),
        'activation_code': str(src.get('activation_code') or '').strip(),
        'identity_verified': str(src.get('identity_verified') or 'Not started').strip() or 'Not started',
        'psc_verified': str(src.get('psc_verified') or 'Not started').strip() or 'Not started',
        'sic_codes': str(src.get('sic_codes') or '').strip(),
        'registered_email': str(src.get('registered_email') or '').strip(),
        'whatsapp_number': str(src.get('whatsapp_number') or '').strip(),
        'accounts_next_due': src.get('accounts_next_due'),
        'accounts_overdue': int(src.get('accounts_overdue') or 0),
        'confirmation_next_due': src.get('confirmation_next_due'),
        'confirmation_overdue': int(src.get('confirmation_overdue') or 0),
        'deadlineText': deadline_str,
        'attention': attention,
        'needs_attention': bool(attention),
        'ch_checked_at': src.get('ch_checked_at'),
        'b2b_id': src.get('b2b_id'),
        'client_type': src.get('client_type'),
    }

def pending_registration_orders(user_id=None, for_client=False):
    sql = """
        SELECT o.id, o.order_number, o.service_name, COALESCE((SELECT GROUP_CONCAT(li.product_name, ', ') FROM order_line_items li WHERE li.order_id = o.id), o.service_name) AS products_summary, o.status, o.created_at, o.user_id,
               u.full_name as client_name, u.email as client_email
        FROM orders o
        JOIN users u ON u.id = o.user_id
        WHERE o.company_id IS NULL
          AND COALESCE(o.portfolio_hidden, 0) = 0
          AND (o.service_name LIKE '%formation%' OR o.service_name LIKE '%incorporation%' OR EXISTS (SELECT 1 FROM order_line_items li WHERE li.order_id = o.id AND (li.product_name LIKE '%formation%' OR li.product_name LIKE '%incorporation%')))
    """
    params = []
    if user_id:
        sql += " AND o.user_id = ?"
        params.append(user_id)
    sql += " ORDER BY o.created_at DESC;"
    
    rows = query_db(sql, params) or []
    pending = []
    for r in rows:
        pending.append({
            'order_id': r['id'],
            'order_number': r.get('order_number') or f"#{r['id']}",
            'service_name': r.get('products_summary') or r.get('service_name') or 'Company Formation',
            'status': r.get('status') or 'Pending',
            'created_at': r.get('created_at'),
            'client_name': r.get('client_name') or '',
            'client_email': r.get('client_email') or '',
            'user_id': r.get('user_id'),
        })
    return pending

def schedule_portfolio_ch_sync(user_id=None):
    """Run non-blocking Companies House background refresh."""
    global _CH_LIST_SYNC_LAST
    now = time.time()
    with _CH_LIST_SYNC_LOCK:
        if (now - _CH_LIST_SYNC_LAST) < 45:
            return False
        _CH_LIST_SYNC_LAST = now

    def _job():
        try:
            api_key = get_ch_api_key()
            if not api_key:
                return

            # Refresh up to 5 companies needing update (never-checked attention first, then oldest)
            sql = """
                SELECT id, company_number, name, inc_date, status
                FROM companies
                WHERE length(trim(company_number)) >= 6
                  AND company_number NOT LIKE 'REG-%'
                  AND (ch_attention_json IS NULL OR ch_checked_at IS NULL
                       OR datetime(ch_checked_at) < datetime('now', '-12 hours'))
                ORDER BY (ch_attention_json IS NULL) DESC, ch_checked_at ASC LIMIT 5;
            """
            due_comps = query_db(sql) or []
            for comp in due_comps:
                num = comp['company_number']
                profile = fetch_company_profile(num)
                if profile.get('success') and profile.get('data'):
                    d = profile['data']
                    status = (d.get('company_status') or 'active').capitalize()
                    inc_date = d.get('date_of_creation')
                    
                    accounts_data = d.get('accounts', {})
                    acc_next_due = accounts_data.get('next_due')
                    acc_overdue = 1 if accounts_data.get('overdue') else 0
                    
                    conf_data = d.get('confirmation_statement', {})
                    conf_next_due = conf_data.get('next_due')
                    conf_overdue = 1 if conf_data.get('overdue') else 0
                    attention = issues_from_profile(d)

                    execute_db("""
                        UPDATE companies
                        SET status = ?, inc_date = COALESCE(?, inc_date),
                            accounts_next_due = ?, accounts_overdue = ?,
                            confirmation_next_due = ?, confirmation_overdue = ?,
                            ch_attention_json = ?,
                            ch_checked_at = datetime('now')
                        WHERE id = ?;
                    """, (status, inc_date, acc_next_due, acc_overdue, conf_next_due, conf_overdue,
                          json.dumps(attention), comp['id']))
                else:
                    # Lookup failed: mark checked so one bad number doesn't block the queue
                    # (retried after 12 hours; stored due dates still drive attention meanwhile)
                    execute_db("""
                        UPDATE companies SET ch_checked_at = datetime('now'),
                            ch_attention_json = COALESCE(ch_attention_json, '[]')
                        WHERE id = ?;
                    """, (comp['id'],))
        except Exception as exc:
            print(f"[CH sync error] {exc}")

    t = threading.Thread(target=_job, daemon=True)
    t.start()
    return True

COMPANY_STATUSES = (
    'Active', 'Dissolved', 'Liquidation', 'Receivership', 'Administration', 'Closed', 'Strike off proposed',
    'Pending', 'Draft', 'Dormant', 'Inactive', 'Overdue',
)

COMPANY_STAFF_SELECT = (
    "c.id, c.name, c.company_number, c.status, c.inc_date, c.director, c.reg_office, c.package, c.account_status, "
    "c.created_at, c.user_id, c.utr_number, c.authentication_code, c.activation_code, "
    "c.identity_verified, c.psc_verified, c.sic_codes, c.registered_email, c.whatsapp_number, "
    "c.accounts_next_due, c.accounts_overdue, c.confirmation_next_due, c.confirmation_overdue, "
    "c.ch_attention_json, c.ch_checked_at, c.b2b_id, c.client_type, c.data_locked, "
    "u.full_name as client_name, u.email as client_email"
)

def handle_company_routes(environ, start_response, path, method, user, body, query):
    valid_prefixes = ('/api/companies', '/api/admin/companies', '/api/companies-house')
    if not any(path.startswith(prefix) for prefix in valid_prefixes):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    # ── POST /api/admin/companies/webfiling-preview + import-webfiling ────
    if path in ('/api/admin/companies/webfiling-preview', '/api/admin/companies/import-webfiling') and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Insufficient permissions", status_code=403)
        from services.webfiling_import import preview_webfiling_numbers, import_webfiling_companies
        payload = body if isinstance(body, dict) else {}
        if path.endswith('/webfiling-preview'):
            data, error = preview_webfiling_numbers(payload.get('company_numbers') or payload.get('numbers') or '')
            if error:
                return error_response(start_response, error, status_code=503 if 'API key' in error else 400)
            return success_response(start_response, data=data)
        summary, error = import_webfiling_companies(payload, actor=user)
        if error:
            return error_response(start_response, error, status_code=503 if 'API key' in error else 400)
        return success_response(
            start_response, data=summary,
            message=(f"Imported {summary['imported']}, updated {summary['updated']}, "
                     f"skipped {summary['skipped']}, failed {summary['failed']}."))

    # ── GET /api/companies/ch-details?number= (order form: details of the selected company) ──
    # Official profile + active directors (month/year of birth, nationality, appointed) from Companies House.
    if path in ('/api/companies/ch-details', '/api/admin/companies/ch-details') and method == 'GET':
        if not is_staff:
            return error_response(start_response, "Insufficient permissions", status_code=403)
        if not get_ch_api_key():
            return error_response(start_response, "Companies House API key is not set (Settings > Integrations).",
                                  status_code=503)
        from services.order_companies import company_ch_details
        details, error = company_ch_details((query.get('number') or [''])[0].strip()[:12])
        if error:
            return error_response(start_response, error, status_code=404)
        return success_response(start_response, data=details)

    # ── GET /api/companies/check-name?q= (order form "Company" field) ──────
    # Is this name / number a registered UK company? Registered -> its official name; otherwise the
    # typed text is treated as a proposed (new) company name.
    if path in ('/api/companies/check-name', '/api/admin/companies/check-name') and method == 'GET':
        q = (query.get('q') or [''])[0].strip()[:160]
        if len(q) < 2:
            return success_response(start_response, data={"query": q, "registered": False, "suggestions": []})
        if not get_ch_api_key():
            return error_response(start_response, "Companies House API key is not set (Settings > Integrations).",
                                  status_code=503)

        def _norm(name):
            text = re.sub(r'[^a-z0-9 ]+', ' ', str(name or '').lower())
            text = re.sub(r'\b(limited|ltd|plc|llp|company|co)\b', ' ', text)
            return re.sub(r'\s+', ' ', text).strip()

        def _pick(item):
            return {
                "name": item.get('company_name') or item.get('title') or '',
                "number": item.get('company_number') or '',
                "status": (item.get('company_status') or '').replace('-', ' ').capitalize(),
                "incorporated": item.get('date_of_creation') or '',
                "address": item.get('address_snippet') or ', '.join(
                    str(v) for k, v in (item.get('registered_office_address') or {}).items()
                    if k in ('address_line_1', 'address_line_2', 'locality', 'postal_code') and v),
            }

        def _in_crm(number):
            if not number:
                return None
            row = query_db("SELECT id, name FROM companies WHERE UPPER(company_number) = ? LIMIT 1;",
                           (number.upper(),), one=True)
            return {"id": row['id'], "name": row['name']} if row else None

        compact = re.sub(r'\s+', '', q).upper()
        if re.fullmatch(r'[A-Z]{0,2}\d{5,8}', compact):
            prof = fetch_company_profile(compact)
            if prof.get('success') and prof.get('data'):
                match = _pick(prof['data'])
                return success_response(start_response, data={
                    "query": q, "registered": True, "match": match, "suggestions": [],
                    "in_crm": _in_crm(match['number'])})

        res = search_companies_house(q)
        if not res.get('success'):
            return error_response(start_response, res.get('error') or 'Companies House search failed', status_code=502)
        items = [_pick(i) for i in (res.get('results') or []) if i.get('company_number')]
        wanted = _norm(q)
        exact = next((i for i in items if wanted and _norm(i['name']) == wanted), None)
        return success_response(start_response, data={
            "query": q,
            "registered": bool(exact),
            "match": exact,
            "in_crm": _in_crm(exact['number']) if exact else None,
            "suggestions": [i for i in items if i is not exact][:8],
        })

    # ── GET /api/companies/name-availability?name= (order form "Company name availability") ──
    # Can this new company name be registered? Applies the Companies House "same as" comparison:
    # case, punctuation, spaces, "&"/"and", a leading "The" and endings like Ltd / Limited / PLC are ignored.
    # Names of dissolved companies can be reused, so only live companies block a name.
    if path in ('/api/companies/name-availability', '/api/admin/companies/name-availability') and method == 'GET':
        name = (query.get('name') or [''])[0].strip()[:160]
        if len(name) < 3:
            return error_response(start_response, "Type at least 3 characters", status_code=400)
        if not get_ch_api_key():
            return error_response(start_response, "Companies House API key is not set (Settings > Integrations).",
                                  status_code=503)

        endings = r'(public limited company|limited liability partnership|limited|ltd|plc|llp|company|co|cyf|cyfyngedig|ccc)'

        def _same_as(text):
            t = str(text or '').lower().replace('&', ' and ').replace('+', ' plus ')
            t = re.sub(r"[^a-z0-9 ]+", ' ', t)
            t = re.sub(r'\s+', ' ', t).strip()
            t = re.sub(r'^the ', '', t)
            t = re.sub(rf'(\s+{endings})+$', '', t)
            return t.replace(' ', '')

        wanted = _same_as(name)
        if not wanted:
            return error_response(start_response, "Type the name you want to register", status_code=400)
        # Search with the same core words the comparison uses (no leading "The", no Ltd/Limited ending)
        core = re.sub(r'^\s*the\s+', '', name, flags=re.I)
        core = re.sub(rf'(\s+{endings}\.?)+\s*$', '', core, flags=re.I).strip() or name
        res = search_companies_house(core)
        if not res.get('success'):
            return error_response(start_response, res.get('error') or 'Companies House search failed', status_code=502)

        conflicts, similar = [], []
        for item in res.get('results') or []:
            entry = {
                "name": item.get('title') or item.get('company_name') or '',
                "number": item.get('company_number') or '',
                "status": (item.get('company_status') or '').replace('-', ' ').capitalize(),
            }
            live = str(item.get('company_status') or '').lower() not in ('dissolved', 'converted-closed', 'removed')
            if _same_as(entry['name']) == wanted and live:
                conflicts.append(entry)
            elif len(similar) < 5:
                similar.append(entry)

        warnings = []
        if not re.search(rf'\b{endings}\.?\s*$', name, flags=re.I):
            warnings.append('A private company name must end with "Ltd" or "Limited".')
        sensitive = ('bank', 'royal', 'british', 'england', 'national', 'international', 'police', 'charity',
                     'university', 'trust', 'insurance', 'chartered', 'institute', 'government', 'council')
        found = [w for w in sensitive if re.search(rf'\b{w}\b', name, flags=re.I)]
        if found:
            warnings.append(f"Contains sensitive word(s) needing approval: {', '.join(found)}.")

        return success_response(start_response, data={
            "name": name,
            "available": not conflicts,
            "conflicts": conflicts,
            "similar": similar,
            "warnings": warnings,
        })

    # ── GET /api/companies/lookup-ch (Companies House Search & Auto-fill) ─
    if path in ('/api/companies/lookup-ch', '/api/admin/companies/lookup-ch', '/api/admin/companies/search', '/api/companies-house/search', '/api/admin/companies/ch-live', '/api/companies-house/company') and method == 'GET':
        comp_number = (query.get('number') or [''])[0].strip()
        search_query = (query.get('query') or query.get('q') or [''])[0].strip()

        if comp_number or (len(search_query) >= 6 and search_query.replace(' ', '').isalnum() and any(c.isdigit() for c in search_query)):
            target_num = comp_number or search_query.replace(' ', '')
            ch_res = fetch_company_profile(target_num)
            if ch_res.get('success') and ch_res.get('data'):
                d = ch_res['data']
                addr = d.get('registered_office_address', {})
                addr_parts = [
                    addr.get('address_line_1'),
                    addr.get('address_line_2'),
                    addr.get('locality'),
                    addr.get('postal_code'),
                    addr.get('country')
                ]
                reg_office = ', '.join([p for p in addr_parts if p]) or 'United Kingdom'
                
                director = ''
                off_res = fetch_company_officers(target_num)
                if off_res.get('success') and off_res.get('officers'):
                    for off in off_res['officers']:
                        if off.get('officer_role', '').lower() in ('director', 'corporate-director'):
                            director = off.get('name', '')
                            break
                    if not director and off_res['officers']:
                        director = off_res['officers'][0].get('name', '')

                status = d.get('company_status', 'active')
                status_formatted = 'Active' if status.lower() in ('active', 'open') else status.capitalize()

                return success_response(start_response, data={
                    "company_name": d.get('company_name', ''),
                    "company_number": d.get('company_number', target_num),
                    "incorporation_date": d.get('date_of_creation', ''),
                    "status": status_formatted,
                    "reg_office": reg_office,
                    "director": director,
                    "type": d.get('type', ''),
                    "sic_codes": d.get('sic_codes', [])
                })

        if search_query:
            search_res = search_companies_house(search_query)
            if search_res.get('success'):
                results = []
                for item in search_res.get('results', []):
                    results.append({
                        "company_name": item.get('title') or item.get('company_name'),
                        "company_number": item.get('company_number'),
                        "incorporation_date": item.get('date_of_creation'),
                        "status": (item.get('company_status') or 'active').capitalize(),
                        "address_snippet": item.get('address_snippet') or item.get('description', '')
                    })
                return success_response(start_response, data={"results": results})
            return error_response(start_response, search_res.get('error', 'Search failed'), status_code=500)

        return success_response(start_response, data={"results": []})

    # ── GET /api/companies OR /api/admin/companies (List matching app.py) ──
    if (path in ('/api/companies', '/api/admin/companies')) and method == 'GET':
        schedule_portfolio_ch_sync(user_id=None if is_staff else user_id)
        
        search = (query.get('search') or [''])[0].strip()
        status_filter = (query.get('status') or [''])[0].strip()
        client_id_filter = (query.get('client_id') or query.get('user_id') or [''])[0].strip()
        limit = min(int((query.get('limit') or ['500'])[0]), 1000)
        offset = max(int((query.get('offset') or ['0'])[0]), 0)

        params = []
        conditions = []

        if not is_staff:
            conditions.append("c.user_id = ?")
            params.append(user_id)
        elif client_id_filter:
            conditions.append("c.user_id = ?")
            params.append(client_id_filter)

        if search:
            conditions.append("(c.name LIKE ? OR c.company_number LIKE ? OR c.director LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

        if status_filter and status_filter.lower() != 'all':
            conditions.append("c.status = ?")
            params.append(status_filter)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        sql = f"""
            SELECT {COMPANY_STAFF_SELECT}
            FROM companies c
            LEFT JOIN users u ON c.user_id = u.id
            {where_clause}
            ORDER BY {company_list_order_sql()}
            LIMIT ? OFFSET ?;
        """
        rows = query_db(sql, params + [limit, offset]) or []
        formatted_companies = [public_client_company(r, for_staff=is_staff) for r in rows]

        pending_regs = pending_registration_orders(user_id=None if is_staff else user_id, for_client=not is_staff)
        clients = query_db("SELECT id, full_name, email FROM users WHERE role = 'CLIENT' AND status = 'Active' ORDER BY full_name COLLATE NOCASE;") or []

        return json_response(start_response, {
            'status': 'success',
            'success': True,
            'companies': formatted_companies,
            'data': {
                'companies': formatted_companies,
                'total': len(formatted_companies),
            },
            'pending_registrations': pending_regs,
            'clients': [{'id': row['id'], 'full_name': row.get('full_name') or '', 'email': row.get('email') or ''} for row in clients],
            'companies_house_configured': bool(get_ch_api_key()),
            'total_uk': len(formatted_companies)
        })

    # ── GET /api/companies/<id> (Detail) ──────────────────────────────────
    match_detail = re.match(r'^/api/(?:admin/)?companies/(\d+)$', path)
    if match_detail and method == 'GET':
        comp_id = int(match_detail.group(1))
        
        row = query_db(f"""
            SELECT {COMPANY_STAFF_SELECT}
            FROM companies c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
            LIMIT 1;
        """, (comp_id,), one=True)

        if not row:
            return error_response(start_response, "Company not found", status_code=404)

        if not is_staff and row['user_id'] != user_id:
            return error_response(start_response, "Access denied", status_code=403)

        directors = query_db("SELECT * FROM company_directors WHERE company_id = ? ORDER BY id ASC;", (comp_id,))
        # Team members (STAFF) only see the orders they added
        own_sql, own_params = ("AND created_by_id = ?", (user_id,)) if user_role == 'STAFF' else ("", ())
        orders = query_db(
            "SELECT id, order_number, service_name, status, total as amount, created_at FROM orders "
            f"WHERE company_id = ? AND COALESCE(is_draft, 0) = 0 {own_sql} ORDER BY created_at DESC;",
            (comp_id, *own_params))

        data = public_client_company(row, for_staff=is_staff)
        data['directors'] = [dict(d) for d in (directors or [])]
        data['orders'] = [dict(o) for o in (orders or [])]
        # Documents filed against this company (customers only see the ones shared with them)
        visible = "" if is_staff else "AND COALESCE(client_visible, 0) = 1"
        docs = query_db(f"""
            SELECT id, name, category, file_type, file_size, status, created_at, client_visible, uploaded_by, order_id
            FROM documents WHERE company_id = ? {visible}
            ORDER BY created_at DESC, id DESC;
        """, (comp_id,)) or []
        data['documents'] = [dict(x) for x in docs]

        return success_response(start_response, data=data)

    # ── PUT / PATCH /api/companies/<id> (Update Company & Compliance Statuses) ─
    match_update = re.match(r'^/api/(?:admin/)?companies/(\d+)$', path)
    if match_update and method in ('PUT', 'PATCH'):
        comp_id = int(match_update.group(1))
        
        comp = query_db("SELECT * FROM companies WHERE id = ? LIMIT 1;", (comp_id,), one=True)
        if not comp:
            return error_response(start_response, "Company not found", status_code=404)

        if not is_staff and comp['user_id'] != user_id:
            return error_response(start_response, "Access denied", status_code=403)

        updatable_fields = [
            'name', 'director', 'reg_office', 'status', 'account_status',
            'identity_verified', 'psc_verified', 'utr_number', 'authentication_code',
            'activation_code', 'sic_codes', 'registered_email', 'whatsapp_number',
            'accounts_next_due', 'confirmation_next_due'
        ]
        
        alias_map = {
            'company_name': 'name',
            'standing': 'account_status',
            'auth_code': 'authentication_code',
            'accounts_due': 'accounts_next_due',
            'confirmation_due': 'confirmation_next_due',
            'address': 'reg_office',
            'registered_office_address': 'reg_office',
        }

        updates = {}
        for key, val in body.items():
            db_key = alias_map.get(key, key)
            if db_key in updatable_fields:
                updates[db_key] = val

        # Only real company statuses (a whole API response once saved its "success" as the status)
        if 'status' in updates:
            wanted = str(updates['status'] or '').strip().lower()
            match = next((s for s in COMPANY_STATUSES if s.lower() == wanted), None)
            if match:
                updates['status'] = match
            else:
                updates.pop('status')

        if updates:
            set_clauses = [f"{k} = ?" for k in updates.keys()]
            values = list(updates.values()) + [comp_id]
            execute_db(f"UPDATE companies SET {', '.join(set_clauses)} WHERE id = ?;", tuple(values))

        # Identity / PSC verification newly marked Verified by the team -> tell the customer (app.py parity)
        if is_staff:
            events = [ev for ev, col in (('identity', 'identity_verified'), ('psc', 'psc_verified'))
                      if str(updates.get(col) or '') == 'Verified' and str(comp.get(col) or '') != 'Verified']
            if events:
                from services.client_mail import notify_compliance_done
                notify_compliance_done(comp_id, events, triggered_by=user_id)

        updated_row = query_db(f"""
            SELECT {COMPANY_STAFF_SELECT}
            FROM companies c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
            LIMIT 1;
        """, (comp_id,), one=True)

        updated_data = public_client_company(updated_row, for_staff=is_staff)
        return success_response(start_response, data=updated_data, message="Company details and compliance status updated successfully.")

    # ── POST /api/companies (Create) ──────────────────────────────────────
    if (path in ('/api/companies', '/api/admin/companies')) and method == 'POST':
        name = (body.get('company_name') or body.get('name') or '').strip()
        comp_number = (body.get('company_number') or '').strip()
        director = body.get('director') or user.get('name') or 'Director'
        reg_office = body.get('reg_office') or '71-75 Shelton Street, Covent Garden, London, WC2H 9JQ'
        inc_date = body.get('inc_date') or body.get('incorporation_date')
        status = body.get('status') or 'Active'
        
        client_mode = body.get('client_mode') or 'existing'
        client_id = None
        if client_mode == 'new':
            new_name = (body.get('new_client_full_name') or body.get('client_name') or '').strip()
            new_email = (body.get('new_client_email') or body.get('client_email') or '').strip().lower()
            if new_name and new_email:
                existing_user = query_db("SELECT id FROM users WHERE lower(email) = ? LIMIT 1;", (new_email,), one=True)
                if existing_user:
                    client_id = existing_user['id']
                else:
                    client_id = execute_db("""
                        INSERT INTO users (full_name, email, password_hash, role, client_type, is_b2b, status, created_at)
                        VALUES (?, ?, ?, 'CLIENT', 'Individual', 0, 'Active', datetime('now', 'localtime'));
                    """, (new_name, new_email, unusable_password_hash()))
        if not client_id:
            client_id = body.get('user_id') or body.get('client_id') or user_id
        if not is_staff:
            client_id = user_id

        if not name:
            return error_response(start_response, "Company name is required", status_code=400)

        if not comp_number:
            import secrets
            comp_number = f"GB{secrets.randbelow(90000000) + 10000000}"

        is_gen = 1 if looks_like_official_company_number(comp_number) else 0

        comp_id = execute_db("""
            INSERT INTO companies (
                user_id, name, company_number, inc_date, director,
                reg_office, status, data_locked, created_at
            ) VALUES (?, ?, ?, coalesce(?, date('now')), ?, ?, ?, ?, datetime('now', 'localtime'));
        """, (client_id, name, comp_number, inc_date, director, reg_office, status, is_gen))

        return success_response(start_response, data={"id": comp_id, "company_name": name, "company_number": comp_number}, message="Company created successfully.", status_code=201)

    # ── DELETE /api/admin/companies/<id> (Delete with genuine protection) ─
    match_del = re.match(r'^/api/(?:admin/)?companies/(\d+)$', path)
    if match_del and method == 'DELETE':
        if user_role not in ('SUPER_ADMIN', 'ADMIN'):
            return error_response(start_response, "Only an admin can delete companies", status_code=403)
        comp_id = int(match_del.group(1))

        comp = query_db("SELECT id, name, company_number FROM companies WHERE id = ? LIMIT 1;", (comp_id,), one=True)
        if not comp:
            return error_response(start_response, "Company not found", status_code=404)

        force = can_force_delete_genuine(user)
        refusal = refuse_company_purge(comp_id, force=force, actor=user)
        if refusal:
            return error_response(start_response, refusal, status_code=403)

        execute_db("DELETE FROM companies WHERE id = ?;", (comp_id,))
        return success_response(start_response, message=f"Company '{comp['name']}' deleted successfully.")

    # ── POST /api/admin/companies/bulk-delete ──────────────────────────────
    if path in ('/api/admin/companies/bulk-delete', '/api/companies/bulk-delete') and method == 'POST':
        if user_role not in ('SUPER_ADMIN', 'ADMIN'):
            return error_response(start_response, "Only an admin can delete companies", status_code=403)
        ids = body.get('company_ids') or body.get('ids') or []
        if not ids:
            return error_response(start_response, "No company IDs provided", status_code=400)

        force = can_force_delete_genuine(user)
        deleted = 0
        blocked = 0
        for cid in ids:
            refusal = refuse_company_purge(cid, force=force, actor=user)
            if refusal:
                blocked += 1
                continue
            execute_db("DELETE FROM companies WHERE id = ?;", (cid,))
            deleted += 1

        if deleted == 0 and blocked > 0:
            return error_response(start_response, "Selected companies are genuine locked records. Super Admin force delete required.", status_code=403)

        return success_response(start_response, message=f"Deleted {deleted} companies" + (f" ({blocked} genuine locked skipped)" if blocked else ""))

    return None
