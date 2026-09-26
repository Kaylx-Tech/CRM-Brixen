"""Activity Log & Audit Trail Routes (/api/activity-logs)
"""
from db import query_db
from utils.response import json_response, success_response, error_response

def handle_audit_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/activity-logs endpoints."""
    if not path.startswith('/api/activity-logs'):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    if user_role not in ('SUPER_ADMIN', 'ADMIN'):
        return error_response(start_response, "Access denied. Admin only.", status_code=403)

    # ── GET /api/activity-logs (List system audit trail) ──────────────────
    if path == '/api/activity-logs' and method == 'GET':
        limit = min(int((query.get('limit') or ['50'])[0]), 100)
        offset = max(int((query.get('offset') or ['0'])[0]), 0)

        rows = query_db("""
            SELECT a.id, a.user_id, a.action, a.target_type, a.target_id, a.details,
                   a.ip_address, a.created_at, u.full_name as user_name, u.email as user_email
            FROM activity_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?;
        """, (limit, offset))

        count_row = query_db("SELECT COUNT(*) as total FROM activity_logs;", one=True)
        total_count = count_row['total'] if count_row else 0

        return success_response(start_response, data={
            "logs": [dict(r) for r in rows],
            "total": total_count,
            "limit": limit,
            "offset": offset
        })

    return None
