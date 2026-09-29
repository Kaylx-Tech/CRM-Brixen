"""Client Directory & CRM Routes (/api/clients, /api/admin/customers, /api/admin/staff)
"""
import re
from db import query_db, execute_db, hash_password
from utils.response import json_response, success_response, error_response

def handle_client_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/clients and /api/admin/customers endpoints."""
    valid_prefixes = (
        '/api/clients',
        '/api/admin/customers',
        '/api/admin/staff'
    )
    if not any(path.startswith(prefix) for prefix in valid_prefixes):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    if not is_staff:
        return error_response(start_response, "Access denied. Staff only.", status_code=403)

    # ── 1. GET /api/admin/customers OR /api/clients (List Customers) ─────────
    if (path in ('/api/admin/customers', '/api/clients') or path == '/api/clients') and method == 'GET':
        search = (query.get('search') or [''])[0].strip() if query else ''
        status_filter = (query.get('status') or [''])[0].strip() if query else ''
        type_filter = (query.get('type') or [''])[0].strip() if query else ''

        params = []
        conditions = ["u.role = 'CLIENT'"]

        if search:
            conditions.append("(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

        if status_filter and status_filter.lower() != 'all':
            conditions.append("u.status = ?")
            params.append(status_filter)

        where_clause = f"WHERE {' AND '.join(conditions)}"

        sql = f"""
            SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status, u.created_at,
                   u.client_type, u.is_b2b, u.wordpress_user_id,
                   (SELECT COUNT(*) FROM companies WHERE user_id = u.id) as companies_count,
                   (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as orders_count
            FROM users u
            {where_clause}
            ORDER BY u.created_at DESC;
        """
        rows = query_db(sql, params)
        customers = [dict(r) for r in rows]

        return success_response(start_response, data={
            "status": "success",
            "customers": customers,
            "clients": customers,
            "total": len(customers)
        })

    # ── 2. POST /api/admin/customers/status (Update Status) ───────────────────
    if path == '/api/admin/customers/status' and method == 'POST':
        cid = body.get('customer_id') or body.get('id')
        new_status = body.get('status')
        if not cid or not new_status:
            return error_response(start_response, "Customer ID and status are required", status_code=400)

        execute_db("UPDATE users SET status = ? WHERE id = ?;", (new_status, cid))
        return success_response(start_response, message=f"Customer status updated to {new_status}")

    # ── 3. POST /api/admin/customers/phone (Update Phone) ─────────────────────
    if path == '/api/admin/customers/phone' and method == 'POST':
        cid = body.get('customer_id') or body.get('id')
        phone = (body.get('phone') or '').strip()
        if not cid:
            return error_response(start_response, "Customer ID is required", status_code=400)

        execute_db("UPDATE users SET phone = ? WHERE id = ?;", (phone or None, cid))
        return success_response(start_response, message="Customer contact updated", data={"phone": phone})

    # ── 3.1 POST /api/admin/customers/notification-email (Update Notification Email) ───
    if path == '/api/admin/customers/notification-email' and method == 'POST':
        cid = body.get('customer_id') or body.get('user_id') or body.get('id')
        n_email = (body.get('notification_email') or '').strip()
        if not cid:
            return error_response(start_response, "Customer ID is required", status_code=400)

        execute_db("UPDATE users SET notification_email = ? WHERE id = ?;", (n_email or None, cid))
        return success_response(start_response, message="Notification email updated", data={"notification_email": n_email})

    # ── 4. POST /api/admin/customers/password (Set / Reset Password) ─────────
    if path in ('/api/admin/customers/password', '/api/admin/customers/set-password') and method == 'POST':
        cid = body.get('customer_id') or body.get('id')
        new_password = body.get('password')
        if not cid or not new_password:
            return error_response(start_response, "Customer ID and new password are required", status_code=400)

        if len(new_password) < 6:
            return error_response(start_response, "Password must be at least 6 characters", status_code=400)

        hashed = hash_password(new_password)
        execute_db("UPDATE users SET password_hash = ? WHERE id = ?;", (hashed, cid))
        return success_response(start_response, message="Customer password updated successfully")

    # ── 5. POST /api/admin/customers/delete (Single Delete) ──────────────────
    if path == '/api/admin/customers/delete' and method == 'POST':
        cid = body.get('customer_id') or body.get('id')
        if not cid:
            return error_response(start_response, "Customer ID is required", status_code=400)

        # Remove from orders / companies / users
        execute_db("DELETE FROM users WHERE id = ? AND role = 'CLIENT';", (cid,))
        return success_response(start_response, message="Customer account deleted successfully")

    # ── 6. POST /api/admin/customers/bulk-delete (Bulk Delete) ───────────────
    if path == '/api/admin/customers/bulk-delete' and method == 'POST':
        cids = body.get('customer_ids') or []
        if not cids or not isinstance(cids, list):
            return error_response(start_response, "customer_ids array required", status_code=400)

        for cid in cids:
            execute_db("DELETE FROM users WHERE id = ? AND role = 'CLIENT';", (cid,))

        return success_response(start_response, message=f"Successfully removed {len(cids)} customer account(s)")

    # ── 7. POST /api/admin/staff OR /api/admin/customers (Create Customer) ───
    if path in ('/api/admin/staff', '/api/admin/customers', '/api/clients') and method == 'POST':
        email = (body.get('email') or '').strip().lower()
        full_name = (body.get('full_name') or body.get('name') or '').strip()
        role = (body.get('role') or 'CLIENT').strip().upper()
        phone = (body.get('phone') or '').strip()
        password = body.get('password') or 'Brixen@2026!'
        client_type = body.get('client_type') or 'Individual'
        is_b2b = 1 if (body.get('is_b2b') or client_type == 'B2B') else 0

        if path in ('/api/admin/customers', '/api/clients'):
            role = 'CLIENT'

        creatable = {
            'SUPER_ADMIN': {'SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF', 'CLIENT'},
            'ADMIN': {'ADMIN', 'MANAGER', 'STAFF', 'CLIENT'},
            'MANAGER': {'STAFF', 'CLIENT'},
            'STAFF': {'CLIENT'},
        }.get(user_role, set())
        if role not in creatable:
            return error_response(start_response, "You cannot create an account with that role", status_code=403)

        if not email or not full_name:
            return error_response(start_response, "Full name and email are required", status_code=400)

        existing = query_db("SELECT id FROM users WHERE email = ?;", (email,), one=True)
        if existing:
            return error_response(start_response, "An account with this email already exists", status_code=400)

        hashed = hash_password(password)
        new_id = execute_db("""
            INSERT INTO users (full_name, email, password_hash, role, phone, client_type, is_b2b, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', datetime('now', 'localtime'));
        """, (full_name, email, hashed, role, phone or None, client_type, is_b2b))

        return success_response(start_response, message=f"Customer '{full_name}' created successfully", data={"id": new_id})

    # ── 8. GET /api/clients/<id> OR /api/admin/customers/<id> (Detail) ───────
    match_detail = re.match(r'^/(?:api/clients|api/admin/customers)/(\d+)$', path)
    if match_detail and method == 'GET':
        client_id = int(match_detail.group(1))

        row = query_db("""
            SELECT id, full_name, email, phone, role, status, created_at, client_type, is_b2b
            FROM users WHERE id = ? LIMIT 1;
        """, (client_id,), one=True)
        if not row:
            return error_response(start_response, "Customer not found", status_code=404)

        companies = query_db("SELECT id, name as company_name, company_number, status FROM companies WHERE user_id = ?;", (client_id,))
        orders = query_db("SELECT id, order_number, service_name, status, total as amount, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC;", (client_id,))
        invoices = query_db("SELECT id, invoice_number, amount, status, due_date FROM invoices WHERE user_id = ? ORDER BY created_at DESC;", (client_id,))

        data = dict(row)
        data['companies'] = [dict(c) for c in companies]
        data['orders'] = [dict(o) for o in orders]
        data['invoices'] = [dict(i) for i in invoices]

        return success_response(start_response, data=data)

    return None
