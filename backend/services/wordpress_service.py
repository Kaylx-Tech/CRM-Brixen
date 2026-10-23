"""WordPress integration over the REST API using an Application Password (no plugin).

Configuration (env, or `settings` table keys wordpress_url / wordpress_api_user / wordpress_app_password):
  WORDPRESS_URL            https://brixenconsultants.com
  WORDPRESS_API_USER       WordPress admin username that owns the application password
  WORDPRESS_APP_PASSWORD   the application password (Users -> Profile -> Application Passwords)
"""
import base64
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

from db import query_db

TIMEOUT = 15


def _setting(key, env_name, default=''):
    row = None
    try:
        row = query_db("SELECT value FROM settings WHERE key = ?;", (key,), one=True)
    except Exception:
        row = None
    return ((row or {}).get('value') or os.environ.get(env_name) or default or '').strip()


def wordpress_base_url():
    # A Finstap company has no website unless it adds its own (never Brixen's)
    from services.portal_compat import _workspace_name
    default = '' if _workspace_name() else 'https://brixenconsultants.com'
    return (_setting('wordpress_url', 'WORDPRESS_URL', default)).rstrip('/')


def website_customer_login_url():
    return wordpress_base_url() + '/my-account/'


def is_configured():
    return bool(_setting('wordpress_api_user', 'WORDPRESS_API_USER') and
                _setting('wordpress_app_password', 'WORDPRESS_APP_PASSWORD'))


def _auth_header():
    user = _setting('wordpress_api_user', 'WORDPRESS_API_USER')
    pw = _setting('wordpress_app_password', 'WORDPRESS_APP_PASSWORD').replace(' ', '')
    token = base64.b64encode(f'{user}:{pw}'.encode('utf-8')).decode('ascii')
    return f'Basic {token}'


def wp_request(method, path, payload=None, params=None):
    """Return (status_code, parsed_json_or_None, error_message_or_None)."""
    url = wordpress_base_url() + '/wp-json' + path
    if params:
        url += '?' + urllib.parse.urlencode(params)
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={'Authorization': _auth_header(), 'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            raw = resp.read().decode('utf-8')
            return resp.status, (json.loads(raw) if raw else None), None
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode('utf-8'))
            msg = body.get('message') if isinstance(body, dict) else None
        except Exception:
            msg = None
        return exc.code, None, msg or f'WordPress returned HTTP {exc.code}'
    except Exception as exc:  # network / DNS / timeout
        return 0, None, f'Could not reach WordPress: {exc}'


def _username_from_email(email):
    base = re.sub(r'[^a-z0-9._-]', '', email.split('@')[0].lower()) or 'customer'
    return base[:40]


def find_user_by_email(email):
    status, data, err = wp_request('GET', '/wp/v2/users', params={'search': email, 'context': 'edit', 'per_page': 20})
    if err or not isinstance(data, list):
        return None, err
    for u in data:
        if str(u.get('email') or '').lower() == email.lower():
            return u, None
    return None, None


def provision_website_user(*, email, password, full_name=None, phone=None, wordpress_user_id=None):
    """Create the website login, or update its password if the user already exists.

    Returns {'ok': bool, 'wordpress_user_id': str|None, 'message': str}.
    """
    email = str(email or '').strip().lower()
    if not email or len(str(password or '')) < 8:
        return {'ok': False, 'message': 'Missing website login details'}
    if not is_configured():
        return {'ok': False, 'message': 'WordPress is not configured (API user / application password missing)'}

    existing, err = (None, None)
    wp_id = str(wordpress_user_id or '').strip()
    if wp_id.isdigit():
        existing = {'id': int(wp_id)}
    else:
        existing, err = find_user_by_email(email)
        if err:
            return {'ok': False, 'message': err}

    name = (full_name or email.split('@')[0]).strip()
    if existing:
        status, data, err = wp_request('POST', f"/wp/v2/users/{existing['id']}", payload={'password': password})
    else:
        status, data, err = wp_request('POST', '/wp/v2/users', payload={
            'username': _username_from_email(email), 'email': email, 'password': password,
            'name': name, 'roles': ['customer'],
        })
        if status == 400 and err and 'username' in err.lower():  # username taken → make it unique
            status, data, err = wp_request('POST', '/wp/v2/users', payload={
                'username': f"{_username_from_email(email)}_{abs(hash(email)) % 10000}", 'email': email,
                'password': password, 'name': name, 'roles': ['customer'],
            })
    if err or not isinstance(data, dict) or not data.get('id'):
        return {'ok': False, 'message': err or 'WordPress did not return a user'}
    return {'ok': True, 'wordpress_user_id': str(data['id']), 'message': 'Website login saved'}


# Website accounts the CRM may lock or delete. Anything else (admins, shop managers, editors) is never touched.
CUSTOMER_ROLES = {'customer', 'subscriber'}


