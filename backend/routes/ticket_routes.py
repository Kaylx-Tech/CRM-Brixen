"""Support tickets for the team (/api/admin/tickets): read customer tickets, reply, change status.

Customers open tickets and reply from the portal (client_portal_routes). A team reply is shown to the customer
in the portal, creates an in-app notification and emails them ("New message from Brixen", app.py parity).

Access: admins and managers; STAFF in the Support department.
"""
import re

from db import query_db, execute_db
from utils.response import success_response, error_response
from services.permissions import departments_from_user
from services.portal_compat import brand_name

TICKET_STATUSES = ('Open', 'In Progress', 'Resolved', 'Closed')
TICKET_PRIORITIES = ('Low', 'Medium', 'High', 'Urgent')

LIST_SQL = """
    SELECT t.id, t.ticket_number, t.user_id, t.order_id, t.company_id, t.subject, t.category, t.priority,
           t.status, t.created_at,
           u.full_name AS client_name, u.email AS client_email,
           c.name AS company_name, o.order_number,
           (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS message_count,
           (SELECT MAX(m.created_at) FROM support_messages m WHERE m.ticket_id = t.id) AS last_message_at,
           (SELECT m.sender_role FROM support_messages m WHERE m.ticket_id = t.id
            ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_sender_role
    FROM support_tickets t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN orders o ON o.id = t.order_id
"""


def can_handle_tickets(user):
    role = (user or {}).get('role')
    if role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER'):
        return True
    return role == 'STAFF' and 'Support' in departments_from_user(user)


def _first(query, key, default=''):
    return str((query.get(key) or [default])[0] or default).strip()


def _ticket_with_messages(tid):
    ticket = query_db(LIST_SQL + " WHERE t.id = ?;", (tid,), one=True)
    if not ticket:
        return None
    messages = query_db("""
        SELECT id, sender_id, sender_name, sender_role, message, attachment_url, created_at
        FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC, id ASC;
    """, (tid,)) or []
    return {'ticket': dict(ticket), 'messages': [dict(m) for m in messages]}


