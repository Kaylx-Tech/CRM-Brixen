"""Manual CRM order create — aligned with app.py create_manual_crm_order (core path)."""
from __future__ import annotations

import json
import secrets
from db import query_db, execute_db, hash_password


def _optional_id(value):
    try:
        if value in (None, '', 0, '0'):
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _ensure_client(data, actor=None):
    actor = actor or {}
    if actor.get('role') == 'CLIENT':
        row = query_db("SELECT * FROM users WHERE id = ? LIMIT 1;", (actor.get('id'),), one=True)
        if not row:
            return None, None, 'Client account not found'
        return int(row['id']), dict(row), None

    mode = str(data.get('client_mode') or 'existing').strip().lower()
    if mode == 'new':
        full_name = str(data.get('new_client_full_name') or '').strip()
        email = str(data.get('new_client_email') or '').strip().lower()
        if not full_name or not email:
            return None, None, 'Please enter the new client name and email.'
        existing = query_db("SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1;", (email,), one=True)
        if existing:
            return int(existing['id']), dict(existing), None
        cid = execute_db("""
            INSERT INTO users (email, password_hash, full_name, role, status, client_type, is_b2b, created_at)
            VALUES (?, ?, ?, 'CLIENT', 'Active', 'Individual', 0, datetime('now'));
        """, (email, hash_password(secrets.token_urlsafe(12)), full_name))
        row = query_db("SELECT * FROM users WHERE id = ? LIMIT 1;", (cid,), one=True)
        return int(cid), dict(row) if row else {'id': cid, 'full_name': full_name, 'email': email}, None

    client_id = _optional_id(data.get('client_id') or data.get('user_id'))
    if not client_id:
        return None, None, 'Please select a client.'
    row = query_db("SELECT * FROM users WHERE id = ? LIMIT 1;", (client_id,), one=True)
    if not row:
        return None, None, 'Selected client not found'
    return int(client_id), dict(row), None


def _ensure_company(client_id, data, service_name, client):
    company_id = _optional_id(data.get('company_id'))
    if company_id:
        company = query_db("SELECT * FROM companies WHERE id = ? LIMIT 1;", (company_id,), one=True)
        if company and int(company.get('user_id') or 0) != int(client_id):
            execute_db("UPDATE companies SET user_id = ? WHERE id = ?;", (client_id, company_id))
        return company_id, None

    company_name = str(data.get('company_name') or data.get('name') or '').strip()
    if not company_name:
        return None, None

    reg_office = str(data.get('reg_office') or '').strip()
    if not reg_office:
        parts = [
            str(data.get('registered_address_line1') or '').strip(),
            str(data.get('registered_city') or '').strip(),
            str(data.get('registered_postcode') or '').strip(),
        ]
        reg_office = ', '.join([p for p in parts if p])

    director = str(data.get('owner_name') or data.get('director') or (client or {}).get('full_name') or '').strip() or None
    package = service_name if 'package' in str(service_name or '').lower() else (data.get('package') or service_name)
    sic = str(data.get('sic_code') or '').strip() or None
    company_type = str(data.get('company_type') or '').strip() or None

    new_id = execute_db("""
        INSERT INTO companies (
            user_id, name, status, director, reg_office, package, sic_codes, created_at
        ) VALUES (?, ?, 'Active', ?, ?, ?, ?, datetime('now'));
    """, (client_id, company_name, director, reg_office or None, package or None, sic))

    # Best-effort optional columns
    try:
        if company_type:
            execute_db("UPDATE companies SET company_type = ? WHERE id = ?;", (company_type, new_id))
    except Exception:
        pass
    try:
        notify_email = str(data.get('company_email') or data.get('registered_email') or '').strip()
        if notify_email:
            execute_db("UPDATE companies SET registered_email = ? WHERE id = ?;", (notify_email, new_id))
    except Exception:
        pass

    return new_id, None


