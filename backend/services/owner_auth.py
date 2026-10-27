"""Sign-in for the Finstap owner portal (admin.finstap.com): the platform's own admins, not a workspace's.

  * accounts live in platform.db (platform_admins); the first one is made on the server with
    scripts/create_platform_owner.py, never through the website
  * every sign-in is email + password, then a 6-digit code sent to that email (10 minutes, 5 tries)
  * a session lasts 12 hours; only hashes of codes and session tokens are stored
  * wrong passwords are slowed down per email and per network
  * everything an owner changes is written to platform_audit
"""
import hashlib
import hmac
import secrets
import threading
import time

from db import hash_password, verify_password
from tenancy import _platform_conn, _platform_execute, _platform_query, ensure_platform, use_tenant

CODE_MINUTES = 10
MAX_TRIES = 5
RESEND_SECONDS = 60
MAX_SENDS = 5
SESSION_HOURS = 12
TOKEN_PREFIX = 'owner.'

FAIL_LIMIT = 5
FAIL_WINDOW = 15 * 60
_fails = {}
_fail_lock = threading.Lock()


class OwnerAuthError(ValueError):
    """Sign-in did not work; the message is safe to show. `wait` = seconds to wait."""

    def __init__(self, message, wait=0):
        super().__init__(message)
        self.wait = wait


def _hash(value):
    return hashlib.sha256(str(value).encode('utf-8')).hexdigest()


def _code_hash(challenge, code):
    return hmac.new(str(challenge).encode('utf-8'), str(code).strip().encode('utf-8'), hashlib.sha256).hexdigest()


def _blocked(keys):
    now = time.time()
    with _fail_lock:
        for key in keys:
            recent = [t for t in _fails.get(key, []) if now - t < FAIL_WINDOW]
            _fails[key] = recent
            if len(recent) >= FAIL_LIMIT:
                return int(FAIL_WINDOW - (now - recent[0]))
    return 0


def _fail(keys):
    with _fail_lock:
        for key in keys:
            _fails.setdefault(key, []).append(time.time())


def save_admin(email, full_name, password):
    """Create an owner account, or set a new name and password on an existing one."""
    email = str(email or '').strip().lower()
    if '@' not in email:
        raise OwnerAuthError("A valid email is required")
    if len(password or '') < 12:
        raise OwnerAuthError("The password must be at least 12 characters")
    ensure_platform()
    _platform_execute("""
        INSERT INTO platform_admins (email, full_name, password_hash) VALUES (?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET full_name = excluded.full_name, password_hash = excluded.password_hash,
                                         status = 'Active';
    """, (email, (full_name or email).strip(), hash_password(password)))


def _send_code(email, code):
    from services.email_service import send_email
    subject = f"{code} is your Finstap owner sign-in code"
    text = (f"Your Finstap owner portal sign-in code is {code}.\n\nIt works for {CODE_MINUTES} minutes. "
            "If you did not just sign in, change your password straight away.")
    html = (f'<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;'
            f'padding:32px 16px;color:#111827;"><p style="font-size:20px;font-weight:700;margin:0 0 16px;">'
            f'Finstap owner portal</p><p style="margin:0 0 20px;color:#4b5563;">Your sign-in code:</p>'
            f'<p style="font-size:40px;letter-spacing:8px;font-weight:600;background:#f1f4f8;border-radius:14px;'
            f'padding:24px;text-align:center;margin:0 0 20px;">{code}</p><p style="color:#6b7280;font-size:14px;">'
            f'It works for {CODE_MINUTES} minutes. If you did not just sign in, change your password straight '
            f'away.</p></div>')
    with use_tenant(None):
        sent = send_email(email, subject, html, text, category='SECURITY', log=False, store_body=False,
                          sender_name='Finstap')
    if not sent:
        from config import IS_PRODUCTION
        if not IS_PRODUCTION:
            # Local development without SMTP: the code goes to the server log
            print(f"[Owner code] {email}: {code} (email not sent: no SMTP in development)")
            return True
    return sent


def start_login(email, password, ip=''):
    """Check the password and email a code. Returns (challenge, email_hint)."""
    email = str(email or '').strip().lower()
    keys = [f"e:{email}", f"i:{ip}"]
    wait = _blocked(keys)
    if wait:
        raise OwnerAuthError(f"Too many tries. Please wait {max(1, wait // 60)} minute(s).", wait=wait)
    admin = _platform_query("SELECT * FROM platform_admins WHERE email = ? AND status = 'Active' LIMIT 1;",
                            (email,), one=True)
    if not verify_password(password or '', admin['password_hash'] if admin else None):
        _fail(keys)
        raise OwnerAuthError("Email or password is not right.")
    challenge = secrets.token_urlsafe(24)
    code = f"{secrets.randbelow(1000000):06d}"
    _platform_execute("""
        INSERT INTO platform_login_codes (challenge, admin_id, code_hash, expires_at)
        VALUES (?, ?, ?, datetime('now', ?));
    """, (challenge, admin['id'], _code_hash(challenge, code), f'+{CODE_MINUTES} minutes'))
    if not _send_code(email, code):
        raise OwnerAuthError("We could not email your sign-in code. Check the server's email settings.")
    name, _, domain = email.partition('@')
    return challenge, f"{name[:1]}•••@{domain}"


