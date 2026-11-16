"""Renewal reminders for Brixen registered office addresses (Smart Operations › Registered Address).

  * Reminder button: the team emails the customer now: renew the address (£50 a year, + the late fee once it
    has expired), otherwise the address subscription is cancelled.
  * Auto reminders: in the last 7 days before the renewal date, one reminder a day (checked every hour).
    Off until an admin or manager switches them on in the tab (setting address_auto_reminders = '1'), so a
    deploy never starts emailing customers by itself. Addresses on card auto-renew are skipped.
  * Website customers (who cannot open the CRM portal) get a card link (Stripe, address_billing.pay_link) and the
    bank details; portal customers get a link to their Addresses page (card or bank transfer there).
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
    due = service.get('status') in ('Renewal due', 'Expired')
    points = [
        f"The registered office address is £{ADDRESS_SERVICE_PRICE:.0f} a year"
        + (f", plus a £{late:.0f} late fee now that it has expired." if late else '.'),
        "If it is not renewed, your address subscription will be cancelled and we will no longer act as the "
        "company's registered office. You are then responsible for giving Companies House a new address.",
    ]
    if portal:
        points.append("Renew it from your client panel in a minute (card or bank transfer).")
        cta_label, cta_url = 'Renew my address', f"{PORTAL_URL}/portal/addresses"
    else:
        # Website customers cannot open the CRM portal: their own card link (Stripe), else the invoice pay link;
        # bank transfer is always offered too
        from services.address_billing import pay_link
        cta_url = (pay_link(company['id']) if company.get('id') else None) or pay.get('pay_url') or None
        bank = (f"by bank transfer to {pay.get('account_name')}, account {pay.get('account_number')}, "
                f"sort code {pay.get('sort_code')}, with {name} as the reference")
        points.append(f"Pay £{price:.0f} by card with the button below, or {bank}." if cta_url
                      else f"Pay £{price:.0f} {bank}.")
        cta_label = f"Pay £{price:.0f} by card" if cta_url else None
    subject, text, html = compose_client_email(
        subject=(f"Renew your registered office address: {name}" if not due
                 else f"Your registered office address is due for renewal: {name}"),
        headline=('Time to renew your registered office address' if not due
                  else 'Your registered office address is due for renewal'),
        greeting=(owner.get('full_name') or 'there').split()[0],
        message=((f"The registered office address for {name} was due for renewal on {when}. " if due
                  else f"The registered office address for {name} renews on {when}. ")
                 + f"Please renew it for £{price:.0f}" + (" (including the late fee)" if late else '')
                 + " to keep using it."),
        points=points,
        details=[('Company', name), ('Address', service.get('line1')), ('Renewal date', when),
                 ('To pay', f"£{price:.0f}")],
        cta_label=cta_label, cta_url=cta_url, category='ORDER')
    return subject, text, html, cta_url


def _company(company_id):
    return query_db("""SELECT id, name, user_id, reg_office, inc_date, created_at FROM companies
                       WHERE id = ?;""", (company_id,), one=True)


def send(company_id, kind='manual', sent_by=None, today=None):
    """Email one company's customer a renewal reminder. Returns the saved reminder (dict)."""
    from routes.client_portal_routes import _company_address_service, _is_brixen_address
    from services.email_service import send_email
    from services.notification_service import notify_user
    _ensure()
    today = today or datetime.date.today()
    company = _company(company_id)
    if not company or not _is_brixen_address(company.get('reg_office')):
        raise ReminderError("This company does not use one of Brixen's addresses")
    owner = query_db("""SELECT id, full_name, email, notification_email, role, client_type, is_b2b, account_type
                        FROM users WHERE id = ?;""", (company.get('user_id'),), one=True) or {}
    to = (owner.get('notification_email') or owner.get('email') or '').strip()
    if not to:
        raise ReminderError("The customer has no email address")
    service = _company_address_service(company)
    if service.get('status') == 'Auto-renew':
        raise ReminderError("This address renews by card automatically; no reminder is needed")
    # Saved first, so an automatic reminder never goes twice the same day
    rid = execute_db("""INSERT INTO address_reminders (company_id, expiry_date, kind, sent_on, sent_to, sent_by)
                        VALUES (?, ?, ?, ?, ?, ?);""",
                     (company['id'], service.get('expiry_date'), kind, today.isoformat(), to, sent_by))
    subject, text, html, _url = compose(company, owner, service)
    emailed = send_email(to, subject, html, text, category='ORDER', user_id=owner.get('id'), company_id=company['id'])
    execute_db("UPDATE address_reminders SET emailed = ? WHERE id = ?;", (1 if emailed else 0, rid))
    notify_user(owner.get('id'), 'Renew your registered office address',
                f"The address for {company.get('name')} renews on {service.get('expiry_date')}. Renew it to keep it.",
                'warning', '/portal/addresses')
    return {'id': rid, 'company_id': company['id'], 'sent_to': to, 'emailed': bool(emailed), 'kind': kind,
            'sent_on': today.isoformat()}


def due_for_auto(today=None):
    """Companies whose renewal date is 0-7 days away and that had no automatic reminder today."""
    from routes.client_portal_routes import _company_address_service, _is_brixen_address, _parse_company_date
    _ensure()
    today = today or datetime.date.today()
    out = []
    for company in query_db("""SELECT id, name, user_id, reg_office, inc_date, created_at FROM companies
                               WHERE TRIM(COALESCE(reg_office, '')) <> '' AND user_id IS NOT NULL;""") or []:
        if not _is_brixen_address(company.get('reg_office')):
            continue
        service = _company_address_service(company)
        renewal = _parse_company_date(service.get('expiry_date'))
        if not renewal or service.get('status') in ('Auto-renew', 'Paid'):
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
                sent = run_auto()
                if sent:
                    print(f"[Address reminders] {sent} reminder(s) sent")
            except Exception as exc:
                print(f"[Address reminders] Worker error: {exc}")
            time.sleep(CHECK_INTERVAL_SECONDS)

    threading.Thread(target=_loop, name='address-reminders', daemon=True).start()
    return True
