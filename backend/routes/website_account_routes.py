"""My Account on the Brixen website (Next.js, website/): individual (retail) customers sign in on the website and see
their orders, invoices, messages and files there, as they did in the WordPress client panel. They never get the CRM
client portal; B2B and Business customers use the portal (services/portal_access.uses_crm_portal) and are sent there.

The website keeps its own sign-in (website_sessions, "Authorization: Bearer ws_..."), separate from the CRM's
user_sessions, so a website session can never open the CRM. The data comes from the same customer views the portal
uses (client_portal_routes, order_routes, document_routes), scoped to the signed-in customer.

POST  /api/public/account/login            {email, password} → {token, user}; old WordPress passwords work once
                                            (users.wordpress_password_hash, then the CRM password)
POST  /api/public/account/logout
POST  /api/public/account/forgot-password  {email} → email with a link to <website>/my-account/reset-password/
POST  /api/public/account/reset-password   {token, password}
GET   /api/public/account/me               the customer (name, email, phone)
PATCH /api/public/account/me               {full_name, phone}
POST  /api/public/account/password         {current_password, new_password}
GET   /api/public/account/dashboard | orders | orders/<id> | invoices | invoices/<id>/document
      | documents | documents/<id>/download | documents/<id>/view | tickets | tickets/<id>/messages | messages
POST  /api/public/account/documents/upload | tickets | tickets/<id>/messages
"""
import hashlib
import os
import re
import secrets
import urllib.parse

from db import query_db, execute_db, verify_password, hash_password, verify_wordpress_password
from utils.response import json_response

PREFIX = '/api/public/account'
TOKEN_PREFIX = 'ws_'
SESSION_DAYS = 30
MIN_PASSWORD = 8
WEBSITE_URL = (os.environ.get('WEBSITE_URL') or 'https://brixenconsultants.com').rstrip('/')
_SENSITIVE = ('password_hash', 'wordpress_password_hash', 'password_reset_token', 'password_reset_expires',
              'access_email_password')

# The portal's customer views the website may use: (website path regex, CRM path template, methods)
PROXY = [
    (r'^/dashboard$', '/api/client/dashboard', ('GET',)),
    (r'^/orders$', '/api/client/orders', ('GET',)),
    (r'^/orders/(\d+)$', '/api/client/orders/{0}', ('GET',)),
    (r'^/invoices$', '/api/client/invoices', ('GET',)),
    (r'^/invoices/(\d+)/document$', '/api/client/invoices/{0}/document', ('GET',)),
    (r'^/documents$', '/api/client/documents', ('GET',)),
    (r'^/documents/upload$', '/api/client/documents/upload', ('POST',)),
    (r'^/documents/(\d+)/(download|view)$', '/api/documents/{0}/{1}', ('GET',)),
    (r'^/tickets$', '/api/client/tickets', ('GET', 'POST')),
    (r'^/tickets/(\d+)/messages$', '/api/client/tickets/{0}/messages', ('GET', 'POST')),
    (r'^/messages$', '/api/client/messages', ('GET',)),
]


def _json(start_response, data, status=200):
    return json_response(start_response, data, status_code=status)


def _error(start_response, message, status=400, **extra):
    return _json(start_response, {'status': 'error', 'message': message, **extra}, status)


def _public_user(row):
    return {'id': row['id'], 'email': row.get('email'), 'full_name': row.get('full_name'), 'phone': row.get('phone')}


def _token(environ):
    auth = str(environ.get('HTTP_AUTHORIZATION') or '')
    token = auth[7:].strip() if auth.lower().startswith('bearer ') else ''
    return token if token.startswith(TOKEN_PREFIX) else ''


def _session_user(environ):
    token = _token(environ)
    if not token:
        return None
    row = query_db("""
        SELECT u.* FROM website_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.revoked_at IS NULL AND datetime(s.expires_at) > datetime('now')
          AND u.status = 'Active' AND u.role = 'CLIENT'
        LIMIT 1;
    """, (hashlib.sha256(token.encode()).hexdigest(),), one=True)
    if not row:
        return None
    user = dict(row)
    from services.portal_access import uses_crm_portal
    if uses_crm_portal(user):  # became B2B / Business: the portal from now on
        return None
    execute_db(f"UPDATE website_sessions SET last_activity_at = datetime('now'), "
               f"expires_at = datetime('now', '+{SESSION_DAYS} days') WHERE token_hash = ?;",
               (hashlib.sha256(token.encode()).hexdigest(),))
    for key in _SENSITIVE:
        user.pop(key, None)
    user['name'] = user.get('full_name')
    return user


