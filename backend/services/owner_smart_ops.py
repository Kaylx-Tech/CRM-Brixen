"""Smart Operations across every workspace, for the owner portal (admin.finstap.com › Smart Operations).
Read only: what the workspaces do in Smart Operations › Company Formation and UK Gov Checks. KYC, Registered
office and Partner Perks have their own owner pages already."""
from datetime import date

from db import query_db
from tenancy import for_each_tenant

TEAM_VIEW = {'role': 'ADMIN'}  # sees every order in the workspace, like an admin there
PER_WORKSPACE = 300


def _tag(tenant, rows):
    return [{**r, 'workspace': tenant['slug'], 'workspace_name': tenant.get('name') or tenant['slug']} for r in rows]


def company_formation():
    """Formation orders and the companies being formed, newest first, in every workspace."""
    from routes.smart_link_routes import _formation_orders

    def one(tenant):
        rows = _formation_orders(TEAM_VIEW)[:PER_WORKSPACE]
        return _tag(tenant, [{k: o.get(k) for k in ('id', 'order_number', 'status', 'created_at', 'applicant_name',
                                                      'products', 'service_name', 'proposed_name', 'companies',
                                                      'formation_status', 'created_by_name')} for o in rows])

    orders = [o for rows in for_each_tenant(one).values() for o in rows]
    orders.sort(key=lambda o: str(o.get('created_at') or ''), reverse=True)
    return {
        'orders': orders,
        'counts': {
            'Pending': sum(1 for o in orders if o.get('formation_status') != 'Registered'),
            'Registered': sum(1 for o in orders if o.get('formation_status') == 'Registered'),
            'All': len(orders),
        },
    }


def uk_gov_checks():
    """The workspaces' UK Gov Checks (their tasks), open ones first, then by due date."""
    def one(tenant):
        rows = query_db(f"""
            SELECT t.id, t.title, t.status, t.priority, t.due_date, t.department, t.created_at, t.completed_at,
                   a.full_name AS assigned_name, c.name AS company_name
            FROM tasks t
            LEFT JOIN users a ON a.id = t.assigned_staff_id
            LEFT JOIN companies c ON c.id = t.company_id
            ORDER BY CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END,
                     COALESCE(t.due_date, '9999-12-31'), t.id DESC
            LIMIT {PER_WORKSPACE};""") or []
        return _tag(tenant, [dict(r) for r in rows])

    checks = [c for rows in for_each_tenant(one).values() for c in rows]
    checks.sort(key=lambda c: (c.get('status') == 'Completed', str(c.get('due_date') or '9999-12-31')))
    today = date.today().isoformat()
    overdue = [c for c in checks if c.get('status') != 'Completed' and c.get('due_date')
               and str(c['due_date'])[:10] < today]
    for c in checks:
        c['overdue'] = c in overdue
    return {
        'checks': checks,
        'counts': {
            'Open': sum(1 for c in checks if c.get('status') != 'Completed'),
            'Overdue': len(overdue),
            'Completed': sum(1 for c in checks if c.get('status') == 'Completed'),
            'All': len(checks),
        },
    }
