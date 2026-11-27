"""Companies › Import from spreadsheet: many companies at once, each with its own client.

The browser reads the spreadsheet (CSV) and sends its rows: {company_number?, company_name?, email?, client_name?,
auth_code?}. Rows are sent a few at a time so no request runs long.

  preview(rows)          for each row: the company at Companies House (its number, or found by its name), whether it
                         is in the CRM already and whether its email already has a client
  import_rows(rows, ...) adds each company with Companies House's data under its client: the client with that email
                         (made when new), else the fallback client the admin gave for rows without an email.
                         The authentication code goes on the company.
A name is matched to Companies House only when the names agree (Ltd / Limited / punctuation aside); otherwise the
closest result is offered as a guess the admin confirms or corrects.
"""
import datetime
import re

from db import execute_db, query_db
from utils.validation import email_problem

MAX_ROWS = 25  # per request


def _norm_name(name):
    n = re.sub(r'[^a-z0-9& ]+', ' ', str(name or '').lower())
    n = re.sub(r'\b(limited|ltd|llp|plc|uk|the|co|company)\b', ' ', n)
    return re.sub(r'\s+', ' ', n).strip()


def _clean(row):
    row = row if isinstance(row, dict) else {}
    out = {k: str(row.get(k) or '').strip() for k in ('company_number', 'company_name', 'email', 'client_name', 'auth_code')}
    out['email'] = out['email'].lower()
    out['auth_code'] = re.sub(r'[^A-Za-z0-9]', '', out['auth_code']).upper()[:12]
    return out


def _search(name):
    """(number, Companies House name, 'exact' | 'guess') for a company name, or (None, None, 'none')."""
    from services.companies_house_service import search_companies_house
    res = search_companies_house(name, items_per_page=10)
    if not res.get('success'):
        raise RuntimeError(res.get('error') or 'Companies House search failed')
    items = [i for i in res.get('results') or [] if i.get('company_number')]
    want = _norm_name(name)
    for i in items:
        if _norm_name(i.get('title')) == want:
            return i['company_number'], i.get('title'), 'exact'
    if items:
        return items[0]['company_number'], items[0].get('title'), 'guess'
    return None, None, 'none'


def preview(rows):
    from services.webfiling_import import canonical_company_number, _existing_company
    from services.smart_intake import companies_house_status_value, fetch_companies_house_profile
    out = []
    for raw in (rows or [])[:MAX_ROWS]:
        row = _clean(raw)
        item = {**row, 'match': '', 'ch_name': '', 'status': '', 'error': ''}
        try:
            number = canonical_company_number(row['company_number']) if row['company_number'] else ''
            if number:
                item['match'] = 'number'
            elif row['company_name']:
                number, item['ch_name'], item['match'] = _search(row['company_name'])
            if number:
                profile, error = fetch_companies_house_profile(number)
                if error or not profile:
                    item['error'] = error or 'Not found at Companies House'
                else:
                    item['found_number'] = profile['company_number']
                    item['ch_name'] = profile['name']
                    item['status'] = companies_house_status_value(profile.get('status'), profile.get('status_detail'))
                    existing = _existing_company(profile['company_number'])
                    item['in_crm'] = bool(existing)
            elif not item['error']:
                item['error'] = 'Not found at Companies House: add its number'
        except Exception as exc:
            item['error'] = str(exc)
        if row['email']:
            if email_problem(row['email']):
                item['email_problem'] = email_problem(row['email'])
            else:
                client = query_db("SELECT id, full_name, role FROM users WHERE LOWER(email) = ? LIMIT 1;",
                                  (row['email'],), one=True)
                item['client_exists'] = bool(client and client['role'] == 'CLIENT')
                if client and client['role'] != 'CLIENT':
                    item['email_problem'] = 'This email belongs to a team member'
        out.append(item)
    return out


