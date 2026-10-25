"""Finstap platform routes (/api/platform) — work without a workspace.

  GET  /api/platform/workspace?slug=acme   → name of a workspace (login page)
  GET  /api/platform/check-slug?slug=acme  → can this workspace URL be used?
  POST /api/platform/signup/email-code     → {email} → 6-digit code emailed (signup step 1)
  POST /api/platform/signup/email-resend   → {challenge} → a new code for the same email
  POST /api/platform/signup/email-verify   → {challenge, code} → email_token for the signup
  POST /api/platform/signup                → create a company workspace (needs email_token) and sign its owner in
  POST /api/platform/handoff               → one-time code (from signup) → that session, on the company subdomain
"""
import threading
import time

from db import query_db, execute_db
from utils.response import success_response, error_response
from tenancy import (
    TenantError, check_slug, create_login_handoff, create_tenant, get_tenant, new_session_token,
    normalize_slug, redeem_login_handoff, use_tenant, workspace_url,
)
from routes.auth_routes import _client_ip, _public_user, _session_cookie
from services import signup_email
from services.signup_email import SignupEmailError

# Signup flood guard: max workspaces per IP inside the window
SIGNUP_MAX_PER_IP = 5
SIGNUP_WINDOW_SECONDS = 60 * 60
_signups = {}
_signup_lock = threading.Lock()


def _signup_allowed(ip):
    now = time.time()
    with _signup_lock:
        recent = [t for t in _signups.get(ip, []) if now - t < SIGNUP_WINDOW_SECONDS]
        _signups[ip] = recent
        if len(recent) >= SIGNUP_MAX_PER_IP:
            return False
        recent.append(now)
        return True


def _query_value(query, key):
    value = (query or {}).get(key) or ['']
    return str(value[0] if isinstance(value, list) else value)


def handle_platform_routes(environ, start_response, path, method, body, query=None):
    if not path.startswith('/api/platform/'):
        return None

    if path == '/api/platform/workspace' and method == 'GET':
        tenant = get_tenant(_query_value(query, 'slug'))
        if not tenant or tenant['status'] != 'Active':
            return error_response(start_response, "Workspace not found", status_code=404)
        return success_response(start_response, data={"workspace": {"slug": tenant['slug'], "name": tenant['name']}})

    if path == '/api/platform/check-slug' and method == 'GET':
        slug = normalize_slug(_query_value(query, 'slug'))
        problem = check_slug(slug)
        return success_response(start_response, data={"slug": slug, "available": not problem, "error": problem})

    # ── Signup step 1: the owner's email, confirmed with an emailed code (services/signup_email.py) ──
    if path == '/api/platform/signup/email-code' and method == 'POST':
        email = signup_email.normalize_email((body or {}).get('email'))
        try:
            challenge = signup_email.start(email, _client_ip(environ))
        except SignupEmailError as exc:
            return error_response(start_response, str(exc), status_code=429 if exc.wait else 400,
                                  details={'resend_after': exc.wait} if exc.wait else None)
        return success_response(start_response, data={
            "challenge": challenge, "email": email, "resend_after": signup_email.RESEND_SECONDS,
        }, message="Code sent.")

    if path == '/api/platform/signup/email-resend' and method == 'POST':
        try:
            signup_email.resend((body or {}).get('challenge'))
        except SignupEmailError as exc:
            return error_response(start_response, str(exc), status_code=429 if exc.wait else 400,
                                  details={'resend_after': exc.wait} if exc.wait else None)
        return success_response(start_response, data={"resend_after": signup_email.RESEND_SECONDS},
                                message="A new code is on its way.")

    if path == '/api/platform/signup/email-verify' and method == 'POST':
        try:
            email, token = signup_email.verify((body or {}).get('challenge'), (body or {}).get('code'))
        except SignupEmailError as exc:
            return error_response(start_response, str(exc), status_code=400)
        return success_response(start_response, data={"email": email, "email_token": token},
                                message="Email confirmed.")

    if path == '/api/platform/signup' and method == 'POST':
        body = body or {}
        # The owner's email must have been confirmed with a code (step 1); the confirmed email is the one used
        email_token = body.get('email_token')
        verified = signup_email.verified_email(email_token)
        if not verified:
            return error_response(start_response, "Confirm your email first: we send you a 6-digit code.",
                                  status_code=400, details={'email_unverified': True})
        if not _signup_allowed(_client_ip(environ)):
            return error_response(start_response, "Too many signups from this network. Try again later.",
                                  status_code=429)
        try:
            tenant, admin_id = create_tenant(
                body.get('company_name'), body.get('slug'),
                body.get('full_name'), verified, body.get('password'),
            )
        except TenantError as exc:
            return error_response(start_response, str(exc), status_code=400)
        signup_email.use_token(email_token)

        # Sign the owner straight into the new workspace
        with use_tenant(tenant):
            token = new_session_token()
            execute_db("""
                INSERT INTO user_sessions (session_token, user_id, expires_at, last_activity_at)
                VALUES (?, ?, datetime('now', '+30 days'), datetime('now'));
            """, (token, admin_id))
            user = _public_user(query_db("SELECT * FROM users WHERE id = ? LIMIT 1;", (admin_id,), one=True))

        # With company subdomains the browser moves to acme.finstap.com, carrying the login as a one-time code
        url = workspace_url(tenant['slug'])
        return success_response(start_response, data={
            "token": token,
            "session_token": token,
            "user": user,
            "workspace": {"slug": tenant['slug'], "name": tenant['name'], "plan": tenant['plan'],
                          "trial_ends_at": tenant['trial_ends_at'], "url": url},
            "handoff_code": create_login_handoff(tenant['slug'], token) if url else None,
        }, message="Workspace created.", status_code=201, headers=[('Set-Cookie', _session_cookie(token))])

    # ── POST /api/platform/handoff {code} → the session it carries (used once, within 2 minutes) ──
    if path == '/api/platform/handoff' and method == 'POST':
        found = redeem_login_handoff((body or {}).get('code'))
        tenant = get_tenant(found[0]) if found else None
        if not found or not tenant or tenant['status'] != 'Active':
            return error_response(start_response, "This sign-in link has expired. Please log in.", status_code=400)
        token = found[1]
        with use_tenant(tenant):
            row = query_db("""
                SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id
                WHERE s.session_token = ? AND s.revoked_at IS NULL AND datetime(s.expires_at) > datetime('now')
                LIMIT 1;
            """, (token,), one=True)
        if not row:
            return error_response(start_response, "This sign-in link has expired. Please log in.", status_code=400)
        return success_response(start_response, data={
            "token": token,
            "session_token": token,
            "user": _public_user(row),
            "workspace": {"slug": tenant['slug'], "name": tenant['name']},
        }, headers=[('Set-Cookie', _session_cookie(token))])

    return None
