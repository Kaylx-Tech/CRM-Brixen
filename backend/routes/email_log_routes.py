"""Email log (/api/admin/email-logs): every email the CRM tried to send, with its status. Admins only.

GET  /api/admin/email-logs?status=&category=&search=&page=&limit=   list (no bodies) + counts per status
GET  /api/admin/email-logs/<id>                                     one email, with its body for the preview
POST /api/admin/email-logs/<id>/resend                              send it again to the same address
"""
import re

from db import query_db
from utils.response import success_response, error_response

ADMIN_ROLES = ('SUPER_ADMIN', 'ADMIN')
LIST_FIELDS = (
    "e.id, e.recipient, e.subject, e.status, e.attempts, e.last_error, e.category, e.user_id, e.order_id, "
    "e.company_id, e.triggered_by, e.created_at, e.sent_at, "
    "u.full_name AS client_name, t.full_name AS triggered_by_name, o.order_number, c.name AS company_name, "
    "CASE WHEN COALESCE(e.body_html, e.body_text, '') != '' THEN 1 ELSE 0 END AS resendable"
)
JOINS = """
    FROM email_outbox e
    LEFT JOIN users u ON u.id = e.user_id
    LEFT JOIN users t ON t.id = e.triggered_by
    LEFT JOIN orders o ON o.id = e.order_id
    LEFT JOIN companies c ON c.id = e.company_id
"""


def _first(query, key, default=''):
    return str((query.get(key) or [default])[0] or default).strip()


def handle_email_log_routes(environ, start_response, path, method, user, body, query):
    if not path.startswith('/api/admin/email-logs'):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if user.get('role') not in ADMIN_ROLES:
        return error_response(start_response, "The email log is available to administrators only.", status_code=403)

    if path == '/api/admin/email-logs' and method == 'GET':
        clauses, params = [], []
        status = _first(query, 'status')
        if status and status != 'all':
            clauses.append("e.status = ?")
            params.append(status)
        category = _first(query, 'category')
        if category and category != 'all':
            clauses.append("e.category = ?")
            params.append(category)
        search = _first(query, 'search')
        if search:
            clauses.append("(e.recipient LIKE ? OR e.subject LIKE ? OR u.full_name LIKE ? OR o.order_number LIKE ?)")
            params += [f"%{search}%"] * 4
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        try:
            page = max(int(_first(query, 'page', '1')), 1)
            limit = min(max(int(_first(query, 'limit', '50')), 1), 200)
        except ValueError:
            page, limit = 1, 50
        total = (query_db(f"SELECT COUNT(*) AS c {JOINS}{where};", params, one=True) or {}).get('c') or 0
        rows = query_db(f"SELECT {LIST_FIELDS} {JOINS}{where} ORDER BY e.id DESC LIMIT ? OFFSET ?;",
                        params + [limit, (page - 1) * limit]) or []
        counts = {r['status']: r['c'] for r in (query_db(
            "SELECT status, COUNT(*) AS c FROM email_outbox GROUP BY status;") or [])}
        categories = [r['category'] for r in (query_db(
            "SELECT DISTINCT category FROM email_outbox WHERE category IS NOT NULL ORDER BY category;") or [])]
        return success_response(start_response, data={
            'emails': [dict(r) for r in rows],
            'pagination': {'page': page, 'limit': limit, 'total': total,
                           'total_pages': max((total + limit - 1) // limit, 1)},
            'counts': counts,
            'categories': categories,
        })

    m = re.match(r'^/api/admin/email-logs/(\d+)$', path)
    if m and method == 'GET':
        row = query_db(f"SELECT {LIST_FIELDS}, e.body_html, e.body_text {JOINS} WHERE e.id = ?;",
                       (int(m.group(1)),), one=True)
        if not row:
            return error_response(start_response, "Email not found", status_code=404)
        return success_response(start_response, data=dict(row))

    m = re.match(r'^/api/admin/email-logs/(\d+)/resend$', path)
    if m and method == 'POST':
        from services.email_service import resend_logged_email
        ok, status, error = resend_logged_email(int(m.group(1)), actor_id=user.get('id'))
        if status == 'not_found':
            return error_response(start_response, error, status_code=404)
        if not ok:
            return error_response(start_response, f"Not sent: {error}", status_code=400 if status == 'not_resendable' else 502)
        return success_response(start_response, data={'status': status}, message="Email sent again.")

    return error_response(start_response, "Not found", status_code=404)
