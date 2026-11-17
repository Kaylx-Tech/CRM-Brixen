"""Old WordPress website logins → the CRM (one time, after the website moved to Next.js).

Settings > Integrations > "Import old website logins" sends the list made from the WordPress database (one entry
per website user: wordpress_user_id, email, name, phone, roles, password_hash). For each customer:

  * found in the CRM (by WordPress id, else email): the old password hash is kept in users.wordpress_password_hash
    and the WordPress id is filled in when missing;
  * not in the CRM yet: added as a customer (CLIENT, no CRM password of its own) with that hash.

At sign-in (My Account on the website, routes/website_account_routes.py; also routes/auth_routes.py) a customer whose CRM password does not match is checked against that hash; when it
matches, the password becomes their CRM password and the old hash is marked 'used'. Setting a new password marks it too.

Skipped: website staff (administrator, shop manager, editor, author), team accounts in the CRM, and customers who
already have their own password (B2B, Business, new-website customers). Nothing is deleted
and no CRM password is changed. Running it again only refreshes the old hashes of customers who have not signed in
with them yet.
"""
from db import query_db, execute_db, unusable_password_hash

STAFF_ROLES = {'administrator', 'shop_manager', 'editor', 'author', 'contributor'}
HASH_PREFIXES = ('$wp$2', '$P$', '$H$', '$2y$', '$2b$', '$2a$')
MAX_USERS = 20000


class LoginImportError(ValueError):
    """Shown to the admin as it is."""


def _clean(entry):
    email = str(entry.get('email') or '').strip().lower()
    wp_id = str(entry.get('wordpress_user_id') or '').strip()
    pw = str(entry.get('password_hash') or '').strip()
    roles = {str(r).strip().lower() for r in (entry.get('roles') or []) if str(r).strip()}
    return {
        'email': email,
        'wp_id': wp_id if wp_id.isdigit() else '',
        'name': str(entry.get('name') or '').strip()[:120] or email.split('@')[0],
        'phone': str(entry.get('phone') or '').strip()[:40],
        'hash': pw if pw.startswith(HASH_PREFIXES) and len(pw) <= 255 else '',
        'roles': roles,
    }


def import_logins(entries):
    """Returns the counts shown to the admin."""
    from services.portal_access import is_b2b_client, is_business_client, is_website_portal_client
    if not isinstance(entries, list) or not entries:
        raise LoginImportError("The file has no website users. Choose the file made from the old website.")
    if len(entries) > MAX_USERS:
        raise LoginImportError(f"The file has more than {MAX_USERS} users.")
    counts = {'updated': 0, 'added': 0, 'staff': 0, 'team': 0, 'has_crm_password': 0, 'no_password': 0,
              'no_email': 0, 'total': len(entries)}
    for raw in entries:
        if not isinstance(raw, dict):
            counts['no_email'] += 1
            continue
        e = _clean(raw)
        if not e['email'] or '@' not in e['email']:
            counts['no_email'] += 1
            continue
        if e['roles'] & STAFF_ROLES:
            counts['staff'] += 1
            continue
        if not e['hash']:
            counts['no_password'] += 1
            continue
        user = None
        if e['wp_id']:
            user = query_db("SELECT * FROM users WHERE wordpress_user_id = ? LIMIT 1;", (e['wp_id'],), one=True)
        if not user:
            user = query_db("SELECT * FROM users WHERE lower(email) = ? LIMIT 1;", (e['email'],), one=True)
        if user:
            user = dict(user)
            if user.get('role') != 'CLIENT':
                counts['team'] += 1
                continue
            # 'used': signed in with it already, or set a new password since; never brought back
            if is_b2b_client(user) or is_business_client(user) or is_website_portal_client(user) \
                    or user.get('wordpress_password_hash') == 'used':
                counts['has_crm_password'] += 1
                continue
            execute_db("""
                UPDATE users SET wordpress_password_hash = ?,
                       wordpress_user_id = CASE WHEN COALESCE(wordpress_user_id, '') = '' OR wordpress_user_id LIKE 'local_%'
                                                THEN ? ELSE wordpress_user_id END
                WHERE id = ?;
            """, (e['hash'], e['wp_id'] or user.get('wordpress_user_id'), user['id']))
            counts['updated'] += 1
            continue
        try:
            from services.permanent_purge import is_purged_email
            if is_purged_email(e['email']):
                counts['no_email'] += 1
                continue
        except ImportError:
            pass
        execute_db("""
            INSERT INTO users (wordpress_user_id, email, password_hash, wordpress_password_hash, full_name, phone,
                               role, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'CLIENT', 'Active', datetime('now'));
        """, (e['wp_id'] or None, e['email'], unusable_password_hash(), e['hash'], e['name'], e['phone']))
        counts['added'] += 1
    return counts
