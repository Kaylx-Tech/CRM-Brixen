"""Invoices & Billing Routes (/api/invoices)
"""
import re
import secrets
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response

def handle_invoice_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/invoices endpoints."""
    if not path.startswith('/api/invoices'):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    # ── GET /api/invoices (List) ───────────────────────────────────────────
    if path == '/api/invoices' and method == 'GET':
        search = (query.get('search') or [''])[0].strip()
        status_filter = (query.get('status') or [''])[0].strip()
        limit = min(int((query.get('limit') or ['50'])[0]), 100)
        offset = max(int((query.get('offset') or ['0'])[0]), 0)

        params = []
        conditions = []

        if not is_staff:
            conditions.append("i.user_id = ?")
            params.append(user_id)

        if search:
            conditions.append("(i.invoice_number LIKE ? OR u.full_name LIKE ? OR i.description LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

        if status_filter:
            conditions.append("i.status = ?")
            params.append(status_filter)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        count_row = query_db(f"SELECT COUNT(*) as total FROM invoices i LEFT JOIN users u ON i.user_id = u.id {where_clause};", params, one=True)
        total_count = count_row['total'] if count_row else 0

        params.extend([limit, offset])
        rows = query_db(f"""
            SELECT i.id, i.invoice_number, i.amount, i.currency, i.status, i.due_date,
                   i.paid_at, i.created_at, i.order_id, i.description,
                   u.full_name as client_name, u.email as client_email
            FROM invoices i
            LEFT JOIN users u ON i.user_id = u.id
            {where_clause}
            ORDER BY i.created_at DESC
            LIMIT ? OFFSET ?;
        """, params)

        return success_response(start_response, data={
            "invoices": [dict(r) for r in rows],
            "total": total_count,
            "limit": limit,
            "offset": offset
        })

    # ── GET /api/invoices/<id> (Detail) ───────────────────────────────────
    match_detail = re.match(r'^/api/invoices/(\d+)$', path)
    if match_detail and method == 'GET':
        inv_id = int(match_detail.group(1))
        
        row = query_db("""
            SELECT i.*, u.full_name as client_name, u.email as client_email, u.phone as client_phone,
                   o.order_number, o.service_name
            FROM invoices i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN orders o ON i.order_id = o.id
            WHERE i.id = ?
            LIMIT 1;
        """, (inv_id,), one=True)

        if not row:
            return error_response(start_response, "Invoice not found", status_code=404)

        if not is_staff and row['user_id'] != user_id:
            return error_response(start_response, "Access denied", status_code=403)

        return success_response(start_response, data=dict(row))

    # ── POST /api/invoices (Create Invoice) ────────────────────────────────
    if path == '/api/invoices' and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Only staff can generate invoices", status_code=403)

        client_id = body.get('user_id')
        order_id = body.get('order_id')
        amount = float(body.get('amount', 0))
        currency = body.get('currency', 'GBP')
        description = body.get('description', 'Brixen Professional Services')
        due_date = body.get('due_date')

        if not client_id or amount <= 0:
            return error_response(start_response, "Client ID and valid amount required", status_code=400)

        inv_num = f"INV-{secrets.randbelow(900000) + 100000}"

        inv_id = execute_db("""
            INSERT INTO invoices (
                invoice_number, user_id, order_id, amount, currency,
                description, status, due_date, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Unpaid', ?, datetime('now'), datetime('now'));
        """, (inv_num, client_id, order_id, amount, currency, description, due_date))

        return success_response(start_response, data={
            "id": inv_id,
            "invoice_number": inv_num,
            "amount": amount
        }, message="Invoice created successfully.", status_code=201)

    # ── POST /api/invoices/<id>/pay (Record Payment) ──────────────────────
    match_pay = re.match(r'^/api/invoices/(\d+)/pay$', path)
    if match_pay and method == 'POST':
        inv_id = int(match_pay.group(1))
        
        row = query_db("SELECT * FROM invoices WHERE id = ? LIMIT 1;", (inv_id,), one=True)
        if not row:
            return error_response(start_response, "Invoice not found", status_code=404)

        execute_db("""
            UPDATE invoices
            SET status = 'Paid', paid_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?;
        """, (inv_id,))

        if row.get('order_id'):
            execute_db("""
                UPDATE orders
                SET payment_status = 'Paid', updated_at = datetime('now')
                WHERE id = ?;
            """, (row['order_id'],))

        return success_response(start_response, message="Payment recorded successfully.")

    return None
