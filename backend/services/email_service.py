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


def send_email(recipient, subject, html_content, text_content=None):
    """Send an HTML transactional email via SMTP. Returns True only on real send."""
    recipient = (recipient or '').strip()
    if not recipient or '@' not in recipient:
        print("[Email Service] Skipped: invalid recipient")
        return False

    smtp_host, smtp_port, smtp_user, smtp_pass, from_email = _smtp_config()

    if not smtp_user or not smtp_pass:
        print(
            f"[Email Service] SMTP not configured — NOT sending to {recipient} "
            f"(subject: {subject!r}). Set smtp_user/smtp_pass in settings or .env."
        )
        return False

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
        return True
    except Exception as e:
        print(f"[Email Service Error] Failed to send email to {recipient}: {e}")
        return False
