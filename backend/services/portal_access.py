"""Who may sign in to the CRM portal (app.py client_can_use_crm_portal).

The team always. Customers: B2B and Business accounts. Individual customers sign in on the Brixen website
(WordPress / WooCommerce); the CRM sends them there instead. An admin who switched into a customer account
(impersonation) can always see it.
"""
from services.wordpress_service import wordpress_base_url, website_customer_login_url

STAFF_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
WEBSITE_ONLY_MESSAGE = "This is a website customer account. Please sign in on the Brixen website."


def is_b2b_client(user):
    return bool(user) and (int(user.get('is_b2b') or 0) == 1 or str(user.get('client_type') or '').upper() == 'B2B')


def is_business_client(user):
    return bool(user) and str(user.get('client_type') or '').strip().lower() == 'business'


def uses_crm_portal(user):
    """B2B and Business customers sign in to the CRM client portal (with the default password at first)."""
    return is_b2b_client(user) or is_business_client(user)


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
