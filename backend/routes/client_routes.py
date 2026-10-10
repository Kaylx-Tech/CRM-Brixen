"""Client Directory & CRM Routes (/api/clients, /api/admin/customers, /api/admin/staff)
"""
import os
import re
from db import query_db, execute_db, hash_password
from utils.response import json_response, success_response, error_response
from services.permissions import check_permission, can_view_revenue
from services.b2b_service import client_is_b2b
from services import wordpress_service

STAFF_MIN_PASSWORD_LEN = 10
STAFF_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
DELETE_ROLES = ('SUPER_ADMIN', 'ADMIN')
# Initial password for customers created from the CRM (override with DEFAULT_CUSTOMER_PASSWORD).
DEFAULT_CUSTOMER_PASSWORD = os.environ.get('DEFAULT_CUSTOMER_PASSWORD') or 'Google@126'


def _audit(user, action, entity_type=None, entity_id=None, details=None):
    try:
        execute_db(
            "INSERT INTO activity_logs (user_id, user_email, action, entity_type, entity_id, details) "
            "VALUES (?, ?, ?, ?, ?, ?);",
            ((user or {}).get('id'), (user or {}).get('email') or 'SYSTEM', action, entity_type,
             str(entity_id) if entity_id is not None else None, details))
    except Exception as exc:
        print(f"[Audit Log Error] {exc}")


def _forbidden(start_response, message="Insufficient permissions"):
    return error_response(start_response, message, status_code=403)


def _client_target(cid):
    return query_db(
        "SELECT id, email, full_name, phone, role, wordpress_user_id, is_b2b, client_type "
        "FROM users WHERE id = ? LIMIT 1;", (cid,), one=True)


def _portal_login_ready(row):
    """Only B2B clients sign in to the CRM portal; others use the website."""
    if not client_is_b2b(row):
        return False
    return not str(row.get('wordpress_user_id') or '').startswith('local_client_')


def _remove_customers(ids, actor):
    """Permanently delete clients (blocked for locked genuine data unless SUPER_ADMIN force)."""
    from services import data_protection, permanent_purge
    force = (actor or {}).get('role') == 'SUPER_ADMIN'
    clean = [int(x) for x in ids if str(x).isdigit()]
    if not clean:
        return 0, []
    marks = ','.join('?' for _ in clean)
    targets = query_db(
        f"SELECT id, email, full_name, wordpress_user_id FROM users WHERE role = 'CLIENT' AND id IN ({marks});",
        clean) or []
    allowed, blocked_msgs = [], []
    for t in targets:
        blocked = data_protection.refuse_client_account_purge(t['id'], force=force, actor=actor)
        if blocked:
            blocked_msgs.append(f"{t.get('full_name') or t.get('email')}: {blocked}")
            _audit(actor, 'CLIENT_DELETE_BLOCKED', 'users', t['id'], blocked)
            continue
        allowed.append(dict(t))
    if not allowed:
        return 0, blocked_msgs
    result = permanent_purge.purge_clients_from_live(clients=allowed, actor=actor, scrub_backups=True)
    root = os.path.abspath(permanent_purge.storage_dir())
    for path in result.get('doc_paths') or []:
        try:
            if path and os.path.abspath(path).startswith(root) and os.path.isfile(path):
                os.remove(path)
        except OSError:
            pass
    _audit(actor, 'CLIENTS_PERMANENTLY_DELETED', 'users', ','.join(str(x['id']) for x in allowed),
           f"Permanently deleted {len(allowed)} customer profile(s)")
    return int(result.get('deleted') or len(allowed)), blocked_msgs