def handle_ticket_routes(environ, start_response, path, method, user, body, query):
    if not path.startswith('/api/admin/tickets'):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if not can_handle_tickets(user):
        return error_response(start_response, "Support tickets are for admins, managers and the Support team.",
                              status_code=403)
    body = body if isinstance(body, dict) else {}

    # ── GET /api/admin/tickets ─────────────────────────────────────────────
    if path == '/api/admin/tickets' and method == 'GET':
        clauses, params = [], []
        status = _first(query, 'status')
        if status == 'active':
            clauses.append("t.status IN ('Open', 'In Progress')")
        elif status in TICKET_STATUSES:
            clauses.append("t.status = ?")
            params.append(status)
        search = _first(query, 'search')
        if search:
            clauses.append("(t.ticket_number LIKE ? OR t.subject LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? "
                           "OR EXISTS (SELECT 1 FROM support_messages sm WHERE sm.ticket_id = t.id AND sm.message LIKE ?))")
            params += [f"%{search}%"] * 5
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        rows = query_db(LIST_SQL + where + """
            ORDER BY CASE t.status WHEN 'Open' THEN 0 WHEN 'In Progress' THEN 1 ELSE 2 END,
                     COALESCE(last_message_at, t.created_at) DESC
            LIMIT 500;
        """, params) or []
        counts = {r['status']: r['c'] for r in (query_db(
            "SELECT status, COUNT(*) AS c FROM support_tickets GROUP BY status;") or [])}
        # Waiting for us = the customer wrote last on an open ticket
        waiting = sum(1 for r in rows if r.get('last_sender_role') == 'CLIENT'
                      and r.get('status') in ('Open', 'In Progress'))
        return success_response(start_response, data={
            'tickets': [dict(r) for r in rows], 'counts': counts, 'waiting_reply': waiting})

    m = re.match(r'^/api/admin/tickets/(\d+)$', path)
    if m and method == 'GET':
        data = _ticket_with_messages(int(m.group(1)))
        if not data:
            return error_response(start_response, "Ticket not found", status_code=404)
        return success_response(start_response, data=data)

    # ── PATCH /api/admin/tickets/<id> (status / priority) ─────────────────
    if m and method in ('PATCH', 'PUT'):
        tid = int(m.group(1))
        ticket = query_db("SELECT id, status FROM support_tickets WHERE id = ?;", (tid,), one=True)
        if not ticket:
            return error_response(start_response, "Ticket not found", status_code=404)
        sets, params = [], []
        if body.get('status') in TICKET_STATUSES:
            sets.append("status = ?")
            params.append(body['status'])
        if body.get('priority') in TICKET_PRIORITIES:
            sets.append("priority = ?")
            params.append(body['priority'])
        if not sets:
            return error_response(start_response, "Nothing to update", status_code=400)
        execute_db(f"UPDATE support_tickets SET {', '.join(sets)} WHERE id = ?;", (*params, tid))
        return success_response(start_response, data=_ticket_with_messages(tid), message="Ticket updated.")

    # ── POST /api/admin/tickets/<id>/messages (team reply) ─────────────────
    m = re.match(r'^/api/admin/tickets/(\d+)/messages$', path)
    if m and method == 'POST':
        tid = int(m.group(1))
        ticket = query_db("""
            SELECT t.*, o.owner_form_email, o.b2b_client_id, c.registered_email AS company_registered_email
            FROM support_tickets t
            LEFT JOIN orders o ON o.id = t.order_id
            LEFT JOIN companies c ON c.id = t.company_id
            WHERE t.id = ?;
        """, (tid,), one=True)
        if not ticket:
            return error_response(start_response, "Ticket not found", status_code=404)
        text = str(body.get('message') or '').strip()[:5000]
        if not text:
            return error_response(start_response, "Write a reply first", status_code=400)
        execute_db("""
            INSERT INTO support_messages (ticket_id, sender_id, sender_name, sender_role, message, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'));
        """, (tid, user.get('id'), user.get('full_name') or user.get('email') or brand_name(), user.get('role'), text))

        # Status after the reply: what the team chose, otherwise an open ticket moves to In Progress
        new_status = body.get('status') if body.get('status') in TICKET_STATUSES else (
            'In Progress' if ticket.get('status') == 'Open' else ticket.get('status'))
        if new_status != ticket.get('status'):
            execute_db("UPDATE support_tickets SET status = ? WHERE id = ?;", (new_status, tid))

        from services.client_mail import notify_client
        preview = text if len(text) <= 600 else text[:600].rstrip() + '…'
        mail = notify_client(
            ticket['user_id'], title=f'New message from {brand_name()}',
            message=f"You have a new reply on support ticket {ticket['ticket_number']}.",
            ntype='support', link='/support',
            subject=f"New reply on {ticket['ticket_number']} — {ticket.get('subject') or 'Support ticket'}",
            headline='You have a new reply from our team',
            details=[('Ticket', ticket['ticket_number']), ('Subject', ticket.get('subject')),
                     ('Status', new_status), ('Reply', preview)],
            cta_label='Open your ticket', category='SUPPORT',
            company=({'id': ticket['company_id'], 'registered_email': ticket.get('company_registered_email')}
                     if ticket.get('company_id') else None),
            order=({'id': ticket['order_id'], 'owner_form_email': ticket.get('owner_form_email'),
                    'b2b_client_id': ticket.get('b2b_client_id')} if ticket.get('order_id') else None),
            triggered_by=user.get('id'))
        data = _ticket_with_messages(tid)
        data['email'] = {'sent': bool(mail.get('email_sent')), 'status': mail.get('email_status'),
                         'to': mail.get('email_to')}
        return success_response(start_response, data=data, message="Reply sent.", status_code=201)

    return error_response(start_response, "Not found", status_code=404)
