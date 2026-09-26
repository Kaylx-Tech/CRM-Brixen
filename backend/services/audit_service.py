"""Audit & Activity Logging Service
Extracted from core Brixen CRM architecture.
"""
from db import execute_db

def log_activity(user_id, action, target_type=None, target_id=None, details=None, ip_address=None):
    """Record an audit trail event for compliance and security."""
    try:
        execute_db("""
            INSERT INTO activity_logs (
                user_id, action, target_type, target_id, details, ip_address, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'));
        """, (user_id, action, target_type, str(target_id) if target_id else None, details, ip_address))
    except Exception as e:
        print(f"[Audit Log Error] Failed to log activity: {e}")

def log_order_timeline(order_id, status, title, description=None, created_by=None):
    """Record an event in an order's historical timeline."""
    try:
        execute_db("""
            INSERT INTO order_timeline (
                order_id, status, title, description, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, datetime('now'));
        """, (order_id, status, title, description, created_by))
    except Exception as e:
        print(f"[Timeline Log Error] Failed to record timeline for order {order_id}: {e}")
