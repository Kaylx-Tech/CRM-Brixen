"""Notifications & Alert Dispatch Service
Extracted from core Brixen CRM architecture.
"""
from db import execute_db, query_db

def create_notification(user_id, title, message, ntype='info', link=None, company_id=None, order_id=None):
    """Create an in-app notification record for a user."""
    try:
        nid = execute_db("""
            INSERT INTO notifications (
                user_id, title, message, type, link, company_id, order_id, is_read, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'));
        """, (user_id, title, message, ntype, link, company_id, order_id))
        return nid
    except Exception as e:
        print(f"[Notification Service Error] Failed to create notification: {e}")
        return None

def mark_notification_read(notification_id, user_id):
    """Mark a notification as read."""
    execute_db("""
        UPDATE notifications
        SET is_read = 1, read_at = datetime('now')
        WHERE id = ? AND user_id = ?;
    """, (notification_id, user_id))

def get_user_unread_count(user_id):
    """Fetch unread notification count for a user."""
    row = query_db("SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0;", (user_id,), one=True)
    return row['c'] if row else 0
