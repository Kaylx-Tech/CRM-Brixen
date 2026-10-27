"""Customer portal API (/api/client/*), ported from the old app.py client views.

Every query is scoped to the signed-in customer. Only client-visible documents are returned and
internal fields (costs, profit, staff notes, file paths) never leave the server.
Orders (/api/client/orders), accountancy and notifications live in their own route modules.
"""
import base64
import datetime
import hashlib
import json
import re
import secrets

from db import query_db, execute_db
from utils.response import success_response, error_response
from services.invoice_service import enrich_invoice_row
from services.notification_service import notify_staff

CLOSED_ORDER_STATUSES = ('Completed', 'Cancelled', 'Refunded')
ACTION_ORDER_STATUSES = ('Documents Required', 'Information Required')
TICKET_PRIORITIES = ('Low', 'Medium', 'High', 'Urgent')
DOC_PUBLIC_FIELDS = ('id', 'name', 'category', 'file_type', 'file_size', 'status', 'created_at',
                     'company_id', 'order_id', 'company_name', 'order_number', 'drive_web_link')
ORDER_PRIVATE_FIELDS = ('notes', 'cost_price', 'catalog_cost', 'manual_cost', 'resolved_cost', 'cost_source',
                        'profit', 'woocommerce_order_id', 'assigned_staff_id', 'assigned_staff_name',
                        'data_locked', 'access_email_password',
                        'checkout_form_json', 'website_checkout_pulled_at', 'website_phone_checked_at',
                        'portfolio_hidden', 'b2b_client_id')
COMPANY_FIELDS = ('id', 'name', 'company_number', 'status', 'inc_date', 'director', 'reg_office', 'package',
                  'account_status', 'created_at', 'utr_number', 'identity_verified', 'psc_verified',
                  'registered_email', 'whatsapp_number', 'sic_codes', 'accounts_next_due', 'accounts_overdue',
                  'confirmation_next_due', 'confirmation_overdue', 'accounts_made_up_to')


def public_document(row):
    return {k: row.get(k) for k in DOC_PUBLIC_FIELDS if k in row}


def public_order(row):
    """Strip internal fields from an order before a customer sees it (also used by order_routes)."""
    return {k: v for k, v in dict(row).items() if k not in ORDER_PRIVATE_FIELDS}


def public_company(row):
    from services.ch_attention import company_attention_issues
    data = {k: row.get(k) for k in COMPANY_FIELDS if k in row}
    data['attention'] = company_attention_issues(dict(row))
    data['needs_attention'] = bool(data['attention'])
    return data


def _client_documents_sql(extra_where='', limit=None):
    return f"""
        SELECT d.*, c.name AS company_name, o.order_number
        FROM documents d
        LEFT JOIN companies c ON d.company_id = c.id
        LEFT JOIN orders o ON d.order_id = o.id
        WHERE d.user_id = ? AND COALESCE(d.client_visible, 0) = 1 {extra_where}
        ORDER BY d.created_at DESC {f'LIMIT {int(limit)}' if limit else ''};
    """


def _invoices_for(uid):
    rows = query_db("""
        SELECT i.*, o.order_number, o.service_name
        FROM invoices i
        LEFT JOIN orders o ON i.order_id = o.id
        WHERE i.user_id = ?
        ORDER BY i.created_at DESC;
    """, (uid,)) or []
    out = []
    for row in rows:
        item = enrich_invoice_row(dict(row)) or dict(row)
        item.pop('data_locked', None)
        out.append(item)
    return out


def _order_progress(order):
    try:
        pct = int(order.get('progress_percent') or 0)
    except (TypeError, ValueError):
        pct = 0
    if not pct:
        status = str(order.get('status') or '')
        pct = {'Completed': 100, 'Processing': 50, 'In Progress': 60, 'Documents Required': 30,
               'Information Required': 30, 'Pending': 10}.get(status, 0)
    return max(0, min(100, pct))


