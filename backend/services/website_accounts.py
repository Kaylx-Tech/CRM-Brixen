"""Website (WordPress) logins for Individual customers made in the CRM.

Individual customers sign in on the Brixen website, not the CRM portal. A customer added in the CRM (Customers,
a new client on an order or a company) gets a website account straight away: an existing website account with
the same email is only linked (its password is never changed); otherwise one is made with the password given
when the customer was added, or the standard first password (DEFAULT_CUSTOMER_PASSWORD).
B2B and Business customers, customers of the new website ("Website Portal") and, once WordPress is switched
off (CUSTOMER_PORTAL_FOR_ALL), every customer use the CRM portal and get none.

users.website_account_by_crm = 1 marks a website account the CRM made or linked, so the customer's Source
stays "CRM" (a website signup arrives with its WordPress id from the website itself).
"""
import os
import threading

from db import query_db, execute_db
from services import wordpress_service
from services.portal_access import uses_crm_portal

DEFAULT_CUSTOMER_PASSWORD = os.environ.get('DEFAULT_CUSTOMER_PASSWORD') or 'Google@126'
NO_WEBSITE_EMAILS = ('guest.unlinked@brixenconsultants.com',)


def ensure_for_customer(user_id, password=None):
    """Give this Individual customer a website login if they have none. Returns
    {'ok', 'skipped'?, 'created'?, 'wordpress_user_id'?, 'message'}."""
    row = query_db("""SELECT id, email, full_name, role, client_type, is_b2b, account_type, wordpress_user_id
                      FROM users WHERE id = ?;""", (user_id,), one=True)
    if not row or str(row.get('role') or '').upper() != 'CLIENT':
        return {'ok': True, 'skipped': True, 'message': 'Not a customer'}
    # B2B, Business, new-website ("Website Portal") customers, and everyone once WordPress is switched off
    # (CUSTOMER_PORTAL_FOR_ALL) sign in to the CRM portal instead
    if uses_crm_portal(row):
        return {'ok': True, 'skipped': True, 'message': 'This customer uses the CRM portal'}
    if str(row.get('wordpress_user_id') or '').strip().isdigit():
        return {'ok': True, 'skipped': True, 'message': 'Already has a website account'}
    email = str(row.get('email') or '').strip().lower()
    if not email or email in NO_WEBSITE_EMAILS:
        return {'ok': True, 'skipped': True, 'message': 'No email for a website account'}
    pw = password if len(str(password or '')) >= 8 else DEFAULT_CUSTOMER_PASSWORD
    site = wordpress_service.link_or_create_website_user(email=email, password=pw, full_name=row.get('full_name'))
    if site.get('ok') and site.get('wordpress_user_id'):
        execute_db("UPDATE users SET wordpress_user_id = ?, website_account_by_crm = 1 WHERE id = ?;",
                   (site['wordpress_user_id'], row['id']))
    else:
        print(f"[Website accounts] {email}: {site.get('message')}")
    return site


def ensure_in_background(user_id, password=None):
    """Same, without making the person wait (orders and companies that add a new client)."""
    def _run():
        try:
            ensure_for_customer(user_id, password)
        except Exception as exc:
            print(f"[Website accounts] customer {user_id}: {exc}")
    threading.Thread(target=_run, name=f'website-account-{user_id}', daemon=True).start()