def _client_for(row, fallback, actor):
    """The client a row's company goes under: by its email (made when new), else the fallback client."""
    from services.webfiling_import import _ensure_client
    if row['email'] and not email_problem(row['email']):
        name = row['client_name'] or row['company_name'] or row['email'].split('@')[0]
        return _ensure_client({'client_mode': 'new', 'new_client_full_name': name, 'new_client_email': row['email']},
                              actor)
    fallback = fallback if isinstance(fallback, dict) else {}
    if not (fallback.get('email') and fallback.get('name')):
        return None, None, 'No email in the sheet: give the client for companies without one'
    return _ensure_client({'client_mode': 'new', 'new_client_full_name': fallback['name'],
                           'new_client_email': str(fallback['email']).strip().lower()}, actor)


def import_rows(rows, fallback=None, actor=None, update_existing=False):
    """Add the companies of the rows that have a number. Returns {results: [...], counts}."""
    from services.webfiling_import import canonical_company_number, _existing_company
    from services.smart_intake import (companies_house_status_value, fetch_companies_house_primary_director,
                                       fetch_companies_house_profile, log_activity)
    results, counts = [], {'imported': 0, 'updated': 0, 'skipped': 0, 'failed': 0}
    for raw in (rows or [])[:MAX_ROWS]:
        row = _clean(raw)
        number = canonical_company_number(raw.get('found_number') or row['company_number']) if (
            raw.get('found_number') or row['company_number']) else ''
        label = row['company_name'] or number
        if not number:
            results.append({'name': label, 'status': 'failed', 'message': 'No company number'})
            counts['failed'] += 1
            continue
        profile, error = fetch_companies_house_profile(number)
        if error or not profile:
            results.append({'name': label, 'company_number': number, 'status': 'failed',
                            'message': error or 'Not found at Companies House'})
            counts['failed'] += 1
            continue
        client_id, client, client_err = _client_for(row, fallback, actor)
        if client_err:
            results.append({'name': profile['name'], 'company_number': number, 'status': 'failed', 'message': client_err})
            counts['failed'] += 1
            continue
        mapped = companies_house_status_value(profile.get('status'), profile.get('status_detail'))
        inc_date = profile.get('inc_date') or ''
        if len(inc_date) < 10:
            inc_date = datetime.date.today().isoformat()
        reg_office = profile.get('reg_office') or 'United Kingdom'
        existing = _existing_company(profile['company_number'])
        if existing:
            sets, args = [], []
            if update_existing:
                sets += ['name = ?', 'status = ?', 'inc_date = ?', 'reg_office = ?']
                args += [profile['name'], mapped, inc_date, reg_office]
            had_code = (query_db("SELECT authentication_code FROM companies WHERE id = ?;", (existing['id'],),
                                 one=True) or {}).get('authentication_code')
            if row['auth_code'] and not had_code:
                sets.append('authentication_code = ?')
                args.append(row['auth_code'])
            if sets:
                execute_db(f"UPDATE companies SET {', '.join(sets)} WHERE id = ?;", (*args, existing['id']))
                results.append({'name': profile['name'], 'company_number': number, 'status': 'updated',
                                'company_id': existing['id']})
                counts['updated'] += 1
            else:
                results.append({'name': profile['name'], 'company_number': number, 'status': 'skipped',
                                'message': 'Already in the CRM', 'company_id': existing['id']})
                counts['skipped'] += 1
            continue
        director = fetch_companies_house_primary_director(number) or row['client_name'] or 'Director'
        email = row['email'] if row['email'] and not email_problem(row['email']) else (client or {}).get('email')
        company_id = execute_db("""
            INSERT INTO companies (user_id, name, company_number, status, inc_date, director, reg_office, package,
                                   account_status, registered_email, authentication_code, data_locked, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Spreadsheet Import', 'Good Standing', ?, ?, 1, datetime('now', 'localtime'));
        """, (client_id, profile['name'], profile['company_number'], mapped, inc_date, director, reg_office,
              email, row['auth_code'] or None))
        results.append({'name': profile['name'], 'company_number': number, 'status': 'imported',
                        'company_id': company_id, 'client': (client or {}).get('full_name')})
        counts['imported'] += 1
    if actor and (counts['imported'] or counts['updated']):
        log_activity(actor, 'COMPANIES_IMPORTED', 'companies', None,
                     f"Spreadsheet import: {counts['imported']} added, {counts['updated']} updated, "
                     f"{counts['skipped']} skipped, {counts['failed']} failed")
    return {'results': results, **counts}
