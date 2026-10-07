"""Role / permission helpers (ported from app.py check_permission & friends)."""
import json
from db import query_db

STAFF_DEPARTMENTS = (
    'New Signups', 'Orders', 'Documents', 'Support', 'Compliance', 'Accounts', 'Accountancy', 'General',
)
INTERNAL_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

# STAFF users also need one of these departments for the permission to apply.
PERMISSION_ACCESS = {
    'clients.view': ('New Signups',),
    'clients.edit': ('New Signups',),
    'clients.create': ('New Signups',),
    'orders.view': ('Orders', 'Support'),
    'orders.edit': ('Orders', 'Support'),
    'documents.view': ('Documents', 'Compliance'),
    'documents.upload': ('Documents', 'Compliance'),
    'documents.send': ('Documents', 'Compliance'),
    'invoices.view': ('Accounts',),
    'accountancy.manage': ('Accountancy', 'Accounts', 'Compliance'),
}


def _parse_departments(value):
    if value is None or value == '' or value == []:
        return []
    if isinstance(value, (list, tuple)):
        items = list(value)
    else:
        text = str(value).strip()
        if not text:
            return []
        if text.startswith('['):
            try:
                parsed = json.loads(text)
                items = parsed if isinstance(parsed, list) else [text]
            except Exception:
                items = [text]
        else:
            items = [p.strip() for p in text.split(',') if p.strip()]
    out = []
    for item in items:
        item = str(item).strip()
        if item in STAFF_DEPARTMENTS and item not in out:
            out.append(item)
    return out


def departments_from_user(user):
    merged = []
    for key in ('department', 'departments'):
        for dept in _parse_departments((user or {}).get(key)):
            if dept not in merged:
                merged.append(dept)
    return merged


def is_internal(user):
    return bool(user and user.get('role') in INTERNAL_ROLES)


def can_view_revenue(user):
    return bool(user and user.get('role') in ('SUPER_ADMIN', 'ADMIN'))


def check_permission(user, permission_name):
    if not user:
        return False
    role = user.get('role')
    if role in ('SUPER_ADMIN', 'ADMIN'):
        return True
    row = query_db(
        """
        SELECT 1 FROM role_permissions rp
        JOIN roles r ON rp.role_id = r.id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE r.name = ? AND p.name = ?;
        """,
        (role, permission_name), one=True)
    if not row:
        return False
    if role != 'STAFF':
        return True
    needed = PERMISSION_ACCESS.get(permission_name)
    if not needed:
        return True
    return bool(set(departments_from_user(user)).intersection(needed))
