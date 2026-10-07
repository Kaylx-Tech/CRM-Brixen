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
    return (_setting('wordpress_url', 'WORDPRESS_URL', 'https://brixenconsultants.com')).rstrip('/')


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