def _pending_actions(uid):
    """What the customer needs to do next (old build_client_pending_actions, simplified)."""
    actions = []
    marks = ','.join('?' for _ in ACTION_ORDER_STATUSES)
    for o in query_db(f"""
        SELECT id, order_number, service_name, status FROM orders
        WHERE user_id = ? AND status IN ({marks}) AND COALESCE(is_draft, 0) = 0
        ORDER BY created_at DESC LIMIT 5;
    """, (uid, *ACTION_ORDER_STATUSES)) or []:
        need_docs = o['status'] == 'Documents Required'
        actions.append({
            'kind': 'order', 'order_id': o['id'], 'icon': 'upload' if need_docs else 'info',
            'title': f"{'Upload documents' if need_docs else 'Information needed'} for {o['order_number']}",
            'detail': o.get('service_name') or '',
            'action_label': 'Upload' if need_docs else 'Open order',
            'view': 'documents' if need_docs else 'orders',
        })
    for inv in _invoices_for(uid):
        due = float(inv.get('amount_due') or 0)
        if str(inv.get('status') or '') != 'Cancelled' and due > 0.004:
            actions.append({
                'kind': 'invoice', 'invoice_id': inv['id'], 'icon': 'credit-card',
                'title': f"Invoice {inv.get('invoice_number')} is awaiting payment",
                'detail': inv.get('service_name') or inv.get('order_number') or '',
                'action_label': 'View invoice', 'view': 'invoices',
            })
        if len(actions) >= 8:
            break
    return actions


