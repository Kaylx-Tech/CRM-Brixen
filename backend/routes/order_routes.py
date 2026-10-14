"""Orders & Service Management Routes (/api/orders)
"""
import json
import os
import re
import secrets
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response
from services.invoice_service import attach_order_profit_fields
from services.order_service import build_admin_order_list
from services.manual_order_service import create_manual_crm_order
from services.notification_service import notify_staff


ORDER_FINANCE_FIELDS = ('cost_price', 'catalog_cost', 'manual_cost', 'resolved_cost', 'cost_source', 'profit')


def strip_order_finance(order):
    """An order without its cost / profit figures (team members only see what the customer pays)."""
    return {k: v for k, v in dict(order).items() if k not in ORDER_FINANCE_FIELDS}


def _wizard_line_items(body):
    items = body.get('line_items')
    if isinstance(items, list) and items:
        return items
    return []


def _upsert_wizard_order(*, body, user_id, is_staff, as_draft=False, own_orders_only=False):
    """Create or update an order from the universal order wizard payload."""
    service_name = (body.get('service_name') or '').strip()
    line_items = _wizard_line_items(body)
    if not service_name and line_items:
        names = [str(i.get('product_name') or i.get('name') or '').strip() for i in line_items]
        names = [n for n in names if n]
        service_name = names[0] if len(names) == 1 else ('Multiple Products' if names else '')

    client_id = body.get('user_id') or body.get('client_id') or user_id
    company_id = body.get('company_id')
    service_id = body.get('service_id')
    notes = (body.get('notes') or '').strip() or None
    form_values = body.get('form_values') if isinstance(body.get('form_values'), dict) else {}
    repeatable = body.get('repeatable_data') if isinstance(body.get('repeatable_data'), dict) else {}
    uploaded_docs = body.get('uploaded_docs') if isinstance(body.get('uploaded_docs'), dict) else {}
    current_step = int(body.get('current_step') or 1)
    draft_id = body.get('order_id') or body.get('draft_order_id')

    if not is_staff:
        client_id = user_id
    elif not query_db("SELECT 1 FROM users WHERE id = ? LIMIT 1;", (client_id,), one=True):
        return None, 'Selected customer not found'

    if not service_name:
        return None, 'Service name is required'

    price_sum = 0.0
    for item in line_items:
        try:
            price_sum += float(item.get('price') or item.get('unit_price') or item.get('line_total') or 0)
        except (TypeError, ValueError):
            pass
    amount = float(body.get('amount') or body.get('price') or price_sum or 0)
    vat = float(body.get('vat', 0) or 0)
    total = float(body.get('total') or (amount + vat))

    owner_name = (form_values.get('full_name') or body.get('owner_name') or '').strip() or None
    owner_email = (
        form_values.get('email')
        or body.get('company_email')
        or body.get('owner_form_email')
        or ''
    ).strip() or None
    access_email = (form_values.get('access_email') or body.get('access_email') or '').strip() or None
    access_password = (
        form_values.get('access_email_password') or body.get('access_email_password') or ''
    ).strip() or None

    checkout_payload = {
        'form_values': form_values,
        'repeatable_data': repeatable,
        'uploaded_docs': uploaded_docs,
        'line_items': line_items,
        'notes': notes,
    }
    checkout_json = json.dumps(checkout_payload)
    form_json = json.dumps(form_values)
    # orders.status CHECK has no 'Draft' (as in app.py): a draft is Pending + is_draft = 1
    status = 'Pending'
    is_draft = 1 if as_draft else 0

    if draft_id:
        # Only a saved draft can be continued (never a placed order); customers only their own,
        # team members (STAFF) only the drafts they started
        existing = query_db(
            "SELECT id, order_number, user_id, created_by_id FROM orders WHERE id = ? AND COALESCE(is_draft, 0) = 1 LIMIT 1;",
            (draft_id,), one=True)
        if existing and not is_staff and int(existing.get('user_id') or 0) != int(user_id or 0):
            existing = None
        if existing and own_orders_only and int(existing.get('created_by_id') or 0) != int(user_id or 0):
            existing = None
        if existing:
            execute_db("""
                UPDATE orders SET
                    user_id = ?, company_id = ?, service_id = ?, service_name = ?,
                    price = ?, vat = ?, total = ?, status = ?, notes = ?,
                    owner_name = ?, owner_form_email = ?,
                    checkout_form_json = ?, order_form_values_json = ?,
                    is_draft = ?, current_step = ?,
                    access_email = ?, access_email_password = ?,
                    updated_at = datetime('now')
                WHERE id = ?;
            """, (
                client_id, company_id, service_id, service_name,
                amount, vat, total, status, notes,
                owner_name, owner_email,
                checkout_json, form_json,
                is_draft, current_step,
                access_email, access_password,
                draft_id,
            ))
            execute_db("DELETE FROM order_line_items WHERE order_id = ?;", (draft_id,))
            order_id = int(draft_id)
            order_num = existing.get('order_number')
        else:
            draft_id = None

    if not draft_id:
        order_num = f"#GB-{secrets.randbelow(900000) + 100000}"
        order_id = execute_db("""
            INSERT INTO orders (
                order_number, user_id, company_id, service_id, service_name,
                price, vat, total, status, notes,
                owner_name, owner_form_email,
                checkout_form_json, order_form_values_json,
                is_draft, current_step,
                access_email, access_email_password,
                created_by_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));
        """, (
            order_num, client_id, company_id, service_id, service_name,
            amount, vat, total, status, notes,
            owner_name, owner_email,
            checkout_json, form_json,
            is_draft, current_step,
            access_email, access_password,
            user_id if is_staff else None,
        ))

    for idx, item in enumerate(line_items):
        pname = (item.get('product_name') or item.get('name') or service_name or 'Product').strip()
        try:
            unit = float(item.get('price') or item.get('unit_price') or item.get('line_total') or 0)
        except (TypeError, ValueError):
            unit = 0.0
        execute_db("""
            INSERT INTO order_line_items (
                order_id, product_name, category_name, quantity, unit_price, line_total, sort_order
            ) VALUES (?, ?, ?, 1, ?, ?, ?);
        """, (
            order_id,
            pname,
            (item.get('category_name') or item.get('category') or '') or None,
            unit,
            unit,
            idx,
        ))

    # Companies picked or added on the service form are found / created in the CRM and linked to the order
    linked_companies = []
    if not as_draft and is_staff and isinstance(body.get('companies'), list) and client_id:
        from services.order_companies import link_order_companies
        try:
            linked_companies = link_order_companies(order_id, client_id, body['companies'][:20])
        except Exception as exc:
            print(f"[order companies] order {order_id}: {exc}")

    return {
        'id': order_id,
        'order_id': order_id,
        'order_number': order_num,
        'service_name': service_name,
        'status': status,
        'linked_companies': linked_companies,
        'order': {
            'id': order_id,
            'order_number': order_num,
            'service_name': service_name,
            'status': status,
        },
    }, None


