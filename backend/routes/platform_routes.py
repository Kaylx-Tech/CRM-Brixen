"""Finstap platform routes (/api/platform) — work without a workspace.

  GET  /api/platform/workspace?slug=acme   → name of a workspace (login page)
  GET  /api/platform/check-slug?slug=acme  → can this workspace URL be used?
  POST /api/platform/signup                → create a company workspace and sign its owner in
"""
import threading
import time

from db import query_db, execute_db
from utils.response import success_response, error_response
from tenancy import (
    TenantError, check_slug, create_tenant, get_tenant, new_session_token, normalize_slug, use_tenant,
)
from routes.auth_routes import _client_ip, _public_user, _session_cookie

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

    if path == '/api/platform/signup' and method == 'POST':
        body = body or {}
        if not _signup_allowed(_client_ip(environ)):
            return error_response(start_response, "Too many signups from this network. Try again later.",
                                  status_code=429)
        try:
            tenant, admin_id = create_tenant(
                body.get('company_name'), body.get('slug'),
                body.get('full_name'), body.get('email'), body.get('password'),
            )
        except TenantError as exc:
            return error_response(start_response, str(exc), status_code=400)

        # Sign the owner straight into the new workspace
        with use_tenant(tenant):
            token = new_session_token()
            execute_db("""
                INSERT INTO user_sessions (session_token, user_id, expires_at, last_activity_at)
                VALUES (?, ?, datetime('now', '+30 days'), datetime('now'));
            """, (token, admin_id))
            user = _public_user(query_db("SELECT * FROM users WHERE id = ? LIMIT 1;", (admin_id,), one=True))

        return success_response(start_response, data={
            "token": token,
            "session_token": token,
            "user": user,
            "workspace": {"slug": tenant['slug'], "name": tenant['name'], "plan": tenant['plan'],
                          "trial_ends_at": tenant['trial_ends_at']},
        }, message="Workspace created.", status_code=201, headers=[('Set-Cookie', _session_cookie(token))])

    return None
