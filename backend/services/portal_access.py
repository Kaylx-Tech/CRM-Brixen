"""Who may sign in to the CRM portal (app.py client_can_use_crm_portal).

The team always. Customers: B2B and Business accounts, and customers who paid for an order on the new website
(Next.js, website/ in this repo; marked account_type = 'Website Portal' when the payment comes in, because that
site has no customer login of its own). Other individual customers sign in on the WordPress website; the CRM sends
them there instead. When WordPress is switched off, turn on the setting customer_portal_for_all (or env
CUSTOMER_PORTAL_FOR_ALL=1) so every customer signs in to the CRM portal. An admin who switched into a customer
account (impersonation) can always see it.
"""
from services.wordpress_service import wordpress_base_url, website_customer_login_url

STAFF_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
WEBSITE_ONLY_MESSAGE = "This is a website customer account. Please sign in on the Brixen website."
WEBSITE_PORTAL = 'Website Portal'  # users.account_type of customers who ordered on the new website


def is_b2b_client(user):
    return bool(user) and (int(user.get('is_b2b') or 0) == 1 or str(user.get('client_type') or '').upper() == 'B2B')


def is_business_client(user):
    return bool(user) and str(user.get('client_type') or '').strip().lower() == 'business'


def is_website_portal_client(user):
    return bool(user) and str(user.get('account_type') or '') == WEBSITE_PORTAL


def portal_for_all_customers():
    """Setting customer_portal_for_all / env CUSTOMER_PORTAL_FOR_ALL: every customer uses the CRM portal."""
    try:
        from services.settings_service import get_setting
        return str(get_setting('customer_portal_for_all') or '').strip().lower() in ('1', 'true', 'yes', 'on')
    except Exception:
        return False


def uses_crm_portal(user):
    """B2B and Business customers sign in to the CRM client portal (with the default password at first), and
    customers of the new website (or every customer, once WordPress is off)."""
    return is_b2b_client(user) or is_business_client(user) or is_website_portal_client(user) \
        or (bool(user) and portal_for_all_customers())


def client_can_use_crm_portal(user, *, impersonated=False):
    if not user:
        return False
    role = str(user.get('role') or '').upper()
    if role in STAFF_ROLES or impersonated:
        return True
    if role != 'CLIENT':
        return False
    if str(user.get('email') or '').strip().lower() == 'guest.unlinked@brixenconsultants.com':
        return False
    return uses_crm_portal(user)


def website_login_url():
    return website_customer_login_url()


def website_lost_password_url():
    return f"{wordpress_base_url()}/my-account/lost-password/"
