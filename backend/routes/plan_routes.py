"""The workspace's own plan (Settings → Plan & usage).

GET /api/admin/plan   → plan, limits, what the workspace uses, trial and subscription dates (admins)
"""
from tenancy import current_tenant
from utils.response import success_response, error_response
from services import plans


def handle_plan_routes(environ, start_response, path, method, user, body, query):
    if path != '/api/admin/plan':
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if str(user.get('role') or '').upper() not in ('SUPER_ADMIN', 'ADMIN'):
        return error_response(start_response, "Only admins can see the plan", status_code=403)
    if method != 'GET':
        return error_response(start_response, "Method not allowed", status_code=405)
    data = plans.summary(current_tenant())
    data['plans'] = plans.public_plans()
    return success_response(start_response, data=data)
