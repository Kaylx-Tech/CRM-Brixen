"""Import companies from a Companies House WebFiling list (ported from app.py import_webfiling_companies).

Also powers the live preview in the Import WebFiling dialog: each number is looked up so staff
can see the official name and status, and whether it is already in the portal, before importing.
"""
import datetime
import re
import uuid

from db import query_db, execute_db, unusable_password_hash
from services.smart_intake import (
    companies_house_api_key,
    companies_house_status_value,
    fetch_companies_house_primary_director,
    fetch_companies_house_profile,
    is_usable_form_email,
    log_activity,
    normalize_company_number,
)

MAX_NUMBERS = 100
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def canonical_company_number(raw):
    """Companies House numbers are 8 characters; WebFiling lists often drop leading zeros."""
    number = normalize_company_number(raw)
    if number.isdigit() and len(number) < 8:
        number = number.zfill(8)
    return number


def parse_company_number_list(text):
    parts = text if isinstance(text, list) else re.split(r'[\s,;]+', str(text or ''))
    seen = set()
    numbers = []
    for part in parts:
        number = canonical_company_number(part)
        if not number or number in seen:
            continue
        seen.add(number)
        numbers.append(number)
    return numbers


def _existing_company(number):
    return query_db("""
        SELECT c.id, c.name, c.user_id, u.full_name AS owner_name, u.email AS owner_email
        FROM companies c LEFT JOIN users u ON u.id = c.user_id
        WHERE UPPER(c.company_number) = ? LIMIT 1;
    """, (number,), one=True)


def preview_webfiling_numbers(text):
    """Look up each number at Companies House (profile only, no officers) for the dialog preview."""
    numbers = parse_company_number_list(text)
    if not numbers:
        return None, 'Enter at least one company number'
    if len(numbers) > MAX_NUMBERS:
        return None, f'Import up to {MAX_NUMBERS} company numbers at a time'
    if not companies_house_api_key():
        return None, 'Add a Companies House API key in System Settings first'

    items = []
    for number in numbers:
        profile, error = fetch_companies_house_profile(number)
        existing = _existing_company(number)
        if error or not profile:
            items.append({'company_number': number, 'found': False,
                          'message': error or 'Company not found at Companies House'})
            continue
        items.append({
            'company_number': profile['company_number'],
            'found': True,
            'name': profile['name'],
            'status': companies_house_status_value(profile.get('status'), profile.get('status_detail')),
            'inc_date': profile.get('inc_date') or '',
            'reg_office': profile.get('reg_office') or '',
            'existing': ({
                'company_id': existing['id'],
                'owner_name': existing.get('owner_name') or existing.get('owner_email') or '',
            } if existing else None),
        })
    return {'items': items}, None


def _ensure_client(data, actor):
    client_id = data.get('client_id') or data.get('user_id')
    if client_id:
        client = query_db("SELECT id, full_name, email, role FROM users WHERE id = ?;", (client_id,), one=True)
        if not client or client.get('role') != 'CLIENT':
            return None, None, 'Select a client account'
        return client['id'], client, None

    if (data.get('client_mode') or '').strip().lower() != 'new':
        return None, None, 'Select the client these companies belong to, or choose New client'

    new_name = (data.get('new_client_full_name') or data.get('client_full_name') or '').strip()
    new_email = (data.get('new_client_email') or data.get('client_email') or '').strip().lower()
    if not new_name:
        return None, None, 'Enter the new client full name'
    if not new_email or not EMAIL_RE.match(new_email):
        return None, None, 'Enter a valid client email'

    try:
        from services import permanent_purge
        if permanent_purge.is_purged_email(new_email):
            return None, None, 'This email was permanently deleted and cannot be recreated'
    except Exception:
        pass

    existing = query_db("SELECT id, full_name, email, role FROM users WHERE LOWER(email) = ?;", (new_email,), one=True)
    if existing:
        if existing.get('role') != 'CLIENT':
            return None, None, 'That email belongs to a staff account'
        return existing['id'], existing, None

    client_id = execute_db("""
        INSERT INTO users (wordpress_user_id, email, password_hash, full_name, country, role, status,
                           client_type, is_b2b, notification_email, created_at, last_synced_at)
        VALUES (?, ?, ?, ?, 'United Kingdom', 'CLIENT', 'Active', 'Individual', 0, ?, datetime('now', 'localtime'), CURRENT_TIMESTAMP);
    """, (f"local_client_{uuid.uuid4().hex[:16]}", new_email, unusable_password_hash(), new_name, new_email))
    client = query_db("SELECT id, full_name, email, role FROM users WHERE id = ?;", (client_id,), one=True)
    if actor:
        log_activity(actor, 'USER_CREATED', 'users', str(client_id), f"Created client {new_email} during WebFiling import")
    return client_id, client, None


