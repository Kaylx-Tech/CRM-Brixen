"""Endpoints the Brixen website (WordPress plugin "brixen-crm") calls — same contract as app.py.

Website customers sign in on the website. Their "Client panel > Messages & Files" page asks the CRM for their
documents with a signed request: HMAC-SHA256 of "wordpress_user_id|email|timestamp" with the shared secret
(settings wordpress_webhook_secret / env WORDPRESS_WEBHOOK_SECRET), valid for 15 minutes.

GET      /api/v1/wordpress/documents                 documents shared with the customer (+ signed download links)
GET      /api/v1/wordpress/documents/<id>/download    the file itself
GET/POST /api/v1/auth/sso                             website -> CRM portal sign-in (B2B accounts only; others
                                                      are sent back to the website)
GET      /api/public/name-availability?name=         Next.js website name search: can this company name be
                                                      registered? No sign-in; limited per visitor (IP).
POST     /api/public/formation-orders                 Next.js website "File Details" form (multipart: fields +
                                                      ID / proof of address files): draft order + Stripe
                                                      Checkout link (services/website_orders.py). Limited per IP.
POST     /api/public/service-orders                   Next.js website order form of any other service
                                                      (services/website_service_orders.py). Limited per IP.
POST     /api/public/enquiries                        Next.js website contact form: a support ticket for the
                                                      team (services/website_enquiries.py). Limited per IP.
GET      /api/public/address-renewal/<token>          the card link in a registered address reminder email:
                                                      Stripe Checkout for this year's renewal (…/done: thank you)
"""
import datetime
import hashlib
import hmac
import os
import re
import threading
import time
import urllib.parse
import uuid

from db import query_db, execute_db
from utils.response import json_response
from services.portal_access import client_can_use_crm_portal, website_login_url
from routes.webhook_routes import _webhook_secret
from routes.company_routes import name_availability
from config import ALLOWED_CORS_ORIGINS

# Public name search: at most this many checks per visitor inside the window (each one calls Companies House)
NAME_CHECK_LIMIT = 20
NAME_CHECK_WINDOW_SECONDS = 10 * 60
_name_checks = {}
_name_checks_lock = threading.Lock()
# Website orders: at most this many order forms per visitor per hour
ORDER_FORM_LIMIT = 6
ORDER_FORM_WINDOW_SECONDS = 60 * 60
_order_forms = {}
# Contact form: at most this many questions per visitor per hour
ENQUIRY_LIMIT = 5
ENQUIRY_WINDOW_SECONDS = 60 * 60
_enquiries = {}
WEBSITE_URL = (os.environ.get('WEBSITE_URL') or 'https://brixenconsultants.com').rstrip('/')


def _visitor_ip(environ):
    ip = (environ.get('HTTP_CF_CONNECTING_IP') or environ.get('HTTP_X_REAL_IP')
          or (environ.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0] or environ.get('REMOTE_ADDR') or '')
    return ip.strip() or 'unknown'


def _allowed(table, ip, limit, window):
    """True and counted when this visitor is under `limit` requests inside `window` seconds."""
    now = time.time()
    with _name_checks_lock:
        if len(table) > 5000:  # forget old visitors so the table stays small
            for key in [k for k, v in table.items() if not v or now - v[-1] > window]:
                table.pop(key, None)
        recent = [t for t in table.get(ip, []) if now - t < window]
        if len(recent) >= limit:
            table[ip] = recent
            return False
        recent.append(now)
        table[ip] = recent
        return True


def _name_check_allowed(ip):
    return _allowed(_name_checks, ip, NAME_CHECK_LIMIT, NAME_CHECK_WINDOW_SECONDS)


def _website_url(environ):
    """Where Stripe sends the customer back: the website the form came from when it is one of ours."""
    origin = str(environ.get('HTTP_ORIGIN') or '').strip().rstrip('/')
    return origin if origin in ALLOWED_CORS_ORIGINS and 'admin.' not in origin and 'portal.' not in origin \
        else WEBSITE_URL


