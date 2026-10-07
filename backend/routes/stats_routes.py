"""Dashboard Analytics & Overview Routes (/api/stats, /api/admin/stats)
Ported from app.py build_admin_dashboard_payload (net profit = turnover - real order cost).
"""
import datetime
from db import query_db
from utils.response import success_response, error_response
from services.invoice_service import resolve_order_cost
from services.staff_incentives import calculate_staff_incentive_grade

STAFF_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
REVENUE_ROLES = ('SUPER_ADMIN', 'ADMIN')
ACTIVE_ORDER_STATUSES = ('Pending', 'Pending Verification', 'Processing', 'In Progress')
NOT_SOLD = ('Cancelled', 'Refunded')


def _shift_month(year, month, offset):
    month += offset
    while month < 1:
        month += 12
        year -= 1
    while month > 12:
        month -= 12
        year += 1
    return year, month


def _pct(part, whole):
    whole = float(whole or 0)
    if whole <= 0:
        return 0
    return int(round(100.0 * float(part or 0) / whole))


def _calc_trend(current, previous):
    c = float(current or 0)
    p = float(previous or 0)
    if p == 0:
        if c > 0:
            return {'text': '+100%', 'direction': 'up', 'pct': 100}
        return {'text': '0%', 'direction': 'up', 'pct': 0}
    rounded = round(((c - p) / abs(p)) * 100.0, 1)
    if rounded >= 0:
        return {'text': f'+{rounded:g}%', 'direction': 'up', 'pct': rounded}
    return {'text': f'{rounded:g}%', 'direction': 'down', 'pct': rounded}


def _format_activity_time(val):
    if not val:
        return '—'
    try:
        s = str(val).replace('T', ' ').split('.')[0]
        dt = datetime.datetime.fromisoformat(s)
        diff = datetime.datetime.now() - dt
        if diff.days == 0:
            secs = diff.seconds
            if secs < 60:
                return 'Just now'
            if secs < 3600:
                return f"{secs // 60}m ago"
            return f"{secs // 3600}h ago"
        if diff.days == 1:
            return 'Yesterday'
        if diff.days < 7:
            return f"{diff.days}d ago"
        return dt.strftime('%b %d')
    except Exception:
        return str(val)[:10]


def _count(sql, params=()):
    row = query_db(sql, params, one=True)
    return int((row or {}).get('c') or 0)


def _sum(sql, params=()):
    row = query_db(sql, params, one=True)
    return float((row or {}).get('s') or 0)


def _orders_cost(where_sql, params):
    rows = query_db(
        f"""
        SELECT id, service_id, service_name, total, status, cost_price
        FROM orders WHERE {where_sql} AND status NOT IN ('Cancelled', 'Refunded');
        """,
        params,
    ) or []
    return sum(float(resolve_order_cost(r)['cost'] or 0) for r in rows)


def _has_table(name):
    return bool(query_db("SELECT name FROM sqlite_master WHERE type='table' AND name=?;", (name,), one=True))


def _top_performers(month_key):
    performers = []
    staff_rows = query_db(
        """
        SELECT id, full_name, email, role, department FROM users
        WHERE role IN ('STAFF', 'MANAGER', 'ADMIN', 'SUPER_ADMIN') AND status = 'Active'
        ORDER BY full_name ASC;
        """
    ) or []
    for s in staff_rows:
        sid = s['id']
        assigned = _count(
            "SELECT COUNT(*) AS c FROM tasks WHERE assigned_staff_id = ? AND strftime('%Y-%m', created_at) = ?;",
            (sid, month_key))
        completed = _count(
            "SELECT COUNT(*) AS c FROM tasks WHERE assigned_staff_id = ? AND status = 'Completed' "
            "AND strftime('%Y-%m', completed_at) = ?;", (sid, month_key))
        if not assigned and not completed:
            continue
        on_time = _count(
            "SELECT COUNT(*) AS c FROM tasks WHERE assigned_staff_id = ? AND status = 'Completed' "
            "AND strftime('%Y-%m', completed_at) = ? "
            "AND (due_date IS NULL OR date(completed_at) <= date(due_date));", (sid, month_key))
        overdue = _count(
            "SELECT COUNT(*) AS c FROM tasks WHERE assigned_staff_id = ? AND status NOT IN ('Completed', 'Cancelled') "
            "AND due_date IS NOT NULL AND date(due_date) < date('now');", (sid,))
        g = calculate_staff_incentive_grade(completed, assigned, on_time, overdue)
        performers.append({
            'id': sid,
            'full_name': s.get('full_name') or 'Staff',
            'email': s.get('email') or '',
            'role': s.get('role') or 'STAFF',
            'department': s.get('department') or '',
            'grade': g['grade'],
            'grade_label': g['status_label'],
            'completed_count': completed,
            'assigned_count': assigned,
            'sla_rate': g['sla_rate'],
        })
    order = {'A+': 0, 'A': 1, 'B': 2, 'C': 3, 'D': 4}
    performers.sort(key=lambda r: (order.get(r['grade'], 5), -r['completed_count']))
    return performers[:3]


