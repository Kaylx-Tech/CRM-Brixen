"""Brixen CRM - SMTP Email Service
Uses DB settings first (settings_service), then environment variables.
Never reports success when SMTP is not configured.
"""
import smtplib
import ssl
import os
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
    from_email = (from_email or user or 'no-reply@brixenconsultants.com').strip()
    return host, port, user, password, from_email


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


def send_email(recipient, subject, html_content, text_content=None, *, category=None, user_id=None,
               order_id=None, company_id=None, triggered_by=None, log=True, store_body=True):
    """Send an HTML transactional email via SMTP. Returns True only on real send.

    Every attempt is written to the email log (status sent / failed / not_configured / invalid_recipient)
    together with what it was about, so admins can see and resend it. store_body=False keeps secrets
    (password reset links) out of the log; such an email cannot be resent from the log.
    """
    meta = {'category': category, 'user_id': user_id, 'order_id': order_id, 'company_id': company_id,
            'triggered_by': triggered_by}
    ok, status, error = _deliver(recipient, subject, html_content, text_content)
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

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = f"Brixen Consultants <{from_email}>"
    msg['To'] = recipient

    if text_content:
        msg.attach(MIMEText(text_content, 'plain'))
    if html_content:
        msg.attach(MIMEText(html_content, 'html'))

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