def _start_session(user_id):
    token = TOKEN_PREFIX + secrets.token_urlsafe(32)
    execute_db(f"""
        INSERT INTO website_sessions (token_hash, user_id, created_at, last_activity_at, expires_at)
        VALUES (?, ?, datetime('now'), datetime('now'), datetime('now', '+{SESSION_DAYS} days'));
    """, (hashlib.sha256(token.encode()).hexdigest(), user_id))
    return token


def _portal_reply(start_response):
    from routes.auth_routes import _frontend_base_url
    return _error(start_response, "Your account uses the Brixen client portal. Please sign in there.", 409,
                  login_target='portal', portal_url=f"{_frontend_base_url()}/login")


def _login(environ, start_response, body):
    from routes.auth_routes import _client_ip, _login_retry_after, _record_login_failure, _clear_login_failures
    from services.portal_access import uses_crm_portal
    email = str(body.get('email') or '').strip().lower()
    password = str(body.get('password') or '')
    if not email or not password:
        return _error(start_response, "Enter your email and password.")
    key = (_client_ip(environ), 'website:' + email)
    wait = _login_retry_after(key)
    if wait:
        return _error(start_response, f"Too many attempts. Try again in {max(1, wait // 60)} minute(s).", 429)
    row = query_db("SELECT * FROM users WHERE lower(email) = ? LIMIT 1;", (email,), one=True)
    user = dict(row) if row else None
    ok = bool(user) and verify_password(password, user.get('password_hash'))
    if user and not ok and user.get('role') == 'CLIENT' \
            and verify_wordpress_password(password, user.get('wordpress_password_hash')):
        execute_db("UPDATE users SET password_hash = ?, wordpress_password_hash = 'used' WHERE id = ?;",
                   (hash_password(password), user['id']))
        ok = True
    if not ok or user.get('role') != 'CLIENT':
        _record_login_failure(key)
        return _error(start_response, "Wrong email or password.", 401)
    _clear_login_failures(key)
    if user.get('status') != 'Active':
        return _error(start_response, "This account is switched off. Please contact us.", 403)
    if uses_crm_portal(user):
        return _portal_reply(start_response)
    return _json(start_response, {'status': 'success', 'token': _start_session(user['id']), 'user': _public_user(user)})


def _forgot(start_response, body):
    """Always the same answer, so nobody can find out which emails have an account."""
    from services.portal_access import uses_crm_portal
    email = str(body.get('email') or '').strip().lower()
    done = {'status': 'success', 'message': "If this email has an account, we have sent a link to choose a new password."}
    row = query_db("SELECT * FROM users WHERE lower(email) = ? AND role = 'CLIENT' AND status = 'Active' LIMIT 1;",
                   (email,), one=True) if email else None
    if not row:
        return _json(start_response, done)
    user = dict(row)
    if uses_crm_portal(user):
        from routes.auth_routes import _frontend_base_url
        link, where = f"{_frontend_base_url()}/forgot-password", 'the Brixen client portal'
    else:
        raw = secrets.token_urlsafe(32)
        execute_db("UPDATE users SET password_reset_token = ?, password_reset_expires = datetime('now', '+2 hours') "
                   "WHERE id = ?;", (hashlib.sha256(raw.encode()).hexdigest(), user['id']))
        link, where = f"{WEBSITE_URL}/my-account/reset-password/?token={urllib.parse.quote(raw)}", None
    send_password_email(user, link, reset=True, portal_name=where)
    return _json(start_response, done)


def send_password_email(user, link, *, reset, order=None, portal_name=None, hours=2):
    from services.client_mail import compose_client_email
    from services.email_service import send_email
    if portal_name:
        subject, headline = 'Reset your Brixen password', 'Reset your password'
        message = f"Your account uses {portal_name}. Use the button to choose a new password there."
        points = []
    elif reset:
        subject, headline = 'Reset your Brixen password', 'Choose a new password'
        message = "We received a request to reset the password of your Brixen account. Choose a new one below."
        points = [f'This link works for {hours} hours. If you did not ask for it, ignore this email.']
    else:
        subject, headline = 'Your Brixen account is ready – choose your password', 'Your Brixen account is ready'
        message = (f"Thank you for your order {order['order_number']}. In My Account on our website you can follow "
                   "your order, download invoices and send us messages and files. Choose a password to sign in.")
        points = [f'This link works for {hours // 24} days. After that, use "Forgot password" on the sign-in page.']
    details = [('Sign-in email', user['email'])]
    if order:
        details = [('Order', order['order_number']), ('Service', order.get('service_name'))] + details
    subj, text, html = compose_client_email(
        subject=subject, headline=headline, greeting=str(user.get('full_name') or 'there').split()[0],
        message=message, details=details, points=points,
        cta_label='Choose my password' if not portal_name else 'Reset my password', cta_url=link, category='SECURITY')
    return send_email(user['email'], subj, html, text_content=text, category='SECURITY', user_id=user['id'],
                      order_id=(order or {}).get('id'), store_body=False)


