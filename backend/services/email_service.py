"""Brixen CRM - SMTP Email Service
Uses DB settings first (settings_service), then environment variables.
Never reports success when SMTP is not configured.
"""
import smtplib
import ssl
import os
from email.mime.application import MIMEApplication
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def _platform_mailbox():
    """Finstap's own no-reply mailbox (PLATFORM_SMTP_USER / PLATFORM_SMTP_PASS, optional PLATFORM_SMTP_FROM,
    PLATFORM_SMTP_HOST, PLATFORM_SMTP_PORT) for the platform's emails: signup codes and the owner portal's
    codes and links. None when it is not set up, so those emails use the server's SMTP_* mailbox.
    The owner portal (Integrations) comes before the env."""
    try:
        from services.platform_integrations import get as platform
    except ImportError:
        def platform(name):
            return os.environ.get(name, '').strip()
    user = platform('PLATFORM_SMTP_USER')
    password = platform('PLATFORM_SMTP_PASS')
    if not user or not password:
        return None
    host = (platform('PLATFORM_SMTP_HOST') or os.environ.get('SMTP_HOST') or 'smtp.hostinger.com').strip()
    try:
        port = int(platform('PLATFORM_SMTP_PORT') or os.environ.get('SMTP_PORT') or 587)
    except (TypeError, ValueError):
        port = 587
    return host, port, user, password, (platform('PLATFORM_SMTP_FROM') or user).strip()


def _in_workspace():
    try:
        from services.settings_service import _in_workspace as check
        return check()
    except Exception:
        return False


def _smtp_config(mailbox=None):
    if mailbox == 'platform':
        own = _platform_mailbox()
        if own:
            return own
    in_workspace = _in_workspace()
    # A Finstap company workspace sends only from its own mailbox (Settings › Email), never the server's SMTP_*;
    # a platform email there (no-reply not set up) uses the server's, never the workspace's
    own_only = in_workspace and mailbox != 'platform'
    env = (lambda name: '') if own_only else (lambda name: os.environ.get(name, ''))
    host = env('SMTP_HOST')
    port = env('SMTP_PORT')
    user = env('SMTP_USER')
    password = env('SMTP_PASS')
    from_email = env('SMTP_FROM')

    if not (in_workspace and mailbox == 'platform'):
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


def workspace_mailbox_ready():
    """True when the current workspace (or Brixen) has a username and password in Settings › Email."""
    _host, _port, user, password, _from = _smtp_config()
    return bool(user and password)


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
        if _in_workspace():
            return "the workspace's own email is not set up yet (Settings › Email)"
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
               order_id=None, company_id=None, triggered_by=None, log=True, store_body=True, logo=None,
               sender_name=None, images=None, attachments=None, mailbox=None):
    """Send an HTML transactional email via SMTP. Returns True only on real send.
    mailbox='platform' sends from Finstap's own no-reply mailbox when it is set up (_platform_mailbox).

    Every attempt is written to the email log (status sent / failed / not_configured / invalid_recipient)
    together with what it was about, so admins can see and resend it. store_body=False keeps secrets
    (password reset links) out of the log; such an email cannot be resent from the log.
    logo=(image bytes, 'png'|'jpeg'|...) is the image behind cid:brand-logo instead of the bundled logo;
    images=[(cid, bytes, subtype)] are more pictures shown inside the email (cid:<cid>).
    sender_name is the From name instead of the company's (e.g. "Finstap" for signup emails).
    attachments=[(filename, bytes, 'application/pdf')] are files attached to the email (not kept in the log,
    so a resend from the log goes without them).
    """
    meta = {'category': category, 'user_id': user_id, 'order_id': order_id, 'company_id': company_id,
            'triggered_by': triggered_by}
    # Sign-in codes and password resets of a workspace that has not set up its own mailbox yet come from
    # Finstap's no-reply, so nobody is locked out; every other email waits for the workspace's mailbox
    if mailbox is None and category == 'SECURITY' and _in_workspace() and not workspace_mailbox_ready():
        mailbox = 'platform'
    # Master switch (Settings > Email: "Send emails"): when off, nothing goes out except password resets,
    # and the email is logged as suppressed so it can be sent later from the Email log
    if category != 'SECURITY' and not emails_enabled():
        ok, status, error = False, 'suppressed', 'Emails are turned off in Settings > Email'
    else:
        ok, status, error = _deliver(recipient, subject, html_content, text_content, logo=logo,
                                     sender_name=sender_name, images=images, attachments=attachments,
                                     mailbox=mailbox)
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