def _customer_account(wordpress_user_id):
    """Return (wp_user, error). Refuses anything that is not a plain customer account."""
    wp_id = str(wordpress_user_id or '').strip()
    if not wp_id.isdigit():
        return None, 'No website account linked'
    if not is_configured():
        return None, 'WordPress is not configured (API user / application password missing)'
    status, data, err = wp_request('GET', f'/wp/v2/users/{wp_id}', params={'context': 'edit'})
    if status == 404:
        return None, 'Website account no longer exists'
    if err or not isinstance(data, dict):
        return None, err or 'Could not load the website account'
    roles = set(data.get('roles') or [])
    if not roles or not roles.issubset(CUSTOMER_ROLES):
        return None, f"Website account has role {', '.join(sorted(roles)) or 'none'}; only customer accounts are changed"
    return data, None


def lock_website_user(wordpress_user_id):
    """Block website login for a suspended customer by giving the account a random password."""
    import secrets
    account, err = _customer_account(wordpress_user_id)
    if err:
        return {'ok': False, 'message': err}
    status, data, err = wp_request('POST', f"/wp/v2/users/{account['id']}",
                                   payload={'password': secrets.token_urlsafe(24)})
    if err:
        return {'ok': False, 'message': err}
    return {'ok': True, 'message': 'Website login blocked'}


def delete_website_user(wordpress_user_id):
    """Permanently delete a customer's WordPress account (their WooCommerce orders stay as guest orders)."""
    account, err = _customer_account(wordpress_user_id)
    if err:
        return {'ok': False, 'message': err}
    status, me, err = wp_request('GET', '/wp/v2/users/me')
    if err or not isinstance(me, dict) or not me.get('id'):
        return {'ok': False, 'message': err or 'Could not identify the WordPress API user'}
    status, data, err = wp_request('DELETE', f"/wp/v2/users/{account['id']}",
                                   params={'force': 'true', 'reassign': me['id']})
    if err:
        return {'ok': False, 'message': err}
    return {'ok': True, 'message': 'Website account deleted'}


def update_woo_product(product_id, changes):
    """Push changed service fields to the linked WooCommerce product.

    `changes` holds only what the admin changed: any of name, description, price, active.
    Returns {'ok': bool, 'message': str, 'skipped': bool}.
    """
    pid = str(product_id or '').strip()
    if not pid.isdigit():
        return {'ok': False, 'skipped': True, 'message': 'Service is not linked to a website product'}
    if not is_configured():
        return {'ok': False, 'skipped': True, 'message': 'WordPress is not configured'}
    payload = {}
    if 'name' in changes:
        payload['name'] = changes['name']
    if 'description' in changes:
        payload['description'] = changes['description']
    if 'price' in changes:
        payload['regular_price'] = f"{float(changes['price']):.2f}"
    if 'active' in changes:
        payload['status'] = 'publish' if changes['active'] else 'draft'
    if not payload:
        return {'ok': True, 'skipped': True, 'message': 'Nothing to update on the website'}
    status, data, err = wp_request('PUT', f'/wc/v3/products/{pid}', payload=payload)
    if err:
        return {'ok': False, 'skipped': False, 'message': err}
    return {'ok': True, 'skipped': False, 'message': 'Website product updated'}


def ensure_webhook(topic, delivery_url, secret):
    """Create the WooCommerce webhook for `topic` pointing at the CRM, unless one already exists."""
    if not is_configured():
        return {'ok': False, 'message': 'WordPress is not configured'}
    status, hooks, err = wp_request('GET', '/wc/v3/webhooks', params={'per_page': 100})
    if err:
        return {'ok': False, 'message': err}
    for hook in hooks or []:
        if hook.get('topic') == topic and str(hook.get('delivery_url') or '').rstrip('/') == delivery_url.rstrip('/'):
            if hook.get('status') != 'active':
                wp_request('PUT', f"/wc/v3/webhooks/{hook['id']}", payload={'status': 'active', 'secret': secret})
                return {'ok': True, 'message': f'{topic} webhook re-activated', 'id': hook['id']}
            return {'ok': True, 'message': f'{topic} webhook already set up', 'id': hook['id']}
    status, data, err = wp_request('POST', '/wc/v3/webhooks', payload={
        'name': f'Brixen CRM - {topic}', 'topic': topic, 'delivery_url': delivery_url,
        'secret': secret, 'status': 'active',
    })
    if err or not isinstance(data, dict):
        return {'ok': False, 'message': err or 'WordPress did not create the webhook'}
    return {'ok': True, 'message': f'{topic} webhook created', 'id': data.get('id')}


def connection_status():
    """Quick check used by Settings: can we log in, and as whom."""
    if not is_configured():
        return {'ok': False, 'message': 'Set WORDPRESS_API_USER and WORDPRESS_APP_PASSWORD'}
    status, me, err = wp_request('GET', '/wp/v2/users/me', params={'context': 'edit'})
    if err or not isinstance(me, dict):
        return {'ok': False, 'message': err or 'Login failed'}
    return {'ok': True, 'message': f"Connected as {me.get('name')}", 'roles': me.get('roles') or [],
            'site': wordpress_base_url()}