def resend(challenge):
    row = _platform_query("""
        SELECT c.*, a.email, CAST((julianday('now') - julianday(c.sent_at)) * 86400 AS INTEGER) AS age
        FROM platform_login_codes c JOIN platform_admins a ON a.id = c.admin_id
        WHERE c.challenge = ? AND c.used_at IS NULL LIMIT 1;
    """, (str(challenge or ''),), one=True)
    if not row:
        raise OwnerAuthError("This sign-in has expired. Please sign in again.")
    wait = RESEND_SECONDS - int(row['age'] or 0)
    if wait > 0:
        raise OwnerAuthError(f"Please wait {wait} seconds before asking for a new code.", wait=wait)
    if int(row['sends'] or 0) >= MAX_SENDS:
        raise OwnerAuthError("Too many codes were sent. Please sign in again later.")
    code = f"{secrets.randbelow(1000000):06d}"
    _platform_execute("""
        UPDATE platform_login_codes SET code_hash = ?, tries = 0, sends = sends + 1, sent_at = datetime('now'),
               expires_at = datetime('now', ?) WHERE challenge = ?;
    """, (_code_hash(challenge, code), f'+{CODE_MINUTES} minutes', challenge))
    if not _send_code(row['email'], code):
        raise OwnerAuthError("We could not email your sign-in code. Please try again.")


def verify(challenge, code, ip='', user_agent=''):
    """Check the code. Returns (session_token, admin)."""
    challenge = str(challenge or '')
    code = ''.join(ch for ch in str(code or '') if ch.isdigit())
    ensure_platform()
    conn = _platform_conn()
    try:
        # One write transaction, so a code works only once
        conn.execute("BEGIN IMMEDIATE;")
        row = conn.execute("""
            SELECT * FROM platform_login_codes
            WHERE challenge = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now') LIMIT 1;
        """, (challenge,)).fetchone()
        if not row:
            conn.commit()
            raise OwnerAuthError("This code has expired. Please sign in again.")
        if row['tries'] >= MAX_TRIES:
            conn.execute("UPDATE platform_login_codes SET used_at = datetime('now') WHERE challenge = ?;", (challenge,))
            conn.commit()
            raise OwnerAuthError("Too many wrong codes. Please sign in again.")
        if len(code) != 6 or not hmac.compare_digest(row['code_hash'], _code_hash(challenge, code)):
            conn.execute("UPDATE platform_login_codes SET tries = tries + 1 WHERE challenge = ?;", (challenge,))
            conn.commit()
            left = MAX_TRIES - row['tries'] - 1
            raise OwnerAuthError("That code is not right." + (f" {left} tries left." if left > 0 else ""))
        token = TOKEN_PREFIX + secrets.token_urlsafe(32)
        conn.execute("UPDATE platform_login_codes SET used_at = datetime('now') WHERE challenge = ?;", (challenge,))
        conn.execute("""
            INSERT INTO platform_sessions (token_hash, admin_id, expires_at, ip, user_agent)
            VALUES (?, ?, datetime('now', ?), ?, ?);
        """, (_hash(token), row['admin_id'], f'+{SESSION_HOURS} hours', (ip or '')[:64], (user_agent or '')[:250]))
        conn.execute("UPDATE platform_admins SET last_login_at = datetime('now') WHERE id = ?;", (row['admin_id'],))
        conn.commit()
    finally:
        conn.close()
    admin = admin_for_token(token)
    audit(admin, 'SIGNED_IN', detail=f"from {ip}" if ip else None)
    return token, admin


def admin_for_token(token):
    """The owner signed in with this token, or None."""
    token = str(token or '')
    if not token.startswith(TOKEN_PREFIX):
        return None
    return _platform_query("""
        SELECT a.id, a.email, a.full_name, a.last_login_at FROM platform_sessions s
        JOIN platform_admins a ON a.id = s.admin_id
        WHERE s.token_hash = ? AND s.revoked_at IS NULL AND datetime(s.expires_at) > datetime('now')
          AND a.status = 'Active' LIMIT 1;
    """, (_hash(token),), one=True)


def logout(token):
    _platform_execute("UPDATE platform_sessions SET revoked_at = datetime('now') WHERE token_hash = ?;",
                      (_hash(token or ''),))


def audit(admin, action, tenant_slug=None, detail=None):
    _platform_execute("""
        INSERT INTO platform_audit (admin_id, admin_email, action, tenant_slug, detail) VALUES (?, ?, ?, ?, ?);
    """, ((admin or {}).get('id'), (admin or {}).get('email'), action, tenant_slug, detail))