def handle_client_portal_routes(environ, start_response, path, method, user, body, query):
    if not path.startswith('/api/client/'):
        return None
    # /api/client/orders, /accountancy and /notifications are served by their own modules
    if re.match(r'^/api/client/(orders|accountancy|accounts-file|notifications|id-verification)(/|$)', path):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if user.get('role') != 'CLIENT':
        return None
    uid = user['id']
    body = body if isinstance(body, dict) else {}

    # ── Dashboard ────────────────────────────────────────────────────────
    if path == '/api/client/dashboard' and method == 'GET':
        companies = query_db("""
            SELECT * FROM companies WHERE user_id = ?
            ORDER BY datetime(created_at) DESC LIMIT 4;
        """, (uid,)) or []
        closed = ','.join('?' for _ in CLOSED_ORDER_STATUSES)
        active_where = f"o.user_id = ? AND o.status NOT IN ({closed}) AND COALESCE(o.is_draft, 0) = 0"
        active_count = int((query_db(f"SELECT COUNT(*) c FROM orders o WHERE {active_where};",
                                     (uid, *CLOSED_ORDER_STATUSES), one=True) or {}).get('c') or 0)
        active = query_db(f"""
            SELECT o.*, c.name AS company_name FROM orders o LEFT JOIN companies c ON o.company_id = c.id
            WHERE {active_where} ORDER BY o.created_at DESC LIMIT 4;
        """, (uid, *CLOSED_ORDER_STATUSES)) or []
        orders = []
        for o in active:
            item = public_order(o)
            item['progress_percent'] = _order_progress(o)
            orders.append(item)
        docs_count = int((query_db(
            "SELECT COUNT(*) c FROM documents WHERE user_id = ? AND COALESCE(client_visible, 0) = 1;",
            (uid,), one=True) or {}).get('c') or 0)
        docs = query_db(_client_documents_sql(limit=4), (uid,)) or []
        actions = _pending_actions(uid)
        total_companies = int((query_db("SELECT COUNT(*) c FROM companies WHERE user_id = ?;", (uid,), one=True)
                               or {}).get('c') or 0)
        hour = datetime.datetime.now().hour
        greeting = 'Good morning' if hour < 12 else ('Good afternoon' if hour < 17 else 'Good evening')
        return success_response(start_response, data={
            'greeting': greeting,
            'user_name': (user.get('full_name') or user.get('name') or '').strip() or user.get('email'),
            'current_date': datetime.date.today().strftime('%d %B %Y'),
            'total_companies': total_companies,
            'active_orders_count': active_count,
            'documents_count': docs_count,
            'pending_actions_count': len(actions),
            'pending_actions': actions,
            'active_orders': orders,
            'companies': [public_company(c) for c in companies],
            'recent_documents': [public_document(d) for d in docs],
        })

    # ── Companies ────────────────────────────────────────────────────────
    if path == '/api/client/companies' and method == 'GET':
        rows = query_db("SELECT * FROM companies WHERE user_id = ? ORDER BY datetime(created_at) DESC;", (uid,)) or []
        return success_response(start_response, data={'companies': [public_company(r) for r in rows]})

    m = re.match(r'^/api/client/companies/(\d+)$', path)
    if m and method == 'GET':
        cid = int(m.group(1))
        company = query_db("SELECT * FROM companies WHERE id = ? AND user_id = ?;", (cid, uid), one=True)
        if not company:
            return error_response(start_response, "Company not found", status_code=404)
        orders = query_db("""
            SELECT id, order_number, service_name, status, progress_percent, created_at, expected_date, total
            FROM orders WHERE user_id = ? AND company_id = ? AND COALESCE(is_draft, 0) = 0
            ORDER BY created_at DESC;
        """, (uid, cid)) or []
        docs = query_db(_client_documents_sql("AND d.company_id = ?"), (uid, cid)) or []
        tickets = query_db("""
            SELECT id, ticket_number, subject, category, priority, status, created_at
            FROM support_tickets WHERE user_id = ? AND company_id = ? ORDER BY created_at DESC;
        """, (uid, cid)) or []
        return success_response(start_response, data={
            'company': public_company(company),
            'orders': [{**dict(o), 'progress_percent': _order_progress(o)} for o in orders],
            'documents': [public_document(d) for d in docs],
            'tickets': [dict(t) for t in tickets],
        })

    # ── Addresses (registered office / mail forwarding subscriptions) ──────
    if path == '/api/client/addresses' and method == 'GET':
        rows = query_db("""
            SELECT a.*, c.name AS company_name FROM addresses a
            LEFT JOIN companies c ON a.company_id = c.id
            WHERE a.user_id = ? ORDER BY a.created_at DESC;
        """, (uid,)) or []
        return success_response(start_response, data={'addresses': [dict(r) for r in rows]})

    # ── Invoices & payments ──────────────────────────────────────────────
    if path in ('/api/client/invoices', '/api/client/payments') and method == 'GET':
        invoices = _invoices_for(uid)
        key = 'payments' if path.endswith('payments') else 'invoices'
        return success_response(start_response, data={key: invoices, 'invoices': invoices})

    # ── Invoice PDF (own invoices only) ──────────────────────────────────
    m = re.match(r'^/api/client/invoices/(\d+)/document$', path)
    if m and method == 'GET':
        inv_id = int(m.group(1))
        if not query_db("SELECT id FROM invoices WHERE id = ? AND user_id = ?;", (inv_id, uid), one=True):
            return error_response(start_response, "Invoice not found", status_code=404)
        from services.invoice_document import pdf_response
        download = (query.get('download') or [''])[0] in ('1', 'true')
        return pdf_response(start_response, inv_id, inline=not download)

    # ── Documents ────────────────────────────────────────────────────────
    if path == '/api/client/documents' and method == 'GET':
        rows = query_db(_client_documents_sql(), (uid,)) or []
        pending = query_db("""
            SELECT id, name, category, created_at, status FROM documents
            WHERE user_id = ? AND COALESCE(client_visible, 0) = 0 AND uploaded_by_id = ?
            ORDER BY created_at DESC LIMIT 50;
        """, (uid, uid)) or []
        return success_response(start_response, data={
            'documents': [public_document(d) for d in rows],
            'my_uploads_in_review': [dict(p) for p in pending],
        })

    if path == '/api/client/documents/upload' and method == 'POST':
        raw = body.get('file_content_base64') or body.get('file_data') or ''
        if isinstance(raw, str) and raw.startswith('data:') and ',' in raw:
            raw = raw[raw.index(',') + 1:]
        try:
            file_bytes = base64.b64decode(raw) if raw else b''
        except Exception:
            return error_response(start_response, "The file could not be read", status_code=400)
        if not file_bytes:
            return error_response(start_response, "Choose a file to upload", status_code=400)
        if len(file_bytes) > 15 * 1024 * 1024:
            return error_response(start_response, "Files must be 15 MB or smaller", status_code=400)
        file_name = str(body.get('file_name') or body.get('name') or 'document').strip()[:200]
        ext = file_name.rsplit('.', 1)[-1].lower() if '.' in file_name else ''
        if ext not in ('pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'heic', 'webp'):
            return error_response(start_response, "Upload a PDF, image or Word file", status_code=400)
        doc_name = str(body.get('name') or file_name).strip()[:200]
        category = str(body.get('category') or 'Company Documents').strip()[:100] or 'Company Documents'

        def _owned(table, value):
            try:
                rid = int(value)
            except (TypeError, ValueError):
                return None
            return rid if query_db(f"SELECT id FROM {table} WHERE id = ? AND user_id = ?;", (rid, uid), one=True) else None

        order_id = _owned('orders', body.get('order_id'))
        company_id = _owned('companies', body.get('company_id'))
        if order_id and not company_id:
            row = query_db("SELECT company_id FROM orders WHERE id = ?;", (order_id,), one=True)
            company_id = (row or {}).get('company_id')

        from services.storage_service import save_client_file
        mime = {'pdf': 'application/pdf', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
                'webp': 'image/webp', 'heic': 'image/heic', 'doc': 'application/msword',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}.get(ext)
        saved = save_client_file(client_id=uid, customer_name=user.get('full_name') or user.get('email'),
                                 filename=file_name, file_bytes=file_bytes, order_id=order_id, mime_type=mime)
        if not saved.get('success'):
            return error_response(start_response, saved.get('error') or 'Upload failed', status_code=500)
        # Customer uploads wait for staff review (old portal): not visible back to the client until approved
        doc_id = execute_db("""
            INSERT INTO documents (
                name, category, file_path, file_type, file_size, user_id, order_id, company_id, uploaded_by,
                drive_file_id, drive_web_link, lifecycle_status, is_posted, client_visible, status, review_notes,
                file_hash, uploaded_at, uploaded_by_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Customer Upload', ?, ?, 'REVIEW_REQUIRED', 0, 0, 'Pending Review',
                      'Uploaded by the customer from the portal. Awaiting staff review.', ?, CURRENT_TIMESTAMP, ?,
                      datetime('now'));
        """, (doc_name, category, saved.get('file_path'), mime, str(saved.get('file_size') or len(file_bytes)),
              uid, order_id, company_id, saved.get('drive_file_id'), saved.get('drive_web_link'),
              hashlib.sha256(file_bytes).hexdigest(), uid))
        try:
            notify_staff('Customer uploaded a document',
                         f"{user.get('full_name') or user.get('email')} uploaded '{doc_name}'.",
                         'document_upload', '/admin/documents')
        except Exception:
            pass
        from services.client_mail import notify_customer_upload_received
        order_number = (query_db("SELECT order_number FROM orders WHERE id = ?;", (order_id,), one=True) or {}
                        ).get('order_number') if order_id else None
        notify_customer_upload_received(uid, doc_name, order_number)
        return success_response(start_response, data={'id': doc_id},
                                message="Document uploaded. Our team will review it shortly.", status_code=201)

    # ── Services catalog (to browse / order) ─────────────────────────────
    if path == '/api/client/services' and method == 'GET':
        rows = query_db("""
            SELECT id, name, description, category, price, duration, estimated_delivery_time
            FROM services WHERE status = 'Active' ORDER BY category ASC, price ASC;
        """) or []
        return success_response(start_response, data={'services': [dict(r) for r in rows]})

    # ── Support tickets & messages ───────────────────────────────────────
    if path == '/api/client/tickets' and method == 'GET':
        rows = query_db("""
            SELECT t.*, c.name AS company_name, o.order_number,
                   (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS message_count,
                   (SELECT MAX(created_at) FROM support_messages m WHERE m.ticket_id = t.id) AS last_message_at
            FROM support_tickets t
            LEFT JOIN companies c ON t.company_id = c.id
            LEFT JOIN orders o ON t.order_id = o.id
            WHERE t.user_id = ? ORDER BY t.created_at DESC;
        """, (uid,)) or []
        return success_response(start_response, data={'tickets': [dict(r) for r in rows]})

    if path == '/api/client/tickets' and method == 'POST':
        subject = str(body.get('subject') or '').strip()[:200]
        message = str(body.get('description') or body.get('message') or '').strip()[:5000]
        if not subject or not message:
            return error_response(start_response, "Add a subject and a message", status_code=400)
        priority = body.get('priority') if body.get('priority') in TICKET_PRIORITIES else 'Medium'
        category = str(body.get('category') or 'General Support').strip()[:80]
        order_id = body.get('order_id') if body.get('order_id') and query_db(
            "SELECT id FROM orders WHERE id = ? AND user_id = ?;", (body.get('order_id'), uid), one=True) else None
        company_id = body.get('company_id') if body.get('company_id') and query_db(
            "SELECT id FROM companies WHERE id = ? AND user_id = ?;", (body.get('company_id'), uid), one=True) else None
        number = f"TICK-{datetime.date.today().year}-{secrets.randbelow(900000) + 100000}"
        tid = execute_db("""
            INSERT INTO support_tickets (ticket_number, user_id, order_id, company_id, subject, category, priority,
                                         status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Open', datetime('now'));
        """, (number, uid, order_id, company_id, subject, category, priority))
        execute_db("""
            INSERT INTO support_messages (ticket_id, sender_id, sender_name, sender_role, message, created_at)
            VALUES (?, ?, ?, 'CLIENT', ?, datetime('now'));
        """, (tid, uid, user.get('full_name') or user.get('email'), message))
        try:
            notify_staff('New support ticket', f"{number}: {subject} ({user.get('full_name') or user.get('email')})",
                         'support_ticket', '/admin/tickets')
        except Exception:
            pass
        from services.client_mail import email_team
        from services.portal_compat import brand_name
        email_team(f"New support ticket {number} — {brand_name()}",
                   f"A client opened a support ticket.\nTicket: {number}\n"
                   f"Client: {user.get('full_name') or user.get('email')}\nSubject: {subject}",
                   link_path='/admin/tickets')
        return success_response(start_response, data={'id': tid, 'ticket_number': number},
                                message=f"Ticket {number} submitted. We'll reply here.", status_code=201)

    m = re.match(r'^/api/client/tickets/(\d+)/messages$', path)
    if m and method in ('GET', 'POST'):
        tid = int(m.group(1))
        ticket = query_db("SELECT * FROM support_tickets WHERE id = ? AND user_id = ?;", (tid, uid), one=True)
        if not ticket:
            return error_response(start_response, "Ticket not found", status_code=404)
        if method == 'POST':
            text = str(body.get('message') or '').strip()[:5000]
            if not text:
                return error_response(start_response, "Write a message first", status_code=400)
            execute_db("""
                INSERT INTO support_messages (ticket_id, sender_id, sender_name, sender_role, message, created_at)
                VALUES (?, ?, ?, 'CLIENT', ?, datetime('now'));
            """, (tid, uid, user.get('full_name') or user.get('email'), text))
            if ticket.get('status') in ('Resolved', 'Closed'):
                execute_db("UPDATE support_tickets SET status = 'Open' WHERE id = ?;", (tid,))
            try:
                notify_staff('Customer replied on a ticket',
                             f"{ticket['ticket_number']}: {user.get('full_name') or user.get('email')} replied.",
                             'support_ticket', '/admin/tickets')
            except Exception:
                pass
        msgs = query_db("""
            SELECT id, sender_name, sender_role, message, created_at FROM support_messages
            WHERE ticket_id = ? ORDER BY created_at ASC, id ASC;
        """, (tid,)) or []
        ticket = query_db("SELECT * FROM support_tickets WHERE id = ?;", (tid,), one=True)
        return success_response(start_response, data={'ticket': dict(ticket), 'messages': [dict(x) for x in msgs]})

    if path == '/api/client/messages' and method == 'GET':
        rows = query_db("""
            SELECT m.id, m.ticket_id, m.sender_name, m.sender_role, m.message, m.created_at,
                   t.ticket_number, t.subject, t.status AS ticket_status
            FROM support_messages m JOIN support_tickets t ON m.ticket_id = t.id
            WHERE t.user_id = ? ORDER BY m.created_at DESC LIMIT 200;
        """, (uid,)) or []
        return success_response(start_response, data={'messages': [dict(r) for r in rows]})

    return error_response(start_response, "Not found", status_code=404)
