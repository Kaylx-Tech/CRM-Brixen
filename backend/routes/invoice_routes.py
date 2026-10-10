"""Invoices & Billing Routes (/api/invoices) — aligned with app.py admin invoices."""
import re
import secrets
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response
from services.invoice_service import enrich_invoice_row, load_invoice_for_staff, update_admin_invoice
from services.invoice_mail import send_invoice_email
from services.notification_service import notify_staff

def handle_invoice_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/invoices endpoints."""
    if not (path.startswith('/api/invoices') or path.startswith('/api/admin/invoices')):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    # Normalize admin alias → same handlers
    # ── GET /api/invoices | /api/admin/invoices (List) ─────────────────────
    if path in ('/api/invoices', '/api/admin/invoices') and method == 'GET':
        search = (query.get('search') or [''])[0].strip()
        status_filter = (query.get('status') or [''])[0].strip()
        limit = min(int((query.get('limit') or ['200'])[0]), 500)
        offset = max(int((query.get('offset') or ['0'])[0]), 0)

        params = []
        conditions = []

        if not is_staff:
            conditions.append("i.user_id = ?")
            params.append(user_id)

        if search:
            conditions.append("""(
                i.invoice_number LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?
                OR o.order_number LIKE ? OR o.owner_name LIKE ? OR o.owner_form_email LIKE ?
            )""")
            sp = f"%{search}%"
            params.extend([sp] * 6)

        if status_filter:
            conditions.append("i.status = ?")
            params.append(status_filter)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        count_row = query_db(
            f"SELECT COUNT(*) as total FROM invoices i LEFT JOIN users u ON i.user_id = u.id LEFT JOIN orders o ON i.order_id = o.id {where_clause};",
            params,
            one=True,
        )
        total_count = count_row['total'] if count_row else 0

        params.extend([limit, offset])
        rows = query_db(f"""
            SELECT i.id, i.invoice_number, i.amount, i.tax, i.total, i.status, i.due_date,
                   i.paid_at, i.created_at, i.order_id, i.payment_method, i.payment_timing,
                   i.deposit_amount, i.amount_paid, i.user_id,
                   u.full_name as client_name, u.email as client_email,
                   o.order_number, o.service_name, o.owner_name, o.owner_form_email
            FROM invoices i
            LEFT JOIN users u ON i.user_id = u.id
            LEFT JOIN orders o ON i.order_id = o.id
            {where_clause}
            ORDER BY i.created_at DESC
            LIMIT ? OFFSET ?;
        """, params)

        invoices = [enrich_invoice_row(dict(r)) for r in rows]
        return success_response(start_response, data={
            "invoices": invoices,
            "total": total_count,
            "limit": limit,
            "offset": offset,
        })

    # ── GET /api/invoices/<id> ─────────────────────────────────────────────
    match_detail = re.match(r'^/api/(?:admin/)?invoices/(\d+)$', path)
    if match_detail and method == 'GET':
        inv_id = int(match_detail.group(1))
        row = load_invoice_for_staff(inv_id)
        if not row:
            return error_response(start_response, "Invoice not found", status_code=404)
        if not is_staff and row['user_id'] != user_id:
            return error_response(start_response, "Access denied", status_code=403)
        return success_response(start_response, data=row)

    # ── POST /api/invoices (Create) ────────────────────────────────────────
    if path in ('/api/invoices', '/api/admin/invoices') and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Only staff can generate invoices", status_code=403)

        client_id = body.get('user_id')
        order_id = body.get('order_id')
        amount = float(body.get('amount', 0))
        tax = float(body.get('tax', 0) or 0)
        total = float(body.get('total') or (amount + tax))
        due_date = body.get('due_date')

        if not client_id or amount <= 0:
            return error_response(start_response, "Client ID and valid amount required", status_code=400)
        if not order_id:
            return error_response(start_response, "Order ID is required", status_code=400)
        if not due_date:
            return error_response(start_response, "Due date is required", status_code=400)

        inv_num = f"INV-{secrets.randbelow(900000) + 100000}"
        inv_id = execute_db("""
            INSERT INTO invoices (
                invoice_number, user_id, order_id, amount, tax, total,
                status, due_date, payment_timing, deposit_amount, amount_paid, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, 'After work', 0, 0, datetime('now'));
        """, (inv_num, client_id, order_id, amount, tax, total, due_date))

        return success_response(start_response, data={
            "id": inv_id,
            "invoice_number": inv_num,
            "amount": amount,
        }, message="Invoice created successfully.", status_code=201)

    # ── PUT/PATCH /api/invoices/<id> (Update + optional send) ──────────────
    match_update = re.match(r'^/api/(?:admin/)?invoices/(\d+)$', path)
    if match_update and method in ('PUT', 'PATCH'):
        if not is_staff:
            return error_response(start_response, "Only staff can update invoices", status_code=403)
        inv_id = int(match_update.group(1))
        updated, error, mail = update_admin_invoice(inv_id, body or {}, actor=user)
        if error:
            code = 404 if error == 'Invoice not found' else 400
            return error_response(start_response, error, status_code=code)

        # If this was send-only and email failed, surface it
        if (body or {}).get('send_payment_details'):
            if not (mail or {}).get('email_sent'):
                return error_response(
                    start_response,
                    (mail or {}).get('email_status') or 'Invoice email was not sent.',
                    status_code=400,
                )

        return success_response(
            start_response,
            data={
                "invoice": updated,
                "email_sent": bool((mail or {}).get('email_sent')),
                "email_status": (mail or {}).get('email_status'),
                "email_to": (mail or {}).get('email_to'),
                "kind": (mail or {}).get('kind'),
            },
            message="Invoice updated successfully.",
        )

    # ── POST /api/invoices/<id>/send ───────────────────────────────────────
    match_send = re.match(r'^/api/(?:admin/)?invoices/(\d+)/send$', path)
    if match_send and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Only staff can send invoice emails", status_code=403)
        inv_id = int(match_send.group(1))
        if not query_db("SELECT id FROM invoices WHERE id = ? LIMIT 1;", (inv_id,), one=True):
            return error_response(start_response, "Invoice not found", status_code=404)
        mail = send_invoice_email(inv_id)
        if not mail.get('email_sent'):
            return error_response(start_response, mail.get('email_status') or 'Failed to send', status_code=400)
        invoice = load_invoice_for_staff(inv_id)
        return success_response(
            start_response,
            data={
                "invoice": invoice,
                "email_sent": True,
                "email_status": mail.get('email_status'),
                "email_to": mail.get('email_to'),
                "kind": mail.get('kind'),
            },
            message="Invoice email sent successfully.",
        )

    # ── POST /api/invoices/<id>/pay ────────────────────────────────────────
    match_pay = re.match(r'^/api/(?:admin/)?invoices/(\d+)/pay$', path)
    if match_pay and method == 'POST':
        inv_id = int(match_pay.group(1))
        row = query_db("SELECT * FROM invoices WHERE id = ? LIMIT 1;", (inv_id,), one=True)
        if not row:
            return error_response(start_response, "Invoice not found", status_code=404)
        if not is_staff and row['user_id'] != user_id:
            return error_response(start_response, "Access denied", status_code=403)
        updated, error, _mail = update_admin_invoice(inv_id, {'status': 'Paid'}, actor=user)
        if error:
            return error_response(start_response, error, status_code=400)
        notify_staff(
            'Payment received',
            f"Invoice {(updated or {}).get('invoice_number') or inv_id} was marked as paid.",
            'payment_received', '/admin/payments',
            exclude_user_id=user_id,
        )
        return success_response(start_response, data={"invoice": updated}, message="Payment recorded successfully.")

    return None
