"""Company Management Routes (/api/companies)
"""
import re
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response

def handle_company_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/companies endpoints."""
    if not path.startswith('/api/companies'):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    # ── GET /api/companies (List) ──────────────────────────────────────────
    if path == '/api/companies' and method == 'GET':
        search = (query.get('search') or [''])[0].strip()
        status_filter = (query.get('status') or [''])[0].strip()
        limit = min(int((query.get('limit') or ['50'])[0]), 100)
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
    match_detail = re.match(r'^/api/companies/(\d+)$', path)
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
    if path == '/api/companies' and method == 'POST':
        name = (body.get('company_name') or body.get('name') or '').strip()
        comp_number = (body.get('company_number') or '').strip()
        director = body.get('director') or user.get('name') or 'Director'
        reg_office = body.get('reg_office') or '71-75 Shelton Street, Covent Garden, London, WC2H 9JQ'
        client_id = body.get('user_id') or body.get('client_id') or user_id

        if not name:
            return error_response(start_response, "Company name is required", status_code=400)

        if not comp_number:
            import secrets
            comp_number = f"GB{secrets.randbelow(90000000) + 10000000}"

        comp_id = execute_db("""
            INSERT INTO companies (
                user_id, name, company_number, inc_date, director,
                reg_office, status, created_at
            ) VALUES (?, ?, ?, date('now'), ?, ?, 'Active', datetime('now'));
        """, (client_id, name, comp_number, director, reg_office))

        return success_response(start_response, data={"id": comp_id, "company_name": name, "company_number": comp_number}, message="Company created successfully.", status_code=201)

    # ── PUT / PATCH /api/companies/<id> (Update) ──────────────────────────
    match_update = re.match(r'^/api/companies/(\d+)$', path)
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
