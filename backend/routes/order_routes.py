"""Orders & Service Management Routes (/api/orders)
"""
import re
import secrets
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response

def handle_order_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/orders endpoints."""
    if not (path.startswith('/api/orders') or path.startswith('/api/admin/orders') or path.startswith('/api/client/orders')):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    # ── GET /api/orders (List) ─────────────────────────────────────────────
    if path in ('/api/orders', '/api/admin/orders', '/api/client/orders') and method == 'GET':
        search = (query.get('search') or [''])[0].strip()
        status_filter = (query.get('status') or [''])[0].strip()
        limit = min(int((query.get('limit') or ['50'])[0]), 100)
        offset = max(int((query.get('offset') or ['0'])[0]), 0)

        params = []
        conditions = []

        if not is_staff:
            conditions.append("o.user_id = ?")
            params.append(user_id)

        if search:
            conditions.append("(o.order_number LIKE ? OR o.service_name LIKE ? OR u.full_name LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

        if status_filter:
            conditions.append("o.status = ?")
            params.append(status_filter)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        count_row = query_db(f"SELECT COUNT(*) as total FROM orders o LEFT JOIN users u ON o.user_id = u.id {where_clause};", params, one=True)
        total_count = count_row['total'] if count_row else 0

        params.extend([limit, offset])
        rows = query_db(f"""
            SELECT o.id, o.order_number, o.service_name, o.price, o.vat, o.total as amount,
                   o.status, o.created_at, o.user_id,
                   u.full_name as client_name, u.email as client_email,
                   c.name as company_name, c.company_number
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN companies c ON o.company_id = c.id
            {where_clause}
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?;
        """, params)

        return success_response(start_response, data={
            "orders": [dict(r) for r in rows],
            "total": total_count,
            "limit": limit,
            "offset": offset
        })

    # ── GET /api/orders/<id> (Detail) ─────────────────────────────────────
    match_detail = re.match(r'^/api/(?:admin/|client/)?orders/(\d+)$', path)
    if match_detail and method == 'GET':
        order_id = int(match_detail.group(1))
        
        row = query_db("""
            SELECT o.*, o.total as amount, u.full_name as client_name, u.email as client_email, u.phone as client_phone,
                   c.name as company_name, c.company_number
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN companies c ON o.company_id = c.id
            WHERE o.id = ?
            LIMIT 1;
        """, (order_id,), one=True)

        if not row:
            return error_response(start_response, "Order not found", status_code=404)

        if not is_staff and row['user_id'] != user_id:
            return error_response(start_response, "Access denied", status_code=403)

        # Timeline / History notes
        events = query_db("SELECT * FROM order_timeline WHERE order_id = ? ORDER BY step_date DESC, id DESC;", (order_id,))
        # Uploaded documents
        docs = query_db("SELECT * FROM documents WHERE order_id = ? ORDER BY created_at DESC;", (order_id,))

        data = dict(row)
        data['timeline'] = [dict(e) for e in events]
        data['documents'] = [dict(d) for d in docs]

        return success_response(start_response, data=data)

    # ── POST /api/orders (Create Order) ────────────────────────────────────
    if path in ('/api/orders', '/api/admin/orders', '/api/client/orders') and method == 'POST':
        service_name = (body.get('service_name') or '').strip()
        amount = float(body.get('amount') or body.get('price') or 0)
        vat = float(body.get('vat', 0))
        total = float(body.get('total') or (amount + vat))
        client_id = body.get('user_id') or body.get('client_id') or user_id
        company_id = body.get('company_id')

        if not is_staff:
            client_id = user_id

        if not service_name:
            return error_response(start_response, "Service name is required", status_code=400)

        order_num = f"#GB-{secrets.randbelow(900000) + 100000}"

        order_id = execute_db("""
            INSERT INTO orders (
                order_number, user_id, company_id, service_name,
                price, vat, total, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', datetime('now'));
        """, (order_num, client_id, company_id, service_name, amount, vat, total))

        return success_response(start_response, data={
            "id": order_id,
            "order_number": order_num,
            "service_name": service_name
        }, message="Order created successfully.", status_code=201)

    # ── PATCH /api/orders/<id>/status (Update Status) ─────────────────────
    match_status = re.match(r'^/api/(?:admin/)?orders/(\d+)/status$', path)
    if match_status and method in ('POST', 'PATCH', 'PUT'):
        order_id = int(match_status.group(1))
        new_status = body.get('status')

        if not is_staff:
            return error_response(start_response, "Only staff can update order status", status_code=403)

        if not new_status:
            return error_response(start_response, "Status is required", status_code=400)

        execute_db("UPDATE orders SET status = ? WHERE id = ?;", (new_status, order_id))

        return success_response(start_response, message=f"Order status updated to {new_status}.")

    return None