def _build_message(subject, sender, recipient, html_content, text_content, logo=None, images=None, attachments=None):
    """Text + HTML; an HTML email that shows the bundled logo (cid:) carries the logo image inside it."""
    from services.email_engine import BUNDLED_LOGO_PATH, EMAIL_LOGO_CID

    body = MIMEMultipart('alternative')
    if text_content:
        body.attach(MIMEText(text_content, 'plain'))
    if html_content:
        body.attach(MIMEText(html_content, 'html'))
    msg = body
    inline = []
    if html_content and f'cid:{EMAIL_LOGO_CID}' in html_content and (logo or os.path.isfile(BUNDLED_LOGO_PATH)):
        if logo:
            data, subtype = logo
        else:
            with open(BUNDLED_LOGO_PATH, 'rb') as fh:
                data, subtype = fh.read(), 'png'
        inline.append((EMAIL_LOGO_CID, data, subtype))
    inline += [i for i in (images or []) if html_content and f'cid:{i[0]}' in html_content]
    # A company's own logo in the header (email_engine.email_brand_header_html): attached here, so every
    # email (and a resend from the Email log) carries it
    from services.email_engine import COMPANY_LOGO_CID, company_logo_image
    if html_content and f'cid:{COMPANY_LOGO_CID}' in html_content and not any(i[0] == COMPANY_LOGO_CID for i in inline):
        company_logo = company_logo_image()
        if company_logo:
            inline.append((COMPANY_LOGO_CID, company_logo[0], company_logo[1]))
    if inline:
        msg = MIMEMultipart('related')
        msg.attach(body)
        for cid, data, subtype in inline:
            image = MIMEImage(data, subtype)
            image.add_header('Content-ID', f'<{cid}>')
            image.add_header('Content-Disposition', 'inline', filename=f'{cid}.{subtype}')
            msg.attach(image)
    if attachments:
        content, msg = msg, MIMEMultipart('mixed')
        msg.attach(content)
        for filename, data, mimetype in attachments:
            part = MIMEApplication(data, (mimetype or 'application/octet-stream').split('/', 1)[-1])
            part.add_header('Content-Disposition', 'attachment', filename=filename)
            msg.attach(part)
    msg['Subject'] = subject
    msg['From'] = sender
    msg['To'] = recipient
    return msg


def _deliver(recipient, subject, html_content, text_content, logo=None, sender_name=None, images=None,
             attachments=None, mailbox=None):
    """Hand the message to the SMTP server. Returns (ok, status, error)."""
    recipient = (recipient or '').strip()
    if not recipient or '@' not in recipient:
        print("[Email Service] Skipped: invalid recipient")
        return False, 'invalid_recipient', 'No valid recipient address'

    smtp_host, smtp_port, smtp_user, smtp_pass, from_email = _smtp_config(mailbox)

    if not smtp_user or not smtp_pass:
        print(
            f"[Email Service] SMTP not configured — NOT sending to {recipient} "
            f"(subject: {subject!r}). Set smtp_user/smtp_pass in settings or .env."
        )
        return False, 'not_configured', 'SMTP is not configured (Settings > Email)'

    from email.utils import formataddr
    from services.portal_compat import brand_name
    # Sent in the company's own name (its Settings > company name)
    msg = _build_message(subject, formataddr((sender_name or brand_name(), from_email)), recipient, html_content,
                         text_content, logo=logo, images=images, attachments=attachments)

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
