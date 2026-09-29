"""Company Management Routes (/api/companies)
"""
import re
from db import query_db, execute_db, unusable_password_hash
from utils.response import json_response, success_response, error_response

def handle_company_routes(environ, start_response, path, method, user, body, query):
    valid_prefixes = ('/api/companies', '/api/admin/companies', '/api/companies-house')
    if not any(path.startswith(prefix) for prefix in valid_prefixes):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    # ── GET /api/companies/lookup-ch (Companies House Search & Auto-fill) ─
    if path in ('/api/companies/lookup-ch', '/api/admin/companies/lookup-ch', '/api/admin/companies/search', '/api/companies-house/search', '/api/admin/companies/ch-live', '/api/companies-house/company') and method == 'GET':
        from services.companies_house_service import fetch_company_profile, fetch_company_officers, search_companies_house
        
        comp_number = (query.get('number') or [''])[0].strip()
        search_query = (query.get('query') or query.get('q') or [''])[0].strip()

        # If specific company number requested or 8 alphanumeric digits
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

        # Otherwise search query by name / text
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

    # ── GET /api/companies OR /api/admin/companies (List) ──────────────────
    if (path in ('/api/companies', '/api/admin/companies')) and method == 'GET':
        search = (query.get('search') or [''])[0].strip()
        status_filter = (query.get('status') or [''])[0].strip()
        limit = min(int((query.get('limit') or ['50'])[0]), 500)
        offset = max(int((query.get('offset') or ['0'])[0]), 0)

        params = []
        conditions = []

        if not is_staff:
            conditions.append("c.user_id = ?")
            params.append(user_id)

        if search:
            conditions.append("(c.name LIKE ? OR c.company_number LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%"])

        if status_filter:
            conditions.append("c.status = ?")
            params.append(status_filter)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        count_row = query_db(f"SELECT COUNT(*) as total FROM companies c {where_clause};", params, one=True)
        total_count = count_row['total'] if count_row else 0

        params.extend([limit, offset])
        rows = query_db(f"""
            SELECT c.id, c.name as company_name, c.company_number, c.status,
                   c.inc_date as incorporation_date, c.accounts_next_due, c.confirmation_next_due as confirmation_statement_next_due,
                   c.director, c.reg_office, c.user_id, u.full_name as client_name, u.email as client_email,
                   c.created_at
            FROM companies c
            LEFT JOIN users u ON c.user_id = u.id
            {where_clause}
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?;
        """, params)

        return success_response(start_response, data={
            "companies": [dict(r) for r in rows],
            "total": total_count,
            "limit": limit,
            "offset": offset
        })

    # ── GET /api/companies/<id> (Detail) ──────────────────────────────────
    match_detail = re.match(r'^/api/(?:admin/)?companies/(\d+)$', path)
    if match_detail and method == 'GET':
        comp_id = int(match_detail.group(1))
        
        row = query_db("""
            SELECT c.*, c.name as company_name, u.full_name as client_name, u.email as client_email, u.phone as client_phone
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

        data = dict(row)
        data['directors'] = [dict(d) for d in directors]

        return success_response(start_response, data=data)

    # ── POST /api/companies (Create) ──────────────────────────────────────
    if (path in ('/api/companies', '/api/admin/companies')) and method == 'POST':
        name = (body.get('company_name') or body.get('name') or '').strip()
        comp_number = (body.get('company_number') or '').strip()
        director = body.get('director') or user.get('name') or 'Director'
        reg_office = body.get('reg_office') or '71-75 Shelton Street, Covent Garden, London, WC2H 9JQ'
        inc_date = body.get('inc_date') or body.get('incorporation_date')
        status = body.get('status') or 'Active'
        
        # Resolve client ID if new client was provided
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
                        VALUES (?, ?, ?, 'CLIENT', 'Individual', 0, 'Active', datetime('now'));
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

        comp_id = execute_db("""
            INSERT INTO companies (
                user_id, name, company_number, inc_date, director,
                reg_office, status, created_at
            ) VALUES (?, ?, ?, coalesce(?, date('now')), ?, ?, ?, datetime('now'));
        """, (client_id, name, comp_number, inc_date, director, reg_office, status))

        return success_response(start_response, data={"id": comp_id, "company_name": name, "company_number": comp_number}, message="Company created successfully.", status_code=201)

    # ── POST /api/admin/companies/import-webfiling ─────────────────────────
    if (path in ('/api/admin/companies/import-webfiling', '/api/companies/import-webfiling')) and method == 'POST':
        import datetime
        from services.companies_house_service import fetch_company_profile, fetch_company_officers

        raw_numbers = body.get('company_numbers') or body.get('numbers') or ''
        tokens = re.split(r'[\s,;\n\r\t]+', str(raw_numbers).strip())
        numbers = []
        seen = set()
        for t in tokens:
            clean = re.sub(r'[^A-Za-z0-9]', '', t).upper()
            if len(clean) >= 5:
                if clean.isdigit() and len(clean) < 8:
                    clean = clean.zfill(8)
                if clean not in seen:
                    seen.add(clean)
                    numbers.append(clean)

        if not numbers:
            return error_response(start_response, "Paste at least one Companies House number", status_code=400)
        if len(numbers) > 100:
            return error_response(start_response, "Import up to 100 company numbers at a time", status_code=400)

        # Client resolution
        client_mode = body.get('client_mode') or 'existing'
        target_client_id = None
        if client_mode == 'new':
            new_name = (body.get('new_client_full_name') or body.get('client_name') or '').strip()
            new_email = (body.get('new_client_email') or body.get('client_email') or '').strip().lower()
            if not new_name or not new_email:
                return error_response(start_response, "New client name and email are required", status_code=400)
            existing_user = query_db("SELECT id FROM users WHERE lower(email) = ? LIMIT 1;", (new_email,), one=True)
            if existing_user:
                target_client_id = existing_user['id']
            else:
                target_client_id = execute_db("""
                    INSERT INTO users (full_name, email, password_hash, role, client_type, is_b2b, status, created_at)
                    VALUES (?, ?, ?, 'CLIENT', 'Individual', 0, 'Active', datetime('now'));
                """, (new_name, new_email, unusable_password_hash()))
        else:
            cid = body.get('client_id')
            if cid:
                try:
                    target_client_id = int(cid)
                except (ValueError, TypeError):
                    target_client_id = None
            if not target_client_id:
                target_client_id = user_id

        update_existing = bool(body.get('update_existing'))
        results = []
        imported = updated = skipped = failed = 0

        for number in numbers:
            existing = query_db("SELECT id, name, user_id FROM companies WHERE company_number = ? LIMIT 1;", (number,), one=True)
            
            # Fetch from Companies House
            ch_res = fetch_company_profile(number)
            ch_data = ch_res.get('data') if isinstance(ch_res, dict) and ch_res.get('success') else None

            if ch_data:
                comp_name = ch_data.get('company_name') or f"Company {number}"
                inc_date = ch_data.get('date_of_creation') or str(datetime.date.today())
                ch_status = ch_data.get('company_status') or 'Active'
                status = 'Active' if ch_status.lower() in ('active', 'open') else ch_status.capitalize()
                
                # Format address
                addr = ch_data.get('registered_office_address', {})
                addr_parts = [addr.get('address_line_1'), addr.get('address_line_2'), addr.get('locality'), addr.get('postal_code'), addr.get('country')]
                reg_office = ', '.join(p for p in addr_parts if p) or 'United Kingdom'

                # Fetch officers
                officers_res = fetch_company_officers(number)
                officers = officers_res.get('officers', []) if isinstance(officers_res, dict) else []
                director = 'Director'
                if officers:
                    for off in officers:
                        if 'director' in off.get('officer_role', '').lower():
                            director = off.get('name') or 'Director'
                            break
                    if director == 'Director' and officers[0].get('name'):
                        director = officers[0].get('name')
            else:
                comp_name = f"UK Company {number}"
                inc_date = str(datetime.date.today())
                status = 'Active'
                reg_office = 'United Kingdom'
                director = 'Director'

            if existing:
                if update_existing:
                    execute_db("""
                        UPDATE companies
                        SET name = ?, status = ?, inc_date = ?, director = ?, reg_office = ?
                        WHERE id = ?;
                    """, (comp_name, status, inc_date, director, reg_office, existing['id']))
                    results.append({
                        'company_number': number,
                        'name': comp_name,
                        'status': 'updated',
                        'company_id': existing['id']
                    })
                    updated += 1
                else:
                    results.append({
                        'company_number': number,
                        'name': existing.get('name') or comp_name,
                        'status': 'skipped',
                        'message': 'Already in portal',
                        'company_id': existing['id']
                    })
                    skipped += 1
                continue

            # Insert new company
            comp_id = execute_db("""
                INSERT INTO companies (
                    user_id, name, company_number, status, inc_date, director,
                    reg_office, package, account_status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'WebFiling Import', 'Good Standing', datetime('now'));
            """, (target_client_id, comp_name, number, status, inc_date, director, reg_office))

            results.append({
                'company_number': number,
                'name': comp_name,
                'status': 'imported',
                'company_id': comp_id
            })
            imported += 1

        summary = {
            "status": "success",
            "imported": imported,
            "updated": updated,
            "skipped": skipped,
            "failed": failed,
            "results": results
        }
        return success_response(start_response, data=summary, message=f"WebFiling import: {imported} added, {updated} updated, {skipped} skipped.")

    # ── POST /api/admin/companies/bulk-delete ──────────────────────────────
    if path in ('/api/admin/companies/bulk-delete', '/api/companies/bulk-delete') and method == 'POST':
        ids = body.get('company_ids') or body.get('ids') or []
        if isinstance(ids, str):
            try:
                ids = [int(i.strip()) for i in ids.split(',') if i.strip()]
            except ValueError:
                ids = []

        if not isinstance(ids, list) or not ids:
            return error_response(start_response, "Select at least one company to delete", status_code=400)

        cleaned_ids = []
        for i in ids:
            try:
                cleaned_ids.append(int(i))
            except (ValueError, TypeError):
                pass

        if not cleaned_ids:
            return error_response(start_response, "Invalid company IDs provided", status_code=400)

        placeholders = ', '.join(['?'] * len(cleaned_ids))
        if is_staff:
            count = execute_db(f"DELETE FROM companies WHERE id IN ({placeholders});", cleaned_ids)
            try:
                execute_db(f"DELETE FROM company_directors WHERE company_id IN ({placeholders});", cleaned_ids)
            except Exception:
                pass
        else:
            params = cleaned_ids + [user_id]
            count = execute_db(f"DELETE FROM companies WHERE id IN ({placeholders}) AND user_id = ?;", params)

        return success_response(start_response, data={"deleted_count": count}, message=f"Successfully deleted {count} {'company' if count == 1 else 'companies'}.")

    # ── DELETE /api/companies/<id> OR /api/admin/companies/<id> ───────────
    match_del = re.match(r'^/api/(?:admin/)?companies/(\d+)$', path)
    if match_del and method == 'DELETE':
        comp_id = int(match_del.group(1))
        row = query_db("SELECT id, user_id FROM companies WHERE id = ? LIMIT 1;", (comp_id,), one=True)
        if not row:
            return error_response(start_response, "Company not found", status_code=404)

        if not is_staff and row['user_id'] != user_id:
            return error_response(start_response, "Access denied", status_code=403)

        execute_db("DELETE FROM companies WHERE id = ?;", (comp_id,))
        try:
            execute_db("DELETE FROM company_directors WHERE company_id = ?;", (comp_id,))
        except Exception:
            pass

        return success_response(start_response, message="Company deleted successfully.")

    # ── PUT / PATCH /api/companies/<id> (Update) ──────────────────────────
    match_update = re.match(r'^/api/(?:admin/)?companies/(\d+)$', path)
    if match_update and method in ('PUT', 'PATCH'):
        comp_id = int(match_update.group(1))
        
        row = query_db("SELECT * FROM companies WHERE id = ? LIMIT 1;", (comp_id,), one=True)
        if not row:
            return error_response(start_response, "Company not found", status_code=404)

        if not is_staff and row['user_id'] != user_id:
            return error_response(start_response, "Access denied", status_code=403)

        allowed_fields = [
            'name', 'company_number', 'status', 'authentication_code', 'utr_number',
            'accounts_next_due', 'confirmation_next_due', 'sic_codes', 'director', 'reg_office'
        ]
        
        updates = []
        params = []
        for field in allowed_fields:
            val = body.get(field)
            if field == 'name' and 'company_name' in body:
                val = body.get('company_name')
            if val is not None:
                updates.append(f"{field} = ?")
                params.append(val)

        if updates:
            params.append(comp_id)
            execute_db(f"UPDATE companies SET {', '.join(updates)} WHERE id = ?;", params)

        return success_response(start_response, message="Company updated successfully.")

    return None

