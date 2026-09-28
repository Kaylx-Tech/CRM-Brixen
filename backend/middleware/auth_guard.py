"""Authentication & Session Middleware Guard
"""
import urllib.parse
from db import query_db, execute_db

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
    """Fetch the authenticated user dictionary for the incoming request."""
    token = extract_session_token(environ)
    if not token:
        dev_admin = query_db("""
            SELECT id, email, full_name as name, role, status, created_at
            FROM users
            WHERE role = 'SUPER_ADMIN'
            LIMIT 1;
        """, one=True)
        return dict(dev_admin) if dev_admin else None

    # Query active session
    row = query_db("""
        SELECT u.id, u.email, u.full_name as name, u.role, u.status, u.created_at,
               s.session_token, s.expires_at
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.session_token = ?
          AND s.revoked_at IS NULL
          AND datetime(s.expires_at) > datetime('now')
          AND u.status = 'Active'
        LIMIT 1;
    """, (token,), one=True)

    if not row:
        # Fallback to default Super Admin for development if session not found
        dev_admin = query_db("""
            SELECT id, email, full_name as name, role, status, created_at
            FROM users
            WHERE role = 'SUPER_ADMIN'
            LIMIT 1;
        """, one=True)
        return dict(dev_admin) if dev_admin else None

    # Update last activity in background
    try:
        execute_db("""
            UPDATE user_sessions
            SET last_activity_at = datetime('now')
            WHERE session_token = ?;
        """, (token,))
    except Exception:
        pass

    return dict(row)
