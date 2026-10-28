"""Authentication & Session Middleware Guard
"""
import os
import urllib.parse
from db import query_db, execute_db

# Session lifetime kept in sync with auth_routes login (30 days).
SESSION_LIFETIME_SQL = "+30 days"

# Sensitive columns that must never travel inside the in-memory user object.
_SENSITIVE_USER_FIELDS = ('password_hash', 'password_reset_token', 'password_reset_expires')


def _dev_auth_bypass_enabled():
    """Dev-only escape hatch. When DEV_AUTH_BYPASS is truthy, requests without a
    valid session are treated as the first SUPER_ADMIN user.

    SECURITY: This MUST stay disabled (unset) in production. It exists only so
    local development can hit APIs without logging in.
    """
    return str(os.environ.get('DEV_AUTH_BYPASS', '')).strip().lower() in ('1', 'true', 'yes', 'on')


def _sanitize_user(row):
    """Convert a DB row to a plain dict with sensitive fields stripped."""
    if not row:
        return None
    data = dict(row)
    for field in _SENSITIVE_USER_FIELDS:
        data.pop(field, None)
    return data


def _dev_admin_user():
    """Return the first SUPER_ADMIN only when the dev bypass flag is enabled."""
    if not _dev_auth_bypass_enabled():
        return None
    dev_admin = query_db("""
        SELECT u.*, u.full_name AS name
        FROM users u
        WHERE u.role = 'SUPER_ADMIN'
        ORDER BY u.id ASC
        LIMIT 1;
    """, one=True)
    return _sanitize_user(dev_admin)


def extract_session_token(environ):
    """Extract session token from Bearer header, custom header, or cookie."""
    # 1. Authorization: Bearer <token>
    auth_header = environ.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:].strip()
        if token:
            return token

    # 2. X-Session-Token
    custom_token = environ.get('HTTP_X_SESSION_TOKEN', '')
    if custom_token:
        return custom_token.strip()

    # 3. Cookies
    cookie_str = environ.get('HTTP_COOKIE', '')
    if cookie_str:
        for item in cookie_str.split(';'):
            item = item.strip()
            if '=' in item:
                k, v = item.split('=', 1)
                k = k.strip()
                if k in ('session_token', 'session', 'auth_token'):
                    return urllib.parse.unquote(v.strip())

    return None


def get_authenticated_user(environ):
    """Fetch the authenticated user dictionary for the incoming request.

    Returns None for unauthenticated / invalid / expired sessions (unless the
    dev bypass flag is explicitly enabled).
    """
    token = extract_session_token(environ)
    if not token:
        return _dev_admin_user()

    # Full user record (u.*) so downstream logic (B2B, department, theme, etc.)
    # has every field it needs; `name` alias kept for existing route code.
    row = query_db("""
        SELECT u.*, u.full_name AS name,
               s.session_token, s.expires_at, s.impersonator_token
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.session_token = ?
          AND s.revoked_at IS NULL
          AND datetime(s.expires_at) > datetime('now')
          AND u.status = 'Active'
        LIMIT 1;
    """, (token,), one=True)

    if not row:
        return _dev_admin_user()

    # Only B2B / Business customers use the CRM portal; Individual customers sign in on the website.
    # A session an admin opened by switching into the customer still works.
    from services.portal_access import client_can_use_crm_portal
    if not client_can_use_crm_portal(row, impersonated=bool(row.get('impersonator_token'))):
        return None

    # Keep active sessions alive: slide expiry forward + track activity.
    try:
        execute_db(f"""
            UPDATE user_sessions
            SET last_activity_at = datetime('now'),
                expires_at = datetime('now', '{SESSION_LIFETIME_SQL}')
            WHERE session_token = ? AND revoked_at IS NULL;
        """, (token,))
    except Exception:
        pass

    return _sanitize_user(row)
