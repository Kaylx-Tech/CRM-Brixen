"""Finstap signup step 1: confirm the owner's email with an emailed 6-digit code.

Nobody can create a workspace with an email they cannot open. The code is checked here, on the
shared address (finstap.com, no workspace yet), and a right code gives an email token that
POST /api/platform/signup must bring; the token is for that one email and works once.

  * a code works for 10 minutes and for 5 tries; a new one can be sent after 60 seconds
  * at most 5 codes per email and 10 per network (IP) an hour
  * a confirmed email can be used for signup within 60 minutes
  * the email is sent as "Finstap" from the platform mailbox (SMTP_* env), never a company's
  * only hashes of the code and the token are stored (platform.db, table signup_emails)
"""
import hashlib
import hmac
import re
import secrets

from tenancy import _platform_conn, _platform_execute, _platform_query, ensure_platform, use_tenant

CODE_MINUTES = 10
MAX_TRIES = 5
RESEND_SECONDS = 60
MAX_SENDS_PER_EMAIL_HOUR = 5
MAX_SENDS_PER_IP_HOUR = 10
TOKEN_MINUTES = 60

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


class SignupEmailError(ValueError):
    """The code could not be sent or checked; the message is safe to show. `wait` = seconds to wait."""

    def __init__(self, message, wait=0):
        super().__init__(message)
        self.wait = wait


def normalize_email(email):
    return str(email or '').strip().lower()


def _code_hash(challenge, code):
    return hmac.new(str(challenge).encode('utf-8'), str(code).strip().encode('utf-8'), hashlib.sha256).hexdigest()


def _token_hash(token):
    return hashlib.sha256(str(token).encode('utf-8')).hexdigest()


def code_email_html(logo_src, code):
    """The signup code email, in the same look as the login code email."""
    font = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
    if logo_src:
        top = (f'<img src="{logo_src}" alt="Finstap" height="48" style="display:block;height:48px;'
               'width:auto;max-width:240px;border:0;outline:none;text-decoration:none;">')
    else:
        top = '<p style="margin:0;font-size:22px;font-weight:700;color:#111827;">Finstap</p>'
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
  <tr><td align="center" style="padding:40px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;{font}color:#111827;">
      <tr><td style="padding:0 0 40px;">{top}</td></tr>
      <tr><td style="padding:0 0 20px;font-size:30px;line-height:1.25;font-weight:700;">Confirm your email to create your Finstap workspace.</td></tr>
      <tr><td style="padding:0 0 24px;font-size:16px;line-height:1.5;color:#4b5563;">Enter this code on the signup page:</td></tr>
      <tr><td align="center" style="background:#f1f4f8;border-radius:16px;padding:32px 16px;font-size:44px;line-height:1;font-weight:500;letter-spacing:6px;color:#111827;">{code}</td></tr>
      <tr><td style="padding:16px 0 32px;font-size:14px;line-height:1.5;color:#6b7280;">The code works for {CODE_MINUTES} minutes. Never share it with anyone.</td></tr>
      <tr><td style="border:1px solid #e5e7eb;border-radius:16px;padding:24px;">
        <p style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;">Why did I get this email?</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#4b5563;">Someone started a Finstap signup with this email address. If this wasn't you, ignore this email: nothing is created without the code.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def _send(email, code):
    """Email the code as Finstap; True when it went out (outside production it may be printed instead)."""
    from services.email_service import send_email
    from services.login_otp import FINSTAP_LOGO_PATH
    try:
        with open(FINSTAP_LOGO_PATH, 'rb') as fh:
            logo_src, logo = 'cid:brand-logo', (fh.read(), 'png')
    except OSError:
        logo_src, logo = '', None
    subject = f"{code} is your Finstap verification code"
    text = (f"Your Finstap verification code is {code}.\n\nIt works for {CODE_MINUTES} minutes. If you did not "
            f"start a Finstap signup, ignore this email.")
    # No workspace here: settings and the email log come from the server (SMTP_* env), never a company
    with use_tenant(None):
        sent = send_email(email, subject, code_email_html(logo_src, code), text, category='SECURITY',
                          log=False, store_body=False, logo=logo, sender_name='Finstap')
    if not sent:
        from config import IS_PRODUCTION
        if not IS_PRODUCTION:
            # Local development without SMTP: the code goes to the server log so signup still works
            print(f"[Signup code] {email}: {code} (email not sent: no SMTP in development)")
            return True
    return sent


def _check_limits(email, ip):
    recent = _platform_query("""
        SELECT COUNT(*) AS c FROM signup_emails WHERE email = ? AND datetime(sent_at) > datetime('now', '-1 hour');
    """, (email,), one=True)
    if int((recent or {}).get('c') or 0) >= MAX_SENDS_PER_EMAIL_HOUR:
        raise SignupEmailError("Too many codes for this email. Try again in an hour.")
    if ip:
        by_ip = _platform_query("""
            SELECT COUNT(*) AS c FROM signup_emails WHERE ip = ? AND datetime(sent_at) > datetime('now', '-1 hour');
        """, (ip,), one=True)
        if int((by_ip or {}).get('c') or 0) >= MAX_SENDS_PER_IP_HOUR:
            raise SignupEmailError("Too many codes from this network. Try again later.")
    last = _platform_query("""
        SELECT CAST((julianday('now') - julianday(sent_at)) * 86400 AS INTEGER) AS age
        FROM signup_emails WHERE email = ? ORDER BY sent_at DESC LIMIT 1;
    """, (email,), one=True)
    if last:
        wait = max(0, RESEND_SECONDS - int(last['age'] or 0))
        if wait > 0:
            raise SignupEmailError(f"Please wait {wait} seconds before asking for a new code.", wait=wait)


