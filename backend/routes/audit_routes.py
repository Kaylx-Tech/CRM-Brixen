"""Activity Log & Audit Trail Routes (/api/activity-logs, /api/admin/activity-logs)
"""
from db import query_db
from utils.response import success_response, error_response

def handle_audit_routes(environ, start_response, path, method, user, body, query):
    """Route handler for activity-log endpoints."""
    if not (path.startswith('/api/activity-logs') or path.startswith('/api/admin/activity-logs')):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    if user_role not in ('SUPER_ADMIN', 'ADMIN'):
        return error_response(start_response, "Access denied. Admin only.", status_code=403)

    # ── GET list (schema columns: entity_type / entity_id, no ip_address) ─
    if path in ('/api/activity-logs', '/api/admin/activity-logs') and method == 'GET':
        try:
            limit = min(int((query.get('limit') or ['50'])[0]), 100)
        except (TypeError, ValueError):
            limit = 50
        try:
            offset = max(int((query.get('offset') or ['0'])[0]), 0)
        except (TypeError, ValueError):
            offset = 0

        rows = query_db("""
            SELECT a.id, a.user_id, a.user_email, a.action, a.entity_type, a.entity_id,
                   a.details, a.created_at, u.full_name as user_name, u.email as actor_email
            FROM activity_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?;
        """, (limit, offset))

        count_row = query_db("SELECT COUNT(*) as total FROM activity_logs;", one=True)
        total_count = count_row['total'] if count_row else 0

        logs = []
        for r in rows:
            item = dict(r)
            # Aliases so older UI that expected target_* still works
            item['target_type'] = item.get('entity_type')
            item['target_id'] = item.get('entity_id')
            item['user_email'] = item.get('actor_email') or item.get('user_email')
            logs.append(item)

        return success_response(start_response, data={
            "logs": logs,
            "total": total_count,
            "limit": limit,
            "offset": offset
        })

    return None