def _recalc_order_from_line_items(order_id):
    """Keep orders.service_name / price / total in sync with order_line_items."""
    items = query_db(
        "SELECT product_name, line_total FROM order_line_items WHERE order_id = ? ORDER BY sort_order ASC, id ASC;",
        (order_id,)) or []
    total = round(sum(float(i.get('line_total') or 0) for i in items), 2)
    names = ', '.join(str(i.get('product_name') or '').strip() for i in items if str(i.get('product_name') or '').strip())
    execute_db(
        "UPDATE orders SET service_name = ?, price = ?, total = ?, updated_at = datetime('now') WHERE id = ?;",
        (names, total, total, order_id))
    from services.invoice_service import sync_invoice_with_order
    sync_invoice_with_order(order_id)  # an unpaid invoice follows the new total
    return total


def _materialize_base_line_items(order):
    """Orders created without line items keep the product only in service_name; turn it into editable rows."""
    oid = order['id']
    if query_db("SELECT 1 FROM order_line_items WHERE order_id = ? LIMIT 1;", (oid,), one=True):
        return
    names = [n.strip() for n in str(order.get('service_name') or '').split(',') if n.strip()]
    total = float(order.get('total') or order.get('price') or 0)
    for idx, name in enumerate(names):
        svc = query_db("SELECT id, category FROM services WHERE LOWER(name) = LOWER(?) LIMIT 1;", (name,), one=True) or {}
        price = total if idx == 0 else 0.0
        execute_db(
            "INSERT INTO order_line_items (order_id, product_name, category_name, quantity, unit_price, line_total, sort_order, fulfillment_status) "
            "VALUES (?, ?, ?, 1, ?, ?, ?, 'Pending');",
            (oid, name, svc.get('category'), price, price, idx))


