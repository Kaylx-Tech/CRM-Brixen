"""Activity Log & Audit Trail Routes (/api/activity-logs, /api/admin/activity-logs)

Mirrors legacy app.py GET /api/admin/activity-logs used by app.js loadAdminLogs().
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

    # ── GET list ───────────────────────────────────────────────────────────
    if path in ('/api/activity-logs', '/api/admin/activity-logs') and method == 'GET':
        try:
            limit = min(int((query.get('limit') or ['100'])[0]), 500)
        except (TypeError, ValueError):
            limit = 100
        try:
            offset = max(int((query.get('offset') or ['0'])[0]), 0)
        except (TypeError, ValueError):
            offset = 0

        q = ((query.get('q') or [''])[0] or '').strip()
        action = ((query.get('action') or [''])[0] or '').strip()
        entity_type = ((query.get('entity_type') or [''])[0] or '').strip()

        where = []
        params = []

        if action and action.lower() != 'all':
            where.append("a.action = ?")
            params.append(action)
        if entity_type and entity_type.lower() != 'all':
            where.append("LOWER(COALESCE(a.entity_type, '')) = ?")
            params.append(entity_type.lower())
        if q:
            like = f"%{q}%"
            where.append(
                "(a.action LIKE ? OR a.details LIKE ? OR a.user_email LIKE ? "
                "OR u.email LIKE ? OR u.full_name LIKE ? OR a.entity_type LIKE ? OR a.entity_id LIKE ?)"
            )
            params.extend([like, like, like, like, like, like, like])

        where_sql = (" WHERE " + " AND ".join(where)) if where else ""

        rows = query_db(f"""
            SELECT a.id, a.user_id, a.user_email, a.action, a.entity_type, a.entity_id,
                   a.details, a.created_at, u.full_name as user_name, u.email as actor_email
            FROM activity_logs a
            LEFT JOIN users u ON a.user_id = u.id
            {where_sql}
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?;
        """, (*params, limit, offset))

        count_row = query_db(
            f"SELECT COUNT(*) as total FROM activity_logs a LEFT JOIN users u ON a.user_id = u.id{where_sql};",
            tuple(params),
            one=True,
        )
        total_count = count_row['total'] if count_row else 0

        # Distinct filter options (from full table, not just page)
        action_rows = query_db(
            "SELECT DISTINCT action FROM activity_logs WHERE action IS NOT NULL AND TRIM(action) != '' ORDER BY action ASC LIMIT 200;"
        ) or []
        entity_rows = query_db(
            "SELECT DISTINCT entity_type FROM activity_logs WHERE entity_type IS NOT NULL AND TRIM(entity_type) != '' ORDER BY entity_type ASC LIMIT 100;"
        ) or []

        logs = []
        for r in rows or []:
            item = dict(r)
            item['target_type'] = item.get('entity_type')
            item['target_id'] = item.get('entity_id')
            item['user_email'] = item.get('actor_email') or item.get('user_email')
            logs.append(item)

        return success_response(start_response, data={
            "logs": logs,
            "total": total_count,
            "limit": limit,
            "offset": offset,
            "actions": [row['action'] for row in action_rows if row.get('action')],
            "entity_types": [row['entity_type'] for row in entity_rows if row.get('entity_type')],
        })

    return None