def _build_admin_dashboard(user, month_param):
    today = datetime.date.today()
    can_revenue = user.get('role') in REVENUE_ROLES
    is_all_time = month_param in ('all', 'ALL', 'all_time')

    year, month = today.year, today.month
    if not is_all_time and month_param and month_param not in ('Current', 'current', 'this_month'):
        try:
            parts = month_param.split('-')
            year, month = int(parts[0]), int(parts[1])
        except Exception:
            year, month = today.year, today.month

    next_year, next_month = _shift_month(year, month, 1)
    if is_all_time:
        month_key, month_label = 'all', 'All Time'
        month_clause, month_params = '1=1', ()
        prev_clause, prev_params = None, ()
    else:
        month_key = f'{year:04d}-{month:02d}'
        month_label = datetime.date(year, month, 1).strftime('%B %Y')
        month_start = f'{year:04d}-{month:02d}-01'
        month_clause = 'created_at >= ? AND created_at < ?'
        month_params = (month_start, f'{next_year:04d}-{next_month:02d}-01')
        py, pm = _shift_month(year, month, -1)
        prev_clause = 'created_at >= ? AND created_at < ?'
        prev_params = (f'{py:04d}-{pm:02d}-01', month_start)

    # ── Counts ─────────────────────────────────────────────────
    tot_customers = _count("SELECT COUNT(*) AS c FROM users WHERE role = 'CLIENT';")
    tot_companies = _count(
        "SELECT COUNT(*) AS c FROM companies WHERE COALESCE(status, '') NOT IN ('Dissolved', 'Liquidation', 'Closed');")
    tot_products = (
        _count("SELECT COUNT(*) AS c FROM services WHERE COALESCE(status, 'Active') = 'Active';")
        if _has_table('services') else 0)
    status_in = ','.join('?' for _ in ACTIVE_ORDER_STATUSES)
    tot_orders = _count(f"SELECT COUNT(*) AS c FROM orders WHERE {month_clause};", month_params)
    pending_orders = _count(
        f"SELECT COUNT(*) AS c FROM orders WHERE {month_clause} AND status IN ({status_in});",
        month_params + ACTIVE_ORDER_STATUSES)
    completed_orders = _count(
        f"SELECT COUNT(*) AS c FROM orders WHERE {month_clause} AND status = 'Completed';", month_params)
    open_tickets = (
        _count("SELECT COUNT(*) AS c FROM support_tickets WHERE status IN ('Open', 'In Progress');")
        if _has_table('support_tickets') else 0)
    tot_docs = _count("SELECT COUNT(*) AS c FROM documents;")
    pending_docs = _count(
        "SELECT COUNT(*) AS c FROM documents WHERE status IN ('Pending Review', 'Pending') "
        "OR overall_status IN ('REVIEW_REQUIRED', 'PENDING');")
    staff_count = _count(
        "SELECT COUNT(*) AS c FROM users WHERE role IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF');")
    today_orders = _count("SELECT COUNT(*) AS c FROM orders WHERE date(created_at) = date('now', 'localtime');")
    today_customers = _count(
        "SELECT COUNT(*) AS c FROM users WHERE role = 'CLIENT' AND date(created_at) = date('now', 'localtime');")

    if prev_clause:
        prev_orders = _count(f"SELECT COUNT(*) AS c FROM orders WHERE {prev_clause};", prev_params)
        new_customers = _count(
            f"SELECT COUNT(*) AS c FROM users WHERE role = 'CLIENT' AND {month_clause};", month_params)
        prev_new_customers = _count(
            f"SELECT COUNT(*) AS c FROM users WHERE role = 'CLIENT' AND {prev_clause};", prev_params)
        sales_trend = _calc_trend(tot_orders, prev_orders)
        customers_trend = _calc_trend(new_customers, prev_new_customers)
    else:  # all time has no previous period → no trend (frontend hides it)
        sales_trend = customers_trend = None

    stats = {
        'total_customers': tot_customers,
        'total_companies': tot_companies,
        'total_products': tot_products,
        'total_orders': tot_orders,
        'pending_orders': pending_orders,
        'completed_orders': completed_orders,
        'open_tickets': open_tickets,
        'total_documents': tot_docs,
        'pending_documents': pending_docs,
        'staff_count': staff_count,
        'today_orders': today_orders,
        'today_customers': today_customers,
        'month_orders': tot_orders,
        'completion_rate': _pct(completed_orders, tot_orders),
        'pending_rate': _pct(pending_orders, tot_orders),
        'month': month_key,
        'month_label': month_label,
        'sales_trend': sales_trend,
        'customers_trend': customers_trend,
    }

    # ── Money (only SUPER_ADMIN / ADMIN) ───────────────────────
    if can_revenue:
        completed_revenue = _sum(
            f"SELECT COALESCE(SUM(total), 0) AS s FROM orders WHERE {month_clause} AND status = 'Completed';",
            month_params)
        turnover = _sum(
            f"SELECT COALESCE(SUM(total), 0) AS s FROM orders WHERE {month_clause} "
            "AND status NOT IN ('Cancelled', 'Refunded');", month_params)
        total_cost = _orders_cost(month_clause, month_params)
        net_profit = round(turnover - total_cost, 2)
        pending_payments = _sum("SELECT COALESCE(SUM(total), 0) AS s FROM invoices WHERE status = 'Pending';")

        if prev_clause:
            prev_rev = _sum(
                f"SELECT COALESCE(SUM(total), 0) AS s FROM orders WHERE {prev_clause} AND status = 'Completed';",
                prev_params)
            prev_turnover = _sum(
                f"SELECT COALESCE(SUM(total), 0) AS s FROM orders WHERE {prev_clause} "
                "AND status NOT IN ('Cancelled', 'Refunded');", prev_params)
            prev_profit = round(prev_turnover - _orders_cost(prev_clause, prev_params), 2)
            stats['revenue_trend'] = _calc_trend(completed_revenue, prev_rev)
            stats['turnover_trend'] = _calc_trend(turnover, prev_turnover)
            stats['profit_trend'] = _calc_trend(net_profit, prev_profit)
        else:
            stats['revenue_trend'] = stats['turnover_trend'] = stats['profit_trend'] = None

        stats.update({
            'total_revenue': f"£{completed_revenue:,.2f}",
            'total_revenue_raw': round(completed_revenue, 2),
            'total_turnover': round(turnover, 2),
            'total_turnover_display': f"£{turnover:,.2f}",
            'total_cost': round(total_cost, 2),
            'net_profit': net_profit,
            'net_profit_display': f"£{net_profit:,.2f}",
            'pending_payments': f"£{pending_payments:,.2f}",
        })

    # ── Charts ─────────────────────────────────────────────────
    rev_expr = "COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled', 'Refunded') THEN total ELSE 0 END), 0)"
    charts = {'orders_daily': [], 'orders_weekly': [], 'orders_yearly': [], 'monthly': []}

    if not is_all_time:
        rows = query_db(
            f"""SELECT CAST(strftime('%d', created_at) AS INTEGER) AS day_n, COUNT(*) AS cnt, {rev_expr} AS rev
                FROM orders WHERE {month_clause} GROUP BY strftime('%d', created_at) ORDER BY day_n;""",
            month_params) or []
        by_day = {int(r['day_n']): r for r in rows if r.get('day_n')}
        if year == today.year and month == today.month:
            last_day = today.day
        else:
            last_day = (datetime.date(next_year, next_month, 1) - datetime.timedelta(days=1)).day
        charts['orders_daily'] = [
            {'label': str(d), 'cnt': int((by_day.get(d) or {}).get('cnt') or 0),
             'revenue': round(float((by_day.get(d) or {}).get('rev') or 0), 2)}
            for d in range(1, last_day + 1)]
    else:
        rows = query_db(
            f"""SELECT date(created_at) AS d, COUNT(*) AS cnt, {rev_expr} AS rev FROM orders
                WHERE date(created_at) >= date('now', 'localtime', '-29 days')
                GROUP BY date(created_at) ORDER BY d;""") or []
        by_d = {str(r['d']): r for r in rows if r.get('d')}
        for off in range(29, -1, -1):
            day = today - datetime.timedelta(days=off)
            r = by_d.get(day.isoformat()) or {}
            charts['orders_daily'].append(
                {'label': str(day.day), 'cnt': int(r.get('cnt') or 0), 'revenue': round(float(r.get('rev') or 0), 2)})

    rows = query_db(
        f"""SELECT date(created_at) AS d, COUNT(*) AS cnt, {rev_expr} AS rev FROM orders
            WHERE date(created_at) >= date('now', 'localtime', '-6 days')
            GROUP BY date(created_at) ORDER BY d;""") or []
    by_d = {str(r['d']): r for r in rows if r.get('d')}
    for off in range(6, -1, -1):
        day = today - datetime.timedelta(days=off)
        r = by_d.get(day.isoformat()) or {}
        charts['orders_weekly'].append(
            {'label': day.strftime('%a'), 'cnt': int(r.get('cnt') or 0), 'revenue': round(float(r.get('rev') or 0), 2)})

    rows = query_db(
        f"""SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS cnt, {rev_expr} AS rev
            FROM orders GROUP BY strftime('%Y-%m', created_at);""") or []
    by_m = {str(r['month']): r for r in rows if r.get('month')}
    for off in range(11, -1, -1):
        y, m = _shift_month(year, month, -off)
        r = by_m.get(f'{y:04d}-{m:02d}') or {}
        charts['orders_yearly'].append(
            {'label': datetime.date(y, m, 1).strftime('%b %y'), 'cnt': int(r.get('cnt') or 0),
             'revenue': round(float(r.get('rev') or 0), 2)})
    # last 6 months ending at the selected month (old app's `monthly` series)
    for off in range(5, -1, -1):
        y, m = _shift_month(year, month, -off)
        r = by_m.get(f'{y:04d}-{m:02d}') or {}
        charts['monthly'].append(
            {'month': f'{y:04d}-{m:02d}', 'label': datetime.date(y, m, 1).strftime('%b %Y'),
             'cnt': int(r.get('cnt') or 0), 'rev': round(float(r.get('rev') or 0), 2)})

    online_sql = (
        "(payment_mode IN ('Website Charge', 'Credit Card (Stripe)') "
        "OR lower(COALESCE(payment_mode, '')) LIKE '%stripe%' OR lower(COALESCE(payment_mode, '')) LIKE '%card%')")
    trend = []
    for off in range(7, -1, -1):
        end_d = today - datetime.timedelta(days=off * 7)
        start_d = end_d - datetime.timedelta(days=6)
        base = ("SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS rev FROM orders "
                "WHERE date(created_at) >= date(?) AND date(created_at) <= date(?) "
                "AND status NOT IN ('Cancelled', 'Refunded') AND ")
        args = (start_d.isoformat(), end_d.isoformat())
        on = query_db(base + online_sql, args, one=True) or {}
        off_row = query_db(base + f"NOT {online_sql}", args, one=True) or {}
        trend.append({
            'week': f"Week {8 - off}",
            'online': int(on.get('cnt') or 0), 'offline': int(off_row.get('cnt') or 0),
            'online_rev': round(float(on.get('rev') or 0), 2), 'offline_rev': round(float(off_row.get('rev') or 0), 2),
        })
    charts['sales_trend'] = trend

    mix = query_db(
        f"""SELECT COALESCE(NULLIF(trim(service_name), ''), 'Other') AS label, COUNT(*) AS cnt FROM orders
            WHERE {month_clause} AND status NOT IN ('Cancelled', 'Refunded')
            GROUP BY COALESCE(NULLIF(trim(service_name), ''), 'Other') ORDER BY cnt DESC LIMIT 5;""",
        month_params) or []
    charts['sales_mix'] = [{'label': str(r['label']), 'cnt': int(r['cnt'] or 0)} for r in mix]

    total_mix = sum(int(r['cnt'] or 0) for r in mix) or 1
    breakdown = [
        {'key': f'service_{i}', 'label': str(r['label']), 'value': int(r['cnt'] or 0),
         'pct': _pct(r['cnt'], total_mix)} for i, r in enumerate(mix)]
    if not breakdown:
        top = max(tot_customers, tot_companies, tot_orders, 1)
        breakdown = [
            {'key': 'customers', 'label': 'Clients', 'value': tot_customers, 'pct': _pct(tot_customers, top)},
            {'key': 'companies', 'label': 'Companies', 'value': tot_companies, 'pct': _pct(tot_companies, top)},
            {'key': 'orders', 'label': 'Orders', 'value': tot_orders, 'pct': _pct(tot_orders, top)},
        ]

    rings = [
        {'key': 'completed', 'label': 'Completed', 'pct': stats['completion_rate'], 'value': completed_orders},
        {'key': 'pending', 'label': 'In progress', 'pct': stats['pending_rate'], 'value': pending_orders},
        {'key': 'documents', 'label': 'Documents', 'value': tot_docs,
         'pct': _pct(tot_docs - pending_docs, tot_docs) if tot_docs else 0},
        {'key': 'companies', 'label': 'Companies', 'value': tot_companies,
         'pct': min(100, _pct(tot_companies, max(tot_customers, 1) * 2))},
    ]
    ops = {
        'grade': stats['completion_rate'], 'pending_orders': pending_orders, 'open_tickets': open_tickets,
        'pending_documents': pending_docs, 'gauge_value': pending_orders + open_tickets, 'gauge_label': 'Open work',
    }
    if can_revenue:
        ops['revenue'] = stats['total_revenue']

    # ── Activity feed (latest orders, then new clients) ────────
    activity = []
    for r in query_db(
        """SELECT o.id, o.order_number, o.service_name, o.status, o.created_at, u.full_name AS client_name
           FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 4;""") or []:
        activity.append({
            'kind': 'order', 'title': r.get('service_name') or 'New order',
            'subtitle': f"Order {r.get('order_number') or r.get('id')} · {r.get('status') or 'Pending'}",
            'meta_time': _format_activity_time(r.get('created_at')), 'meta_tag': 'Order',
            'meta_user': r.get('client_name') or 'Client', 'view': 'orders'})
    if len(activity) < 4:
        for r in query_db(
            "SELECT id, full_name, email, created_at FROM users WHERE role = 'CLIENT' "
            "ORDER BY created_at DESC LIMIT 4;") or []:
            if len(activity) >= 4:
                break
            activity.append({
                'kind': 'customer', 'title': f"New client {r.get('full_name') or 'Customer'}",
                'subtitle': r.get('email') or 'Client account created',
                'meta_time': _format_activity_time(r.get('created_at')), 'meta_tag': 'Client',
                'meta_user': r.get('full_name') or 'Staff', 'view': 'customers'})

    recent_orders = query_db(
        """SELECT o.id, o.order_number, o.service_name, o.total AS amount, o.status, o.created_at,
                  u.full_name AS client_name
           FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT 5;""") or []
    if not can_revenue:
        for r in recent_orders:
            r.pop('amount', None)

    month_options = []
    for off in range(0, 12):
        y, m = _shift_month(today.year, today.month, -off)
        month_options.append({'value': f'{y:04d}-{m:02d}', 'label': datetime.date(y, m, 1).strftime('%B %Y')})

    if not can_revenue:  # hide money from staff without revenue access
        for series in (charts['orders_daily'], charts['orders_weekly'], charts['orders_yearly']):
            for p in series:
                p['revenue'] = 0
        for p in charts['monthly']:
            p['rev'] = 0
        for p in charts['sales_trend']:
            p['online_rev'] = p['offline_rev'] = 0

    return {
        'status': 'success', 'success': True,
        'stats': stats, 'metrics': stats, 'charts': charts, 'breakdown': breakdown, 'rings': rings, 'ops': ops,
        'activity': activity[:4], 'top_performers': _top_performers(month_key if not is_all_time else
                                                                    f'{today.year:04d}-{today.month:02d}'),
        'month': month_key, 'month_label': month_label, 'month_options': month_options,
        'can_view_revenue': can_revenue, 'recent_orders': recent_orders,
    }


