"""Audit & Activity Logging Service
Extracted from core Brixen CRM architecture.
"""
from db import execute_db

def log_activity(user_id, action, target_type=None, target_id=None, details=None, ip_address=None):
    """Record an audit trail event for compliance and security."""
    try:
        execute_db("""
            INSERT INTO activity_logs (
                user_id, action, entity_type, entity_id, details, created_at
            ) VALUES (?, ?, ?, ?, ?, datetime('now'));
        """, (user_id, action, target_type, str(target_id) if target_id else None, details))
    except Exception as e:
        print(f"[Audit Log Error] Failed to log activity: {e}")


def log_order_timeline(order_id, status, title, description=None, created_by=None):
    """Record an event in an order's historical timeline (schema: title, status, step_date)."""
    try:
        step_status = status if status in ('Completed', 'Current', 'Pending') else 'Pending'
        execute_db("""
            INSERT INTO order_timeline (
                order_id, title, status, step_date
            ) VALUES (?, ?, ?, datetime('now'));
        """, (order_id, title or description or 'Update', step_status))
    except Exception as e:
        print(f"[Timeline Log Error] Failed to record timeline for order {order_id}: {e}")
