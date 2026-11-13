"""Search across the workspace for the Ctrl K box (components/ComboSearch.jsx).

GET /api/admin/search?q=acme → {clients, companies, orders, invoices}, a few of each, newest first.

Each group follows the same rules as its own page: clients need clients.view, invoices are hidden from
Operations staff (who never see money) and from staff without invoices.view, and no amounts are sent back.
Customers (CLIENT role) cannot use it.
"""
from db import query_db
from utils.response import success_response, error_response
from services.permissions import check_permission
from services.price_privacy import hides_prices

INTERNAL = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
PER_GROUP = 5
MIN_LENGTH = 2


def _like(text):
    """'ac%me' → '%ac\\%me%' (what was typed is matched literally, anywhere in the field)."""
    safe = text.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    return f'%{safe}%'


def _clients(term):
    return query_db("""
        SELECT id, full_name, email, phone, status, client_type, b2b_id, address, country, notification_email,
               type_locked, type_change_count, wordpress_user_id, created_at
        FROM users
        WHERE role = 'CLIENT' AND (full_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'
                                   OR IFNULL(phone, '') LIKE ? ESCAPE '\\' OR IFNULL(b2b_id, '') LIKE ? ESCAPE '\\')
        ORDER BY id DESC LIMIT ?;
    """, (term, term, term, term, PER_GROUP))


def _companies(term):
    return query_db("""
        SELECT c.id, c.name, c.company_number, c.status, c.user_id, u.full_name AS owner_name
        FROM companies c LEFT JOIN users u ON u.id = c.user_id
        WHERE c.name LIKE ? ESCAPE '\\' OR c.company_number LIKE ? ESCAPE '\\'
        ORDER BY c.id DESC LIMIT ?;
    """, (term, term, PER_GROUP))


def _orders(term):
    return query_db("""
        SELECT o.id, o.order_number, o.service_name, o.status, o.owner_name, c.name AS company_name,
               u.full_name AS client_name
        FROM orders o
        LEFT JOIN companies c ON c.id = o.company_id
        LEFT JOIN users u ON u.id = o.user_id
        WHERE o.order_number LIKE ? ESCAPE '\\' OR o.service_name LIKE ? ESCAPE '\\'
           OR IFNULL(o.owner_name, '') LIKE ? ESCAPE '\\' OR IFNULL(c.name, '') LIKE ? ESCAPE '\\'
           OR IFNULL(u.full_name, '') LIKE ? ESCAPE '\\'
        ORDER BY o.id DESC LIMIT ?;
    """, (term, term, term, term, term, PER_GROUP))


def _invoices(term):
    return query_db("""
        SELECT i.id, i.invoice_number, i.status, i.order_id, o.order_number, u.full_name AS client_name
        FROM invoices i
        LEFT JOIN orders o ON o.id = i.order_id
        LEFT JOIN users u ON u.id = i.user_id
        WHERE i.invoice_number LIKE ? ESCAPE '\\' OR IFNULL(o.order_number, '') LIKE ? ESCAPE '\\'
           OR IFNULL(u.full_name, '') LIKE ? ESCAPE '\\'
        ORDER BY i.id DESC LIMIT ?;
    """, (term, term, term, PER_GROUP))


def _can_see_invoices(user):
    if hides_prices(user):
        return False
    return str(user.get('role') or '').upper() in ('SUPER_ADMIN', 'ADMIN', 'MANAGER') or \
        check_permission(user, 'invoices.view')


def handle_search_routes(environ, start_response, path, method, user, body, query):
    if path != '/api/admin/search':
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if str(user.get('role') or '').upper() not in INTERNAL:
        return error_response(start_response, "Search is for the team only", status_code=403)
    if method != 'GET':
        return error_response(start_response, "Method not allowed", status_code=405)

    raw = (query or {}).get('q') or ['']
    text = str(raw[0] if isinstance(raw, list) else raw).strip()[:100]
    empty = {'clients': [], 'companies': [], 'orders': [], 'invoices': []}
    if len(text) < MIN_LENGTH:
        return success_response(start_response, data={**empty, 'q': text})

    term = _like(text)
    data = {
        'q': text,
        'clients': _clients(term) if check_permission(user, 'clients.view') else [],
        'companies': _companies(term),
        'orders': _orders(term),
        'invoices': _invoices(term) if _can_see_invoices(user) else [],
    }
    return success_response(start_response, data=data)