def handle_stats_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/stats and /api/admin/stats endpoints."""
    if not (path.startswith('/api/stats') or path.startswith('/api/admin/stats')):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_id = user.get('id')
    is_staff = user.get('role', 'CLIENT') in STAFF_ROLES

    if path in ('/api/stats', '/api/stats/overview', '/api/admin/stats') and method == 'GET':
        if is_staff:
            month_param = query.get('month', [None])[0] if query else None
            return success_response(start_response, data=_build_admin_dashboard(user, month_param))

        if path == '/api/admin/stats':
            return error_response(start_response, "Insufficient permissions", status_code=403)

        # Client dashboard metrics
        total_companies = _count("SELECT COUNT(*) AS c FROM companies WHERE user_id = ?;", (user_id,))
        my_orders = _count("SELECT COUNT(*) AS c FROM orders WHERE user_id = ?;", (user_id,))
        my_invoices = _count("SELECT COUNT(*) AS c FROM invoices WHERE user_id = ?;", (user_id,))
        recent_orders = query_db(
            """SELECT id, order_number, service_name, total AS amount, status, created_at
               FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 5;""", (user_id,))
        counts = {"total_companies": total_companies, "total_orders": my_orders, "total_invoices": my_invoices}
        return success_response(start_response, data={
            "status": "success", "success": True, "metrics": counts, "stats": counts,
            "recent_orders": [dict(r) for r in recent_orders],
        })

    return None
