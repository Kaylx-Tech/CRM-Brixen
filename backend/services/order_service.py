"""Admin order list helpers — aligned with app.py /api/admin/orders."""
from __future__ import annotations

import calendar
import datetime
from db import query_db
from services.invoice_service import attach_order_profit_fields


def _qs_first(query, key, default=''):
    return (query.get(key) or [default])[0].strip() if isinstance(query.get(key), list) else str(query.get(key) or default).strip()


def resolve_admin_order_dates(query):
    today = datetime.date.today()
    preset = _qs_first(query, 'date_preset')
    date_from = _qs_first(query, 'date_from')
    date_to = _qs_first(query, 'date_to')
    month = _qs_first(query, 'month')
    year = _qs_first(query, 'year')

    if preset == 'today':
        return str(today), str(today)
    if preset == 'yesterday':
        day = today - datetime.timedelta(days=1)
        return str(day), str(day)
    if preset == 'this_week':
        start = today - datetime.timedelta(days=today.weekday())
        return str(start), str(today)
    if preset == 'this_month':
        return f"{today.year:04d}-{today.month:02d}-01", str(today)
    if preset == 'last_month':
        first_this = today.replace(day=1)
        last_end = first_this - datetime.timedelta(days=1)
        return f"{last_end.year:04d}-{last_end.month:02d}-01", str(last_end)
    if preset == 'this_year':
        return f"{today.year:04d}-01-01", str(today)
    if month and month not in ('all', 'All', ''):
        try:
            if '-' in month:
                y_str, m_str = month.split('-', 1)
                y, m = int(y_str), int(m_str)
            else:
                m = int(month)
                y = int(year) if year else today.year
            last = calendar.monthrange(y, m)[1]
            return f"{y:04d}-{m:02d}-01", f"{y:04d}-{m:02d}-{last:02d}"
        except ValueError:
            return None, None
    if date_from or date_to:
        return (date_from or None), (date_to or None)
    return None, None


