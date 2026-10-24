"""Brixen CRM - SMTP Email Service
Uses DB settings first (settings_service), then environment variables.
Never reports success when SMTP is not configured.
"""
import smtplib
import ssl
import os
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def _smtp_config():
    host = os.environ.get('SMTP_HOST', '')
    port = os.environ.get('SMTP_PORT', '')
    user = os.environ.get('SMTP_USER', '')
    password = os.environ.get('SMTP_PASS', '')
    from_email = os.environ.get('SMTP_FROM', '')

    try:
        from services.settings_service import get_setting
        host = get_setting('smtp_host', host) or host
        port = get_setting('smtp_port', port) or port
        user = get_setting('smtp_user', user) or user
        password = get_setting('smtp_pass', password) or password
        from_email = get_setting('smtp_from', from_email) or from_email
    except Exception:
        pass

    host = (host or 'smtp.hostinger.com').strip()
    try:
        port = int(port or 587)
    except (TypeError, ValueError):
        port = 587
    user = (user or '').strip()
    password = (password or '').strip()
    from_email = (from_email or user or '').strip()
    return host, port, user, password, from_email


def emails_enabled():
    """Settings key emails_enabled (kept from the old portal). Missing = on; false / 0 / off / no = off."""
    try:
        from services.settings_service import get_setting
        value = str(get_setting('emails_enabled', 'true') or 'true').strip().lower()
    except Exception:
        return True
    return value not in ('false', '0', 'off', 'no')


def _log_email(recipient, subject, html_content, text_content, status, error, meta):
    """Record every email attempt in email_outbox (the Email log page). Never raises."""
    try:
        from db import execute_db
        meta = meta or {}
        return execute_db("""
            INSERT INTO email_outbox (recipient, subject, body_text, body_html, status, attempts, last_error,
                                      category, user_id, order_id, company_id, triggered_by, created_at, sent_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP,
                    CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP END);
        """, (recipient or '(none)', subject or '(no subject)', text_content, html_content, status,
              (str(error)[:500] if error else None), meta.get('category'), meta.get('user_id'),
              meta.get('order_id'), meta.get('company_id'), meta.get('triggered_by'), status))
    except Exception as exc:
        print(f"[Email Service] Could not write the email log: {exc}")
        return None


# Why the last email on this server thread could not be sent (read by the login code step)
_last_failure = {'status': '', 'error': ''}


def last_failure_reason():
    """A short, readable reason the last send failed ('' when it went out). No secrets in it."""
    status = _last_failure['status']
    text = str(_last_failure['error'] or '')
    low = text.lower()
    if not status:
        return ''
    if status == 'not_configured':
        return 'email (SMTP) is not set up on the server: SMTP_USER / SMTP_PASS are empty'
    if status == 'invalid_recipient':
        return 'the account has no valid email address'
    if '535' in low or 'authentication' in low or 'username and password' in low or 'auth' in low:
        return 'the email server refused the SMTP username or password (SMTP_USER / SMTP_PASS)'
    if 'timed out' in low or 'timeout' in low or 'refused' in low or 'unreachable' in low or 'name or service' in low:
        return 'the server cannot reach the email server (SMTP_HOST / SMTP_PORT)'
    if 'sender' in low or '553' in low or '550' in low:
        return 'the email server refused the From address (SMTP_FROM must be the SMTP_USER mailbox)'
    return f'the email server said: {text[:140]}'


