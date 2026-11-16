"""Questions sent from the new website's contact form ("Send us your question" / "Book a free consultation").

Each one becomes a support ticket in the CRM (Support > Tickets, category "Website Enquiry") with the visitor's
details in the first message, so the team answers it in one place. The team gets an in-app notification and an
email. The visitor is found by email, or added as a CLIENT with no password (like a website order); a team reply
on the ticket is emailed to them as usual.

Spam: the form has a hidden field people never fill in (a robot that fills it gets a normal "sent" answer and
nothing is saved), and website_routes limits how many forms one visitor can send.
"""
import datetime
import re
import secrets

from db import query_db, execute_db, unusable_password_hash

CATEGORY = 'Website Enquiry'
EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')


class EnquiryError(ValueError):
    """Shown to the visitor as it is."""


def _text(fields, key, limit):
    return re.sub(r'\s+', ' ', str(fields.get(key) or '')).strip()[:limit]


def _visitor(email, name, phone):
    try:
        from services.permanent_purge import is_purged_email
        if is_purged_email(email):
            raise EnquiryError("We cannot take a message from this email address. Please call or WhatsApp us.")
    except ImportError:
        pass
    row = query_db("SELECT id, role FROM users WHERE lower(email) = ? LIMIT 1;", (email,), one=True)
    if row:
        if row.get('role') != 'CLIENT':
            raise EnquiryError("This email belongs to a Brixen team account. Please use your own email address.")
        return row['id']
    return execute_db("""
        INSERT INTO users (email, password_hash, full_name, phone, role, status, created_at)
        VALUES (?, ?, ?, ?, 'CLIENT', 'Active', datetime('now'));
    """, (email, unusable_password_hash(), name, phone))


def create_enquiry(fields):
    """Saves the question as a ticket. Returns {'ticket_number': ...} (None for a robot)."""
    if _text(fields, 'website', 200):  # hidden field: only robots fill it
        return {'ticket_number': None}
    name = _text(fields, 'name', 120)
    email = _text(fields, 'email', 200).lower()
    phone = _text(fields, 'phone', 40)
    company = _text(fields, 'company', 160)
    service = _text(fields, 'service', 80) or 'Other'
    budget = _text(fields, 'budget', 40)
    message = str(fields.get('message') or '').strip()[:5000]
    page = _text(fields, 'page', 200)
    if not name or not email or not phone or not message:
        raise EnquiryError("Please fill in your name, email, WhatsApp number and message.")
    if not EMAIL_RE.match(email):
        raise EnquiryError("Please enter a valid email address.")

    user_id = _visitor(email, name, phone)
    number = f"TICK-{datetime.date.today().year}-{secrets.randbelow(900000) + 100000}"
    subject = f"{service}: question from the website"[:200]
    tid = execute_db("""
        INSERT INTO support_tickets (ticket_number, user_id, subject, category, priority, status, created_at)
        VALUES (?, ?, ?, ?, 'Medium', 'Open', datetime('now'));
    """, (number, user_id, subject, CATEGORY))
    details = [f"Name: {name}", f"Email: {email}", f"WhatsApp: {phone}"]
    details += [f"Company: {company}"] if company else []
    details += [f"Service: {service}"]
    details += [f"Budget: {budget}"] if budget else []
    details += [f"Sent from: {page}"] if page else []
    execute_db("""
        INSERT INTO support_messages (ticket_id, sender_id, sender_name, sender_role, message, created_at)
        VALUES (?, ?, ?, 'CLIENT', ?, datetime('now'));
    """, (tid, user_id, name, message + "\n\n" + "\n".join(details)))

    try:
        from services.notification_service import notify_staff
        notify_staff('New website question', f"{number}: {service} ({name})", 'support_ticket', '/admin/tickets')
    except Exception:
        pass
    from services.client_mail import email_team
    email_team(f"New website question {number} — Brixen Consultants",
               f"Someone sent a question from the website contact form.\nTicket: {number}\nName: {name}\n"
               f"Email: {email}\nWhatsApp: {phone}\nService: {service}\n\n{message[:1000]}",
               link_path='/admin/tickets')
    return {'ticket_number': number}
