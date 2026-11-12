"""The workspace's own plan (Settings → Plan & usage) and the owner's contact number.

GET  /api/admin/plan              → plan, limits, what the workspace uses, trial and subscription dates (admins)
GET  /api/admin/workspace-phone   → {phone, needed}: the owner's active mobile number, and whether to ask for it (admins)
POST /api/admin/workspace-phone   → {phone} → saved on the workspace (admins)
"""
from tenancy import current_tenant, set_owner_phone
from utils.response import success_response, error_response
from utils.validation import validate, validation_error
from services import plans

PHONE_SCHEMA = {'phone': {'label': 'Mobile number', 'required': True, 'type': 'phone', 'max_length': 30}}


def _is_admin(user):
    return str((user or {}).get('role') or '').upper() in ('SUPER_ADMIN', 'ADMIN')


def _workspace_phone(start_response, method, user, body):
    """Finstap asks the admins of a workspace without a number for one (a popup in the app)."""
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if not _is_admin(user):
        return error_response(start_response, "Only admins can change the workspace number", status_code=403)
    tenant = current_tenant()
    if not tenant:
        return error_response(start_response, "Workspace is required", status_code=400)
    if method == 'GET':
        phone = str(tenant.get('owner_phone') or '').strip()
        # Brixen's own database (plan 'legacy') is not a Finstap customer and is never asked
        return success_response(start_response, data={
            'phone': phone, 'needed': not phone and tenant.get('plan') != 'legacy',
        })
    if method == 'POST':
        body = body or {}
        errors = validate(body, PHONE_SCHEMA)
        if errors:
            return validation_error(start_response, errors)
        phone = str(body.get('phone') or '').strip()
        set_owner_phone(tenant['slug'], phone)
        return success_response(start_response, data={'phone': phone, 'needed': False}, message="Number saved.")
    return error_response(start_response, "Method not allowed", status_code=405)


def handle_plan_routes(environ, start_response, path, method, user, body, query):
    if path == '/api/admin/workspace-phone':
        return _workspace_phone(start_response, method, user, body)
    if path != '/api/admin/plan':
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if not _is_admin(user):
        return error_response(start_response, "Only admins can see the plan", status_code=403)
    if method != 'GET':
        return error_response(start_response, "Method not allowed", status_code=405)
    data = plans.summary(current_tenant())
    data['plans'] = plans.public_plans()
    return success_response(start_response, data=data)
