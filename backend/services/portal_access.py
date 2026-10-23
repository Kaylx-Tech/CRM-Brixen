"""Who may sign in to the CRM portal (app.py client_can_use_crm_portal).

The team always. Customers: only B2B accounts. Individual and Business customers sign in on the Brixen website
(WordPress / WooCommerce); the CRM sends them there instead. An admin who switched into a customer account
(impersonation) can always see it.
"""
from services.wordpress_service import wordpress_base_url, website_customer_login_url

STAFF_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')


def website_only_message():
    from services.portal_compat import brand_name
    return f"This is a website customer account. Please sign in on the {brand_name()} website."


def _in_workspace():
    """A Finstap company: its customers have no separate website, so they all use its portal."""
    from services.portal_compat import _workspace_name
    return bool(_workspace_name())


def is_b2b_client(user):
    return bool(user) and (int(user.get('is_b2b') or 0) == 1 or str(user.get('client_type') or '').upper() == 'B2B')


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
    return _in_workspace() or is_b2b_client(user)


def website_login_url():
    return website_customer_login_url()


def website_lost_password_url():
    return f"{wordpress_base_url()}/my-account/lost-password/"
