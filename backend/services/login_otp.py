"""Email login codes (one-time passwords) after the password.

Everyone signing in with email + password gets a 6-digit code by email, unless this browser was
confirmed for that user in the last 24 hours. A browser is told apart by a random device id the
CRM keeps in the browser (a new browser has a new id, so it always gets a code). The server only
stores hashes of the device id and the code.

  * a code works for 10 minutes and for 5 tries; a new one can be sent after 60 seconds
  * a confirmed browser is trusted for 24 hours from the moment the code was entered
  * LOGIN_EMAIL_OTP=0 (env) switches codes off, e.g. while email is down
  * when the code email cannot be sent at all (SMTP missing or refusing), the sign-in goes ahead
    without a code and the login screen shows why, so nobody is locked out by an email problem;
    LOGIN_OTP_STRICT=1 (env) blocks the sign-in instead
  * Finstap workspaces in LOGIN_OTP_SKIP_WORKSPACES (env, comma-separated; default "demo", the
    workspace shown to prospective clients) sign in without a code
"""
import hashlib
import hmac
import os
import secrets
import uuid

from db import query_db, execute_db

CODE_MINUTES = 10
MAX_TRIES = 5
RESEND_SECONDS = 60
MAX_SENDS = 5
TRUST_HOURS = 24


def _workspace_slug():
    """The Finstap workspace of this request ('' in Brixen, which has no workspaces)."""
    try:
        from tenancy import current_tenant
    except ImportError:
        return ''
    return str((current_tenant() or {}).get('slug') or '').lower()


def strict_mode():
    """LOGIN_OTP_STRICT=1: no sign-in at all when the code email cannot be sent."""
    return str(os.environ.get('LOGIN_OTP_STRICT', '0')).strip().lower() in ('1', 'true', 'on', 'yes')


def otp_enabled():
    if str(os.environ.get('LOGIN_EMAIL_OTP', '1')).strip().lower() in ('0', 'false', 'off', 'no'):
        return False
    skip = {s.strip().lower() for s in os.environ.get('LOGIN_OTP_SKIP_WORKSPACES', 'demo').split(',') if s.strip()}
    slug = _workspace_slug()
    return not (slug and slug in skip)


def _ensure_tables():
    execute_db("""
        CREATE TABLE IF NOT EXISTS login_otps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenge TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            device_hash TEXT,
            code_hash TEXT NOT NULL,
            tries INTEGER NOT NULL DEFAULT 0,
            sends INTEGER NOT NULL DEFAULT 1,
            sent_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL,
            used_at TEXT,
            user_agent TEXT
        );
    """)
    execute_db("""
        CREATE TABLE IF NOT EXISTS trusted_devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            device_hash TEXT NOT NULL,
            trusted_until TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            user_agent TEXT,
            UNIQUE(user_id, device_hash)
        );
    """)


def _device_hash(device_id):
    device_id = str(device_id or '').strip()
    return hashlib.sha256(device_id.encode('utf-8')).hexdigest() if len(device_id) >= 16 else ''


def _code_hash(challenge, code):
    return hmac.new(str(challenge).encode('utf-8'), str(code).strip().encode('utf-8'), hashlib.sha256).hexdigest()


def email_hint(email):
    """m•••@gmail.com"""
    name, _, domain = str(email or '').partition('@')
    return f"{name[:1]}•••@{domain}" if domain else '•••'


def device_trusted(user_id, device_id):
    """This browser entered a code for this user within the last 24 hours."""
    device = _device_hash(device_id)
    if not device:
        return False
    _ensure_tables()
    row = query_db("""
        SELECT 1 FROM trusted_devices
        WHERE user_id = ? AND device_hash = ? AND datetime(trusted_until) > datetime('now') LIMIT 1;
    """, (user_id, device), one=True)
    return bool(row)


