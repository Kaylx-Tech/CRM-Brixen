"""B2B & Partner Portal Business Logic
Extracted from core Brixen CRM architecture.
"""

def client_is_b2b(client):
    """Check if a given client dictionary represents a B2B partner account."""
    if not client:
        return False
    role = str(client.get('role') or '').strip().upper()
    if role and role != 'CLIENT':
        return False
    if int(client.get('is_b2b') or 0) == 1:
        return True
    return str(client.get('client_type') or '').strip().upper() == 'B2B'

def is_b2b_order_context(*, client=None, order=None):
    """Check if an order belongs to a B2B white-label context."""
    if client and client_is_b2b(client):
        return True
    if order:
        if order.get('b2b_client_id'):
            return True
        checkout_json = str(order.get('checkout_form_json') or '').lower()
        if 'b2b' in checkout_json:
            return True
    return False

def b2b_blocks_client_email(client, *, ntype=None, email_category=None):
    """Block marketing/direct promo to B2B white-label clients."""
    if not client_is_b2b(client):
        return False
    category = str(email_category or '').strip().upper()
    if category == 'MARKETING':
        return True
    key_l = str(ntype or '').strip().lower()
    if key_l in ('marketing', 'promo', 'newsletter'):
        return True
    return False

def client_can_use_crm_portal(client):
    """Verify if a client is active and permitted to login."""
    if not client:
        return False
    status = str(client.get('status') or '').strip().capitalize()
    return status == 'Active'