def _reset(start_response, body):
    raw = str(body.get('token') or '').strip()
    password = str(body.get('password') or '')
    if len(password) < MIN_PASSWORD:
        return _error(start_response, f"Use at least {MIN_PASSWORD} characters for your password.")
    if 'confirm_password' in body and str(body.get('confirm_password') or '') != password:
        return _error(start_response, "The two passwords are not the same.")
    row = query_db("""
        SELECT * FROM users WHERE password_reset_token = ? AND role = 'CLIENT'
          AND datetime(password_reset_expires) > datetime('now') LIMIT 1;
    """, (hashlib.sha256(raw.encode()).hexdigest(),), one=True) if raw else None
    if not row:
        return _error(start_response, "This link has expired or was already used. Ask for a new one.", 400)
    user = dict(row)
    execute_db("""
        UPDATE users SET password_hash = ?, wordpress_password_hash = 'used', password_reset_token = NULL,
               password_reset_expires = NULL
        WHERE id = ?;
    """, (hash_password(password), user['id']))
    execute_db("UPDATE website_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL;",
               (user['id'],))
    from services.portal_access import uses_crm_portal
    if uses_crm_portal(user):
        return _portal_reply(start_response)
    return _json(start_response, {'status': 'success', 'token': _start_session(user['id']), 'user': _public_user(user)})


def _proxy(environ, start_response, sub, method, user, body, query):
    from routes.client_portal_routes import handle_client_portal_routes
    from routes.document_routes import handle_document_routes
    from routes.order_routes import handle_order_routes
    for pattern, target, methods in PROXY:
        m = re.match(pattern, sub)
        if m and method in methods:
            path = target.format(*m.groups())
            for handler in (handle_client_portal_routes, handle_order_routes, handle_document_routes):
                res = handler(environ, start_response, path, method, user, body, query)
                if res is not None:
                    return res
    return None


def handle_website_account_routes(environ, start_response, path, method, user, body, query):
    if not path.startswith(PREFIX):
        return None
    sub = path[len(PREFIX):].rstrip('/') or '/'
    body = body if isinstance(body, dict) else {}

    if sub == '/login' and method == 'POST':
        return _login(environ, start_response, body)
    if sub == '/forgot-password' and method == 'POST':
        return _forgot(start_response, body)
    if sub == '/reset-password' and method == 'POST':
        return _reset(start_response, body)

    me = _session_user(environ)
    if not me:
        return _error(start_response, "Please sign in again.", 401)

    if sub == '/logout' and method == 'POST':
        execute_db("UPDATE website_sessions SET revoked_at = datetime('now') WHERE token_hash = ?;",
                   (hashlib.sha256(_token(environ).encode()).hexdigest(),))
        return _json(start_response, {'status': 'success'})
    if sub == '/me' and method == 'GET':
        return _json(start_response, {'status': 'success', 'user': _public_user(me)})
    if sub == '/me' and method in ('PATCH', 'POST'):
        name = re.sub(r'\s+', ' ', str(body.get('full_name') or '')).strip()[:120]
        phone = re.sub(r'\s+', ' ', str(body.get('phone') or '')).strip()[:40]
        if not name:
            return _error(start_response, "Enter your name.")
        if phone:
            from utils.validation import check_field
            msg = check_field(phone, {'label': 'Phone', 'type': 'phone'})
            if msg:
                return _error(start_response, msg)
        execute_db("UPDATE users SET full_name = ?, phone = ? WHERE id = ?;", (name, phone or None, me['id']))
        return _json(start_response, {'status': 'success', 'message': 'Your details are saved.',
                                      'user': _public_user({**me, 'full_name': name, 'phone': phone})})
    if sub == '/password' and method == 'POST':
        row = query_db("SELECT password_hash FROM users WHERE id = ?;", (me['id'],), one=True)
        new = str(body.get('new_password') or '')
        if not verify_password(str(body.get('current_password') or ''), (row or {}).get('password_hash')):
            return _error(start_response, "Your current password is not right.")
        if len(new) < MIN_PASSWORD:
            return _error(start_response, f"Use at least {MIN_PASSWORD} characters for your new password.")
        execute_db("UPDATE users SET password_hash = ?, wordpress_password_hash = 'used' WHERE id = ?;",
                   (hash_password(new), me['id']))
        current = hashlib.sha256(_token(environ).encode()).hexdigest()
        execute_db("UPDATE website_sessions SET revoked_at = datetime('now') "
                   "WHERE user_id = ? AND token_hash != ? AND revoked_at IS NULL;", (me['id'], current))
        return _json(start_response, {'status': 'success', 'message': 'Your password is changed.'})

    res = _proxy(environ, start_response, sub, method, me, body, query)
    if res is not None:
        return res
    return _error(start_response, "Not found", 404)
