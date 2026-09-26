"""Brixen CRM - SMTP Email Service
"""
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import os

def send_email(recipient, subject, html_content, text_content=None):
    """Send an HTML transactional email via SMTP."""
    smtp_host = os.environ.get('SMTP_HOST', 'mail.brixenconsultants.com')
    smtp_port = int(os.environ.get('SMTP_PORT', '465'))
    smtp_user = os.environ.get('SMTP_USER', '')
    smtp_pass = os.environ.get('SMTP_PASS', '')
    from_email = os.environ.get('SMTP_FROM', 'no-reply@brixenconsultants.com')

    if not smtp_user or not smtp_pass:
        print(f"[Email Engine (Dev Mode)] Skipped sending to {recipient}: Subject '{subject}'")
        return True

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
            with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
                server.login(smtp_user, smtp_pass)
                server.sendmail(from_email, [recipient], msg.as_string())
        else:
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(from_email, [recipient], msg.as_string())
        return True
    except Exception as e:
        print(f"[Email Service Error] Failed to send email to {recipient}: {e}")
        return False