def trust_device(user_id, device_id, user_agent=''):
    device = _device_hash(device_id)
    if not device:
        return
    _ensure_tables()
    execute_db("""
        INSERT INTO trusted_devices (user_id, device_hash, trusted_until, user_agent)
        VALUES (?, ?, datetime('now', ?), ?)
        ON CONFLICT(user_id, device_hash) DO UPDATE SET
            trusted_until = excluded.trusted_until, user_agent = excluded.user_agent;
    """, (user_id, device, f'+{TRUST_HOURS} hours', (user_agent or '')[:250]))


def code_email_html(brand, logo_src, code):
    """The login code email: logo (or the name), headline, the code in a large box, and why it came."""
    from html import escape
    name = escape(brand)
    if logo_src:
        top = (f'<img src="{escape(logo_src)}" alt="{name}" height="48" style="display:block;height:48px;'
               'width:auto;max-width:240px;border:0;outline:none;text-decoration:none;">')
    else:
        top = f'<p style="margin:0;font-size:22px;font-weight:700;color:#111827;">{name}</p>'
    font = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;{font}color:#111827;">
      <tr><td style="padding:0 0 40px;">{top}</td></tr>
      <tr><td style="padding:0 0 20px;font-size:30px;line-height:1.25;font-weight:700;">Finish signing in to {name}.</td></tr>
      <tr><td style="padding:0 0 24px;font-size:16px;line-height:1.5;color:#4b5563;">Use this one-time login code to confirm it's you:</td></tr>
      <tr><td align="center" style="background:#f1f4f8;border-radius:16px;padding:32px 16px;font-size:44px;line-height:1;font-weight:500;letter-spacing:6px;color:#111827;">{code}</td></tr>
      <tr><td style="padding:16px 0 32px;font-size:14px;line-height:1.5;color:#6b7280;">The code works for {CODE_MINUTES} minutes. Never share it with anyone.</td></tr>
      <tr><td style="border:1px solid #e5e7eb;border-radius:16px;padding:24px;">
        <p style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;">Why did I get this email?</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">Someone signed in to {name} with your email and password. If this wasn't you, change your password now, because someone else knows it.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


FINSTAP_LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                 'static', 'img', 'finstap-logo.png')


def _email_logo():
    """(img src, (bytes, subtype) or None) for the code email: the company's logo from Settings > Branding,
    Finstap's logo when it has none, and the company name ('') when its logo is one email apps cannot show (SVG, ICO)."""
    import base64
    import re
    from services.settings_service import get_setting
    data_url = str(get_setting('brand_logo') or '').strip()
    if not data_url:
        with open(FINSTAP_LOGO_PATH, 'rb') as fh:
            return 'cid:brand-logo', (fh.read(), 'png')
    found = re.match(r'^data:image/(png|jpeg|jpg|gif|webp);base64,(.+)$', data_url, re.I | re.S)
    if not found:
        return '', None
    try:
        return 'cid:brand-logo', (base64.b64decode(found.group(2)), found.group(1).lower().replace('jpg', 'jpeg'))
    except ValueError:
        return '', None


def _send_code(user, code):
    """Email the code; True when it went out (or, outside production, when it was printed instead)."""
    from services.email_service import send_email
    from services.portal_compat import brand_settings
    brand = brand_settings().get('brand_name') or 'your CRM'
    subject = f"{code} is your {brand} login code"
    text = (f"Your login code is {code}.\n\nIt works for {CODE_MINUTES} minutes. If you did not try to "
            f"sign in, change your password, because someone knows it.")
    logo_src, logo = _email_logo()
    html = code_email_html(brand, logo_src, code)
    sent = send_email(user.get('email'), subject, html, text, category='SECURITY',
                      user_id=user.get('id'), store_body=False, logo=logo)
    if not sent:
        from config import IS_PRODUCTION
        if not IS_PRODUCTION:
            # Local development without SMTP: the code goes to the server log so sign-in still works
            print(f"[Login code] {user.get('email')}: {code} (email not sent: no SMTP in development)")
            return True
    return sent


