"""Registered office addresses that expired: 7 days after the renewal date with no payment the address is
Expired (client_portal_routes._company_address_service). The customer gets one email (and a portal notification)
saying we no longer act as their registered office, that they are responsible if the company is dissolved or the
address is defaulted, and that renewing now costs £50 + £5 late fee. Admins are told too.

  * One notice per company per expiry date (address_expiry_notices), checked every hour.
  * Only addresses that expire after this went live are emailed (setting address_expiry_notices_since), so old
    companies whose renewals were never recorded in the CRM do not all get an email on the first day.
"""
import datetime
import os
import threading
import time

from db import query_db, execute_db

CHECK_INTERVAL_SECONDS = 3600
SINCE_KEY = 'address_expiry_notices_since'

_worker_started = False


def _since():
    row = query_db("SELECT value FROM settings WHERE key = ?;", (SINCE_KEY,), one=True)
    if row and row.get('value'):
        return datetime.date.fromisoformat(str(row['value'])[:10])
    today = datetime.date.today()
    execute_db("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?);", (SINCE_KEY, today.isoformat()))
    return today


def _send_notice(company, service, expired_on):
    from config import PORTAL_URL
    from services.client_mail import compose_client_email
    from services.email_service import send_email
    from services.notification_service import notify_staff, notify_user
    owner = query_db("SELECT id, full_name, email FROM users WHERE id = ?;", (company['user_id'],), one=True) or {}
    name = company.get('name') or 'your company'
    price = service['renewal_price']
    emailed = False
    if owner.get('email'):
        subject, text, html = compose_client_email(
            subject=f"Registered office address expired: {name}",
            headline='Your registered office address has expired',
            greeting=(owner.get('full_name') or 'there').split()[0],
            message=(f"The registered office address for {name} was due for renewal and has not been paid, so it "
                     f"expired on {expired_on:%d %B %Y}. We no longer act as the company's registered office."),
            points=[
                'If the company is struck off or dissolved, or its registered address is defaulted at Companies '
                'House while the address is expired, you are responsible for this.',
                f"You can still renew from your client panel: £{price:.2f} (£{price - service['late_fee']:.2f} a "
                f"year + £{service['late_fee']:.2f} late fee).",
            ],
            details=[('Company', name), ('Address', service.get('line1')), ('Expired on', f"{expired_on:%d %b %Y}")],
            cta_label='Renew my address', cta_url=f"{PORTAL_URL}/portal/addresses", category='ORDER')
        emailed = send_email(owner['email'], subject, html, text, category='ORDER', user_id=owner['id'],
                             company_id=company['id'])
    notify_user(owner.get('id'), 'Registered office address expired',
                f"The address for {name} expired. Renew it to keep using it (£{price:.2f} incl. late fee).",
                'warning', '/portal/addresses')
    notify_staff('Registered office address expired',
                 f"{name}: the address expired on {expired_on:%d %b %Y} without payment"
                 f"{'' if emailed else ' (customer email not sent)'}.",
                 'warning', '/admin/companies')
    return emailed


def send_expiry_notices(today=None):
    """Email every company whose Brixen address expired and has not been told yet. Returns how many were told."""
    from routes.client_portal_routes import ADDRESS_GRACE_DAYS, _company_address_service, _is_brixen_address, \
        _parse_company_date
    today = today or datetime.date.today()
    since = _since()
    told = 0
    companies = query_db("""
        SELECT id, name, user_id, reg_office, inc_date, created_at FROM companies
        WHERE TRIM(COALESCE(reg_office, '')) <> '' AND user_id IS NOT NULL;
    """) or []
    for company in companies:
        if not _is_brixen_address(company.get('reg_office')):
            continue
        service = _company_address_service(company)
        renewal = _parse_company_date(service.get('expiry_date'))
        if service['status'] != 'Expired' or not renewal:
            continue
        expired_on = renewal + datetime.timedelta(days=ADDRESS_GRACE_DAYS)
        if expired_on < since or expired_on > today:
            continue
        if query_db("SELECT 1 FROM address_expiry_notices WHERE company_id = ? AND expiry_date = ?;",
                    (company['id'], renewal.isoformat()), one=True):
            continue
        # Saved first, so a mail error never sends the same notice twice
        execute_db("INSERT OR IGNORE INTO address_expiry_notices (company_id, expiry_date) VALUES (?, ?);",
                   (company['id'], renewal.isoformat()))
        emailed = _send_notice(company, service, expired_on)
        execute_db("UPDATE address_expiry_notices SET emailed = ? WHERE company_id = ? AND expiry_date = ?;",
                   (1 if emailed else 0, company['id'], renewal.isoformat()))
        told += 1
    return told


def start_address_expiry_worker():
    """Every hour, email customers whose registered office address expired."""
    global _worker_started
    if os.environ.get('CRM_TESTING') == '1' or _worker_started:
        return False
    _worker_started = True

    def _loop():
        while True:
            try:
                told = send_expiry_notices()
                if told:
                    print(f"[Address expiry] {told} customer(s) told their address expired")
            except Exception as exc:
                print(f"[Address expiry] Worker error: {exc}")
            time.sleep(CHECK_INTERVAL_SECONDS)

    threading.Thread(target=_loop, name='address-expiry', daemon=True).start()
    return True
