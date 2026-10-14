"""Authentication & User Routes (/api/auth)
"""
import uuid
import hashlib
import secrets
import time
import threading
import urllib.parse
from db import query_db, execute_db, verify_password, hash_password
from utils.response import json_response, success_response, error_response
from services.email_service import send_email
from config import FRONTEND_URL, COOKIE_SECURE, SESSION_COOKIE_MAX_AGE

MIN_PASSWORD_LEN = 8
STAFF_MIN_PASSWORD_LEN = 10

# Login brute-force guard: max failed attempts per (ip, email) inside the window.
LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW_SECONDS = 15 * 60
_login_failures = {}
_login_lock = threading.Lock()


def _client_ip(environ):
    forwarded = (environ.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
    return forwarded or environ.get('REMOTE_ADDR') or 'unknown'


def _login_retry_after(key):
    """Seconds until another attempt is allowed, or 0 when not locked out."""
    now = time.time()
    with _login_lock:
        attempts = [t for t in _login_failures.get(key, []) if now - t < LOGIN_WINDOW_SECONDS]
        if attempts:
            _login_failures[key] = attempts
        else:
            _login_failures.pop(key, None)
        if len(attempts) >= LOGIN_MAX_FAILURES:
            return int(LOGIN_WINDOW_SECONDS - (now - attempts[0])) + 1
    return 0


def _record_login_failure(key):
    with _login_lock:
        _login_failures.setdefault(key, []).append(time.time())


def _clear_login_failures(key):
    with _login_lock:
        _login_failures.pop(key, None)


def _revoke_user_sessions(user_id, except_token=None):
    execute_db("""
        UPDATE user_sessions
        SET revoked_at = datetime('now')
        WHERE user_id = ? AND revoked_at IS NULL AND session_token != ?;
    """, (user_id, except_token or ''))


def _public_user(user_row):
    """Safe user payload for /me and /profile (matches legacy public_me_user fields)."""
    if not user_row:
        return None
    return {
        "id": user_row.get('id'),
        "email": user_row.get('email'),
        "full_name": user_row.get('full_name') or user_row.get('name'),
        "name": user_row.get('full_name') or user_row.get('name'),
        "role": user_row.get('role'),
        "phone": user_row.get('phone') or '',
        "country": user_row.get('country') or '',
        "address": user_row.get('address') or '',
        "department": user_row.get('department') or '',
        "status": user_row.get('status') or '',
        "avatar_url": user_row.get('avatar_url') or '',
    }


SWITCH_ROLES = ('SUPER_ADMIN', 'ADMIN')
ROLE_RANK = {'STAFF': 1, 'MANAGER': 2, 'ADMIN': 3, 'SUPER_ADMIN': 4}


def _can_switch_to(actor, target):
    """Old portal rule: admins switch to lower-ranked active team members; super admins to anyone on the team."""
    if not actor or not target or actor.get('id') == target.get('id'):
        return False
    if actor.get('role') not in SWITCH_ROLES or target.get('role') not in ROLE_RANK:
        return False
    if target.get('status') != 'Active' or target.get('removed_at'):
        return False
    if actor.get('role') == 'SUPER_ADMIN':
        return True
    return ROLE_RANK[target['role']] < ROLE_RANK[actor['role']]


def _impersonation_origin(session_token):
    """The admin (with their live session token) behind a switched session, or None."""
    if not session_token:
        return None
    row = query_db("SELECT impersonator_token FROM user_sessions WHERE session_token = ? LIMIT 1;",
                   (session_token,), one=True)
    origin_token = (row or {}).get('impersonator_token')
    if not origin_token:
        return None
    origin = query_db("""
        SELECT u.*, s.session_token FROM user_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.session_token = ? AND s.revoked_at IS NULL AND datetime(s.expires_at) > datetime('now')
          AND u.status = 'Active' LIMIT 1;
    """, (origin_token,), one=True)
    return dict(origin) if origin else None


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

        attempt_key = (_client_ip(environ), email)
        retry_after = _login_retry_after(attempt_key)
        if retry_after:
            return error_response(
                start_response,
                f"Too many failed login attempts. Try again in {max(1, retry_after // 60)} minute(s).",
                status_code=429,
            )

        user_row = query_db("""
            SELECT id, email, password_hash, full_name as name, role, status
            FROM users
            WHERE lower(email) = ?
            LIMIT 1;
        """, (email,), one=True)
        
        if not user_row or not verify_password(password, user_row['password_hash']):
            _record_login_failure(attempt_key)
            return error_response(start_response, "Invalid email or password.", status_code=401)

        _clear_login_failures(attempt_key)
        if user_row.get('status') != 'Active':
            return error_response(start_response, "Account is disabled. Please contact support.", status_code=403)
            
        # Generate new DB session token (30 days validity)
        session_token = str(uuid.uuid4())
        execute_db("""
            INSERT INTO user_sessions (session_token, user_id, expires_at, last_activity_at)
            VALUES (?, ?, datetime('now', '+30 days'), datetime('now'));
        """, (session_token, user_row['id']))
        
        # Same safe payload as /me, so the frontend gets department (staff page access depends on it)
        full_row = query_db("SELECT * FROM users WHERE id = ? LIMIT 1;", (user_row['id'],), one=True)
        user_data = _public_user(dict(full_row)) if full_row else {
            "id": user_row['id'], "email": user_row['email'], "name": user_row['name'], "role": user_row['role']}
        
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

        fresh = query_db("SELECT * FROM users WHERE id = ? LIMIT 1;", (user['id'],), one=True) or user
        payload = _public_user(fresh)
        origin = _impersonation_origin(user.get('session_token'))
        payload['impersonated'] = bool(origin)
        payload['impersonator_name'] = (origin or {}).get('full_name') or ''
        return success_response(start_response, data={"user": payload})

    # ── GET /api/auth/switch-users (team members the signed-in admin may switch to) ──
    if path == '/api/auth/switch-users' and method == 'GET':
        if not user:
            return error_response(start_response, "Unauthorized", status_code=401)
        if _impersonation_origin(user.get('session_token')) or user.get('role') not in SWITCH_ROLES:
            return success_response(start_response, data={"users": []})
        rows = query_db("""
            SELECT id, full_name, email, role, status FROM users
            WHERE role IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF') AND status = 'Active'
              AND removed_at IS NULL AND id != ?
            ORDER BY full_name COLLATE NOCASE;
        """, (user['id'],)) or []
        users = [dict(r) for r in rows if _can_switch_to(user, r)]
        return success_response(start_response, data={"users": users})

    # ── POST /api/auth/switch-user (admin views the CRM as a team member) ──
    if path == '/api/auth/switch-user' and method == 'POST':
        if not user:
            return error_response(start_response, "Unauthorized", status_code=401)
        if _impersonation_origin(user.get('session_token')):
            return error_response(start_response, "Return to your own account before switching again.", status_code=400)
        target = query_db("SELECT * FROM users WHERE id = ? LIMIT 1;", ((body or {}).get('user_id'),), one=True)
        if not target or not _can_switch_to(user, target):
            return error_response(start_response, "You cannot switch to that user.", status_code=403)
        token = str(uuid.uuid4())
        execute_db("""
            INSERT INTO user_sessions (session_token, user_id, expires_at, last_activity_at, impersonator_token)
            VALUES (?, ?, datetime('now', '+8 hours'), datetime('now'), ?);
        """, (token, target['id'], user['session_token']))
        execute_db(
            "INSERT INTO activity_logs (user_id, user_email, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?);",
            (user['id'], user.get('email'), 'USER_IMPERSONATE', 'users', str(target['id']),
             f"Switched session to {target['email']} ({target['role']})"))
        payload = _public_user(dict(target))
        payload.update({'impersonated': True, 'impersonator_name': user.get('full_name') or user.get('name') or ''})
        return success_response(start_response, data={"token": token, "user": payload},
                                message=f"You are now viewing the CRM as {target['full_name']}.",
                                headers=[('Set-Cookie', _session_cookie(token))])

    # ── POST /api/auth/switch-back (return to the admin's own session) ─────
    if path == '/api/auth/switch-back' and method == 'POST':
        if not user:
            return error_response(start_response, "Unauthorized", status_code=401)
        origin = _impersonation_origin(user.get('session_token'))
        if not origin:
            return error_response(start_response, "You are already on your own account.", status_code=400)
        execute_db("UPDATE user_sessions SET revoked_at = datetime('now') WHERE session_token = ?;",
                   (user['session_token'],))
        execute_db(
            "INSERT INTO activity_logs (user_id, user_email, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?);",
            (origin['id'], origin.get('email'), 'USER_IMPERSONATE_STOP', 'users', str(user['id']),
             'Returned to original account'))
        payload = _public_user(dict(origin))
        payload.update({'impersonated': False, 'impersonator_name': ''})
        return success_response(start_response, data={"token": origin['session_token'], "user": payload},
                                message="Back on your own account.",
                                headers=[('Set-Cookie', _session_cookie(origin['session_token']))])

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

    # ── POST /api/auth/profile ────────────────────────────────────────────
    # Legacy app.js saveProfile() — update contact details + optional password.
    if path == '/api/auth/profile' and method == 'POST':
        if not user:
            return error_response(start_response, "Not authenticated", status_code=401)

        body = body if isinstance(body, dict) else {}
        current = query_db("SELECT * FROM users WHERE id = ? LIMIT 1;", (user['id'],), one=True)
        if not current:
            return error_response(start_response, "User not found", status_code=404)

        full_name = (body.get('full_name') if 'full_name' in body else current.get('full_name')) or current.get('full_name')
        phone = body.get('phone') if 'phone' in body else current.get('phone')
        country = body.get('country') if 'country' in body else current.get('country')
        address = body.get('address') if 'address' in body else current.get('address')

        new_password = body.get('new_password') or ''
        if not isinstance(new_password, str):
            new_password = ''
        new_password = new_password.strip()

        if new_password:
            current_password = body.get('current_password') or ''
            if not verify_password(current_password, current.get('password_hash')):
                return error_response(start_response, "Current password is incorrect.", status_code=400)
            if len(new_password) < STAFF_MIN_PASSWORD_LEN:
                return error_response(
                    start_response,
                    f"Password must be at least {STAFF_MIN_PASSWORD_LEN} characters.",
                    status_code=400,
                )
            if 'confirm_password' in body and (body.get('confirm_password') or '') != new_password:
                return error_response(start_response, "New passwords do not match.", status_code=400)
            execute_db(
                "UPDATE users SET password_hash = ? WHERE id = ?;",
                (hash_password(new_password), user['id']),
            )
            # Sign out every other device; keep the session that made the change.
            _revoke_user_sessions(user['id'], except_token=user.get('session_token'))

        execute_db("""
            UPDATE users SET full_name = ?, phone = ?, country = ?, address = ? WHERE id = ?;
        """, (full_name, phone, country, address, user['id']))

        updated = query_db("SELECT * FROM users WHERE id = ? LIMIT 1;", (user['id'],), one=True)
        try:
            from services.audit_service import log_activity
            log_activity(
                user_id=user['id'],
                action='PROFILE_UPDATE',
                target_type='users',
                target_id=str(user['id']),
                details='Updated profile settings.' + (' Password changed.' if new_password else ''),
            )
        except Exception:
            pass

        return success_response(
            start_response,
            data={"user": _public_user(updated)},
            message="Password updated." if new_password else "Profile updated successfully",
        )

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
                    category='SECURITY', user_id=user_row['id'], store_body=False,
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
        _revoke_user_sessions(found_user['id'])
        return success_response(start_response, message="Password updated. You can now sign in.")

    return None