def handle_client_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/clients and /api/admin/customers endpoints."""
    valid_prefixes = (
        '/api/clients',
        '/api/admin/customers',
        '/api/admin/clients',
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
    if path in ('/api/admin/customers', '/api/clients') and method == 'GET':
        if not check_permission(user, 'clients.view'):
            return _forbidden(start_response)
        search = (query.get('search') or [''])[0].strip() if query else ''
        status_filter = (query.get('status') or [''])[0].strip() if query else ''

        params = []
        conditions = ["u.role = 'CLIENT'"]
        if search:
            conditions.append("(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.b2b_id LIKE ?)")
            params.extend([f"%{search}%"] * 4)
        if status_filter and status_filter.lower() != 'all':
            conditions.append("u.status = ?")
            params.append(status_filter)
        if user_role == 'MANAGER':  # managers only see clients on their orders / unassigned ones
            conditions.append(
                "u.id IN (SELECT user_id FROM orders WHERE assigned_staff_id = ? OR assigned_staff_id IS NULL "
                "OR assigned_staff_id IN (SELECT id FROM users WHERE role = 'STAFF'))")
            params.append(user['id'])

        rows = query_db(f"""
            SELECT u.id, u.full_name, u.email, u.phone, u.country, u.address, u.role, u.status, u.created_at,
                   u.client_type, u.is_b2b, u.b2b_id, u.wordpress_user_id, u.notification_email,
                   COALESCE(u.type_change_count, 0) as type_change_count,
                   COALESCE(u.type_locked, 0) as type_locked,
                   (SELECT COUNT(*) FROM companies WHERE user_id = u.id) as companies_count,
                   (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as orders_count
            FROM users u
            WHERE {' AND '.join(conditions)}
            ORDER BY u.created_at DESC;
        """, params) or []
        customers = []
        for r in rows:
            item = dict(r)
            item['portal_login_ready'] = _portal_login_ready(item)
            item['website_login_only'] = not client_is_b2b(item)
            customers.append(item)
        return success_response(start_response, data={
            "status": "success", "customers": customers, "clients": customers, "total": len(customers)})

    # ── 2. POST /api/admin/customers/status (Update Status) ───────────────────
    if path == '/api/admin/customers/status' and method == 'POST':
        if not check_permission(user, 'clients.edit'):
            return _forbidden(start_response)
        cid = body.get('customer_id') or body.get('id')
        new_status = body.get('status')
        if not cid or new_status not in ('Active', 'Suspended', 'Pending'):
            return error_response(start_response, "Customer ID and a valid status are required", status_code=400)
        execute_db("UPDATE users SET status = ? WHERE id = ? AND role = 'CLIENT';", (new_status, cid))
        _audit(user, 'CUSTOMER_STATUS_CHANGE', 'users', cid, f"Updated status to {new_status}")
        return success_response(start_response, message=f"Customer status updated to {new_status}")

    # ── 2.1 POST /api/admin/customers/type (one change, then locked) ──────────
    if path in ('/api/admin/customers/type', '/api/admin/customers/client-type') and method == 'POST':
        if user_role not in ('SUPER_ADMIN', 'ADMIN') or not check_permission(user, 'clients.edit'):
            return error_response(start_response, "Only an admin can change the customer type", status_code=403)
        cid = body.get('customer_id') or body.get('id')
        new_type = str(body.get('type') or body.get('client_type') or '').strip()
        if not cid or not new_type:
            return error_response(start_response, "Customer ID and type are required", status_code=400)

        row = query_db("SELECT id, client_type, is_b2b, COALESCE(type_locked, 0) as type_locked, COALESCE(type_change_count, 0) as type_change_count FROM users WHERE id = ? AND role = 'CLIENT';", (cid,), one=True)
        if not row:
            return error_response(start_response, "Customer not found", status_code=404)
        if int(row['type_locked'] or 0) >= 1 or int(row['type_change_count'] or 0) >= 1:
            return error_response(start_response, "Customer type has already been changed once and is permanently locked.", status_code=400)

        is_b2b = 1 if new_type.upper() == 'B2B' else 0
        client_type = 'B2B' if is_b2b else ('Business' if new_type.lower() == 'business' else 'Individual')
        b2b_id = f"B2B-{str(cid).zfill(6)}" if is_b2b else None
        execute_db("""
            UPDATE users
            SET client_type = ?, is_b2b = ?, b2b_id = COALESCE(b2b_id, ?), type_change_count = COALESCE(type_change_count, 0) + 1, type_locked = 1,
                notification_email = CASE WHEN ? IN ('B2B', 'Business') AND TRIM(COALESCE(notification_email, '')) = ''
                                          THEN email ELSE notification_email END
            WHERE id = ?;
        """, (client_type, is_b2b, b2b_id, client_type, cid))
        _audit(user, 'CUSTOMER_TYPE_CHANGE', 'users', cid, f"Updated customer type to {client_type} (locked)")
        return success_response(start_response, message=f"Customer type updated to {client_type} and permanently locked", data={"type": client_type, "is_b2b": is_b2b, "type_locked": 1, "type_change_count": 1})

    # ── 3. POST /api/admin/customers/phone (Update Phone) ─────────────────────
    if path == '/api/admin/customers/phone' and method == 'POST':
        if not check_permission(user, 'clients.edit'):
            return _forbidden(start_response)
        cid = body.get('customer_id') or body.get('id')
        phone = (body.get('phone') or '').strip()
        target = _client_target(cid) if cid else None
        if not target or target.get('role') != 'CLIENT':
            return error_response(start_response, "Customer not found", status_code=404)
        execute_db("UPDATE users SET phone = ? WHERE id = ?;", (phone or None, cid))
        _audit(user, 'CUSTOMER_PHONE_UPDATE', 'users', cid, f"Updated UK contact for {target.get('email')}")
        return success_response(start_response, message="UK contact number saved.", data={"phone": phone})

    # ── 3.1 POST /api/admin/customers/notification-email ──────────────────────
    if path == '/api/admin/customers/notification-email' and method == 'POST':
        if not check_permission(user, 'clients.edit'):
            return _forbidden(start_response)
        cid = body.get('customer_id') or body.get('user_id') or body.get('id')
        raw_email = (body.get('notification_email') or '').strip().lower()
        if raw_email and not STAFF_EMAIL_RE.match(raw_email):
            return error_response(start_response, "Enter a valid notification email.", status_code=400)
        target = _client_target(cid) if cid else None
        if not target or target.get('role') != 'CLIENT':
            return error_response(start_response, "Customer not found", status_code=404)
        # Blank means "use the signup email", so store that instead of leaving it empty
        login_email = (target.get('email') or '').strip().lower()
        saved_email = raw_email or login_email or None
        execute_db("UPDATE users SET notification_email = ? WHERE id = ?;", (saved_email, cid))
        _audit(user, 'CUSTOMER_NOTIFICATION_EMAIL_UPDATE', 'users', cid,
               f"Notification email for {target.get('email')} set to {raw_email or '(login email)'}")
        return success_response(
            start_response,
            message="Notification email saved. All client emails for this customer will use it.",
            data={"notification_email": saved_email or '', "effective_email": saved_email or ''})

    # ── 4. POST /api/admin/customers/password (Set / Reset Password) ─────────
    if path in ('/api/admin/customers/password', '/api/admin/customers/set-password') and method == 'POST':
        if not check_permission(user, 'clients.edit'):
            return _forbidden(start_response)
        cid = body.get('customer_id') or body.get('id')
        password = body.get('password') or ''
        confirm = body.get('confirm_password')
        if not cid:
            return error_response(start_response, "Customer is required", status_code=400)
        if not isinstance(password, str) or len(password) < STAFF_MIN_PASSWORD_LEN:
            return error_response(start_response, f"Password must be at least {STAFF_MIN_PASSWORD_LEN} characters", status_code=400)
        if confirm is not None and confirm != password:
            return error_response(start_response, "Passwords do not match", status_code=400)
        target = _client_target(cid)
        if not target or target.get('role') != 'CLIENT':
            return error_response(start_response, "Customer not found", status_code=404)

        execute_db("UPDATE users SET password_hash = ? WHERE id = ?;", (hash_password(password), cid))
        _audit(user, 'CLIENT_PASSWORD_SET', 'users', cid, f"Set portal password for {target.get('email')}")

        name = target.get('full_name') or 'Customer'
        if client_is_b2b(target):
            return success_response(
                start_response, message=f"{name} can now sign in at the portal with {target.get('email')}.",
                data={"portal_login_ready": True, "website_provisioned": None})

        # Normal website customers must also exist in WordPress (REST API + application password)
        site = wordpress_service.provision_website_user(
            email=target.get('email'), password=password, full_name=target.get('full_name'),
            phone=target.get('phone'), wordpress_user_id=target.get('wordpress_user_id'))
        if not site.get('ok'):
            return json_response(start_response, {
                'status': 'error', 'success': False,
                'message': f"CRM password was saved, but the website login was not saved ({site.get('message')}). "
                           "Check the WordPress connection in Settings, then set the password again.",
                'website_provisioned': False, 'website_error': site.get('message'),
            }, 502)
        if site.get('wordpress_user_id'):
            execute_db("UPDATE users SET wordpress_user_id = ? WHERE id = ?;", (site['wordpress_user_id'], cid))
        return success_response(
            start_response,
            message=f"{name} can now sign in on the Brixen website ({wordpress_service.website_customer_login_url()}) with {target.get('email')}.",
            data={"portal_login_ready": False, "website_provisioned": True})

    # ── 5. POST /api/admin/customers/delete (Single Delete) ──────────────────
    if path == '/api/admin/customers/delete' and method == 'POST':
        if user_role not in DELETE_ROLES:
            return _forbidden(start_response, "Deletion is restricted to Administrator accounts only.")
        cid = body.get('customer_id') or body.get('id')
        target = _client_target(cid) if cid else None
        if not target or target.get('role') != 'CLIENT':
            return error_response(start_response, "Customer not found or not a client", status_code=404)
        deleted, blocked = _remove_customers([cid], user)
        if deleted < 1:
            return _forbidden(start_response, "This client could not be deleted. " + (blocked[0] if blocked else
                              "If records are locked, sign in as Super Admin (owner) and try again."))
        return success_response(start_response, message=f"Customer '{target.get('full_name') or target.get('email')}' has been removed successfully.")

    # ── 6. POST /api/admin/customers/bulk-delete (Bulk Delete) ───────────────
    if path == '/api/admin/customers/bulk-delete' and method == 'POST':
        if user_role not in DELETE_ROLES:
            return _forbidden(start_response, "Deletion is restricted to Administrator accounts only.")
        cids = body.get('customer_ids') or []
        if not cids or not isinstance(cids, list):
            return error_response(start_response, "No customer IDs selected", status_code=400)
        deleted, blocked = _remove_customers(cids, user)
        if deleted < 1:
            return _forbidden(start_response, "No customers were removed. " + (blocked[0] if blocked else
                              "If records are locked, sign in as Super Admin (owner) and try again."))
        suffix = f" ({len(blocked)} blocked: locked genuine records)" if blocked else ""
        return success_response(start_response, message=f"Successfully removed {deleted} customer(s).{suffix}",
                                data={"deleted_count": deleted, "blocked": blocked})

    # ── 6b. GET /api/admin/staff (List staff / team members) ─────────────────
    if path == '/api/admin/staff' and method == 'GET':
        rows = query_db("""
            SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status, u.created_at,
                   (SELECT COUNT(*) FROM tasks t
                    WHERE t.assigned_staff_id = u.id
                      AND t.status IN ('Open', 'In Progress')) as open_tasks,
                   (SELECT COUNT(*) FROM tasks t
                    WHERE t.assigned_staff_id = u.id) as total_tasks
            FROM users u
            WHERE u.role IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
              AND u.removed_at IS NULL
            ORDER BY
              CASE u.role
                WHEN 'SUPER_ADMIN' THEN 0
                WHEN 'ADMIN' THEN 1
                WHEN 'MANAGER' THEN 2
                ELSE 3
              END,
              u.full_name COLLATE NOCASE;
        """)
        staff = [dict(r) for r in rows]
        return success_response(start_response, data={
            "staff": staff,
            "total": len(staff),
        })

    # ── 6c. DELETE /api/admin/staff/<id> (Remove team member, admin only) ────
    # Soft remove: the account is switched off and signed out, but kept so task and audit history stay intact.
    match_staff = re.match(r'^/api/admin/staff/(\d+)$', path)
    if match_staff and method == 'DELETE':
        if user_role not in ('SUPER_ADMIN', 'ADMIN'):
            return error_response(start_response, "Only an admin can remove team members", status_code=403)
        sid = int(match_staff.group(1))
        member = query_db("SELECT id, full_name, email, role, status FROM users WHERE id = ? LIMIT 1;", (sid,), one=True)
        if not member or member.get('role') not in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF'):
            return error_response(start_response, "Team member not found", status_code=404)
        if sid == user.get('id'):
            return error_response(start_response, "You cannot remove your own account", status_code=400)
        if member.get('role') == 'SUPER_ADMIN' and user_role != 'SUPER_ADMIN':
            return error_response(start_response, "Only a super admin can remove another super admin", status_code=403)
        if member.get('role') == 'SUPER_ADMIN':
            others = query_db("""
                SELECT COUNT(*) AS c FROM users
                WHERE role = 'SUPER_ADMIN' AND status = 'Active' AND id <> ?;
            """, (sid,), one=True)
            if not (others or {}).get('c'):
                return error_response(start_response, "The last super admin cannot be removed", status_code=400)

        execute_db("UPDATE users SET status = 'Suspended', removed_at = datetime('now') WHERE id = ?;", (sid,))
        execute_db("UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL;", (sid,))
        open_tasks = (query_db("""
            SELECT COUNT(*) AS c FROM tasks
            WHERE assigned_staff_id = ? AND status IN ('Open', 'In Progress');
        """, (sid,), one=True) or {}).get('c') or 0
        _audit(user, 'STAFF_REMOVED', 'users', sid,
               f"Removed team member {member.get('email')} ({member.get('role')})")
        msg = f"{member.get('full_name') or member.get('email')} was removed from the team"
        if open_tasks:
            msg += f". They still had {open_tasks} open task(s) - reassign them from Tasks."
        return success_response(start_response, message=msg, data={"id": sid, "open_tasks": open_tasks})

    # ── 7. POST /api/admin/staff OR /api/admin/customers (Create Customer) ───
    if path in ('/api/admin/staff', '/api/admin/customers', '/api/clients') and method == 'POST':
        email = (body.get('email') or '').strip().lower()
        full_name = (body.get('full_name') or body.get('name') or '').strip()
        role = (body.get('role') or 'CLIENT').strip().upper()
        phone = (body.get('phone') or '').strip()
        password = body.get('password') or DEFAULT_CUSTOMER_PASSWORD
        client_type = body.get('client_type') or 'Individual'
        is_b2b = 1 if (body.get('is_b2b') or client_type == 'B2B') else 0

        if path in ('/api/admin/customers', '/api/clients'):
            role = 'CLIENT'

        creatable = {
            'SUPER_ADMIN': {'SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF', 'CLIENT'},
            'ADMIN': {'ADMIN', 'MANAGER', 'STAFF', 'CLIENT'},
            # Only admins add team members; managers and staff can still create customers
            'MANAGER': {'CLIENT'},
            'STAFF': {'CLIENT'},
        }.get(user_role, set())
        if role not in creatable:
            msg = ("Only an admin can add team members" if role != 'CLIENT'
                   else "You cannot create an account with that role")
            return error_response(start_response, msg, status_code=403)
        if not check_permission(user, 'clients.create' if role == 'CLIENT' else 'staff.manage'):
            return _forbidden(start_response)

        if not email or not full_name or not STAFF_EMAIL_RE.match(email):
            return error_response(start_response, "Full name and a valid email are required", status_code=400)
        if role != 'CLIENT' and (not body.get('password') or len(str(body.get('password'))) < STAFF_MIN_PASSWORD_LEN):
            return error_response(
                start_response, f"Staff accounts need an explicit password (min {STAFF_MIN_PASSWORD_LEN} characters)",
                status_code=400)

        existing = query_db("SELECT id, role, removed_at FROM users WHERE email = ?;", (email,), one=True)
        if existing and role != 'CLIENT' and existing.get('removed_at') and existing.get('role') != 'CLIENT':
            # Adding back someone who was removed earlier: switch the old account on again
            execute_db("""
                UPDATE users SET full_name = ?, password_hash = ?, role = ?, phone = COALESCE(?, phone),
                                 status = 'Active', removed_at = NULL
                WHERE id = ?;
            """, (full_name, hash_password(password), role, phone or None, existing['id']))
            _audit(user, 'STAFF_RESTORED', 'users', existing['id'], f"Re-added {role} account for {email}")
            return success_response(start_response, message=f"Team member '{full_name}' added back", data={"id": existing['id']})
        if existing:
            return error_response(start_response, "An account with this email already exists", status_code=400)

        hashed = hash_password(password)
        # Notification emails default to the login email (can be changed later from the customer profile).
        notification_email = email if role == 'CLIENT' else None
        new_id = execute_db("""
            INSERT INTO users (full_name, email, password_hash, role, phone, client_type, is_b2b, notification_email, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', datetime('now', 'localtime'));
        """, (full_name, email, hashed, role, phone or None, client_type, is_b2b, notification_email))

        if is_b2b and new_id:
            execute_db("UPDATE users SET b2b_id = COALESCE(b2b_id, ?) WHERE id = ?;", (f"B2B-{str(new_id).zfill(6)}", new_id))
        _audit(user, 'CUSTOMER_CREATED' if role == 'CLIENT' else 'STAFF_CREATED', 'users', new_id,
               f"Created {role} account for {email}")
        noun = 'Customer' if role == 'CLIENT' else 'Team member'
        return success_response(start_response, message=f"{noun} '{full_name}' created successfully", data={"id": new_id})

    # ── 8. GET /api/clients/<id> OR /api/admin/customers/<id> (Detail) ───────
    match_detail = re.match(r'^/(?:api/clients|api/admin/customers)/(\d+)$', path)
    if match_detail and method == 'GET':
        client_id = int(match_detail.group(1))

        row = query_db("""
            SELECT id, full_name, email, phone, country, address, role, status, created_at,
                   client_type, is_b2b, b2b_id, wordpress_user_id, notification_email,
                   COALESCE(type_locked, 0) as type_locked,
                   COALESCE(type_change_count, 0) as type_change_count
            FROM users WHERE id = ? LIMIT 1;
        """, (client_id,), one=True)
        if not row:
            return error_response(start_response, "Customer not found", status_code=404)

        companies = query_db("""
            SELECT id, name, name as company_name, company_number, status, inc_date,
                   director, reg_office, package, account_status, created_at
            FROM companies 
            WHERE user_id = ? 
            ORDER BY id DESC;
        """, (client_id,))
        
        orders = query_db("""
            SELECT o.id, o.order_number, o.service_name,
                   COALESCE((SELECT GROUP_CONCAT(li.product_name, ', ') FROM order_line_items li WHERE li.order_id = o.id), o.service_name) AS products_summary,
                   o.status,
                   o.total as amount, o.total, o.payment_mode,
                   (SELECT inv.status FROM invoices inv WHERE inv.order_id = o.id ORDER BY inv.id DESC LIMIT 1) AS payment_status,
                   o.created_at,
                   c.name as company_name
            FROM orders o
            LEFT JOIN companies c ON o.company_id = c.id
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC;
        """, (client_id,))
        
        invoices = query_db("""
            SELECT id, invoice_number, amount, total, status, due_date, paid_at, created_at
            FROM invoices 
            WHERE user_id = ? 
            ORDER BY created_at DESC;
        """, (client_id,))

        documents = query_db("""
            SELECT d.id, d.name, d.category, d.status, d.file_type, d.created_at, d.uploaded_by,
                   d.drive_file_id, d.drive_web_link, o.order_number
            FROM documents d
            LEFT JOIN orders o ON o.id = d.order_id
            WHERE d.user_id = ?
            ORDER BY d.created_at DESC;
        """, (client_id,))
        tickets = query_db("""
            SELECT id, ticket_number, subject, status, priority, created_at
            FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC;
        """, (client_id,)) if query_db(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='support_tickets';", one=True) else []
        logs = query_db("""
            SELECT action, details, created_at FROM activity_logs
            WHERE entity_type = 'users' AND entity_id = ?
            ORDER BY created_at DESC LIMIT 50;
        """, (str(client_id),))

        data = dict(row)
        data['companies'] = [dict(c) for c in (companies or [])]
        data['orders'] = [dict(o) for o in (orders or [])]
        data['invoices'] = [dict(i) for i in (invoices or [])]
        data['documents'] = [dict(d) for d in (documents or [])]
        data['support_tickets'] = [dict(t) for t in (tickets or [])]
        data['activity_logs'] = [dict(l) for l in (logs or [])]
        data['companies_count'] = len(data['companies'])
        data['orders_count'] = len(data['orders'])
        if not can_view_revenue(user):  # money is visible to SUPER_ADMIN / ADMIN only
            for o in data['orders']:
                for k in ('amount', 'total', 'payment_mode'):
                    o.pop(k, None)
            for i in data['invoices']:
                for k in ('amount', 'total'):
                    i.pop(k, None)

        return success_response(start_response, data=data)

    # ── 8b. GET /api/admin/clients/<id>/full (legacy deliver-doc associations) ─
    match_full = re.match(r'^/api/admin/clients/(\d+)/full$', path)
    if match_full and method == 'GET':
        client_id = int(match_full.group(1))
        row = query_db("""
            SELECT id, full_name, email, phone, role, status, created_at, client_type, is_b2b
            FROM users WHERE id = ? AND role = 'CLIENT' LIMIT 1;
        """, (client_id,), one=True)
        if not row:
            return error_response(start_response, "Client not found", status_code=404)

        companies = query_db(
            "SELECT id, name, company_number, status FROM companies WHERE user_id = ? ORDER BY name;",
            (client_id,),
        )
        orders = query_db(
            """
            SELECT id, order_number, service_name, status, company_id, total as amount, created_at
            FROM orders WHERE user_id = ? ORDER BY created_at DESC;
            """,
            (client_id,),
        )
        return json_response(start_response, {
            "success": True,
            "status": "success",
            "client": dict(row),
            "companies": [dict(c) for c in (companies or [])],
            "orders": [dict(o) for o in (orders or [])],
            "data": {
                "client": dict(row),
                "companies": [dict(c) for c in (companies or [])],
                "orders": [dict(o) for o in (orders or [])],
            },
        })

    return None