def _client_has_company_named(client_id, name):
    return query_db(
        "SELECT id FROM companies WHERE user_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1;",
        (client_id, name), one=True)


def import_webfiling_companies(data, actor=None):
    data = data if isinstance(data, dict) else {}
    numbers = parse_company_number_list(data.get('company_numbers') or data.get('numbers') or '')
    if not numbers:
        return None, 'Paste at least one Companies House number from WebFiling saved companies'
    if len(numbers) > MAX_NUMBERS:
        return None, f'Import up to {MAX_NUMBERS} company numbers at a time'
    if not companies_house_api_key():
        return None, 'Add a Companies House API key in System Settings before importing WebFiling companies'

    client_id, client, client_err = _ensure_client(data, actor)
    if client_err:
        return None, client_err

    update_existing = bool(data.get('update_existing'))
    package = (data.get('package') or 'WebFiling Import').strip() or 'WebFiling Import'
    registered_email = next(
        (e for e in (data.get('new_client_email'), (client or {}).get('email')) if is_usable_form_email(str(e or '').strip())),
        None)
    results = []
    imported = updated = skipped = failed = 0

    for number in numbers:
        profile, error = fetch_companies_house_profile(number)
        if error or not profile:
            results.append({'company_number': number, 'status': 'error',
                            'message': error or 'Company not found at Companies House'})
            failed += 1
            continue

        existing = _existing_company(profile['company_number'])
        director = fetch_companies_house_primary_director(number) or 'Director'
        mapped_status = companies_house_status_value(profile.get('status'), profile.get('status_detail'))
        inc_date = profile.get('inc_date') or ''
        if len(inc_date) < 10:
            inc_date = datetime.date.today().isoformat()
        reg_office = profile.get('reg_office') or 'United Kingdom'

        if existing:
            if update_existing:
                execute_db("""
                    UPDATE companies SET name = ?, status = ?, inc_date = ?, director = ?, reg_office = ?
                    WHERE id = ?;
                """, (profile['name'], mapped_status, inc_date, director, reg_office, existing['id']))
                results.append({'company_number': profile['company_number'], 'name': profile['name'],
                                'status': 'updated', 'company_id': existing['id']})
                updated += 1
            else:
                owner = existing.get('owner_name') or existing.get('owner_email')
                results.append({'company_number': profile['company_number'], 'name': profile['name'],
                                'status': 'skipped',
                                'message': f"Already in portal{f' ({owner})' if owner else ''}",
                                'company_id': existing['id']})
                skipped += 1
            continue

        if _client_has_company_named(client_id, profile['name']):
            results.append({'company_number': profile['company_number'], 'name': profile['name'],
                            'status': 'skipped', 'message': 'This client already has a company with that name'})
            skipped += 1
            continue

        company_id = execute_db("""
            INSERT INTO companies (user_id, name, company_number, status, inc_date, director, reg_office,
                                   package, account_status, registered_email, data_locked, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Good Standing', ?, 1, datetime('now', 'localtime'));
        """, (client_id, profile['name'], profile['company_number'], mapped_status, inc_date, director,
              reg_office, package, registered_email))
        results.append({'company_number': profile['company_number'], 'name': profile['name'],
                        'status': 'imported', 'company_id': company_id})
        imported += 1

    if actor and (imported or updated):
        log_activity(actor, 'COMPANIES_IMPORTED', 'companies', None,
                     f"WebFiling import: {imported} added, {updated} updated, {skipped} skipped, {failed} failed")

    return {'imported': imported, 'updated': updated, 'skipped': skipped, 'failed': failed,
            'results': results}, None
