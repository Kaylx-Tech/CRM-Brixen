"""Client Directory & CRM Routes (/api/clients)
"""
import re
from db import query_db, execute_db, hash_password
from utils.response import json_response, success_response, error_response

def handle_client_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/clients endpoints."""
    if not path.startswith('/api/clients'):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    if not is_staff:
        return error_response(start_response, "Access denied. Staff only.", status_code=403)

    # ── GET /api/clients (List Clients) ───────────────────────────────────
    if path == '/api/clients' and method == 'GET':
        search = (query.get('search') or [''])[0].strip()
        limit = min(int((query.get('limit') or ['50'])[0]), 100)
        offset = max(int((query.get('offset') or ['0'])[0]), 0)

        params = []
        conditions = ["u.role = 'CLIENT'"]

        if search:
            conditions.append("(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

        where_clause = f"WHERE {' AND '.join(conditions)}"

        count_row = query_db(f"SELECT COUNT(*) as total FROM users u {where_clause};", params, one=True)
        total_count = count_row['total'] if count_row else 0

        params.extend([limit, offset])
        rows = query_db(f"""
            SELECT u.id, u.full_name as name, u.email, u.phone, u.role, u.status, u.created_at,
                   (SELECT COUNT(*) FROM companies WHERE client_id = u.id) as total_companies,
                   (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as total_orders
            FROM users u
            {where_clause}
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?;
        """, params)

        return success_response(start_response, data={
            "clients": [dict(r) for r in rows],
            "total": total_count,
            "limit": limit,
            "offset": offset
        })

    # ── GET /api/clients/<id> (Detail) ────────────────────────────────────
    match_detail = re.match(r'^/api/clients/(\d+)$', path)
    if match_detail and method == 'GET':
        client_id = int(match_detail.group(1))

        row = query_db("SELECT id, full_name as name, email, phone, role, status, created_at FROM users WHERE id = ? LIMIT 1;", (client_id,), one=True)
        if not row:
            return error_response(start_response, "Client not found", status_code=404)

        companies = query_db("SELECT id, company_name, company_number, status FROM companies WHERE client_id = ? OR user_id = ?;", (client_id, client_id))
        orders = query_db("SELECT id, order_number, service_name, status, amount, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC;", (client_id,))
        invoices = query_db("SELECT id, invoice_number, amount, status, due_date FROM invoices WHERE user_id = ? ORDER BY created_at DESC;", (client_id,))

        data = dict(row)
        data['companies'] = [dict(c) for c in companies]
        data['orders'] = [dict(o) for o in orders]
        data['invoices'] = [dict(i) for i in invoices]

        return success_response(start_response, data=data)

    return None
