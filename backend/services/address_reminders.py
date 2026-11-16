"""Renewal reminders for Brixen registered office addresses (Smart Operations › Registered Address).

  * Reminder button: the team emails the customer now: renew the address (£50 a year, + the late fee once it
    has expired), otherwise the address subscription is cancelled.
  * Auto reminders: in the last 7 days before the renewal date, one reminder a day (checked every hour).
    Off until an admin or manager switches them on in the tab (setting address_auto_reminders = '1'), so a
    deploy never starts emailing customers by itself. Addresses on card auto-renew are skipped.
  * Every customer can pay from the email without signing in: a card button (Stripe, address_billing.pay_link,
    once Stripe is set up) and the bank details with an "I have paid by bank transfer" button (paid_link), which
    tells the team to check the bank and press Mark paid. Portal customers also get their Addresses page link.
  * Every reminder is saved (address_reminders) before it is sent, so the same automatic one never goes twice.
Nothing here deletes data.
"""
import datetime
import os
import threading
import time

from db import query_db, execute_db

SETTING_KEY = 'address_auto_reminders'
AUTO_DAYS_BEFORE = 7
CHECK_INTERVAL_SECONDS = 3600
_worker_started = False


class ReminderError(ValueError):
    """Shown to the team as it is."""


def _ensure():
    execute_db("""
        CREATE TABLE IF NOT EXISTS address_reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            expiry_date TEXT,
            kind TEXT NOT NULL,
            sent_on TEXT NOT NULL,
            sent_to TEXT,
            emailed INTEGER NOT NULL DEFAULT 0,
            sent_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    execute_db("CREATE INDEX IF NOT EXISTS idx_address_reminders_company ON address_reminders(company_id, sent_on);")
    # The email for a company whose owner is not a customer account (e.g. a company under the team's Admin)
    execute_db("""
        CREATE TABLE IF NOT EXISTS address_reminder_emails (
            company_id INTEGER PRIMARY KEY,
            email TEXT NOT NULL,
            updated_by TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)


def own_customer(owner):
    """The company is under its own customer's account: not a team account (e.g. Admin) and not the shared
    "Unlinked Guest Customer" that holds website orders of many people (its email must never be changed)."""
    from routes.id_verification_routes import GUEST_EMAIL
    return (owner or {}).get('role') == 'CLIENT' and str((owner or {}).get('email') or '').strip().lower() != GUEST_EMAIL


def recipient(company, owner):
    """(email, where it is kept) for a company's reminders: a customer's notification email, else their login
    email; a company under a team account uses the email the team set for it. where: 'company', 'customer' or ''."""
    _ensure()
    if not own_customer(owner):
        row = query_db("SELECT email FROM address_reminder_emails WHERE company_id = ?;", (company['id'],), one=True)
        if row and str(row.get('email') or '').strip():
            return row['email'].strip(), 'company'
        return '', ''  # never the team's own email
    email = (owner.get('notification_email') or owner.get('email') or '').strip()
    return email, ('customer' if email else '')


def reminder_emails(rows):
    """For the Registered Address list: each row's reminder email and whether its owner is a customer account."""
    _ensure()
    ids = sorted({r['company_id'] for r in rows if r.get('company_id')})
    custom, owners = {}, {}
    for chunk in range(0, len(ids), 500):
        part = ids[chunk:chunk + 500]
        marks = ','.join('?' * len(part))
        custom.update({r['company_id']: r['email'] for r in query_db(
            f"SELECT company_id, email FROM address_reminder_emails WHERE company_id IN ({marks});", tuple(part)) or []})
        owners.update({r['id']: r for r in query_db(f"""
            SELECT c.id, u.role, u.email, u.notification_email FROM companies c LEFT JOIN users u ON u.id = c.user_id
            WHERE c.id IN ({marks});""", tuple(part)) or []})
    # The team already checked the email once: a reminder was sent by hand to the email it still has
    confirmed = {(c['company_id'], str(c['email'] or '').strip().lower()) for c in query_db(
        "SELECT DISTINCT company_id, sent_to AS email FROM address_reminders WHERE kind = 'manual';") or []}
    for r in rows:
        owner = owners.get(r.get('company_id')) or {}
        r['owner_is_customer'] = own_customer(owner)
        own = (owner.get('notification_email') or owner.get('email') or '').strip() or None
        # A company under a team account (e.g. Admin) never emails the team: only an email the team typed for it
        r['reminder_email'] = own if r['owner_is_customer'] else custom.get(r.get('company_id'))
        r['email_confirmed'] = bool(r['reminder_email']) and \
            (r.get('company_id'), r['reminder_email'].strip().lower()) in confirmed
    return rows


def set_email(company_id, email, actor):
    """The team corrected the email before a reminder. A customer account keeps it as its notification email
    (all client emails go there; the login email is not changed); a company under a team account keeps it for
    its own reminders. Returns where it was saved: 'customer' or 'company'."""
    from utils.validation import email_problem
    _ensure()
    email = str(email or '').strip().lower()
    if not email or email_problem(email):
        raise ReminderError(email_problem(email) if email else "Type the customer's email address")
    company = _company(company_id)
    if not company:
        raise ReminderError("Company not found")
    owner = query_db("SELECT id, role, email FROM users WHERE id = ?;", (company.get('user_id'),), one=True) or {}
    if own_customer(owner):
        execute_db("UPDATE users SET notification_email = ? WHERE id = ?;", (email, owner['id']))
        where = 'customer'
    else:
        execute_db("""INSERT INTO address_reminder_emails (company_id, email, updated_by) VALUES (?, ?, ?)
                      ON CONFLICT(company_id) DO UPDATE SET email = excluded.email, updated_by = excluded.updated_by,
                      updated_at = datetime('now');""", (company['id'], email, (actor or {}).get('email')))
        where = 'company'
    try:
        execute_db("""INSERT INTO activity_logs (user_id, user_email, action, entity_type, entity_id, details)
                      VALUES (?, ?, 'ADDRESS_REMINDER_EMAIL', 'companies', ?, ?);""",
                   ((actor or {}).get('id'), (actor or {}).get('email') or 'SYSTEM', str(company['id']),
                    f"Reminder email for {company.get('name')} set to {email}"
                    f" ({'customer notification email' if where == 'customer' else 'this company only'})"))
    except Exception as exc:
        print(f"[Address reminders] audit: {exc}")
    return where


def auto_enabled():
    row = query_db("SELECT value FROM settings WHERE key = ?;", (SETTING_KEY,), one=True)
    return str((row or {}).get('value') or '0') == '1'


def set_auto(enabled):
    execute_db("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
               (SETTING_KEY, '1' if enabled else '0'))
    return auto_enabled()


def last_reminders():
    """{company_id: {'sent_on', 'kind', 'emailed'}} of each company's latest reminder."""
    _ensure()
    rows = query_db("""
        SELECT r.company_id, r.sent_on, r.kind, r.emailed, r.created_at FROM address_reminders r
        JOIN (SELECT company_id, MAX(id) AS id FROM address_reminders GROUP BY company_id) m ON m.id = r.id;
    """) or []
    return {r['company_id']: {'sent_on': r['sent_on'], 'kind': r['kind'], 'emailed': bool(r['emailed']),
                              'at': r['created_at']} for r in rows}


def compose(company, owner, service):
    """(subject, text, html, cta_url) of the reminder email."""
    from config import PORTAL_URL
    from routes.client_portal_routes import ADDRESS_SERVICE_PRICE, _parse_company_date, _renewal_pay_details
    from services.client_mail import compose_client_email
    from services.portal_access import uses_crm_portal
    name = company.get('name') or 'your company'
    renewal = _parse_company_date(service.get('expiry_date'))
    when = f"{renewal:%d %B %Y}" if renewal else 'now'
    price = service.get('renewal_price') or ADDRESS_SERVICE_PRICE
    late = service.get('late_fee') or 0
    pay = _renewal_pay_details()
    portal = uses_crm_portal(owner)
    status = service.get('status')
    due = status in ('Renewal due', 'Expired')
    # Paid straight from the email, no sign-in: by card (Stripe) or by bank transfer and then "I have paid", so
    # the team knows to check the bank
    from services.address_billing import paid_link, pay_link
    card_url = (pay_link(company['id']) if company.get('id') else None) or pay.get('pay_url') or None
    paid_url = paid_link(company['id']) if company.get('id') else None
    if card_url:
        cta_label, cta_url = f"Pay £{price:.0f} by card", card_url
        cta2_label, cta2_url = ('I have paid by bank transfer', paid_url) if paid_url else (None, None)
    else:
        cta_label, cta_url = ('I have paid by bank transfer', paid_url) if paid_url else (None, None)
        cta2_label = cta2_url = None

    # One short line on top; the money in a box; the buttons; the bank details in their own box; the rest small
    if status == 'Expired':
        message = f"The registered office address for {name} expired on {when}. Renew it today to keep using it."
    elif due:
        message = f"The registered office address for {name} was due for renewal on {when}. Please renew it to keep using it."
    else:
        message = f"The registered office address for {name} renews on {when}. Renew it now so it does not lapse."
    from services.address_start import director_of
    details = [('Company', name),
               ('Director', director_of(company['id']) if company.get('id') else None),
               ('Address', service.get('line1')), ('Renewal date', when),
               ('Yearly fee', f"£{ADDRESS_SERVICE_PRICE:.2f}")]
    if late:
        months = int(service.get('late_months') or 1)
        details.append((f"Late fee ({months} month{'s' if months != 1 else ''} × £5)" if months > 1 else 'Late fee (1 month)',
                        f"£{late:.2f}"))
    points = []
    if card_url:
        points.append("Pay by card in a minute, or by bank transfer with the details below.")
    else:
        points.append("Pay by bank transfer with the details below, then press \"I have paid\" so we can renew it straight away.")
    bank_rows = [('Account name', pay.get('account_name')), ('Account number', pay.get('account_number')),
                 ('Sort code', pay.get('sort_code')), ('Reference', name)]
    # Customers in Pakistan can pay into Brixen's PKR account (the same details as on invoices)
    from services.invoice_mail import INVOICE_BANK_PKR as pkr
    pkr_rows = [('Account name', pkr.get('account_name')), ('Bank', pkr.get('bank_name')), ('IBAN', pkr.get('iban')),
                ('Reference', name)]
    footnote = ("If the address is not renewed, the subscription is cancelled and we will no longer act as the "
                "company's registered office; you would then need to give Companies House a new address.")
    if card_url and paid_url:
        footnote = "Paid by bank transfer? Press \"I have paid\" so we can renew it straight away. " + footnote
    if portal:
        footnote += f" You can also renew it from your client panel: {PORTAL_URL}/portal/addresses"
    # The company's director (Companies House); else the customer's first name; never the guest or a team
    # account's name ("Hello Unlinked")
    director = dict(details).get('Director')
    first = (director or '').split() or ((owner.get('full_name') or '').split() if own_customer(owner) else [])
    subject, text, html = compose_client_email(
        subject=(f"Renew your registered office address: {name}" if not due
                 else f"Your registered office address has expired: {name}" if status == 'Expired'
                 else f"Your registered office address is due for renewal: {name}"),
        headline=('Renew your registered office address' if not due
                  else 'Your registered office address has expired' if status == 'Expired'
                  else 'Your registered office address is due'),
        greeting=first[0] if first else 'there',
        message=message,
        points=points,
        details=details,
        details_total=('To pay', f"£{price:.2f}"),
        cta_label=cta_label, cta_url=cta_url, cta2_label=cta2_label, cta2_url=cta2_url,
        boxes=[{'title': 'Bank transfer · UK (GBP)', 'rows': [(k, v) for k, v in bank_rows if v]},
               {'title': 'Bank transfer · Pakistan (PKR)', 'rows': [(k, v) for k, v in pkr_rows if v]}],
        footnote=footnote, category='ORDER',
        # One short red line: what happens if it is not paid
        alert="If unpaid, your registered address will be defaulted and your company may be closed.")
    return subject, text, html, cta_url


def _company(company_id):
    return query_db("""SELECT id, name, user_id, reg_office, inc_date, created_at, company_number FROM companies
                       WHERE id = ?;""", (company_id,), one=True)


def send(company_id, kind='manual', sent_by=None, today=None):
    """Email one company's customer a renewal reminder. Returns the saved reminder (dict)."""
    from routes.client_portal_routes import _company_address_service, NEEDS_RENEWAL_STATUSES
    from services.address_start import ensure_fresh, uses_our_address
    from services.email_service import send_email
    from services.notification_service import notify_user
    _ensure()
    today = today or datetime.date.today()
    company = _company(company_id)
    if not company:
        raise ReminderError("Company not found")
    company = dict(company)
    # Never on old facts: Companies House is checked again first when the last check is over a day old
    facts = ensure_fresh(company)
    if not uses_our_address(company, facts):
        raise ReminderError("Companies House shows this company at another address now, so no reminder was sent")
    service = _company_address_service(company)
    if service.get('status') == 'Auto-renew':
        raise ReminderError("This address renews by card automatically; no reminder is needed")
    if service.get('status') not in NEEDS_RENEWAL_STATUSES and not service.get('renewal_invoice'):
        raise ReminderError(f"Nothing to renew: the address is {str(service.get('status') or '').lower()} "
                            "(checked with Companies House)")
    owner = query_db("""SELECT id, full_name, email, notification_email, role, client_type, is_b2b, account_type
                        FROM users WHERE id = ?;""", (company.get('user_id'),), one=True) or {}
    to, _where = recipient(company, owner)
    if not to:
        raise ReminderError("No customer email for this company yet: type it on the Reminder" if not own_customer(owner)
                            else "The customer has no email address")
    if not own_customer(owner):
        # The email goes to the person the team typed in, not to the team account that holds the company
        owner = {'full_name': '', 'email': to, 'role': 'CLIENT'}
    # Saved first, so an automatic reminder never goes twice the same day
    rid = execute_db("""INSERT INTO address_reminders (company_id, expiry_date, kind, sent_on, sent_to, sent_by)
                        VALUES (?, ?, ?, ?, ?, ?);""",
                     (company['id'], service.get('expiry_date'), kind, today.isoformat(), to, sent_by))
    subject, text, html, _url = compose(company, owner, service)
    emailed = send_email(to, subject, html, text, category='ORDER', user_id=owner.get('id'), company_id=company['id'])
    execute_db("UPDATE address_reminders SET emailed = ? WHERE id = ?;", (1 if emailed else 0, rid))
    if owner.get('id'):
        notify_user(owner.get('id'), 'Renew your registered office address',
                    f"The address for {company.get('name')} renews on {service.get('expiry_date')}. Renew it to keep it.",
                    'warning', '/portal/addresses')
    return {'id': rid, 'company_id': company['id'], 'sent_to': to, 'emailed': bool(emailed), 'kind': kind,
            'sent_on': today.isoformat()}


def due_for_auto(today=None):
    """Companies whose renewal date is 0-7 days away and that had no automatic reminder today."""
    from routes.client_portal_routes import _company_address_service, _parse_company_date, NEEDS_RENEWAL_STATUSES
    from services.address_start import uses_our_address
    _ensure()
    today = today or datetime.date.today()
    out = []
    for company in query_db("""SELECT id, name, user_id, reg_office, inc_date, created_at, company_number FROM companies
                               WHERE user_id IS NOT NULL;""") or []:
        company = dict(company)
        if not uses_our_address(company):
            continue
        service = _company_address_service(company)
        renewal = _parse_company_date(service.get('expiry_date'))
        # Only an address still waiting for this year's payment (not moved away, dissolved or paid)
        if not renewal or service.get('status') not in NEEDS_RENEWAL_STATUSES:
            continue
        if not 0 <= (renewal - today).days <= AUTO_DAYS_BEFORE:
            continue
        if query_db("SELECT 1 FROM address_reminders WHERE company_id = ? AND kind = 'auto' AND sent_on = ?;",
                    (company['id'], today.isoformat()), one=True):
            continue
        out.append(company)
    return out


def run_auto(today=None):
    """One automatic reminder per company per day in its last 7 days. Returns how many were sent."""
    if not auto_enabled():
        return 0
    sent = 0
    for company in due_for_auto(today):
        try:
            send(company['id'], kind='auto', sent_by='Auto reminder', today=today)
            sent += 1
        except ReminderError:
            continue
        except Exception as exc:
            print(f"[Address reminders] {company.get('name')}: {exc}")
    return sent


def start_worker():
    """Every hour: today's automatic reminders (only while they are switched on)."""
    global _worker_started
    if os.environ.get('CRM_TESTING') == '1' or _worker_started:
        return False
    _worker_started = True

    def _loop():
        while True:
            try:
                # First when each address started (AD01 on Companies House), so reminders use the right date
                from services.address_start import refresh
                refresh()
            except Exception as exc:
                print(f"[Address reminders] Companies House check: {exc}")
            try:
                sent = run_auto()
                if sent:
                    print(f"[Address reminders] {sent} reminder(s) sent")
            except Exception as exc:
                print(f"[Address reminders] Worker error: {exc}")
            time.sleep(CHECK_INTERVAL_SECONDS)

    threading.Thread(target=_loop, name='address-reminders', daemon=True).start()
    return True
