"""Authentication & User Routes (/api/auth)
"""
import uuid
import hashlib
import secrets
import urllib.parse
from db import query_db, execute_db, verify_password, hash_password
from utils.response import json_response, success_response, error_response
from services.email_service import send_email
from config import FRONTEND_URL, COOKIE_SECURE, SESSION_COOKIE_MAX_AGE

MIN_PASSWORD_LEN = 8


def _session_cookie(token, *, clear=False):
    """Build Set-Cookie for session_token (Secure on HTTPS / Coolify)."""
    if clear:
        parts = [
            'session_token=',
            'Path=/',
            'SameSite=Lax',
            'Max-Age=0',
            'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        ]
    else:
        parts = [
            f'session_token={token}',
            'Path=/',
            'SameSite=Lax',
            f'Max-Age={SESSION_COOKIE_MAX_AGE}',
            'HttpOnly',
        ]
    if COOKIE_SECURE:
        parts.append('Secure')
    return '; '.join(parts)


def _frontend_base_url():
    """Admin CRM base URL for password-reset links (env / settings, not hardcoded)."""
    try:
        from services.settings_service import get_setting
        configured = (get_setting('frontend_url') or '').strip().rstrip('/')
        if configured:
            return configured
    except Exception:
        pass
    return FRONTEND_URL

def handle_auth_routes(environ, start_response, path, method, user, body, query=None):
    """Route handler for /api/auth endpoints."""
    
    # ── POST /api/auth/login ───────────────────────────────────────────────
    if path == '/api/auth/login' and method == 'POST':
        email = (body.get('email') or '').strip().lower()
        password = body.get('password') or ''
        
        if not email or not password:
            return error_response(start_response, "Email and password are required.", status_code=400)
            
        user_row = query_db("""
            SELECT id, email, password_hash, full_name as name, role, status
            FROM users
            WHERE lower(email) = ?
            LIMIT 1;
        """, (email,), one=True)
        
        if not user_row or not verify_password(password, user_row['password_hash']):
            return error_response(start_response, "Invalid email or password.", status_code=401)
            
        if user_row.get('status') != 'Active':
            return error_response(start_response, "Account is disabled. Please contact support.", status_code=403)
            
        # Generate new DB session token (30 days validity)
        session_token = str(uuid.uuid4())
        execute_db("""
            INSERT INTO user_sessions (session_token, user_id, expires_at, last_activity_at)
            VALUES (?, ?, datetime('now', '+30 days'), datetime('now'));
        """, (session_token, user_row['id']))
        
        user_data = {
            "id": user_row['id'],
            "email": user_row['email'],
            "name": user_row['name'],
            "role": user_row['role']
        }
        
        cookie_header = _session_cookie(session_token)
        return success_response(start_response, data={
            "token": session_token,
            "session_token": session_token,
            "user": user_data,
            "status": "success"
        }, message="Login successful.", headers=[('Set-Cookie', cookie_header)])

    # ── GET /api/auth/me ──────────────────────────────────────────────────
    if path == '/api/auth/me' and method == 'GET':
        if not user:
            return error_response(start_response, "Unauthorized", status_code=401)
            
        return success_response(start_response, data={
            "user": {
                "id": user['id'],
                "email": user['email'],
                "name": user.get('name') or user.get('full_name'),
                "role": user['role']
            }
        })

    # ── POST /api/auth/logout ─────────────────────────────────────────────
    if path == '/api/auth/logout' and method == 'POST':
        if user and user.get('session_token'):
            execute_db("""
                UPDATE user_sessions
                SET revoked_at = datetime('now')
                WHERE session_token = ?;
            """, (user['session_token'],))
            
        cookie_clear = _session_cookie('', clear=True)
        return success_response(start_response, message="Logged out successfully.", headers=[('Set-Cookie', cookie_clear)])

    # ── POST /api/auth/forgot-password ────────────────────────────────────
    if path == '/api/auth/forgot-password' and method == 'POST':
        email = (body.get('email') or '').strip().lower()
        if not email:
            return error_response(start_response, "Email is required.", status_code=400)

        generic_msg = "If that email is registered, a password reset link has been sent."
        user_row = query_db(
            "SELECT id, email, full_name FROM users WHERE lower(email) = ? AND status = 'Active' LIMIT 1;",
            (email,),
            one=True,
        )
        if user_row:
            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
            execute_db("""
                UPDATE users
                SET password_reset_token = ?, password_reset_expires = datetime('now', '+2 hours')
                WHERE id = ?;
            """, (token_hash, user_row['id']))

            try:
                reset_link = f"{_frontend_base_url()}/reset-password?token={urllib.parse.quote(raw_token)}"
                send_email(
                    recipient=email,
                    subject="Brixen CRM - Password Reset Request",
                    html_content=(
                        f"<p>Hello {user_row['full_name'] or 'Client'},</p>"
                        f"<p>You requested a password reset. Click below:</p>"
                        f"<p><a href='{reset_link}'>{reset_link}</a></p>"
                        f"<p>This link expires in 2 hours.</p>"
                    ),
                )
            except Exception as e:
                print(f"[Email Error] Failed to send reset link: {e}")

        return success_response(start_response, message=generic_msg)

    # ── POST /api/auth/reset-password ─────────────────────────────────────
    if path == '/api/auth/reset-password' and method == 'POST':
        raw_token = str(body.get('token') or '').strip()
        new_password = str(body.get('password') or body.get('new_password') or '')
        confirm_password = body.get('confirm_password')
        if not raw_token:
            return error_response(start_response, "Reset link is missing or invalid.", status_code=400)
        if len(new_password) < MIN_PASSWORD_LEN:
            return error_response(start_response, f"Password must be at least {MIN_PASSWORD_LEN} characters.", status_code=400)
        if confirm_password is not None and confirm_password != new_password:
            return error_response(start_response, "Passwords do not match.", status_code=400)

        token_hash = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
        found_user = query_db("""
            SELECT id FROM users
            WHERE password_reset_token = ?
              AND password_reset_expires IS NOT NULL
              AND datetime(password_reset_expires) > datetime('now')
            LIMIT 1;
        """, (token_hash,), one=True)
        if not found_user:
            return error_response(start_response, "This reset link is invalid or has expired. Request a new one.", status_code=400)

        execute_db("""
            UPDATE users
            SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL
            WHERE id = ?;
        """, (hash_password(new_password), found_user['id']))
        return success_response(start_response, message="Password updated. You can now sign in.")

    return None
