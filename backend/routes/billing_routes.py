"""The workspace's own billing (Finstap): its plan, card payments through Stripe, and Finstap's services.

GET  /api/admin/billing/status     → {locked, message} for every team member (the app shows only Billing
                                      while the workspace is locked)
GET  /api/admin/billing            → plan, dates, what is due for services, payments (admins)
POST /api/admin/billing/subscribe  {plan, cycle} → {url} of Stripe Checkout, or the plan changed at once
POST /api/admin/billing/portal     → {url} of Stripe's Customer Portal (card, invoices, cancel)
POST /api/admin/billing/services   → {url} of Stripe Checkout for registered office / KYC charges
"""
import re

from config import TENANT_BASE_DOMAIN
from tenancy import current_tenant, get_tenant, workspace_url
from utils.response import success_response, error_response
from services import plans
from services import stripe_billing as stripe

ADMINS = ('SUPER_ADMIN', 'ADMIN')


def _return_url(environ, slug):
    """Back to this workspace's Billing page after Stripe (the page the request came from, if it is ours)."""
    origin = (environ.get('HTTP_ORIGIN') or '').strip().rstrip('/')
    host = re.sub(r'^https?://', '', origin).split(':')[0].lower()
    ours = host in ('localhost', '127.0.0.1') or (TENANT_BASE_DOMAIN and host.endswith('.' + TENANT_BASE_DOMAIN))
    base = origin if ours else (workspace_url(slug) or origin)
    return f"{base}/admin/billing"


def handle_billing_routes(environ, start_response, path, method, user, body, query):
    if not path.startswith('/api/admin/billing'):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    tenant = current_tenant()
    if not tenant or tenant.get('plan') == 'legacy':
        return error_response(start_response, "Billing is not used in this workspace", status_code=404)
    tenant = get_tenant(tenant['slug'])  # fresh: Stripe may have just changed it
    role = str(user.get('role') or '').upper()

    if path == '/api/admin/billing/status' and method == 'GET':
        reason = plans.lock_reason(tenant)
        return success_response(start_response, data={
            'locked': bool(reason), 'reason': reason, 'message': plans.LOCK_MESSAGES.get(reason),
            'can_pay': role in ADMINS,
        })

    if role not in ADMINS:
        return error_response(start_response, "Only the workspace's admins can open Billing", status_code=403)

    # The Balance button (header): balance, what is due, how to top up or pay by card
    if path == '/api/admin/billing/wallet' and method == 'GET':
        from services import wallet
        return success_response(start_response, data=wallet.summary(tenant['slug']))

    if path == '/api/admin/billing' and method == 'GET':
        data = plans.summary(tenant)
        data.update({
            'plans': plans.public_plans(),
            'stripe_ready': stripe.configured(),
            'card_on_file': bool(tenant.get('stripe_customer_id')),
            'pays_by_card': bool(tenant.get('stripe_subscription_id'))
            and tenant.get('subscription_status') in ('active', 'trialing', 'past_due'),
            'services': stripe.services_due(tenant['slug']),
            'payments': stripe.payments_for(tenant['slug']),
            'price_override': tenant.get('price_override'),
            'message': plans.LOCK_MESSAGES.get(data.get('locked')),
        })
        return success_response(start_response, data=data)

    if method != 'POST':
        return error_response(start_response, "Not found", status_code=404)
    body = body if isinstance(body, dict) else {}
    back = _return_url(environ, tenant['slug'])
    try:
        if path == '/api/admin/billing/subscribe':
            url = stripe.subscribe(tenant['slug'], str(body.get('plan') or '').lower(),
                                   str(body.get('cycle') or 'monthly').lower(), back)
            if url:
                return success_response(start_response, data={'url': url})
            return success_response(start_response, data={'url': None}, message="Plan changed.")
        if path == '/api/admin/billing/portal':
            return success_response(start_response, data={'url': stripe.portal(tenant['slug'], back)})
        if path == '/api/admin/billing/services':
            return success_response(start_response, data={'url': stripe.pay_services(tenant['slug'], back)})
    except stripe.StripeError as exc:
        return error_response(start_response, str(exc), status_code=400)
    return error_response(start_response, "Not found", status_code=404)