def email_failure_reason():
    """Why the code email did not go out (from the email service), for the login fallback."""
    from services.email_service import last_failure_reason
    return last_failure_reason() or 'the email could not be sent'


def start_challenge(user, device_id, user_agent=''):
    """Email a new code. Returns (challenge, error); on error email_failure_reason() says why."""
    _ensure_tables()
    challenge = uuid.uuid4().hex
    code = f"{secrets.randbelow(1_000_000):06d}"
    execute_db("""
        INSERT INTO login_otps (challenge, user_id, device_hash, code_hash, expires_at, user_agent)
        VALUES (?, ?, ?, ?, datetime('now', ?), ?);
    """, (challenge, user['id'], _device_hash(device_id), _code_hash(challenge, code),
          f'+{CODE_MINUTES} minutes', (user_agent or '')[:250]))
    if not _send_code(user, code):
        execute_db("UPDATE login_otps SET used_at = datetime('now') WHERE challenge = ?;", (challenge,))
        return None, "We could not email your login code. Please try again in a few minutes or contact support."
    return challenge, None


def _open_challenge(challenge):
    _ensure_tables()
    return query_db("""
        SELECT *, CAST(strftime('%s', 'now') - strftime('%s', sent_at) AS INTEGER) AS age_seconds
        FROM login_otps
        WHERE challenge = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now') LIMIT 1;
    """, (str(challenge or ''),), one=True)


def resend_code(challenge):
    """A new code for the same sign-in. Returns (ok, error, wait_seconds)."""
    row = _open_challenge(challenge)
    if not row:
        return False, "This sign-in has expired. Please log in again.", 0
    wait = RESEND_SECONDS - int(row.get('age_seconds') or 0)
    if wait > 0:
        return False, f"Please wait {wait} seconds before asking for a new code.", wait
    if int(row.get('sends') or 0) >= MAX_SENDS:
        return False, "Too many codes were sent. Please log in again later.", 0
    user = query_db("SELECT id, email, full_name FROM users WHERE id = ? LIMIT 1;", (row['user_id'],), one=True)
    if not user:
        return False, "This sign-in has expired. Please log in again.", 0
    code = f"{secrets.randbelow(1_000_000):06d}"
    execute_db("""
        UPDATE login_otps SET code_hash = ?, tries = 0, sends = sends + 1, sent_at = datetime('now'),
                              expires_at = datetime('now', ?)
        WHERE id = ?;
    """, (_code_hash(challenge, code), f'+{CODE_MINUTES} minutes', row['id']))
    if not _send_code(dict(user), code):
        return False, "We could not email your login code. Please try again in a few minutes.", 0
    return True, None, RESEND_SECONDS


def verify_code(challenge, code, device_id, user_agent=''):
    """Check the code. Returns (user_id, error). A right code trusts this browser for 24 hours."""
    row = _open_challenge(challenge)
    if not row:
        return None, "This code has expired. Please log in again to get a new one."
    if int(row.get('tries') or 0) >= MAX_TRIES:
        execute_db("UPDATE login_otps SET used_at = datetime('now') WHERE id = ?;", (row['id'],))
        return None, "Too many wrong codes. Please log in again to get a new one."
    if not hmac.compare_digest(row['code_hash'], _code_hash(challenge, str(code or '').strip())):
        execute_db("UPDATE login_otps SET tries = tries + 1 WHERE id = ?;", (row['id'],))
        left = MAX_TRIES - int(row.get('tries') or 0) - 1
        return None, (f"That code is not right. {left} tr{'y' if left == 1 else 'ies'} left."
                      if left > 0 else "Too many wrong codes. Please log in again to get a new one.")
    execute_db("UPDATE login_otps SET used_at = datetime('now') WHERE id = ?;", (row['id'],))
    # The browser that asked for the code is the one trusted (its id must match)
    if row.get('device_hash') and row['device_hash'] == _device_hash(device_id):
        trust_device(row['user_id'], device_id, user_agent)
    return row['user_id'], None
