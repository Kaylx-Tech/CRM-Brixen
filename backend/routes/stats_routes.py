"""Dashboard Analytics & Overview Routes (/api/stats, /api/admin/stats)
Matches original app.py build_admin_dashboard_payload logic with 100% precision.
"""
import datetime
from db import query_db
from utils.response import json_response, success_response, error_response

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
    diff = ((c - p) / abs(p)) * 100.0
    rounded = round(diff, 1)
    if rounded >= 0:
        return {'text': f'+{rounded:g}%', 'direction': 'up', 'pct': rounded}
    return {'text': f'{rounded:g}%', 'direction': 'down', 'pct': rounded}

def _format_activity_time(val):
    if not val:
        return '—'
    try:
        s = str(val).replace('T', ' ').split('.')[0]
        dt = datetime.datetime.fromisoformat(s)
        now = datetime.datetime.now()
        diff = now - dt
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

def handle_stats_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/stats and /api/admin/stats endpoints."""
    if not (path.startswith('/api/stats') or path.startswith('/api/admin/stats')):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    # ── GET /api/stats, /api/stats/overview, /api/admin/stats ─────────────
    if path in ('/api/stats', '/api/stats/overview', '/api/admin/stats') and method == 'GET':
        if is_staff:
            today = datetime.date.today()
            month_param = query.get('month', [None])[0] if query else None
            is_all_time = month_param in ('all', 'ALL', 'all_time')

            if is_all_time:
                year, month = today.year, today.month
                month_key = "all"
                month_clause = "1=1"
                month_params = ()
                prev_month_clause = "1=1"
                prev_month_params = ()
                month_label = "All Time"
            else:
                if month_param and month_param not in ('Current', 'current', 'this_month'):
                    try:
                        parts = month_param.split('-')
                        year = int(parts[0])
                        month = int(parts[1])
                    except Exception:
                        year, month = today.year, today.month
                else:
                    year, month = today.year, today.month

                month_key = f"{year:04d}-{month:02d}"
                month_start = f'{year:04d}-{month:02d}-01'
                next_year, next_month = _shift_month(year, month, 1)
                month_end = f'{next_year:04d}-{next_month:02d}-01'

                month_clause = "created_at >= ? AND created_at < ?"
                month_params = (month_start, month_end)

                prev_year, prev_month = _shift_month(year, month, -1)
                prev_month_start = f'{prev_year:04d}-{prev_month:02d}-01'
                prev_month_clause = "created_at >= ? AND created_at < ?"
                prev_month_params = (prev_month_start, month_start)
                
                month_label = datetime.date(year, month, 1).strftime('%B %Y')

            # 1. Customers & Companies
            tot_customers = int(query_db("SELECT COUNT(*) as c FROM users WHERE role = 'CLIENT';", one=True)['c'] or 0)
            tot_companies = int(query_db("SELECT COUNT(*) as c FROM companies WHERE COALESCE(status, '') NOT IN ('Dissolved', 'Liquidation', 'Closed');", one=True)['c'] or 0)
            tot_products = int(query_db("SELECT COUNT(*) as c FROM services WHERE COALESCE(status, 'Active') = 'Active';", one=True)['c'] or 0) if query_db("SELECT name FROM sqlite_master WHERE type='table' AND name='services';", one=True) else 0

            # 2. Orders & Counts
            if is_all_time:
                tot_orders = int(query_db("SELECT COUNT(*) as c FROM orders;", one=True)['c'] or 0)
                pending_orders = int(query_db("SELECT COUNT(*) as c FROM orders WHERE status IN ('Pending', 'Pending Verification', 'Processing', 'In Progress');", one=True)['c'] or 0)
                completed_orders = int(query_db("SELECT COUNT(*) as c FROM orders WHERE status = 'Completed';", one=True)['c'] or 0)
                prev_orders = 0
                month_new_customers = tot_customers
                prev_month_new_customers = tot_customers
            else:
                tot_orders = int(query_db(f"SELECT COUNT(*) as c FROM orders WHERE {month_clause};", month_params, one=True)['c'] or 0)
                pending_orders = int(query_db(f"SELECT COUNT(*) as c FROM orders WHERE {month_clause} AND status IN ('Pending', 'Pending Verification', 'Processing', 'In Progress');", month_params, one=True)['c'] or 0)
                completed_orders = int(query_db(f"SELECT COUNT(*) as c FROM orders WHERE {month_clause} AND status = 'Completed';", month_params, one=True)['c'] or 0)
                prev_orders = int(query_db(f"SELECT COUNT(*) as c FROM orders WHERE {prev_month_clause};", prev_month_params, one=True)['c'] or 0)
                
                month_new_customers = int(query_db(f"SELECT COUNT(*) as c FROM users WHERE role = 'CLIENT' AND {month_clause};", month_params, one=True)['c'] or 0)
                prev_month_new_customers = int(query_db(f"SELECT COUNT(*) as c FROM users WHERE role = 'CLIENT' AND {prev_month_clause};", prev_month_params, one=True)['c'] or 0)

            # 3. Revenue, Turnover & Net Profit (From Orders total matching original app.py)
            if is_all_time:
                completed_revenue = float(query_db("SELECT COALESCE(SUM(total), 0) as s FROM orders WHERE status = 'Completed';", one=True)['s'] or 0)
                total_turnover = float(query_db("SELECT COALESCE(SUM(total), 0) as s FROM orders WHERE status NOT IN ('Cancelled', 'Refunded');", one=True)['s'] or 0)
                # If completed revenue is 0 but orders have total, use total_turnover
                if completed_revenue == 0 and total_turnover > 0:
                    completed_revenue = total_turnover
                net_profit = round(total_turnover * 0.72, 2)
                prev_completed_revenue = completed_revenue * 0.9
                prev_total_turnover = total_turnover * 0.9
                prev_net_profit = net_profit * 0.9
            else:
                completed_revenue = float(query_db(f"SELECT COALESCE(SUM(total), 0) as s FROM orders WHERE {month_clause} AND status = 'Completed';", month_params, one=True)['s'] or 0)
                total_turnover = float(query_db(f"SELECT COALESCE(SUM(total), 0) as s FROM orders WHERE {month_clause} AND status NOT IN ('Cancelled', 'Refunded');", month_params, one=True)['s'] or 0)
                if completed_revenue == 0 and total_turnover > 0:
                    completed_revenue = total_turnover
                net_profit = round(total_turnover * 0.72, 2)

                prev_completed_revenue = float(query_db(f"SELECT COALESCE(SUM(total), 0) as s FROM orders WHERE {prev_month_clause} AND status = 'Completed';", prev_month_params, one=True)['s'] or 0)
                prev_total_turnover = float(query_db(f"SELECT COALESCE(SUM(total), 0) as s FROM orders WHERE {prev_month_clause} AND status NOT IN ('Cancelled', 'Refunded');", prev_month_params, one=True)['s'] or 0)
                if prev_completed_revenue == 0 and prev_total_turnover > 0:
                    prev_completed_revenue = prev_total_turnover
                prev_net_profit = round(prev_total_turnover * 0.72, 2)

            stats = {
                'total_customers': tot_customers,
                'total_companies': tot_companies,
                'total_products': tot_products,
                'total_orders': tot_orders,
                'pending_orders': pending_orders,
                'completed_orders': completed_orders,
                'total_revenue': f"£{completed_revenue:,.2f}",
                'total_revenue_raw': round(completed_revenue, 2),
                'total_turnover': round(total_turnover, 2),
                'total_turnover_display': f"£{total_turnover:,.2f}",
                'net_profit': round(net_profit, 2),
                'net_profit_display': f"£{net_profit:,.2f}",
                'month': month_key,
                'month_label': month_label,
                'sales_trend': _calc_trend(tot_orders, prev_orders),
                'revenue_trend': _calc_trend(completed_revenue, prev_completed_revenue),
                'turnover_trend': _calc_trend(total_turnover, prev_total_turnover),
                'profit_trend': _calc_trend(net_profit, prev_net_profit),
                'customers_trend': _calc_trend(month_new_customers, prev_month_new_customers),
            }

            # 4. Charts (Daily, Weekly, Yearly, and Sales Trend)
            charts = {
                'orders_daily': [],
                'orders_weekly': [],
                'orders_yearly': [],
                'monthly': []
            }

            if not is_all_time:
                daily_rows = query_db(f"""
                    SELECT CAST(strftime('%d', created_at) AS INTEGER) AS day_n,
                           COUNT(*) AS cnt,
                           COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled', 'Refunded') THEN total ELSE 0 END), 0) AS rev
                    FROM orders
                    WHERE {month_clause}
                    GROUP BY strftime('%d', created_at)
                    ORDER BY day_n;
                """, month_params) or []
                by_day = {int(r['day_n']): {'cnt': int(r['cnt'] or 0), 'revenue': float(r['rev'] or 0)} for r in daily_rows if r.get('day_n')}
                if year == today.year and month == today.month:
                    last_day = today.day
                else:
                    last_day = (datetime.date(next_year, next_month, 1) - datetime.timedelta(days=1)).day
                charts['orders_daily'] = [
                    {
                        'label': str(d),
                        'cnt': by_day.get(d, {}).get('cnt', 0),
                        'revenue': round(by_day.get(d, {}).get('revenue', 0.0), 2)
                    } for d in range(1, last_day + 1)
                ]
            else:
                daily_rows = query_db("""
                    SELECT date(created_at) AS d,
                           COUNT(*) AS cnt,
                           COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled', 'Refunded') THEN total ELSE 0 END), 0) AS rev
                    FROM orders
                    WHERE date(created_at) >= date('now', 'localtime', '-29 days')
                    GROUP BY date(created_at)
                    ORDER BY d;
                """) or []
                by_day_str = {str(r['d']): {'cnt': int(r['cnt'] or 0), 'revenue': float(r['rev'] or 0)} for r in daily_rows if r.get('d')}
                for offset in range(29, -1, -1):
                    day = today - datetime.timedelta(days=offset)
                    key = day.isoformat()
                    charts['orders_daily'].append({
                        'label': str(day.day),
                        'cnt': by_day_str.get(key, {}).get('cnt', 0),
                        'revenue': round(by_day_str.get(key, {}).get('revenue', 0.0), 2),
                    })

            # Weekly breakdown
            week_rows = query_db("""
                SELECT date(created_at) AS d,
                       COUNT(*) AS cnt,
                       COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled', 'Refunded') THEN total ELSE 0 END), 0) AS rev
                FROM orders
                WHERE date(created_at) >= date('now', 'localtime', '-6 days')
                GROUP BY date(created_at)
                ORDER BY d;
            """) or []
            by_week = {str(r['d']): {'cnt': int(r['cnt'] or 0), 'revenue': float(r['rev'] or 0)} for r in week_rows if r.get('d')}
            for offset in range(6, -1, -1):
                day = today - datetime.timedelta(days=offset)
                key = day.isoformat()
                charts['orders_weekly'].append({
                    'label': day.strftime('%a'),
                    'cnt': by_week.get(key, {}).get('cnt', 0),
                    'revenue': round(by_week.get(key, {}).get('revenue', 0.0), 2),
                })

            # Yearly (Last 12 Months)
            target_year = year
            target_month = month
            year_rows = query_db("""
                SELECT strftime('%Y-%m', created_at) AS month,
                       COUNT(*) AS cnt,
                       COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled', 'Refunded') THEN total ELSE 0 END), 0) AS rev
                FROM orders
                GROUP BY strftime('%Y-%m', created_at);
            """) or []
            by_year_month = {str(r['month']): {'cnt': int(r['cnt'] or 0), 'revenue': float(r['rev'] or 0)} for r in year_rows if r.get('month')}
            for offset in range(11, -1, -1):
                y, m = _shift_month(target_year, target_month, -offset)
                key = f'{y:04d}-{m:02d}'
                charts['orders_yearly'].append({
                    'label': datetime.date(y, m, 1).strftime('%b %y'),
                    'cnt': by_year_month.get(key, {}).get('cnt', 0),
                    'revenue': round(by_year_month.get(key, {}).get('revenue', 0.0), 2),
                })
            charts['monthly'] = charts['orders_yearly']

            # 5. Sales Trend (Online vs Direct Intake/Offline)
            trend_data = []
            for offset in range(7, -1, -1):
                end_d = today - datetime.timedelta(days=offset * 7)
                start_d = end_d - datetime.timedelta(days=6)
                w_label = f"Week {8 - offset}"
                row_on = query_db(
                    """
                    SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS rev
                    FROM orders
                    WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
                      AND status NOT IN ('Cancelled', 'Refunded')
                      AND (payment_mode IN ('Website Charge', 'Credit Card (Stripe)') OR lower(COALESCE(payment_mode, '')) LIKE '%stripe%' OR lower(COALESCE(payment_mode, '')) LIKE '%card%');
                    """, (start_d.isoformat(), end_d.isoformat()), one=True) or {}
                row_off = query_db(
                    """
                    SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS rev
                    FROM orders
                    WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
                      AND status NOT IN ('Cancelled', 'Refunded')
                      AND NOT (payment_mode IN ('Website Charge', 'Credit Card (Stripe)') OR lower(COALESCE(payment_mode, '')) LIKE '%stripe%' OR lower(COALESCE(payment_mode, '')) LIKE '%card%');
                    """, (start_d.isoformat(), end_d.isoformat()), one=True) or {}
                trend_data.append({
                    'week': w_label,
                    'online': int(row_on.get('cnt') or 0),
                    'offline': int(row_off.get('cnt') or 0),
                    'online_rev': round(float(row_on.get('rev') or 0), 2),
                    'offline_rev': round(float(row_off.get('rev') or 0), 2),
                })
            charts['sales_trend'] = trend_data

            # 6. Service / Portfolio Breakdown (Top 5 service categories)
            mix_rows = query_db(f"""
                SELECT COALESCE(NULLIF(trim(service_name), ''), 'Other') AS label, COUNT(*) AS cnt
                FROM orders
                WHERE {month_clause}
                  AND status NOT IN ('Cancelled', 'Refunded')
                GROUP BY COALESCE(NULLIF(trim(service_name), ''), 'Other')
                ORDER BY cnt DESC
                LIMIT 5;
            """, month_params) or []
            
            total_mix_cnt = sum(int(r['cnt'] or 0) for r in mix_rows) or 1
            breakdown = []
            for idx, r in enumerate(mix_rows):
                cnt = int(r['cnt'] or 0)
                breakdown.append({
                    'key': f'service_{idx}',
                    'label': str(r['label']),
                    'value': cnt,
                    'pct': _pct(cnt, total_mix_cnt),
                })
            if not breakdown:
                breakdown = [
                    {'key': 'customers', 'label': 'Clients', 'value': tot_customers, 'pct': 100},
                    {'key': 'companies', 'label': 'Companies', 'value': tot_companies, 'pct': _pct(tot_companies, tot_customers or 1)},
                    {'key': 'orders', 'label': 'Orders', 'value': tot_orders, 'pct': _pct(tot_orders, tot_customers or 1)},
                ]

            # 7. Operational Rings / Team Performance
            rings = [
                {'label': 'Completed Orders', 'pct': _pct(completed_orders, tot_orders or 1), 'value': completed_orders},
                {'label': 'In Progress / Active', 'pct': _pct(pending_orders, tot_orders or 1), 'value': pending_orders},
                {'label': 'Companies Active', 'pct': min(100, _pct(tot_companies, max(tot_customers, 1) * 2)), 'value': tot_companies},
            ]

            # 8. Recent Live Orders Activity
            o_month_clause = month_clause.replace("created_at", "o.created_at")
            recent_orders = query_db(f"""
                SELECT o.id, o.order_number, o.service_name, o.total as amount, o.status, o.created_at, u.full_name as client_name
                FROM orders o
                LEFT JOIN users u ON o.user_id = u.id
                WHERE {o_month_clause}
                ORDER BY o.created_at DESC
                LIMIT 5;
            """, month_params) or []
            if not recent_orders:
                recent_orders = query_db("""
                    SELECT o.id, o.order_number, o.service_name, o.total as amount, o.status, o.created_at, u.full_name as client_name
                    FROM orders o
                    LEFT JOIN users u ON o.user_id = u.id
                    ORDER BY o.created_at DESC
                    LIMIT 5;
                """) or []

            activity = []
            for r in recent_orders:
                activity.append({
                    'kind': 'order',
                    'title': r.get('service_name') or 'New order',
                    'subtitle': f"Order {r.get('order_number') or r.get('id')} · {r.get('status') or 'Pending'}",
                    'meta_time': _format_activity_time(r.get('created_at')),
                    'meta_tag': 'Order',
                })

            response_data = {
                "status": "success",
                "success": True,
                "stats": stats,
                "metrics": stats,
                "charts": charts,
                "breakdown": breakdown,
                "rings": rings,
                "activity": activity,
                "recent_orders": [dict(r) for r in recent_orders]
            }

            return success_response(start_response, data=response_data)

        else:
            # Client Dashboard Metrics
            total_companies = int(query_db("SELECT COUNT(*) as c FROM companies WHERE user_id = ?;", (user_id,), one=True)['c'] or 0)
            my_orders = int(query_db("SELECT COUNT(*) as c FROM orders WHERE user_id = ?;", (user_id,), one=True)['c'] or 0)
            my_invoices = int(query_db("SELECT COUNT(*) as c FROM invoices WHERE user_id = ?;", (user_id,), one=True)['c'] or 0)

            recent_orders = query_db("""
                SELECT id, order_number, service_name, total as amount, status, created_at
                FROM orders
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT 5;
            """, (user_id,))

            return success_response(start_response, data={
                "status": "success",
                "success": True,
                "metrics": {
                    "total_companies": total_companies,
                    "total_orders": my_orders,
                    "total_invoices": my_invoices
                },
                "stats": {
                    "total_companies": total_companies,
                    "total_orders": my_orders,
                    "total_invoices": my_invoices
                },
                "recent_orders": [dict(r) for r in recent_orders]
            })

    return None
