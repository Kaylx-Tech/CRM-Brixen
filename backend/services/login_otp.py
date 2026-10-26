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
import re
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


FINSTAP_ICON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                 'static', 'img', 'finstap-icon.png')
FINSTAP_ACCENT = '#6559ff'


def _image_from_data_url(data_url):
    """(bytes, subtype) of a PNG/JPG/GIF/WebP data: URL; None for SVG, ICO or anything else."""
    import base64
    found = re.match(r'^data:image/(png|jpeg|jpg|gif|webp);base64,(.+)$', str(data_url or '').strip(), re.I | re.S)
    if not found:
        return None
    try:
        return base64.b64decode(found.group(2)), found.group(1).lower().replace('jpg', 'jpeg')
    except ValueError:
        return None


def _email_branding():
    """Who the code email is from: the company's name, its app icon from Settings > Branding (Finstap's
    when it has no branding at all; none when its icon is one email apps cannot show) and its accent."""
    from services.portal_compat import brand_settings
    from services.settings_service import get_setting
    settings = brand_settings()
    brand_icon, brand_logo = get_setting('brand_icon') or '', get_setting('brand_logo') or ''
    icon = _image_from_data_url(brand_icon)
    if not icon and not brand_icon and not brand_logo:
        with open(FINSTAP_ICON_PATH, 'rb') as fh:
            icon = (fh.read(), 'png')
    accent = str(get_setting('accent_color') or '').strip() or FINSTAP_ACCENT
    return {'brand': settings.get('brand_name') or 'your CRM', 'icon': icon, 'accent': accent,
            'support_email': settings.get('support_email') or ''}


COPY_ICON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              'static', 'img', 'copy-icon.png')


def _device_label(user_agent):
    """'Chrome on macOS' from a browser's user agent ('' when unknown)."""
    ua = str(user_agent or '')
    browser = next((name for key, name in (('Edg/', 'Edge'), ('OPR/', 'Opera'), ('Firefox/', 'Firefox'),
                                           ('CriOS', 'Chrome'), ('Chrome/', 'Chrome'), ('Safari/', 'Safari'))
                    if key in ua), '')
    system = next((name for key, name in (('iPhone', 'iOS'), ('iPad', 'iPadOS'), ('Android', 'Android'),
                                          ('Windows', 'Windows'), ('Mac OS X', 'macOS'), ('Linux', 'Linux'))
                   if key in ua), '')
    return ' on '.join(p for p in (browser, system) if p)


def sign_in_details(environ):
    """Where the sign-in came from, for the code email: device, location (city and country, when the
    proxy in front sends them, e.g. Cloudflare's visitor location headers), IP address, time and the
    address of the CRM it was made on."""
    from datetime import datetime, timezone
    from urllib.parse import unquote
    environ = environ or {}
    ip = (environ.get('HTTP_CF_CONNECTING_IP') or environ.get('HTTP_X_REAL_IP')
          or (environ.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0] or environ.get('REMOTE_ADDR') or '').strip()
    city = unquote(environ.get('HTTP_CF_IPCITY') or '').strip()
    country = (environ.get('HTTP_CF_IPCOUNTRY') or '').strip().upper()
    if country in ('XX', 'T1'):
        country = ''
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo('Europe/London'))
    except Exception:
        now = datetime.now(timezone.utc)
    origin = (environ.get('HTTP_ORIGIN') or '').strip().rstrip('/')
    return {
        'device': _device_label(environ.get('HTTP_USER_AGENT')),
        'location': ', '.join(p for p in (city, country) if p),
        'ip': ip,
        'time': f"{now.strftime('%-d %b %Y, %H:%M')} {now.tzname()}",
        'origin': origin if origin.startswith(('https://', 'http://')) else '',
    }


