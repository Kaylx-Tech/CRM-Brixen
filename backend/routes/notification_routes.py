"""Notification Routes (/api/notifications)
"""
import re
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response
from services.notification_service import mark_notification_read, get_user_unread_count

def handle_notification_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/notifications endpoints."""
    if not path.startswith('/api/notifications'):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_id = user.get('id')

    # ── GET /api/notifications (List notifications for current user) ──────
    if path == '/api/notifications' and method == 'GET':
        limit = min(int((query.get('limit') or ['20'])[0]), 50)
        
        rows = query_db("""
            SELECT id, title, message, type, link, is_read, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?;
        """, (user_id, limit))

        unread_count = get_user_unread_count(user_id)

        return success_response(start_response, data={
            "notifications": [dict(r) for r in rows],
            "unread_count": unread_count
        })

    # ── POST /api/notifications/<id>/read (Mark single as read) ───────────
    match_read = re.match(r'^/api/notifications/(\d+)/read$', path)
    if match_read and method == 'POST':
        nid = int(match_read.group(1))
        mark_notification_read(nid, user_id)
        return success_response(start_response, message="Notification marked as read.")

    # ── POST /api/notifications/read-all (Mark all as read) ───────────────
    if path == '/api/notifications/read-all' and method == 'POST':
        execute_db("UPDATE notifications SET is_read = 1 WHERE user_id = ?;", (user_id,))
        return success_response(start_response, message="All notifications marked as read.")

    return None
