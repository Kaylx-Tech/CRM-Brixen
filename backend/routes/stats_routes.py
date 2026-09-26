"""Dashboard Analytics & Overview Routes (/api/stats)
"""
from db import query_db
from utils.response import json_response, success_response, error_response

def handle_stats_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/stats endpoints."""
    if not path.startswith('/api/stats'):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    # ── GET /api/stats/overview ───────────────────────────────────────────
    if path == '/api/stats/overview' and method == 'GET':
        if is_staff:
            # Staff Global Dashboard Metrics
            total_clients = query_db("SELECT COUNT(*) as c FROM users WHERE role = 'CLIENT';", one=True)['c']
            total_companies = query_db("SELECT COUNT(*) as c FROM companies;", one=True)['c']
            active_orders = query_db("SELECT COUNT(*) as c FROM orders WHERE status IN ('Pending', 'In Progress');", one=True)['c']
            completed_orders = query_db("SELECT COUNT(*) as c FROM orders WHERE status = 'Completed';", one=True)['c']
            
            revenue_row = query_db("SELECT SUM(amount) as rev FROM invoices WHERE status = 'Paid';", one=True)
            total_revenue = float(revenue_row['rev'] or 0)
            
            unpaid_row = query_db("SELECT SUM(amount) as unp FROM invoices WHERE status = 'Unpaid';", one=True)
            unpaid_revenue = float(unpaid_row['unp'] or 0)

            pending_tasks = query_db("SELECT COUNT(*) as c FROM tasks WHERE status != 'Done';", one=True)['c']

            recent_orders = query_db("""
                SELECT o.id, o.order_number, o.service_name, o.total as amount, o.status, o.created_at, u.full_name as client_name
                FROM orders o
                LEFT JOIN users u ON o.user_id = u.id
                ORDER BY o.created_at DESC
                LIMIT 5;
            """)

            return success_response(start_response, data={
                "metrics": {
                    "total_clients": total_clients,
                    "total_companies": total_companies,
                    "active_orders": active_orders,
                    "completed_orders": completed_orders,
                    "total_revenue": total_revenue,
                    "unpaid_revenue": unpaid_revenue,
                    "pending_tasks": pending_tasks
                },
                "recent_orders": [dict(r) for r in recent_orders]
            })
        else:
            # Client Dashboard Metrics
            total_companies = query_db("SELECT COUNT(*) as c FROM companies WHERE user_id = ?;", (user_id,), one=True)['c']
            my_orders = query_db("SELECT COUNT(*) as c FROM orders WHERE user_id = ?;", (user_id,), one=True)['c']
            my_invoices = query_db("SELECT COUNT(*) as c FROM invoices WHERE user_id = ?;", (user_id,), one=True)['c']

            recent_orders = query_db("""
                SELECT id, order_number, service_name, total as amount, status, created_at
                FROM orders
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT 5;
            """, (user_id,))

            return success_response(start_response, data={
                "metrics": {
                    "total_companies": total_companies,
                    "total_orders": my_orders,
                    "total_invoices": my_invoices
                },
                "recent_orders": [dict(r) for r in recent_orders]
            })

    return None