def handle_order_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/orders endpoints."""
    if not (path.startswith('/api/orders') or path.startswith('/api/admin/orders') or path.startswith('/api/client/orders')):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
    # Team members (STAFF) only work with the orders they added themselves and never see costs or profit
    own_orders_only = user_role == 'STAFF'

    match_any_order = re.match(r'^/api/(?:admin/|client/)?orders/(\d+)(?:/|$)', path)
    if own_orders_only and match_any_order:
        owner = query_db("SELECT created_by_id FROM orders WHERE id = ? LIMIT 1;",
                         (int(match_any_order.group(1)),), one=True)
        if not owner or int(owner.get('created_by_id') or 0) != int(user_id or 0):
            return error_response(start_response, "Order not found", status_code=404)

    # ── GET /api/orders | /api/admin/orders (List) ─────────────────────────
    if path in ('/api/orders', '/api/admin/orders', '/api/client/orders') and method == 'GET':
        if is_staff or path.startswith('/api/admin/'):
            payload = build_admin_order_list(user, query)
            # Keep Payments page fields
            orders = payload.get('orders') or []
            payload['total'] = (payload.get('pagination') or {}).get('total', len(orders))
            payload['total_sell'] = sum(float(o.get('total') or 0) for o in orders)
            if own_orders_only:
                payload['orders'] = [strip_order_finance(o) for o in orders]
            else:
                payload['total_cost'] = sum(float(o.get('resolved_cost') or 0) for o in orders)
                payload['net_profit'] = payload['total_sell'] - payload['total_cost']
            payload['limit'] = (payload.get('pagination') or {}).get('limit')
            payload['offset'] = ((payload.get('pagination') or {}).get('page', 1) - 1) * (payload.get('limit') or 25)
            return success_response(start_response, data=payload)

        # Client-scoped simple list
        search = (query.get('search') or [''])[0].strip()
        status_filter = (query.get('status') or [''])[0].strip()
        limit = min(int((query.get('limit') or ['50'])[0]), 100)
        offset = max(int((query.get('offset') or ['0'])[0]), 0)
        params = [user_id]
        conditions = ["o.user_id = ?", "COALESCE(o.is_draft, 0) = 0"]
        if search:
            conditions.append("(o.order_number LIKE ? OR o.service_name LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%"])
        if status_filter:
            conditions.append("o.status = ?")
            params.append(status_filter)
        where_clause = "WHERE " + " AND ".join(conditions)
        rows = query_db(f"""
            SELECT o.id, o.order_number, o.service_name, o.price, o.vat, o.total as amount, o.total,
                   o.status, o.created_at, o.payment_mode,
                   c.name as company_name
            FROM orders o
            LEFT JOIN companies c ON o.company_id = c.id
            {where_clause}
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?;
        """, params + [limit, offset])
        return success_response(start_response, data={
            "orders": [dict(r) for r in rows],
            "total": len(rows),
            "limit": limit,
            "offset": offset,
        })

    # ── GET /api/orders/<id> (Detail) ─────────────────────────────────────
    match_detail = re.match(r'^/api/(?:admin/|client/)?orders/(\d+)$', path)
    if match_detail and method == 'GET':
        order_id = int(match_detail.group(1))

        row = query_db("""
            SELECT o.*, o.total as amount, u.full_name as client_name, u.email as client_email, u.phone as client_phone,
                   c.name as company_name, c.company_number, cb.full_name as created_by_name
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN companies c ON o.company_id = c.id
            LEFT JOIN users cb ON o.created_by_id = cb.id
            WHERE o.id = ?
            LIMIT 1;
        """, (order_id,), one=True)

        if not row:
            return error_response(start_response, "Order not found", status_code=404)

        if not is_staff and row['user_id'] != user_id:
            return error_response(start_response, "Access denied", status_code=403)

        events = query_db("SELECT * FROM order_timeline WHERE order_id = ? ORDER BY step_date DESC, id DESC;", (order_id,))
        docs = query_db("SELECT * FROM documents WHERE order_id = ? ORDER BY created_at DESC;", (order_id,))
        line_items = query_db("SELECT * FROM order_line_items WHERE order_id = ? ORDER BY id ASC;", (order_id,))

        data = attach_order_profit_fields(dict(row))
        data['timeline'] = [dict(e) for e in events]
        data['documents'] = [dict(d) for d in docs]
        data['line_items'] = [dict(li) for li in line_items]
        # The order's invoice (team members in STAFF role have no access to invoices)
        if not own_orders_only:
            from services.invoice_service import enrich_invoice_row
            inv = query_db("""
                SELECT id, invoice_number, status, total, amount_paid, deposit_amount, payment_timing,
                       payment_method, due_date, paid_at, created_at
                FROM invoices WHERE order_id = ? ORDER BY id DESC LIMIT 1;
            """, (order_id,), one=True)
            data['invoice'] = enrich_invoice_row(dict(inv)) if inv else None
        if own_orders_only:
            data = strip_order_finance(data)
        if not is_staff:
            # Customers never see costs, profit, staff notes or internal documents
            from routes.client_portal_routes import public_order, public_document
            data = public_order(data)
            data['documents'] = [public_document(dict(d)) for d in docs if int(d.get('client_visible') or 0) == 1]

        if data.get('checkout_form_json'):
            try:
                data['checkout_form'] = json.loads(data['checkout_form_json'])
            except Exception:
                data['checkout_form'] = []
        if data.get('order_form_values_json'):
            try:
                data['order_form_values'] = json.loads(data['order_form_values_json'])
            except Exception:
                data['order_form_values'] = {}

        return success_response(start_response, data=data)

    # ── POST /api/orders/draft (Wizard draft save) ─────────────────────────
    if path in ('/api/orders/draft', '/api/admin/orders/draft', '/api/client/orders/draft') and method == 'POST':
        result, err = _upsert_wizard_order(body=body or {}, user_id=user_id, is_staff=is_staff, as_draft=True,
                                           own_orders_only=own_orders_only)
        if err:
            return error_response(start_response, err, status_code=400)
        return success_response(
            start_response,
            data=result,
            message=f"Draft saved as {result.get('order_number')}.",
        )

    # ── POST /api/orders (Create Order / Wizard submit / Manual CRM) ───────
    if path in ('/api/orders', '/api/admin/orders', '/api/client/orders') and method == 'POST':
        payload = body or {}
        # The order wizard sends its answers in form_values (and the customer's email as company_email);
        # it must take the wizard path, which saves those answers and finalises a saved draft.
        is_wizard = isinstance(payload.get('form_values'), dict)
        is_manual = not is_wizard and bool(
            payload.get('client_mode')
            or payload.get('new_client_email')
            or payload.get('company_email')
            or payload.get('company_type')
            or payload.get('sic_code')
        )
        if is_manual:
            result, err = create_manual_crm_order(payload, actor=user)
        else:
            result, err = _upsert_wizard_order(body=payload, user_id=user_id, is_staff=is_staff, as_draft=False,
                                               own_orders_only=own_orders_only)
        if err:
            return error_response(start_response, err, status_code=400)
        # Every placed order gets its invoice straight away (app.py ensure_invoice_for_order)
        from services.invoice_service import ensure_invoice_for_order
        invoice_id = ensure_invoice_for_order(result.get('order_id') or result.get('id'))
        if invoice_id:
            inv = query_db("SELECT id, invoice_number, status FROM invoices WHERE id = ?;", (invoice_id,), one=True)
            result['invoice'] = dict(inv) if inv else None
        if not is_manual:  # manual CRM orders notify from inside create_manual_crm_order
            notify_staff(
                'New order',
                f"Order {result.get('order_number')} ({result.get('service_name') or 'order'}) was created.",
                'order_update', '/admin/orders',
                exclude_user_id=user_id,
            )
        return success_response(
            start_response,
            data=result,
            message=f"Order {result.get('order_number')} created successfully.",
            status_code=201,
        )

    # ── PATCH /api/orders/<id>/cost (Update Cost Price) ───────────────────
    match_cost = re.match(r'^/api/(?:admin/)?orders/(\d+)/cost$', path)
    if match_cost and method in ('POST', 'PATCH', 'PUT'):
        order_id = int(match_cost.group(1))
        if not is_staff or own_orders_only:
            return error_response(start_response, "Only admins and managers can update order cost", status_code=403)

        if 'cost_price' in body and body.get('cost_price') is None:
            execute_db("UPDATE orders SET cost_price = NULL, updated_at = datetime('now') WHERE id = ?;", (order_id,))
            return success_response(start_response, data={"id": order_id, "cost_price": None}, message="Order cost reset.")

        cost_price = float(body.get('cost_price', 0) or 0)
        execute_db(
            "UPDATE orders SET cost_price = ?, updated_at = datetime('now') WHERE id = ?;",
            (cost_price, order_id)
        )
        return success_response(
            start_response,
            data={"id": order_id, "cost_price": cost_price},
            message="Order cost updated successfully."
        )

    # ── Order products: POST/PATCH/DELETE /api/orders/<id>/line-items[/<lid>] ──
    match_li = re.match(r'^/api/(?:admin/)?orders/(\d+)/line-items(?:/(\d+))?$', path)
    if match_li and method in ('POST', 'PATCH', 'PUT', 'DELETE'):
        if not is_staff:
            return error_response(start_response, "Only staff can change order products", status_code=403)
        order_id = int(match_li.group(1))
        li_id = int(match_li.group(2)) if match_li.group(2) else None
        order = query_db("SELECT * FROM orders WHERE id = ?;", (order_id,), one=True)
        if not order:
            return error_response(start_response, "Order not found", status_code=404)
        body = body or {}
        _materialize_base_line_items(order)
        if li_id == 0:  # UI row that was not yet a real line item: use the first (base) product
            first = query_db("SELECT id FROM order_line_items WHERE order_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1;", (order_id,), one=True)
            li_id = first['id'] if first else None

        if method == 'POST' and li_id is None:
            service_id = body.get('service_id')
            svc = query_db("SELECT id, name, category, price FROM services WHERE id = ?;", (int(service_id),), one=True) if service_id else None
            name = str(body.get('product_name') or (svc or {}).get('name') or '').strip()
            if not name:
                return error_response(start_response, "service_id or product_name is required", status_code=400)
            try:
                qty = max(1, int(body.get('quantity') or 1))
                unit = float(body['unit_price']) if body.get('unit_price') not in (None, '') else float((svc or {}).get('price') or 0)
            except (TypeError, ValueError):
                return error_response(start_response, "Invalid price or quantity", status_code=400)
            nxt = (query_db("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM order_line_items WHERE order_id = ?;", (order_id,), one=True) or {}).get('n') or 0
            execute_db(
                "INSERT INTO order_line_items (order_id, product_name, category_name, quantity, unit_price, line_total, sort_order, fulfillment_status) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending');",
                (order_id, name, (svc or {}).get('category'), qty, unit, round(unit * qty, 2), nxt))
            action = f"Added product {name}"
        else:
            if li_id is None:
                return error_response(start_response, "Line item id required", status_code=400)
            item = query_db("SELECT * FROM order_line_items WHERE id = ? AND order_id = ?;", (li_id, order_id), one=True)
            if not item:
                return error_response(start_response, "Product row not found", status_code=404)
            if method == 'DELETE':
                count = (query_db("SELECT COUNT(*) AS c FROM order_line_items WHERE order_id = ?;", (order_id,), one=True) or {}).get('c') or 0
                if count <= 1:
                    return error_response(start_response, "An order must keep at least one product", status_code=400)
                execute_db("DELETE FROM order_line_items WHERE id = ?;", (li_id,))
                action = f"Removed product {item.get('product_name')}"
            else:
                try:
                    qty = max(1, int(body.get('quantity') if body.get('quantity') not in (None, '') else item.get('quantity') or 1))
                    unit = float(body['unit_price']) if body.get('unit_price') not in (None, '') else float(item.get('unit_price') or 0)
                except (TypeError, ValueError):
                    return error_response(start_response, "Invalid price or quantity", status_code=400)
                if unit < 0:
                    return error_response(start_response, "Price cannot be negative", status_code=400)
                execute_db("UPDATE order_line_items SET quantity = ?, unit_price = ?, line_total = ? WHERE id = ?;",
                           (qty, unit, round(unit * qty, 2), li_id))
                action = f"Changed price of {item.get('product_name')} to {unit:.2f}"

        total = _recalc_order_from_line_items(order_id)
        try:
            from services.audit_service import log_activity, log_order_timeline
            log_activity((user or {}).get('id'), 'ORDER_PRODUCTS_CHANGED', 'orders', order_id, action)
            log_order_timeline(order_id, 'Completed', action)
        except Exception:
            pass
        fresh = query_db("SELECT * FROM order_line_items WHERE order_id = ? ORDER BY sort_order ASC, id ASC;", (order_id,)) or []
        return success_response(start_response, message=action, data={"line_items": [dict(r) for r in fresh], "total": total})

    # ── PATCH/PUT /api/orders/<id> (Update Order) ─────────────────────────
    match_update = re.match(r'^/api/(?:admin/)?orders/(\d+)$', path)
    if match_update and method in ('PATCH', 'PUT'):
        order_id = int(match_update.group(1))
        if not is_staff:
            return error_response(start_response, "Only staff can update orders", status_code=403)

        updates = []
        params = []
        if 'cost_price' in body and not own_orders_only:
            if body.get('cost_price') is None or str(body.get('cost_price')).strip() == '':
                updates.append("cost_price = NULL")
            else:
                updates.append("cost_price = ?")
                params.append(float(body['cost_price'] or 0))
        if 'price' in body:
            updates.append("price = ?")
            params.append(float(body['price'] or 0))
        if 'total' in body:
            updates.append("total = ?")
            params.append(float(body['total'] or 0))
        if 'payment_mode' in body:
            updates.append("payment_mode = ?")
            params.append(body['payment_mode'])
        if 'status' in body:
            updates.append("status = ?")
            params.append(body['status'])
        if 'notes' in body:
            updates.append("notes = ?")
            params.append(body['notes'])
        if 'access_email' in body:
            updates.append("access_email = ?")
            params.append(body['access_email'])
        if 'access_email_password' in body:
            updates.append("access_email_password = ?")
            params.append(body['access_email_password'])
        if 'checkout_form' in body:
            cf = body['checkout_form']
            # Wizard orders keep a dict here (form values, uploads, line items): edited fields go under "fields"
            current = query_db("SELECT checkout_form_json FROM orders WHERE id = ?;", (order_id,), one=True) or {}
            try:
                existing_cf = json.loads(current.get('checkout_form_json') or 'null')
            except (TypeError, ValueError):
                existing_cf = None
            if isinstance(existing_cf, dict) and isinstance(cf, list):
                cf = {**existing_cf, 'fields': cf}
            cf_json = json.dumps(cf) if isinstance(cf, (list, dict)) else str(cf or '')
            updates.append("checkout_form_json = ?")
            params.append(cf_json)
        if 'order_form_values_json' in body:
            ofv = body['order_form_values_json']
            ofv_json = json.dumps(ofv) if isinstance(ofv, (list, dict)) else str(ofv or '')
            updates.append("order_form_values_json = ?")
            params.append(ofv_json)

        old_status = (query_db("SELECT status FROM orders WHERE id = ?;", (order_id,), one=True) or {}).get('status')
        if updates:
            updates.append("updated_at = datetime('now')")
            params.append(order_id)
            execute_db(f"UPDATE orders SET {', '.join(updates)} WHERE id = ?;", params)
        if 'status' in body and body.get('status') != old_status:
            from services.client_mail import notify_order_status_changed
            notify_order_status_changed(order_id, old_status, triggered_by=user_id)
        if any(k in body for k in ('price', 'total', 'status')):
            from services.invoice_service import sync_invoice_with_order
            sync_invoice_with_order(order_id)

        return success_response(start_response, message="Order updated successfully.")

    # ── PATCH /api/orders/<id>/status (Update Status) ─────────────────────
    match_status = re.match(r'^/api/(?:admin/)?orders/(\d+)/status$', path)
    if match_status and method in ('POST', 'PATCH', 'PUT'):
        order_id = int(match_status.group(1))
        new_status = body.get('status')

        if not is_staff:
            return error_response(start_response, "Only staff can update order status", status_code=403)

        if not new_status:
            return error_response(start_response, "Status is required", status_code=400)

        old_status = (query_db("SELECT status FROM orders WHERE id = ?;", (order_id,), one=True) or {}).get('status')
        execute_db("UPDATE orders SET status = ? WHERE id = ?;", (new_status, order_id))
        if new_status != old_status:
            from services.client_mail import notify_order_status_changed
            notify_order_status_changed(order_id, old_status, triggered_by=user_id)
            from services.invoice_service import sync_invoice_with_order
            sync_invoice_with_order(order_id)
        if str(new_status).strip().lower() == 'completed':
            done = query_db("SELECT order_number, service_name FROM orders WHERE id = ?;", (order_id,), one=True) or {}
            notify_staff(
                'Order completed',
                f"Order {done.get('order_number') or order_id} ({done.get('service_name') or 'order'}) is completed.",
                'order_complete', '/admin/orders',
                exclude_user_id=user_id,
            )

        return success_response(start_response, message=f"Order status updated to {new_status}.")

    # ── DELETE /api/orders/<id> (Cancel / soft-delete) ─────────────────────
    match_delete = re.match(r'^/api/(?:admin/)?orders/(\d+)$', path)
    if match_delete and method == 'DELETE':
        order_id = int(match_delete.group(1))
        if user_role not in ('SUPER_ADMIN', 'ADMIN'):
            return error_response(start_response, "Only an admin can delete orders", status_code=403)

        existing = query_db("SELECT * FROM orders WHERE id = ?;", (order_id,), one=True)
        if not existing:
            return error_response(start_response, "Order not found", status_code=404)

        # Genuine (paid / website) orders are locked; an admin unlocks them by confirming in the
        # delete dialog, which sends force_delete_genuine. Only admins ever reach this point.
        from services import data_protection, permanent_purge
        force_flag = (body or {}).get('force_delete_genuine') if isinstance(body, dict) else None
        if force_flag is None:
            force_flag = ((query or {}).get('force_delete_genuine') or [''])[0]
        force = str(force_flag).strip().lower() in ('1', 'true', 'yes')
        if not force:
            blocked = data_protection.refuse_manual_delete_order(existing, actor=user)
            if blocked:
                return error_response(start_response, blocked, status_code=403)

        result = permanent_purge.purge_order_from_live(order=existing, actor=user, scrub_backups=True)
        root = os.path.abspath(permanent_purge.storage_dir())
        for doc_path in result.get('doc_paths') or []:
            try:
                if doc_path and os.path.abspath(doc_path).startswith(root) and os.path.isfile(doc_path):
                    os.remove(doc_path)
            except OSError:
                pass
        try:
            from services.audit_service import log_activity
            log_activity((user or {}).get('id'), 'ORDER_PERMANENTLY_DELETED', 'orders', order_id,
                         f"Permanently deleted order {existing.get('order_number')}")
        except Exception:
            pass
        return success_response(
            start_response,
            data={"id": order_id, "company_kept": True},
            message="Order permanently deleted.",
        )

    return None
