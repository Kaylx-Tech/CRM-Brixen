"""Check the WordPress Application Password from the environment (read-only, nothing is changed).

Usage (backend container terminal):
    python /app/scripts/wp_test.py

Reads the site URL, username and application password from env (several common names are
accepted, see below). The password is never printed. Every request is a GET.
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    import db  # noqa: F401  (loads backend/.env the same way the app does)
except Exception:
    pass

URL_KEYS = ('WORDPRESS_URL', 'WORDPRESS_BASE_URL', 'WP_URL', 'WP_BASE_URL', 'WP_SITE_URL')
USER_KEYS = ('WORDPRESS_API_USER', 'WORDPRESS_USERNAME', 'WORDPRESS_USER', 'WP_USERNAME', 'WP_USER', 'WP_API_USER')
PASS_KEYS = ('WORDPRESS_APP_PASSWORD', 'WORDPRESS_APPLICATION_PASSWORD', 'WP_APP_PASSWORD',
             'WP_APPLICATION_PASSWORD', 'WP_API_PASSWORD', 'WP_PASSWORD', 'WORDPRESS_PASSWORD')


def first_env(keys):
    for key in keys:
        value = (os.environ.get(key) or '').strip()
        if value:
            return key, value
    return None, ''


def get(base, path, auth):
    req = urllib.request.Request(base + '/wp-json' + path, headers={
        'Authorization': 'Basic ' + auth, 'User-Agent': 'BrixenCRM-wp-test/1.0', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode('utf-8') or 'null')
            return resp.status, body, resp.headers
    except urllib.error.HTTPError as err:
        try:
            body = json.loads(err.read().decode('utf-8') or 'null')
        except Exception:
            body = None
        return err.code, body, err.headers
    except Exception as err:
        return 0, {'message': str(err)}, {}


def main():
    url_key, base = first_env(URL_KEYS)
    user_key, username = first_env(USER_KEYS)
    pass_key, password = first_env(PASS_KEYS)
    print('Env found:')
    print(f"  URL      : {url_key or 'MISSING'} {('= ' + base) if base else ''}")
    print(f"  Username : {user_key or 'MISSING'} {('= ' + username) if username else ''}")
    print(f"  Password : {pass_key or 'MISSING'} {('(' + str(len(password.replace(' ', ''))) + ' chars, hidden)') if password else ''}")
    if not (base and username and password):
        print('\nSet the missing variable(s) and run again. Accepted names:')
        print('  URL:', ', '.join(URL_KEYS))
        print('  Username:', ', '.join(USER_KEYS))
        print('  Password:', ', '.join(PASS_KEYS))
        return 1

    base = base.rstrip('/')
    auth = base64.b64encode(f"{username}:{password}".encode('utf-8')).decode('ascii')

    status, me, _ = get(base, '/wp/v2/users/me?context=edit', auth)
    print(f"\n1. Login (users/me): HTTP {status}")
    if status != 200:
        print('   FAILED:', (me or {}).get('code'), '-', (me or {}).get('message'))
        print('   Check the username (WordPress login name, not email) and the application password.')
        return 1
    caps = (me or {}).get('capabilities') or {}
    print(f"   OK - logged in as {me.get('name')} (id {me.get('id')}), roles: {', '.join(me.get('roles') or [])}")
    for cap in ('manage_options', 'manage_woocommerce', 'list_users', 'create_users', 'edit_users',
                'edit_shop_orders', 'edit_products', 'upload_files', 'edit_posts'):
        print(f"   {'yes' if caps.get(cap) else 'no ':3s}  {cap}")

    checks = [
        ('WooCommerce orders', '/wc/v3/orders?per_page=1'),
        ('WooCommerce customers', '/wc/v3/customers?per_page=1&role=all'),
        ('WooCommerce products', '/wc/v3/products?per_page=1'),
        ('WooCommerce product categories', '/wc/v3/products/categories?per_page=1'),
        ('WooCommerce coupons', '/wc/v3/coupons?per_page=1'),
        ('WooCommerce refunds', '/wc/v3/refunds?per_page=1'),
        ('WooCommerce webhooks', '/wc/v3/webhooks?per_page=1'),
        ('WooCommerce payment gateways', '/wc/v3/payment_gateways'),
        ('WooCommerce sales report', '/wc/v3/reports/sales'),
        ('WordPress users', '/wp/v2/users?per_page=1&context=edit'),
        ('WordPress pages', '/wp/v2/pages?per_page=1'),
        ('WordPress posts', '/wp/v2/posts?per_page=1'),
        ('WordPress media', '/wp/v2/media?per_page=1'),
        ('Contact Form 7 forms', '/contact-form-7/v1/contact-forms'),
        ('Brixen CRM plugin', '/brixen-crm/v1'),
    ]
    print('\n2. What this password can read (GET only):')
    for label, path in checks:
        status, body, headers = get(base, path, auth)
        total = headers.get('X-WP-Total') if headers else None
        if status == 200:
            count = total if total is not None else (len(body) if isinstance(body, list) else '-')
            print(f"   OK   {label:32s} total: {count}")
        else:
            reason = (body or {}).get('code') if isinstance(body, dict) else ''
            print(f"   {status or 'ERR':<4} {label:32s} {reason}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