def start(email, ip=''):
    """Send a code to this email. Returns the challenge id the code is checked against."""
    email = normalize_email(email)
    if not EMAIL_RE.match(email):
        raise SignupEmailError("Enter a valid email address.")
    ensure_platform()
    _check_limits(email, ip)
    challenge = secrets.token_urlsafe(24)
    code = f"{secrets.randbelow(1000000):06d}"
    _platform_execute("""
        INSERT INTO signup_emails (challenge, email, code_hash, ip, expires_at)
        VALUES (?, ?, ?, ?, datetime('now', ?));
    """, (challenge, email, _code_hash(challenge, code), (ip or '')[:64], f'+{CODE_MINUTES} minutes'))
    if not _send(email, code):
        # A code that never went out does not count against the wait or the hourly limits
        _platform_execute("""
            UPDATE signup_emails SET expires_at = datetime('now'), sent_at = datetime('now', '-1 hour')
            WHERE challenge = ?;
        """, (challenge,))
        raise SignupEmailError("We could not send the code right now. Please try again in a few minutes.")
    return challenge


def resend(challenge):
    """A new code on the same challenge; the old code stops working."""
    challenge = str(challenge or '')
    row = _platform_query("""
        SELECT email, sends, CAST((julianday('now') - julianday(sent_at)) * 86400 AS INTEGER) AS age
        FROM signup_emails WHERE challenge = ? AND verified_at IS NULL LIMIT 1;
    """, (challenge,), one=True)
    if not row:
        raise SignupEmailError("Start again: enter your email.")
    wait = max(0, RESEND_SECONDS - int(row['age'] or 0))
    if wait > 0:
        raise SignupEmailError(f"Please wait {wait} seconds before asking for a new code.", wait=wait)
    if int(row['sends'] or 0) >= MAX_SENDS_PER_EMAIL_HOUR:
        raise SignupEmailError("Too many codes for this email. Try again in an hour.")
    code = f"{secrets.randbelow(1000000):06d}"
    _platform_execute("""
        UPDATE signup_emails SET code_hash = ?, tries = 0, sends = sends + 1, sent_at = datetime('now'),
               expires_at = datetime('now', ?)
        WHERE challenge = ?;
    """, (_code_hash(challenge, code), f'+{CODE_MINUTES} minutes', challenge))
    if not _send(row['email'], code):
        raise SignupEmailError("We could not send the code right now. Please try again in a few minutes.")


def verify(challenge, code):
    """Check the code. Returns (email, email_token) for the signup."""
    challenge = str(challenge or '')
    code = re.sub(r'\D', '', str(code or ''))
    ensure_platform()
    conn = _platform_conn()
    try:
        # One write transaction, so a code cannot be used twice by two requests at once
        conn.execute("BEGIN IMMEDIATE;")
        row = conn.execute("""
            SELECT * FROM signup_emails WHERE challenge = ? AND verified_at IS NULL
              AND datetime(expires_at) > datetime('now') LIMIT 1;
        """, (challenge,)).fetchone()
        if not row:
            conn.commit()
            raise SignupEmailError("This code has expired. Send a new code.")
        if row['tries'] >= MAX_TRIES:
            conn.commit()
            raise SignupEmailError("Too many wrong tries. Send a new code.")
        if len(code) != 6 or not hmac.compare_digest(row['code_hash'], _code_hash(challenge, code)):
            conn.execute("UPDATE signup_emails SET tries = tries + 1 WHERE challenge = ?;", (challenge,))
            conn.commit()
            left = MAX_TRIES - row['tries'] - 1
            raise SignupEmailError("That code is not right." + (f" {left} tries left." if left > 0 else
                                                                 " Send a new code."))
        token = secrets.token_urlsafe(32)
        conn.execute("""
            UPDATE signup_emails SET verified_at = datetime('now'), token_hash = ?,
                   token_expires_at = datetime('now', ?)
            WHERE challenge = ?;
        """, (_token_hash(token), f'+{TOKEN_MINUTES} minutes', challenge))
        conn.commit()
        return row['email'], token
    finally:
        conn.close()


def verified_email(token):
    """The confirmed email behind a token that is still good (not used, not expired); '' otherwise."""
    if not token:
        return ''
    row = _platform_query("""
        SELECT email FROM signup_emails WHERE token_hash = ? AND verified_at IS NOT NULL AND used_at IS NULL
          AND datetime(token_expires_at) > datetime('now') LIMIT 1;
    """, (_token_hash(token),), one=True)
    return row['email'] if row else ''


def use_token(token):
    """The workspace was made: the token cannot make another one."""
    _platform_execute("UPDATE signup_emails SET used_at = datetime('now') WHERE token_hash = ?;", (_token_hash(token),))
