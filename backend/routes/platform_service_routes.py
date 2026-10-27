"""Finstap services as a workspace sees them (services/platform_services.py).

GET  /api/admin/finstap-services                    prices, and this workspace's registered office requests
POST /api/admin/registered-office {company_id, notes}  ask Finstap for a registered office (admins, managers)
POST /api/admin/registered-office/<id>/cancel        take back a request that is still pending
"""
import re

from tenancy import current_tenant
from utils.response import success_response, error_response
from services import platform_services as svc

MANAGERS = ('SUPER_ADMIN', 'ADMIN', 'MANAGER')


def handle_platform_service_routes(environ, start_response, path, method, user, body, query):
    if path != '/api/admin/finstap-services' and not path.startswith('/api/admin/registered-office'):
        return None
    tenant = current_tenant()
    if not tenant or tenant.get('plan') == 'legacy':
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if str(user.get('role') or '').upper() not in MANAGERS:
        return error_response(start_response, "Only admins and managers can use Finstap services", status_code=403)
    body = body if isinstance(body, dict) else {}

    try:
        if path == '/api/admin/finstap-services' and method == 'GET':
            prices = svc.settings()
            return success_response(start_response, data={
                'kyc_price': prices['kyc_price'],
                'ro_price_year': prices['ro_price_year'],
                'ro_available': bool(prices['ro_addresses']),
                'requests': svc.ro_requests(slug=tenant['slug']),
            })
        if path == '/api/admin/registered-office' and method == 'POST':
            row = svc.request_ro(tenant, user, body.get('company_id'), body.get('notes'))
            return success_response(start_response, data=row, status_code=201,
                                    message="Request sent to Finstap. You'll see here when it is confirmed.")
        match = re.match(r'^/api/admin/registered-office/(\d+)/cancel$', path)
        if match and method == 'POST':
            svc.cancel_ro_request(tenant, int(match.group(1)))
            return success_response(start_response, message="Request cancelled.")
    except svc.ServiceError as exc:
        return error_response(start_response, str(exc), status_code=400)
    return error_response(start_response, "Not found", status_code=404)
