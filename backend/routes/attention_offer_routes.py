"""Companies › Attention › Offer to Fix (services/attention_offers.py).

Team (admins, managers and staff who may see prices):
  GET  /api/admin/companies/<id>/offer          → client, problems, services, ready message, last offer
  POST /api/admin/companies/<id>/offer          {service_id, channel: email|whatsapp, message, email?, phone?}
                                                 → {offer, link, whatsapp_url?}
  GET  /api/admin/attention-offers              → {offers: {company_id: newest offer}}
  POST /api/admin/attention-offers/send-all     {company_ids} → emails an offer to each (matching service)
Client (no sign-in):
  GET  /api/public/offer/<token>                → what the offer page shows (marks it opened)
  POST /api/public/offer/<token>/accept         → a Pending order for the service, once
"""
import re

from utils.response import success_response, error_response

TEAM_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')


def handle_attention_offer_routes(environ, start_response, path, method, user, body, query):
    if not (path.startswith('/api/public/offer/') or path.startswith('/api/admin/attention-offers')
            or re.match(r'^/api/admin/companies/\d+/offer$', path)):
        return None
    from services import attention_offers as offers
    body = body if isinstance(body, dict) else {}
    try:
        public = re.match(r'^/api/public/offer/([A-Za-z0-9_-]{16,64})(/accept)?$', path)
        if public:
            if public.group(2) and method == 'POST':
                return success_response(start_response, data=offers.accept(public.group(1)),
                                        message="Thank you. We have your go-ahead and will start on it.")
            if not public.group(2) and method == 'GET':
                return success_response(start_response, data=offers.public_view(public.group(1)))
            return error_response(start_response, "Not found", status_code=404)

        if not user:
            return error_response(start_response, "Authentication required", status_code=401)
        if str(user.get('role') or '').upper() not in TEAM_ROLES:
            return error_response(start_response, "This is for the team only", status_code=403)
        from services.price_privacy import hides_prices
        if hides_prices(user):
            return error_response(start_response, "Offers show prices, so they are for admins and managers.",
                                  status_code=403)

        one = re.match(r'^/api/admin/companies/(\d+)/offer$', path)
        if one and method == 'GET':
            return success_response(start_response, data=offers.prepare(int(one.group(1))))
        if one and method == 'POST':
            out = offers.send(int(one.group(1)), body, user)
            return success_response(start_response, data=out, message="Offer emailed to the client."
                                    if body.get('channel') != 'whatsapp' else "Opening WhatsApp…")
        if path == '/api/admin/attention-offers' and method == 'GET':
            return success_response(start_response, data={'offers': offers.latest_by_company()})
        if path == '/api/admin/attention-offers/send-all' and method == 'POST':
            ids = body.get('company_ids') if isinstance(body.get('company_ids'), list) else []
            result = offers.send_to_all(ids, user)
            return success_response(start_response, data=result,
                                    message=f"{result['sent']} offer(s) emailed"
                                    + (f", {len(result['skipped'])} skipped" if result['skipped'] else '') + '.')
    except offers.OfferError as exc:
        return error_response(start_response, str(exc), status_code=400)
    return error_response(start_response, "Not found", status_code=404)
