"""WordPress & WooCommerce Webhook Integration Service
Idempotent upsert keyed by woocommerce_order_id / order_number (app.py parity).
"""
import secrets
from db import query_db, execute_db, hash_password, unusable_password_hash
from services.audit_service import log_order_timeline
from services.notification_service import notify_staff


def process_woocommerce_customer(payload):
    """WooCommerce customer.created / customer.updated: add or update the signup in the CRM."""
    if not isinstance(payload, dict):
        return {"success": False, "error": "Invalid payload"}
    wp_id = str(payload.get('id') or '').strip()
    email = str(payload.get('email') or '').strip().lower()
    if not email or not wp_id.isdigit():
        return {"success": False, "error": "Customer payload missing id or email"}
    role = str(payload.get('role') or 'customer').strip().lower()
    if role not in ('customer', 'subscriber'):
        return {"success": True, "skipped": True, "reason": f"Ignored {role} account"}

    try:
        from services.permanent_purge import is_purged_email
        if is_purged_email(email):
            return {"success": True, "skipped": True, "reason": "Email was permanently deleted"}
    except Exception:
        pass

    billing = payload.get('billing') or {}
    first = str(payload.get('first_name') or billing.get('first_name') or '').strip()
    last = str(payload.get('last_name') or billing.get('last_name') or '').strip()
    full_name = f"{first} {last}".strip() or str(payload.get('username') or '').strip() or email.split('@')[0]
    phone = str(billing.get('phone') or '').strip() or None
    country = str(billing.get('country') or '').strip() or None

    existing = query_db(
        "SELECT id, role, full_name, phone, wordpress_user_id FROM users WHERE wordpress_user_id = ? LIMIT 1;",
        (wp_id,), one=True) or query_db(
        "SELECT id, role, full_name, phone, wordpress_user_id FROM users WHERE lower(email) = ? LIMIT 1;",
        (email,), one=True)

    if existing:
        if existing.get('role') != 'CLIENT':
            return {"success": True, "skipped": True, "reason": "Email belongs to a staff account"}
        # Link the website account and fill blanks; never overwrite details staff already edited in the CRM
        execute_db("""
            UPDATE users
            SET wordpress_user_id = CASE WHEN COALESCE(wordpress_user_id, '') = '' OR wordpress_user_id LIKE 'local_%'
                                         THEN ? ELSE wordpress_user_id END,
                full_name = CASE WHEN TRIM(COALESCE(full_name, '')) = '' THEN ? ELSE full_name END,
                phone = COALESCE(NULLIF(TRIM(phone), ''), ?),
                last_synced_at = CURRENT_TIMESTAMP
            WHERE id = ?;
        """, (wp_id, full_name, phone, existing['id']))
        return {"success": True, "customer_id": existing['id'], "created": False}

    created = str(payload.get('date_created') or '').replace('T', ' ')[:19] or None
    cid = execute_db("""
        INSERT INTO users (wordpress_user_id, email, password_hash, full_name, phone, country, role, status,
                           client_type, is_b2b, notification_email, created_at, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?, 'CLIENT', 'Active', 'Individual', 0, ?, COALESCE(?, datetime('now')), CURRENT_TIMESTAMP);
    """, (wp_id, email, unusable_password_hash(), full_name, phone, country, email, created))
    try:
        notify_staff('New website signup', f"{full_name} ({email}) signed up on the website.",
                     'signup', '/admin/customers')
    except Exception:
        pass
    return {"success": True, "customer_id": cid, "created": True}


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
        from services.order_numbers import next_order_number
        order_num = next_order_number()

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
        service_name = ', '.join(n for n in names if n) or 'Professional Service'
    else:
        service_name = 'Professional Service'

    # 3. Idempotent upsert by woocommerce_order_id then order_number
    existing = None
    if order_id_wc:
        existing = query_db(
            "SELECT id, order_number FROM orders WHERE woocommerce_order_id = ? LIMIT 1;",
            (order_id_wc,),
            one=True,
        )
    if not existing:
        # Same number without a WooCommerce id: only an earlier copy of this website order may be reused.
        # A CRM order holding the number (CRM and website share the #GB series) is never overwritten.
        existing = query_db("""
            SELECT id, order_number FROM orders
            WHERE order_number = ? AND COALESCE(woocommerce_order_id, '') = ''
              AND created_by_id IS NULL AND payment_mode = 'Website Charge'
            LIMIT 1;
        """, (order_num,), one=True)
    if not existing and query_db("SELECT 1 FROM orders WHERE order_number = ? LIMIT 1;", (order_num,), one=True):
        # The number is taken by a CRM order: the website order keeps its number with a -W mark
        order_num = f"{order_num}-W"

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
        notify_staff(
            'New website order',
            f"Order {order_num} from {full_name or email} is in the CRM.",
            'order_update', '/admin/orders',
        )
        from services.client_mail import email_team
        from services.portal_compat import brand_name
        email_team(f"New website order {order_num} — {brand_name()}",
                   f"A new website order is in the CRM.\nOrder: {order_num}\nClient: {full_name or email}",
                   link_path='/admin/orders', order_id=order_id)
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

    # 5. Company formation bought on the website: its proposed company goes in as Pending (not registered)
    try:
        from services.order_companies import ensure_formation_company, website_company_name
        ensure_formation_company(order_id, website_company_name(payload))
    except Exception as e:
        print(f"[Webhook] formation company error: {e}")

    # 6. Invoice (app.py): a website order paid at checkout (WooCommerce processing / completed, or a payment
    #    date) gets a Paid invoice; otherwise a Pending one
    try:
        from services.invoice_service import ensure_invoice_for_order, sync_invoice_with_order
        wc_status = str(payload.get('status') or '').strip().lower()
        paid = wc_status in ('processing', 'completed') or bool(payload.get('date_paid') or payload.get('date_paid_gmt'))
        before = query_db("SELECT status FROM invoices WHERE order_id = ? ORDER BY id DESC LIMIT 1;",
                          (order_id,), one=True)
        ensure_invoice_for_order(order_id, paid=paid)
        sync_invoice_with_order(order_id)
        # Paid at checkout: "Payment received" email once, when the invoice first turns Paid (app.py);
        # never for the shared guest account
        if paid and (before or {}).get('status') != 'Paid' and status != 'Pending Verification':
            from services.invoice_mail import send_payment_received
            invoice = query_db("SELECT * FROM invoices WHERE order_id = ? ORDER BY id DESC LIMIT 1;",
                               (order_id,), one=True)
            order_row = query_db("""
                SELECT o.*, u.email, u.full_name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?;
            """, (order_id,), one=True)
            if invoice and order_row and invoice.get('status') == 'Paid':
                send_payment_received(dict(invoice), dict(order_row))
    except Exception as e:
        print(f"[Webhook] invoice sync error: {e}")

    return {
        "success": True,
        "order_id": order_id,
        "order_number": order_num,
        "user_id": user_id,
        "created": created,
    }
