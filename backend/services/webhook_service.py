"""WordPress & WooCommerce Webhook Integration Service
Idempotent upsert keyed by woocommerce_order_id / order_number (app.py parity).
"""
import secrets
from db import query_db, execute_db, hash_password, unusable_password_hash
from services.audit_service import log_order_timeline


def process_woocommerce_order(payload):
    """Process an incoming WooCommerce order webhook payload."""
    if not isinstance(payload, dict):
        return {"success": False, "error": "Invalid payload"}

    order_id_wc = str(payload.get('id') or payload.get('order_id') or payload.get('woocommerce_order_id') or '').strip()
    billing = payload.get('billing') or {}
    email = (billing.get('email') or payload.get('email') or '').strip().lower()
    first_name = billing.get('first_name', '')
    last_name = billing.get('last_name', '')
    full_name = f"{first_name} {last_name}".strip() or 'Client'
    try:
        total = float(payload.get('total', 0) or 0)
    except (TypeError, ValueError):
        total = 0.0

    order_num_raw = payload.get('number') or payload.get('order_number') or order_id_wc
    order_num = str(order_num_raw or '').strip()
    if order_num and not order_num.startswith('#'):
        order_num = f"#GB{order_num}" if str(order_num).isdigit() else f"#{order_num}"
    if not order_num:
        order_num = f"#GB-{secrets.randbelow(900000) + 100000}"

    if not email:
        return {"success": False, "error": "Order payload missing client email"}

    # Block permanently purged emails (same gate as app.py)
    try:
        from services.permanent_purge import is_purged_email
        if is_purged_email(email):
            return {"success": False, "error": "Email is permanently purged and cannot be re-synced"}
    except Exception:
        pass

    # 1. Find or create user
    user = query_db("SELECT id, email FROM users WHERE lower(email) = ? LIMIT 1;", (email,), one=True)
    if not user:
        guest = query_db(
            "SELECT id FROM users WHERE email = 'guest.unlinked@brixenconsultants.com' LIMIT 1;",
            one=True,
        )
        if guest:
            user_id = guest['id']
            status = 'Pending Verification'
            notes = f"Guest Order (Email: {email}) - Pending Staff Verification"
        else:
            pwd_hash = unusable_password_hash()
            user_id = execute_db("""
                INSERT INTO users (email, password_hash, full_name, role, status, created_at)
                VALUES (?, ?, ?, 'CLIENT', 'Active', datetime('now'));
            """, (email, pwd_hash, full_name))
            status = 'Pending'
            notes = ''
    else:
        user_id = user['id']
        status = 'Pending'
        notes = ''

    # 2. Extract service line item
    line_items = payload.get('line_items') or []
    if isinstance(line_items, list) and line_items:
        names = [str(item.get('name') or '').strip() for item in line_items if isinstance(item, dict)]
        service_name = ', '.join(n for n in names if n) or 'Brixen Professional Service'
    else:
        service_name = 'Brixen Professional Service'

    # 3. Idempotent upsert by woocommerce_order_id then order_number
    existing = None
    if order_id_wc:
        existing = query_db(
            "SELECT id, order_number FROM orders WHERE woocommerce_order_id = ? LIMIT 1;",
            (order_id_wc,),
            one=True,
        )
    if not existing:
        existing = query_db(
            "SELECT id, order_number FROM orders WHERE order_number = ? LIMIT 1;",
            (order_num,),
            one=True,
        )

    if existing:
        order_id = existing['id']
        order_num = existing.get('order_number') or order_num
        execute_db("""
            UPDATE orders
            SET status = ?, total = ?, price = ?, service_name = ?,
                woocommerce_order_id = COALESCE(?, woocommerce_order_id),
                updated_at = datetime('now')
            WHERE id = ?;
        """, (status, total, total, service_name, order_id_wc or None, order_id))
        log_order_timeline(order_id, 'Current', 'Order Updated from Website', f"Order #{order_num} updated from WooCommerce.")
        created = False
    else:
        order_id = execute_db("""
            INSERT INTO orders (
                order_number, user_id, service_name, price, vat, total,
                status, notes, woocommerce_order_id, payment_mode, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 0.00, ?, ?, ?, ?, 'Website Charge', datetime('now'), datetime('now'));
        """, (order_num, user_id, service_name, total, total, status, notes or None, order_id_wc or None))
        log_order_timeline(order_id, 'Pending', 'Order Received from Website', f"Order #{order_num} synced from WooCommerce.")
        created = True

    # 4. Replace line items when present
    if isinstance(line_items, list) and line_items and order_id:
        try:
            execute_db("DELETE FROM order_line_items WHERE order_id = ?;", (order_id,))
            for idx, item in enumerate(line_items):
                if not isinstance(item, dict):
                    continue
                name = str(item.get('name') or 'Product').strip() or 'Product'
                qty = int(item.get('quantity') or 1)
                try:
                    unit = float(item.get('price') or item.get('total') or 0)
                except (TypeError, ValueError):
                    unit = 0.0
                line_total = unit * qty if item.get('total') is None else float(item.get('total') or unit)
                execute_db("""
                    INSERT INTO order_line_items (
                        order_id, woocommerce_product_id, product_name, quantity,
                        unit_price, line_total, sort_order
                    ) VALUES (?, ?, ?, ?, ?, ?, ?);
                """, (
                    order_id,
                    str(item.get('product_id') or '') or None,
                    name,
                    qty,
                    unit,
                    line_total,
                    idx,
                ))
        except Exception as e:
            print(f"[Webhook] line items sync error: {e}")

    return {
        "success": True,
        "order_id": order_id,
        "order_number": order_num,
        "user_id": user_id,
        "created": created,
    }