def code_email_html(brand, code, *, icon_src='', accent='#111827', details=None, support_email='', copy_icon_src=''):
    """The login code email: small icon and name, where the sign-in came from, the code, and what to do
    if it was not you. Inter like the CRM (email apps without it fall back to their system font).
    Email apps cannot copy on a click (no scripts), so one tap on the code selects all six digits and
    the small copy icon says so."""
    from html import escape
    name = escape(brand)
    details = details or {}
    accent = accent if re.match(r'^#[0-9a-fA-F]{6}$', str(accent or '')) else '#111827'
    sans = "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
    mono = "font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;"
    icon = (f'<img src="{escape(icon_src)}" alt="" width="36" height="36" style="display:block;width:36px;'
            'height:36px;border:0;border-radius:9px;outline:none;text-decoration:none;">' if icon_src else '')
    rows = [(label, details.get(key)) for label, key in
            (('Device', 'device'), ('Location', 'location'), ('IP address', 'ip'), ('Time', 'time'))]
    rows = [(label, value) for label, value in rows if value]
    detail_rows = ''.join(
        f'<tr><td style="padding:14px 0;{"border-top:1px solid #ececef;" if i else ""}font-size:11px;'
        f'font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">{label}</td>'
        f'<td align="right" style="padding:14px 0;{"border-top:1px solid #ececef;" if i else ""}{mono}'
        f'font-size:13px;color:#18181b;">{escape(str(value))}</td></tr>'
        for i, (label, value) in enumerate(rows))
    detail_box = (f'<tr><td style="padding:0 0 32px;"><table role="presentation" width="100%" cellpadding="0" '
                  f'cellspacing="0" style="background:#fafafa;border:1px solid #ececef;border-radius:12px;">'
                  f'<tr><td style="padding:6px 24px;"><table role="presentation" width="100%" cellpadding="0" '
                  f'cellspacing="0">{detail_rows}</table></td></tr></table></td></tr>') if rows else ''
    copy_icon = (f'<td style="padding:0 0 0 4px;vertical-align:middle;"><img src="{escape(copy_icon_src)}" '
                 'alt="Copy" title="Tap the code to select it, then copy" width="20" height="20" '
                 'style="display:block;width:20px;height:20px;border:0;outline:none;"></td>') if copy_icon_src else ''
    secure = (f' <a href="{escape(details["origin"])}/forgot-password" style="color:{accent};font-weight:600;'
              f'text-decoration:underline;">Secure your account&nbsp;&rarr;</a>') if details.get('origin') else ''
    help_line = (f'<br>Need help? <a href="mailto:{escape(support_email)}" style="color:#71717a;">'
                 f'{escape(support_email)}</a>') if support_email else ''
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;">Someone is signing in to your {name} account. Your code works for {CODE_MINUTES} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;{sans}color:#18181b;">
      <tr><td style="height:4px;line-height:4px;font-size:0;background:{accent};border-radius:16px 16px 0 0;">&nbsp;</td></tr>
      <tr><td style="padding:40px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 0 36px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              {f'<td style="padding:0 12px 0 0;vertical-align:middle;">{icon}</td>' if icon else ''}
              <td style="vertical-align:middle;font-size:17px;font-weight:600;letter-spacing:-0.01em;color:#18181b;">{name}</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:0 0 12px;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:#18181b;">Verify your sign-in</td></tr>
          <tr><td style="padding:0 0 28px;font-size:15px;line-height:1.6;color:#52525b;">We noticed a new sign-in to your {name} account. If this was you, enter the code below to continue.</td></tr>
          {detail_box}
          <tr><td align="center" style="padding:0 0 10px;font-size:13px;color:#71717a;">Your one-time code</td></tr>
          <tr><td align="center" style="padding:0 0 10px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="{mono}font-size:40px;line-height:1.1;font-weight:600;letter-spacing:10px;color:#18181b;"><span style="-webkit-user-select:all;user-select:all;">{code[:3]}<span style="margin-left:14px;">{code[3:]}</span></span></td>
              {copy_icon}
            </tr></table>
          </td></tr>
          <tr><td align="center" style="padding:0 0 32px;font-size:13px;color:#71717a;">Tap the code to copy it &middot; expires in {CODE_MINUTES} minutes</td></tr>
          <tr><td style="padding:0 0 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;">
              <tr><td style="padding:16px 20px;font-size:14px;line-height:1.6;color:#78350f;">&#9888;&#65039;&nbsp; If you didn't try to sign in, someone knows your password.{secure}</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 40px 28px;border-top:1px solid #ececef;font-size:12px;line-height:1.7;color:#a1a1aa;">
        You're receiving this because of a sign-in to your {name} account.{help_line}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def _copy_icon():
    with open(COPY_ICON_PATH, 'rb') as fh:
        return fh.read()


def _send_code(user, code, details=None):
    """Email the code; True when it went out (or, outside production, when it was printed instead)."""
    from services.email_service import send_email
    branding = _email_branding()
    brand = branding['brand']
    subject = f"Verify your sign-in to {brand}"
    text = (f"Verify your sign-in to {brand}\n\nYour one-time code: {code}\nIt expires in {CODE_MINUTES} minutes.\n\n"
            + ''.join(f"{label}: {details[key]}\n" for label, key in
                      (('Device', 'device'), ('Location', 'location'), ('IP address', 'ip'), ('Time', 'time'))
                      if (details or {}).get(key))
            + "\nIf you didn't try to sign in, someone knows your password: change it now.")
    html = code_email_html(brand, code, icon_src='cid:brand-logo' if branding['icon'] else '',
                           accent=branding['accent'], details=details, support_email=branding['support_email'],
                           copy_icon_src='cid:copy-icon')
    # From the login code mailbox (e.g. noreply@) when one is set up in Settings > Email
    sent = send_email(user.get('email'), subject, html, text, category='SECURITY',
                      user_id=user.get('id'), store_body=False, images=[('copy-icon', _copy_icon(), 'png')], logo=branding['icon'])
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


def start_challenge(user, device_id, user_agent='', details=None):
    """Email a new code. Returns (challenge, error); on error email_failure_reason() says why."""
    _ensure_tables()
    challenge = uuid.uuid4().hex
    code = f"{secrets.randbelow(1_000_000):06d}"
    execute_db("""
        INSERT INTO login_otps (challenge, user_id, device_hash, code_hash, expires_at, user_agent)
        VALUES (?, ?, ?, ?, datetime('now', ?), ?);
    """, (challenge, user['id'], _device_hash(device_id), _code_hash(challenge, code),
          f'+{CODE_MINUTES} minutes', (user_agent or '')[:250]))
    if not _send_code(user, code, details):
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


def resend_code(challenge, details=None):
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
    if not _send_code(dict(user), code, details):
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
