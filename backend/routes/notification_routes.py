"""Notification Routes (/api/notifications)
"""
import re
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response
from services.notification_service import get_user_unread_count

def handle_notification_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/notifications and /api/client/notifications endpoints."""
    valid_prefixes = ('/api/notifications', '/api/client/notifications')
    if not any(path.startswith(prefix) for prefix in valid_prefixes):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_id = user.get('id')

    # ── GET notifications (List notifications for current user) ───────────
    if (path in ('/api/notifications', '/api/client/notifications')) and method == 'GET':
        try:
            limit = min(int((query.get('limit') or ['50'])[0]), 200)
        except (TypeError, ValueError):
            limit = 50
        
        rows = query_db("""
            SELECT id, title, message, type, link, is_read, created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?;
        """, (user_id, limit))

        unread_count = get_user_unread_count(user_id)

        # Top-level shape matches app.py + Notification.jsx (data.notifications)
        return json_response(start_response, {
            "status": "success",
            "success": True,
            "notifications": [dict(r) for r in rows],
            "unread_count": unread_count
        })

    # ── POST read (Mark all or single as read) ─────────────────────────────
    if (path in ('/api/notifications/read', '/api/client/notifications/read', '/api/notifications/read-all')) and method == 'POST':
        note_id = body.get('id') if isinstance(body, dict) else None
        if note_id:
            execute_db("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?;", (user_id, note_id))
        else:
            execute_db("UPDATE notifications SET is_read = 1 WHERE user_id = ?;", (user_id,))
        return json_response(start_response, {"status": "success", "success": True, "message": "Notifications marked read."})

    # ── POST /api/notifications/<id>/read (Mark single as read) ───────────
    match_read = re.match(r'^/(?:api/notifications|api/client/notifications)/(\d+)/read$', path)
    if match_read and method == 'POST':
        nid = int(match_read.group(1))
        execute_db("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?;", (nid, user_id))
        return json_response(start_response, {"status": "success", "success": True, "message": "Notification marked as read."})

    # ── DELETE /api/client/notifications (Clear notifications) ───────────
    if (path in ('/api/notifications/clear', '/api/client/notifications/clear', '/api/client/notifications')) and method in ('POST', 'DELETE'):
        execute_db("DELETE FROM notifications WHERE user_id = ?;", (user_id,))
        return success_response(start_response, data={"status": "success"}, message="Notifications cleared.")

    return None
