"""WordPress & WooCommerce Webhook Integration Service
Extracted from core Brixen CRM architecture.
"""
import json
import secrets
from db import query_db, execute_db, hash_password
from services.audit_service import log_order_timeline

def process_woocommerce_order(payload):
    """Process an incoming WooCommerce order webhook payload."""
    order_id_wc = str(payload.get('id') or payload.get('order_id') or '')
    billing = payload.get('billing') or {}
    email = (billing.get('email') or payload.get('email') or '').strip().lower()
    first_name = billing.get('first_name', '')
    last_name = billing.get('last_name', '')
    full_name = f"{first_name} {last_name}".strip() or 'Client'
    total = float(payload.get('total', 0))

    if not email:
        return {"success": False, "error": "Order payload missing client email"}

    # 1. Find or create user
    user = query_db("SELECT id, email FROM users WHERE lower(email) = ? LIMIT 1;", (email,), one=True)
    if not user:
        random_pass = secrets.token_urlsafe(16)
        pwd_hash = hash_password(random_pass)
        user_id = execute_db("""
            INSERT INTO users (email, password_hash, full_name, role, status, created_at)
            VALUES (?, ?, ?, 'CLIENT', 'Active', datetime('now'));
        """, (email, pwd_hash, full_name))
    else:
        user_id = user['id']

    # 2. Extract service line item
    line_items = payload.get('line_items', [])
    service_name = line_items[0].get('name', 'Brixen Professional Service') if line_items else 'Brixen Service'

    order_num = f"#GB-{order_id_wc or secrets.randbelow(900000) + 100000}"

    # 3. Insert or update order
    order_id = execute_db("""
        INSERT INTO orders (
            order_number, user_id, service_name, price, vat, total,
            status, woocommerce_order_id, created_at
        ) VALUES (?, ?, ?, ?, 0.00, ?, 'Pending', ?, datetime('now'));
    """, (order_num, user_id, service_name, total, total, order_id_wc))

    log_order_timeline(order_id, 'Pending', 'Order Received from Website', f"Order #{order_num} synced from WooCommerce.")

    return {
        "success": True,
        "order_id": order_id,
        "order_number": order_num,
        "user_id": user_id
    }
