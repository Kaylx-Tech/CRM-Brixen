"""Notifications & Alert Dispatch Service
Schema-aligned with notifications table (user_id, title, message, type, link, is_read, created_at).
"""
from db import execute_db, query_db


def create_notification(user_id, title, message, ntype='info', link=None, company_id=None, order_id=None):
    """Create an in-app notification record for a user.

    company_id / order_id are accepted for call-site compatibility but are not
    persisted (those columns are not on the notifications table).
    """
    try:
        nid = execute_db("""
            INSERT INTO notifications (
                user_id, title, message, type, link, is_read, created_at
            ) VALUES (?, ?, ?, ?, ?, 0, datetime('now'));
        """, (user_id, title, message, ntype, link))
        return nid
    except Exception as e:
        print(f"[Notification Service Error] Failed to create notification: {e}")
        return None


def mark_notification_read(notification_id, user_id):
    """Mark a notification as read."""
    execute_db("""
        UPDATE notifications
        SET is_read = 1
        WHERE id = ? AND user_id = ?;
    """, (notification_id, user_id))


def get_user_unread_count(user_id):
    """Fetch unread notification count for a user."""
    row = query_db(
        "SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0;",
        (user_id,),
        one=True,
    )
    return row['c'] if row else 0