def create_manual_crm_order(data, actor=None):
    extras = dict(data) if isinstance(data, dict) else {}
    client_id, client, client_err = _ensure_client(extras, actor=actor)
    if client_err:
        return None, client_err

    line_items = extras.get('line_items')
    valid_items = []
    total_price = 0.0
    if isinstance(line_items, list) and line_items:
        for item in line_items:
            pn = str((item or {}).get('product_name') or '').strip()
            if not pn:
                continue
            try:
                p = float((item or {}).get('price') or 0)
            except (TypeError, ValueError):
                p = 0.0
            if p < 0:
                return None, 'Price cannot be negative'
            valid_items.append({
                'product_name': pn,
                'price': p,
                'category_name': str((item or {}).get('category_name') or (item or {}).get('category') or 'Manual CRM Order').strip(),
            })
            total_price += p
        if not valid_items:
            return None, 'Enter at least one product name'
        service_name = valid_items[0]['product_name'] if len(valid_items) == 1 else 'Multiple Products'
    else:
        service_name = str(extras.get('service_name') or extras.get('product') or '').strip()
        if not service_name:
            return None, 'Enter the service / product name'
        try:
            total_price = float(extras.get('price') if extras.get('price') not in (None, '') else 0)
        except (TypeError, ValueError):
            return None, 'Enter a valid price'
        if total_price < 0:
            return None, 'Price cannot be negative'
        valid_items = [{'product_name': service_name, 'price': total_price, 'category_name': 'Manual CRM Order'}]

    company_email = str(extras.get('company_email') or '').strip()
    if not company_email:
        return None, 'Please enter the company notification email.'

    company_id, company_err = _ensure_company(client_id, extras, service_name, client)
    if company_err:
        return None, company_err

    is_b2b = bool(client and (client.get('is_b2b') == 1 or str(client.get('client_type') or '').upper() == 'B2B'))
    if is_b2b and actor and actor.get('role') not in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF'):
        total_price = 0.0
        for item in valid_items:
            item['price'] = 0.0

    price = round(float(total_price), 2)
    vat = 0.0
    total = price
    status = str(extras.get('status') or 'Processing').strip() or 'Processing'
    payment_mode = str(extras.get('payment_mode') or 'Manual CRM').strip() or 'Manual CRM'
    notes = str(extras.get('notes') or '').strip() or None
    owner_name = str(extras.get('owner_name') or (client or {}).get('full_name') or '').strip() or None
    owner_email = company_email

    checkout_payload = {
        'source': 'manual_crm',
        'company_type': extras.get('company_type'),
        'sic_code': extras.get('sic_code'),
        'company_phone': extras.get('company_phone'),
        'reg_office': extras.get('reg_office'),
        'registered_address_line1': extras.get('registered_address_line1'),
        'registered_city': extras.get('registered_city'),
        'registered_postcode': extras.get('registered_postcode'),
        'director_phone': extras.get('director_phone'),
        'director_nationality': extras.get('director_nationality'),
        'director_residence': extras.get('director_residence'),
        'line_items': valid_items,
        'notes': notes,
    }
    checkout_json = json.dumps(checkout_payload)
    order_num = f"#GB-{secrets.randbelow(900000) + 100000}"

    order_id = execute_db("""
        INSERT INTO orders (
            order_number, user_id, company_id, service_name,
            price, vat, total, status, notes, payment_mode,
            owner_name, owner_form_email,
            checkout_form_json, is_draft, current_step,
            created_by_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 5, ?, datetime('now'));
    """, (
        order_num, client_id, company_id, service_name,
        price, vat, total, status, notes, payment_mode,
        owner_name, owner_email,
        checkout_json,
        (actor or {}).get('id') if (actor or {}).get('role') in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF') else None,
    ))

    for idx, item in enumerate(valid_items):
        unit = float(item.get('price') or 0)
        execute_db("""
            INSERT INTO order_line_items (
                order_id, product_name, category_name, quantity, unit_price, line_total, sort_order
            ) VALUES (?, ?, ?, 1, ?, ?, ?);
        """, (order_id, item['product_name'], item.get('category_name'), unit, unit, idx))

    from services.notification_service import notify_staff
    notify_staff(
        'New CRM order',
        f"Order {order_num} for {(client or {}).get('full_name') or 'a customer'} was created.",
        'order_update', '/admin/orders',
        exclude_user_id=(actor or {}).get('id'),
    )

    return {
        'id': order_id,
        'order_id': order_id,
        'order_number': order_num,
        'service_name': service_name,
        'status': status,
        'company_id': company_id,
        'order': {
            'id': order_id,
            'order_number': order_num,
            'service_name': service_name,
            'status': status,
            'company_id': company_id,
        },
    }, None