def _verify_signature(wp_id, email, timestamp, signature, max_age_seconds=900):
    secret = _webhook_secret()
    if not secret:
        return False, 'Website integration is not configured'
    wp_id = str(wp_id or '').strip()
    email = str(email or '').strip().lower()
    timestamp = str(timestamp or '').strip()
    signature = str(signature or '').strip().replace('sha256=', '')
    if not wp_id or not timestamp or not signature:
        return False, 'Missing signed website credentials'
    try:
        ts_int = int(timestamp)
    except (TypeError, ValueError):
        return False, 'Invalid timestamp'
    if abs(int(datetime.datetime.now().timestamp()) - ts_int) > max_age_seconds:
        return False, 'Signed link expired. Refresh Messages & Files.'
    expected = hmac.new(secret.encode('utf-8'), f"{wp_id}|{email}|{timestamp}".encode('utf-8'),
                        hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return False, 'Invalid website signature'
    return True, None


def _find_client(wp_id, email):
    wp_id = str(wp_id or '').strip()
    email = str(email or '').strip().lower()
    client = None
    if wp_id:
        client = query_db("SELECT * FROM users WHERE wordpress_user_id = ? AND role = 'CLIENT';", (wp_id,), one=True)
    if not client and email:
        client = query_db("SELECT * FROM users WHERE LOWER(email) = ? AND role = 'CLIENT' ORDER BY id DESC;",
                          (email,), one=True)
    return dict(client) if client else None


def _signed_params(source):
    get = (lambda k: (source.get(k) or [''])[0]) if isinstance(next(iter(source.values()), None), list) \
        else (lambda k: source.get(k) or '')
    return {k: str(get(k) or '').strip() for k in ('wordpress_user_id', 'email', 'timestamp', 'signature')}


def _api_base(environ):
    proto = environ.get('HTTP_X_FORWARDED_PROTO') or environ.get('wsgi.url_scheme') or 'https'
    host = environ.get('HTTP_X_FORWARDED_HOST') or environ.get('HTTP_HOST') or 'api.brixenconsultants.com'
    return f"{proto.split(',')[0].strip()}://{host.split(',')[0].strip()}"


def _client_can_open(doc):
    """Shared with the customer, or the customer's own upload (app.py client_can_access_document)."""
    if int(doc.get('client_visible') or 0):
        return True
    return str(doc.get('uploaded_by') or '') == 'Customer Upload' or str(doc.get('category') or '') == 'Checkout Upload'


def _plain_page(start_response, title, message, status='200 OK'):
    """A small page for a visitor who came from an email link (no website around it)."""
    import html
    page = (f"<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,"
            f"initial-scale=1'><title>{html.escape(title)}</title></head><body style=\"font-family:-apple-system,"
            f"system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;color:#111;line-height:1.5\">"
            f"<h1 style='font-size:22px'>{html.escape(title)}</h1><p>{html.escape(message)}</p>"
            f"<p><a href='{WEBSITE_URL}'>Brixen Consultants</a></p></body></html>").encode()
    start_response(status, [('Content-Type', 'text/html; charset=utf-8'), ('Content-Length', str(len(page))),
                            ('Cache-Control', 'no-store')])
    return [page]


def _address_card_payment(environ, start_response, token, done):
    """The card link in an address reminder email: Stripe Checkout for this year's renewal, then a thank-you page."""
    from routes.client_portal_routes import ADDRESS_SERVICE_PRICE, _company_address_service, _is_brixen_address
    from services import address_billing
    company = address_billing.company_for_link(token)
    if not company or not _is_brixen_address(company.get('reg_office')):
        return _plain_page(start_response, 'Link not found', 'This payment link is not valid. Please contact us.',
                           '404 Not Found')
    if done:
        return _plain_page(start_response, 'Thank you',
                           f"Your payment for the registered office address of {company.get('name')} was received. "
                           "We will email you a receipt shortly.")
    service = _company_address_service(company)
    if service['status'] in ('Paid', 'Auto-renew') and not service['renewal_invoice']:
        return _plain_page(start_response, 'Nothing to pay',
                           f"The registered office address of {company.get('name')} is paid until "
                           f"{service.get('expiry_date') or 'the renewal date'}. Thank you.")
    owner = query_db("SELECT email FROM users WHERE id = ?;", (company.get('user_id'),), one=True) or {}
    open_total = float((service['renewal_invoice'] or {}).get('total') or 0)
    here = f"{_api_base(environ)}/api/public/address-renewal/{token}"
    try:
        url = address_billing.pay_once(company, open_total or ADDRESS_SERVICE_PRICE, f"{here}/done", WEBSITE_URL,
                                       late_fee=0 if open_total else service['late_fee'], email=owner.get('email'))
    except address_billing.StripeError as exc:
        return _plain_page(start_response, 'Card payment not available', f"{exc} You can pay by bank transfer "
                           "with the details in our email.", '400 Bad Request')
    start_response('302 Found', [('Location', url), ('Cache-Control', 'no-store'), ('Content-Length', '0')])
    return [b'']


def handle_website_routes(environ, start_response, path, method, user, body, query):
    # Address renewal by card from the reminder email (website customers)
    pay = re.match(r'^/api/public/address-renewal/([A-Za-z0-9_-]{16,64})(/done)?$', path)
    if pay and method == 'GET':
        return _address_card_payment(environ, start_response, pay.group(1), bool(pay.group(2)))

    if path == '/api/public/name-availability' and method == 'GET':
        if not _name_check_allowed(_visitor_ip(environ)):
            return json_response(start_response, {'status': 'error', 'message':
                                 'Too many name checks. Please wait a few minutes or contact us.'}, status_code=429)
        data, err, status = name_availability(((query or {}).get('name') or [''])[0])
        if err:
            if status >= 500:  # never show the visitor our setup or Companies House errors
                err = 'Name check is not available right now. Please try again or contact us.'
            return json_response(start_response, {'status': 'error', 'message': err}, status_code=status)
        return json_response(start_response, {
            'status': 'success',
            'name': data['name'],
            'available': data['available'],
            'warnings': data['warnings'],
            'similar': [i['name'] for i in data['similar'] if i.get('name')][:5],
        })

    if path in ('/api/public/formation-orders', '/api/public/service-orders') and method == 'POST':
        from services.website_orders import OrderError, create_formation_order
        from services.website_service_orders import create_service_order
        if not _allowed(_order_forms, _visitor_ip(environ), ORDER_FORM_LIMIT, ORDER_FORM_WINDOW_SECONDS):
            return json_response(start_response, {'status': 'error', 'message':
                                 'Too many order forms from your connection. Please wait a while or contact us.'},
                                 status_code=429)
        body = body if isinstance(body, dict) else {}
        files = body.get('_files') or {}
        fields = {k: v for k, v in body.items() if k != '_files'}
        try:
            create = create_formation_order if path == '/api/public/formation-orders' else create_service_order
            result = create(fields, files, _website_url(environ))
        except OrderError as exc:
            return json_response(start_response, {'status': 'error', 'message': str(exc)}, status_code=400)
        except Exception as exc:
            from services.error_tracking import report_problem
            report_problem('website_order', exc, level='error')
            return json_response(start_response, {'status': 'error', 'message':
                                 'Your order could not be sent. Please try again in a minute or contact us.'},
                                 status_code=500)
        return json_response(start_response, {'status': 'success', **result}, status_code=201)

    if path == '/api/public/enquiries' and method == 'POST':
        from services.website_enquiries import EnquiryError, create_enquiry
        if not _allowed(_enquiries, _visitor_ip(environ), ENQUIRY_LIMIT, ENQUIRY_WINDOW_SECONDS):
            return json_response(start_response, {'status': 'error', 'message':
                                 'Too many messages from your connection. Please call or WhatsApp us.'},
                                 status_code=429)
        try:
            result = create_enquiry(body if isinstance(body, dict) else {})
        except EnquiryError as exc:
            return json_response(start_response, {'status': 'error', 'message': str(exc)}, status_code=400)
        except Exception as exc:
            from services.error_tracking import report_problem
            report_problem('website_enquiry', exc, level='error')
            return json_response(start_response, {'status': 'error', 'message':
                                 'Your message could not be sent. Please call or WhatsApp us.'}, status_code=500)
        return json_response(start_response, {'status': 'success', **result}, status_code=201)

    if not (path.startswith('/api/v1/wordpress/documents') or path == '/api/v1/auth/sso'):
        return None

    # ── GET /api/v1/wordpress/documents ────────────────────────────────────
    if path == '/api/v1/wordpress/documents' and method == 'GET':
        p = _signed_params(query or {})
        ok, err = _verify_signature(p['wordpress_user_id'], p['email'], p['timestamp'], p['signature'])
        if not ok:
            return json_response(start_response, {'status': 'error', 'message': err}, status_code=401)
        client = _find_client(p['wordpress_user_id'], p['email'])
        if not client:
            return json_response(start_response, {'status': 'success', 'documents': [],
                                                  'message': 'No CRM client matched this website account yet.'})
        rows = query_db("""
            SELECT d.id, d.name, d.category, d.file_type, d.file_size, d.created_at, d.review_notes,
                   c.name AS company_name, o.order_number
            FROM documents d
            LEFT JOIN companies c ON d.company_id = c.id
            LEFT JOIN orders o ON d.order_id = o.id
            WHERE d.user_id = ? AND COALESCE(d.client_visible, 0) = 1
            ORDER BY d.created_at DESC, d.id DESC;
        """, (client['id'],)) or []
        signed = urllib.parse.urlencode(p)
        base = _api_base(environ)
        documents = [{
            'id': r['id'],
            'name': r.get('name'),
            'category': r.get('category') or 'Posted Documents',
            'file_type': r.get('file_type'),
            'file_size': r.get('file_size'),
            'company_name': r.get('company_name'),
            'order_number': r.get('order_number'),
            'created_at': r.get('created_at'),
            'message': r.get('review_notes') or 'A document is ready for you.',
            'download_url': f"{base}/api/v1/wordpress/documents/{r['id']}/download?{signed}",
        } for r in rows]
        return json_response(start_response, {'status': 'success', 'client_email': client.get('email'),
                                              'documents': documents})

    # ── GET /api/v1/wordpress/documents/<id>/download ──────────────────────
    parts = [x for x in path.split('/') if x]
    if (len(parts) == 6 and parts[:4] == ['api', 'v1', 'wordpress', 'documents'] and parts[5] == 'download'
            and method == 'GET'):
        try:
            doc_id = int(parts[4])
        except ValueError:
            return json_response(start_response, {'status': 'error', 'message': 'Document not found'}, status_code=404)
        p = _signed_params(query or {})
        ok, err = _verify_signature(p['wordpress_user_id'], p['email'], p['timestamp'], p['signature'])
        if not ok:
            return json_response(start_response, {'status': 'error', 'message': err}, status_code=401)
        client = _find_client(p['wordpress_user_id'], p['email'])
        if not client:
            return json_response(start_response, {'status': 'error', 'message': 'Access denied'}, status_code=403)
        doc = query_db("SELECT * FROM documents WHERE id = ?;", (doc_id,), one=True)
        if not doc or int(doc.get('user_id') or 0) != int(client['id']) or not _client_can_open(dict(doc)):
            return json_response(start_response, {'status': 'error', 'message': 'Document not found'}, status_code=404)
        from routes.document_routes import _serve_document
        return _serve_document(start_response, dict(doc), inline=False)

    # ── /api/v1/auth/sso (website -> CRM portal) ───────────────────────────
    if path == '/api/v1/auth/sso' and method in ('GET', 'POST'):
        p = _signed_params(query or {}) if method == 'GET' else _signed_params(body if isinstance(body, dict) else {})
        if not p['wordpress_user_id']:
            return json_response(start_response, {'status': 'error', 'message': 'Missing wordpress_user_id'}, status_code=401)
        ok, err = _verify_signature(p['wordpress_user_id'], p['email'], p['timestamp'], p['signature'],
                                    max_age_seconds=300)
        if not ok:
            return json_response(start_response, {'status': 'error', 'message': err or 'Invalid SSO signature'},
                                 status_code=401)
        client = _find_client(p['wordpress_user_id'], p['email'])
        stay_url = website_login_url() + '?brixen_stay=1'
        if not client or not client_can_use_crm_portal(client) or client.get('status') != 'Active':
            # Website customers stay on the website (app.py sends them back with brixen_stay=1)
            if method == 'GET':
                start_response('302 Found', [('Location', stay_url), ('Content-Length', '0')])
                return [b'']
            return json_response(start_response, {
                'status': 'error', 'message': 'This is a website customer account. Use the Brixen website to sign in.',
                'login_target': 'website', 'website_url': stay_url}, status_code=403)

        token = str(uuid.uuid4())
        execute_db("""
            INSERT INTO user_sessions (session_token, user_id, expires_at, last_activity_at)
            VALUES (?, ?, datetime('now', '+30 days'), datetime('now'));
        """, (token, client['id']))
        if method == 'GET':
            # The CRM front end keeps the session in the browser: hand it over in the URL fragment
            # (never sent to any server) on the /sso page, which stores it and opens the portal.
            from routes.auth_routes import _frontend_base_url
            start_response('302 Found', [('Location', f"{_frontend_base_url()}/sso#token={token}"),
                                         ('Content-Length', '0')])
            return [b'']
        from routes.auth_routes import _public_user
        return json_response(start_response, {'status': 'success', 'token': token,
                                              'user': _public_user(client)})

    return None