def build_admin_order_list(user, query):
    """Return dict with orders, pagination, stats, facets (app.py shape inside data)."""
    user_role = (user or {}).get('role', 'CLIENT')
    user_id = (user or {}).get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    # Draft wizard rows stay out of the orders board until submitted (as in app.py)
    clauses = ["COALESCE(o.is_draft, 0) = 0"]
    params = []

    if not is_staff:
        clauses.append("o.user_id = ?")
        params.append(user_id)
    # Team members (STAFF) only see the orders they added themselves
    own_only = user_role == 'STAFF'
    if own_only:
        clauses.append("o.created_by_id = ?")
        params.append(user_id)

    # Admins can filter by the team member who added the order ("website" = not added in the CRM,
    # "b2b" = placed by a B2B customer in their portal)
    b2b_portal_sql = ("(o.created_by_id IS NULL AND COALESCE(o.woocommerce_order_id, '') = '' "
                      "AND (COALESCE(u.is_b2b, 0) = 1 OR COALESCE(u.client_type, '') = 'B2B'))")
    created_by = _qs_first(query, 'created_by')
    if created_by and not own_only:
        if created_by == 'website':
            clauses.append(f"o.created_by_id IS NULL AND NOT {b2b_portal_sql}")
        elif created_by == 'b2b':
            clauses.append(b2b_portal_sql)
        else:
            try:
                clauses.append("o.created_by_id = ?")
                params.append(int(created_by))
            except ValueError:
                clauses.pop()

    search = _qs_first(query, 'search')
    if search:
        clauses.append("""(
            o.order_number LIKE ? OR o.service_name LIKE ? OR u.full_name LIKE ?
            OR u.email LIKE ? OR IFNULL(c.name, '') LIKE ? OR o.owner_name LIKE ?
            OR o.owner_form_email LIKE ?
        )""")
        term = f"%{search}%"
        params.extend([term] * 7)

    customer_id = _qs_first(query, 'customer_id')
    if customer_id:
        try:
            clauses.append("o.user_id = ?")
            params.append(int(customer_id))
        except ValueError:
            pass

    company_id = _qs_first(query, 'company_id')
    if company_id:
        try:
            clauses.append("o.company_id = ?")
            params.append(int(company_id))
        except ValueError:
            pass

    client_type = _qs_first(query, 'client_type')
    if client_type == 'B2B':
        clauses.append("(u.is_b2b = 1 OR u.client_type = 'B2B')")
    elif client_type == 'Business':
        clauses.append("(u.client_type = 'Business' AND COALESCE(u.is_b2b, 0) = 0)")
    elif client_type in ('Normal', 'Customer', 'Individual'):
        clauses.append("(COALESCE(u.is_b2b, 0) = 0 AND (u.client_type IS NULL OR u.client_type IN ('', 'Normal', 'Customer', 'Individual')))")

    # The status filter is added last: the stat cards count every status within the other filters
    status_filter = _qs_first(query, 'status')
    status_group = _qs_first(query, 'status_group')
    status_clause, status_params = None, []
    if status_filter and status_filter not in ('all', 'All'):
        status_clause, status_params = "o.status = ?", [status_filter]
    elif status_group == 'pending':
        status_clause = "o.status IN ('Pending', 'Pending Verification')"
    elif status_group == 'in_progress':
        status_clause = "o.status IN ('Processing', 'In Progress')"
    elif status_group == 'completed':
        status_clause = "o.status = 'Completed'"

    product = _qs_first(query, 'product')
    if product:
        clauses.append(
            "(o.service_name = ? OR EXISTS (SELECT 1 FROM order_line_items li WHERE li.order_id = o.id AND li.product_name = ?))"
        )
        params.extend([product, product])

    payment_status = _qs_first(query, 'payment_status')
    if payment_status == 'Unpaid':
        clauses.append("NOT EXISTS (SELECT 1 FROM invoices inv WHERE inv.order_id = o.id AND inv.status = 'Paid')")
    elif payment_status:
        clauses.append("EXISTS (SELECT 1 FROM invoices inv WHERE inv.order_id = o.id AND inv.status = ?)")
        params.append(payment_status)

    payment_mode = _qs_first(query, 'payment_mode')
    if payment_mode:
        clauses.append("o.payment_mode = ?")
        params.append(payment_mode)

    date_from, date_to = resolve_admin_order_dates(query)
    if date_from:
        clauses.append("date(o.created_at) >= date(?)")
        params.append(date_from)
    if date_to:
        clauses.append("date(o.created_at) <= date(?)")
        params.append(date_to)

    stats_where_sql = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    stats_params = list(params)
    if status_clause:
        clauses.append(status_clause)
        params.extend(status_params)
    where_sql = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    from_sql = """
        FROM orders o
        JOIN users u ON o.user_id = u.id
        LEFT JOIN companies c ON o.company_id = c.id
        LEFT JOIN users cb ON o.created_by_id = cb.id
    """

    try:
        page = max(int(_qs_first(query, 'page', '1') or '1'), 1)
    except ValueError:
        page = 1
    try:
        limit = int(_qs_first(query, 'limit', '25') or '25')
    except ValueError:
        limit = 25
    limit = min(max(limit, 1), 200)
    offset = (page - 1) * limit

    total_row = query_db("SELECT COUNT(*) as c " + from_sql + where_sql, params, one=True)
    total_records = int((total_row or {}).get('c') or 0)

    stats_row = query_db("""
        SELECT
            COUNT(*) as total_orders,
            SUM(CASE WHEN o.status IN ('Pending', 'Pending Verification') THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN o.status IN ('Processing', 'In Progress') THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN o.status = 'Completed' THEN 1 ELSE 0 END) as completed,
            COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN o.total ELSE 0 END), 0) as revenue
    """ + from_sql + stats_where_sql, stats_params, one=True) or {}

    rows = query_db("""
        SELECT o.id, o.order_number, o.user_id, o.company_id, o.service_id, o.service_name,
               o.price, o.vat, o.total, o.cost_price, o.status, o.progress_percent, o.payment_mode,
               o.created_at, o.updated_at, o.expected_date,
               o.owner_name, o.owner_form_email,
               u.full_name as client_name, u.email as client_email, u.email as portal_account_email,
               u.is_b2b, u.client_type,
               c.name as company_name, c.company_number,
               o.created_by_id, cb.full_name as created_by_name, cb.role as created_by_role,
               CASE WHEN COALESCE(o.woocommerce_order_id, '') != '' THEN 1 ELSE 0 END as from_website,
               COALESCE(
                   (SELECT GROUP_CONCAT(li.product_name, ', ') FROM order_line_items li WHERE li.order_id = o.id),
                   o.service_name
               ) as products_summary,
               (SELECT li.category_name FROM order_line_items li WHERE li.order_id = o.id
                ORDER BY li.sort_order ASC, li.id ASC LIMIT 1) as category_name,
               (SELECT COUNT(*) FROM order_line_items li WHERE li.order_id = o.id) as line_item_count,
               (SELECT COUNT(*) FROM order_line_items li WHERE li.order_id = o.id
                AND COALESCE(li.fulfillment_status, 'Pending') != 'Cancelled') as line_item_active_count,
               (SELECT COUNT(*) FROM order_line_items li WHERE li.order_id = o.id
                AND li.fulfillment_status = 'Completed') as line_items_completed,
               (SELECT inv.status FROM invoices inv WHERE inv.order_id = o.id
                ORDER BY inv.id DESC LIMIT 1) as payment_status
    """ + from_sql + where_sql + " ORDER BY o.created_at DESC LIMIT ? OFFSET ?;", params + [limit, offset]) or []

    listed = []
    for row in rows:
        item = attach_order_profit_fields(dict(row))
        if not item.get('owner_name'):
            item['owner_name'] = item.get('client_name')
        if not item.get('owner_form_email'):
            item['owner_form_email'] = item.get('client_email')
        listed.append(item)

    products = query_db("""
        SELECT name FROM (
            SELECT DISTINCT o.service_name AS name FROM orders o
            UNION
            SELECT DISTINCT li.product_name AS name FROM order_line_items li
            UNION
            SELECT DISTINCT sv.name AS name FROM services sv
            WHERE COALESCE(sv.status, 'Active') = 'Active'
        ) t WHERE name IS NOT NULL AND TRIM(name) != '' ORDER BY name COLLATE NOCASE;
    """) or []

    # Filter options only come from the orders this user may see
    scope_sql, scope_params = ("AND o.created_by_id = ?", [user_id]) if own_only else ("", [])
    companies = query_db(f"""
        SELECT DISTINCT c.id, c.name
        FROM companies c
        WHERE c.name IS NOT NULL AND TRIM(c.name) != ''
          AND (
            EXISTS (SELECT 1 FROM orders o WHERE o.company_id = c.id {scope_sql})
            OR EXISTS (SELECT 1 FROM orders o WHERE o.user_id = c.user_id {scope_sql})
          )
        ORDER BY c.name COLLATE NOCASE;
    """, scope_params * 2) or []

    customers = query_db(f"""
        SELECT DISTINCT u.id, u.full_name, u.email, u.is_b2b, u.client_type, u.b2b_id
        FROM orders o JOIN users u ON u.id = o.user_id
        WHERE 1 = 1 {scope_sql}
        ORDER BY u.full_name COLLATE NOCASE;
    """, scope_params) or []

    added_by = [] if own_only else (query_db("""
        SELECT DISTINCT cb.id, cb.full_name, cb.role
        FROM orders o JOIN users cb ON cb.id = o.created_by_id
        WHERE COALESCE(o.is_draft, 0) = 0
        ORDER BY cb.full_name COLLATE NOCASE;
    """) or [])

    stats = {
        'total_orders': int(stats_row.get('total_orders') or 0),
        'pending': int(stats_row.get('pending') or 0),
        'in_progress': int(stats_row.get('in_progress') or 0),
        'completed': int(stats_row.get('completed') or 0),
        'revenue': float(stats_row.get('revenue') or 0),
    }

    return {
        'orders': listed,
        'pagination': {
            'page': page,
            'limit': limit,
            'total': total_records,
            'total_pages': (total_records + limit - 1) // limit if limit else 1,
        },
        'stats': stats,
        'facets': {
            'products': [r['name'] for r in products],
            'companies': [{'id': r['id'], 'name': r['name']} for r in companies],
            'customers': [dict(r) for r in customers],
            'added_by': [dict(r) for r in added_by],
        },
    }