def send_email(recipient, subject, html_content, text_content=None, *, category=None, user_id=None,
               order_id=None, company_id=None, triggered_by=None, log=True, store_body=True):
    """Send an HTML transactional email via SMTP. Returns True only on real send.

    Every attempt is written to the email log (status sent / failed / not_configured / invalid_recipient)
    together with what it was about, so admins can see and resend it. store_body=False keeps secrets
    (password reset links) out of the log; such an email cannot be resent from the log.
    """
    meta = {'category': category, 'user_id': user_id, 'order_id': order_id, 'company_id': company_id,
            'triggered_by': triggered_by}
    # Master switch (Settings > Email: "Send emails"): when off, nothing goes out except password resets,
    # and the email is logged as suppressed so it can be sent later from the Email log
    if category != 'SECURITY' and not emails_enabled():
        ok, status, error = False, 'suppressed', 'Emails are turned off in Settings > Email'
    else:
        ok, status, error = _deliver(recipient, subject, html_content, text_content)
    _last_failure['status'], _last_failure['error'] = ('', '') if ok else (status, error)
    if log:
        _log_email((recipient or '').strip(), subject,
                   html_content if store_body else None, text_content if store_body else None,
                   status, error, meta)
    return ok


def resend_logged_email(log_id, actor_id=None):
    """Send a logged email again (same recipient and content). Returns (ok, status, error)."""
    from db import execute_db, query_db
    row = query_db("SELECT * FROM email_outbox WHERE id = ?;", (log_id,), one=True)
    if not row:
        return False, 'not_found', 'Email not found in the log'
    if not row.get('body_html') and not row.get('body_text'):
        return False, 'not_resendable', 'This email (e.g. a password reset) was not stored, so it cannot be resent'
    ok, status, error = _deliver(row['recipient'], row['subject'], row.get('body_html'), row.get('body_text'))
    execute_db("""
        UPDATE email_outbox
        SET status = ?, attempts = COALESCE(attempts, 0) + 1, last_error = ?,
            sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END
        WHERE id = ?;
    """, (status, (str(error)[:500] if error else None), status, log_id))
    return ok, status, error


def _build_message(subject, sender, recipient, html_content, text_content):
    """Text + HTML; an HTML email that shows the bundled logo (cid:) carries the logo image inside it."""
    from services.email_engine import BUNDLED_LOGO_PATH, EMAIL_LOGO_CID

    body = MIMEMultipart('alternative')
    if text_content:
        body.attach(MIMEText(text_content, 'plain'))
    if html_content:
        body.attach(MIMEText(html_content, 'html'))
    msg = body
    if html_content and f'cid:{EMAIL_LOGO_CID}' in html_content and os.path.isfile(BUNDLED_LOGO_PATH):
        msg = MIMEMultipart('related')
        msg.attach(body)
        with open(BUNDLED_LOGO_PATH, 'rb') as fh:
            logo = MIMEImage(fh.read(), 'png')
        logo.add_header('Content-ID', f'<{EMAIL_LOGO_CID}>')
        logo.add_header('Content-Disposition', 'inline', filename='logo.png')
        msg.attach(logo)
    msg['Subject'] = subject
    msg['From'] = sender
    msg['To'] = recipient
    return msg


def _deliver(recipient, subject, html_content, text_content):
    """Hand the message to the SMTP server. Returns (ok, status, error)."""
    recipient = (recipient or '').strip()
    if not recipient or '@' not in recipient:
        print("[Email Service] Skipped: invalid recipient")
        return False, 'invalid_recipient', 'No valid recipient address'

    smtp_host, smtp_port, smtp_user, smtp_pass, from_email = _smtp_config()

    if not smtp_user or not smtp_pass:
        print(
            f"[Email Service] SMTP not configured — NOT sending to {recipient} "
            f"(subject: {subject!r}). Set smtp_user/smtp_pass in settings or .env."
        )
        return False, 'not_configured', 'SMTP is not configured (Settings > Email)'

    from email.utils import formataddr
    from services.portal_compat import brand_name
    # Sent in the company's own name (its Settings > company name)
    msg = _build_message(subject, formataddr((brand_name(), from_email)), recipient, html_content, text_content)

    try:
        if smtp_port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=20) as server:
                server.login(smtp_user, smtp_pass)
                server.sendmail(from_email, [recipient], msg.as_string())
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(from_email, [recipient], msg.as_string())
        return True, 'sent', None
    except Exception as e:
        print(f"[Email Service Error] Failed to send email to {recipient}: {e}")
        return False, 'failed', e
