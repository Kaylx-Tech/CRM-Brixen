"""Finstap plans: what each subscription includes, how much a workspace uses, and the checks that keep
a workspace inside its plan.

  * PLANS is the one place prices, limits and features live (the landing page and the owner portal
    read it through GET /api/platform/plans). None as a limit means unlimited.
  * A workspace's plan is tenants.plan in platform.db: trial, starter, pro, business, enterprise, or
    legacy (Brixen's own adopted database: no limits). A trial gets the Pro plan until it ends.
  * The owner portal can give one workspace its own limits (tenants.custom_limits, JSON), e.g. for
    Enterprise deals; those win over the plan's.
  * Limits only stop NEW records. Nothing is ever deleted or hidden when a plan goes down, and a
    workspace's own customers (client portal, website orders and webhooks) are never blocked.
  * PLAN_LOCK_EXPIRED_TRIALS=1 (env) makes a workspace read-only once its trial has ended without a
    paid plan; off by default until online payment is live.
"""
import json
import os
import re

from db import query_db

UNLIMITED = None

# Features a plan may include, with the words shown to people
FEATURES = {
    'client_portal': 'Client portal',
    'invoices': 'Orders and invoices',
    'companies_house': 'Companies House lookup and sync',
    'branding': 'Your logo, colours and address',
    'login_codes': 'Email login codes and team roles',
    'director_id': 'Director ID verification tracking',
    'accounts': 'Company accounts and Companies House filing',
    'registered_office': 'Registered office and mail forwarding services',
    'smart_operations': 'Smart Operations (GOV forms) and compliance alerts',
    'website': 'Website (WordPress) connection',
    'own_email': 'Your own email sender',
    'price_privacy': 'Hide prices from operations staff',
    'performance': 'Staff performance and incentives',
    'audit_logs': 'Activity logs',
    'email_log': 'Email log',
    'bulk_import': 'Bulk import from Companies House WebFiling',
    'priority_support': 'Priority support',
    'custom_software': 'Custom features built for you',
    'dedicated_server': 'Dedicated server or database',
    'own_domain': 'Your own domain (crm.yourcompany.com)',
    'migration': 'Data migration, training and SLA',
}

LIMITS = {
    'users': 'Team users',
    'customers': 'Customers',
    'companies': 'Companies',
    'orders_month': 'Orders a month',
    'storage_gb': 'Document storage (GB)',
    'ai_month': 'AI assistant questions a month',
}

_BASE = ['client_portal', 'invoices', 'companies_house', 'branding', 'login_codes']
_PRO = _BASE + ['director_id', 'accounts', 'registered_office', 'smart_operations', 'website', 'own_email',
                'price_privacy']
_BUSINESS = _PRO + ['performance', 'audit_logs', 'email_log', 'bulk_import', 'priority_support']

PLANS = {
    'starter': {
        'name': 'Starter',
        'tagline': 'For small practices getting organised.',
        'price_month': 29, 'price_year': 290, 'extra_user_month': 10,
        'limits': {'users': 2, 'customers': 100, 'companies': 150, 'orders_month': 50, 'storage_gb': 10,
                   'ai_month': 100},
        'features': _BASE,
    },
    'pro': {
        'name': 'Pro',
        'tagline': 'For growing firms that sell company services.',
        'price_month': 79, 'price_year': 790, 'extra_user_month': 10, 'popular': True,
        'limits': {'users': 5, 'customers': 1000, 'companies': 1500, 'orders_month': UNLIMITED,
                   'storage_gb': 50, 'ai_month': 500},
        'features': _PRO,
    },
    'business': {
        'name': 'Business',
        'tagline': 'For established teams with many clients.',
        'price_month': 199, 'price_year': 1990, 'extra_user_month': 8,
        'limits': {'users': 15, 'customers': 5000, 'companies': 10000, 'orders_month': UNLIMITED,
                   'storage_gb': 250, 'ai_month': 2000},
        'features': _BUSINESS,
    },
    'enterprise': {
        'name': 'Enterprise',
        'tagline': 'Custom software and limits, built around your firm.',
        'price_month': None, 'price_year': None, 'extra_user_month': None, 'custom': True,
        'limits': {key: UNLIMITED for key in LIMITS},
        'features': list(FEATURES),
    },
}
PLAN_ORDER = ['starter', 'pro', 'business', 'enterprise']
TRIAL_PLAN = 'pro'
PAID_PLANS = set(PLAN_ORDER)


class PlanLimitError(Exception):
    """A workspace reached a limit or asked for a feature its plan does not include; safe to show."""

    def __init__(self, message, code='plan_limit', key=None):
        super().__init__(message)
        self.code = code
        self.key = key


def public_plans():
    """The plans for the landing page and the owner portal."""
    return {
        'order': PLAN_ORDER,
        'plans': {key: {**PLANS[key], 'key': key} for key in PLAN_ORDER},
        'features': FEATURES,
        'limits': LIMITS,
        'trial_plan': TRIAL_PLAN,
    }


def _custom_limits(tenant):
    try:
        data = json.loads((tenant or {}).get('custom_limits') or '{}')
    except (TypeError, ValueError):
        return {}
    return {k: (None if v in (None, '', 'unlimited') else int(v)) for k, v in data.items() if k in LIMITS}


def trial_active(tenant):
    """The trial has not ended yet (no end date = still on trial)."""
    ends = (tenant or {}).get('trial_ends_at')
    if not ends:
        return True
    row = query_db("SELECT datetime(?) > datetime('now') AS ok;", (ends,), one=True)
    return bool(row and row['ok'])


def effective(tenant):
    """{'key', 'name', 'limits', 'features', 'unlimited'} that apply to this workspace right now."""
    plan = ((tenant or {}).get('plan') or 'trial').lower()
    if not tenant or plan == 'legacy':
        return {'key': 'legacy', 'name': 'Legacy', 'limits': {k: None for k in LIMITS},
                'features': list(FEATURES), 'unlimited': True}
    base = PLANS.get(TRIAL_PLAN if plan == 'trial' else plan) or PLANS[TRIAL_PLAN]
    limits = {**base['limits'], **_custom_limits(tenant)}
    return {'key': plan, 'name': 'Free trial' if plan == 'trial' else base['name'], 'limits': limits,
            'features': list(base['features']), 'unlimited': False}


def _size_bytes(value):
    """documents.file_size is usually a byte count; a few older rows say '12.5 KB'."""
    text = str(value or '').strip().upper()
    match = re.match(r'^([\d.]+)\s*(B|KB|MB|GB)?$', text)
    if not match:
        return 0
    number = float(match.group(1))
    return int(number * {'B': 1, 'KB': 1024, 'MB': 1024 ** 2, 'GB': 1024 ** 3}.get(match.group(2) or 'B'))


def _count(sql, args=()):
    row = query_db(sql, args, one=True)
    return int((row or {}).get('c') or 0)


def usage():
    """What the active workspace uses (run inside that workspace's database)."""
    month = "datetime(created_at) >= datetime('now', 'start of month')"
    sizes = query_db("SELECT file_size FROM documents;") or []
    try:
        ai = _count(f"SELECT COUNT(*) AS c FROM ai_usage WHERE {month};")
    except Exception:
        ai = 0  # older databases without the AI table
    return {
        'users': _count("SELECT COUNT(*) AS c FROM users WHERE role != 'CLIENT' AND status != 'Suspended';"),
        'customers': _count("SELECT COUNT(*) AS c FROM users WHERE role = 'CLIENT';"),
        'companies': _count("SELECT COUNT(*) AS c FROM companies;"),
        'orders_month': _count(f"SELECT COUNT(*) AS c FROM orders WHERE status != 'Draft' AND {month};"),
        'storage_gb': round(sum(_size_bytes(r.get('file_size')) for r in sizes) / 1024 ** 3, 3),
        'ai_month': ai,
    }


def check_limit(tenant, key, adding=1):
    """Raise PlanLimitError when adding `adding` more of `key` would go over the plan."""
    plan = effective(tenant)
    limit = plan['limits'].get(key)
    if plan['unlimited'] or limit is None:
        return
    used = usage()[key]
    if used + adding > limit:
        label = LIMITS[key].lower()
        shown = f"{limit} GB of document storage" if key == 'storage_gb' else f"{limit} {label}"
        raise PlanLimitError(f"Your {plan['name']} plan includes {shown} and this workspace has reached it. "
                             f"Upgrade your plan in Settings → Plan & usage to add more.", key=key)


def check_feature(tenant, feature):
    plan = effective(tenant)
    if feature not in plan['features']:
        needed = next((PLANS[k]['name'] for k in PLAN_ORDER if feature in PLANS[k]['features']), 'a higher')
        raise PlanLimitError(f"{FEATURES[feature]} is part of the {needed} plan. "
                             f"Upgrade in Settings → Plan & usage to use it.", code='plan_feature', key=feature)


def lock_expired_trials():
    return str(os.environ.get('PLAN_LOCK_EXPIRED_TRIALS', '0')).strip().lower() in ('1', 'true', 'yes', 'on')


# Areas of the CRM that belong to a feature (path prefix → feature). Incoming website webhooks are
# left out on purpose: a workspace never loses its customers' orders because of its plan.
FEATURE_PATHS = (
    ('/api/admin/activity-logs', 'audit_logs'),
    ('/api/activity-logs', 'audit_logs'),
    ('/api/admin/email-logs', 'email_log'),
    ('/api/admin/companies/webfiling-preview', 'bulk_import'),
    ('/api/admin/companies/import-webfiling', 'bulk_import'),
    ('/api/tasks/incentives-report', 'performance'),
    ('/api/admin/accountancy', 'accounts'),
    ('/api/accountancy', 'accounts'),
    ('/api/admin/smart-links', 'smart_operations'),
    ('/api/admin/settings/test-wordpress', 'website'),
    ('/api/admin/settings/wordpress-webhooks', 'website'),
)

_DOCUMENT_UPLOADS = ('/api/documents', '/api/documents/upload', '/api/admin/documents', '/api/admin/documents/upload')


def _upload_size(body):
    files = (body or {}).get('_files') or {}
    return sum(len(f.get('bytes') or b'') for f in files.values() if isinstance(f, dict))


def guard(tenant, path, method, user, body):
    """Check one request against the workspace's plan; raises PlanLimitError. Only the team's own
    actions are checked: the client portal (/api/client/...) and website endpoints never are."""
    if not tenant or not user or (tenant.get('plan') or '') == 'legacy':
        return
    role = str(user.get('role') or '').upper()
    if role == 'CLIENT' or path.startswith(('/api/client/', '/api/v1/', '/api/webhooks', '/api/auth/')):
        return

    if (lock_expired_trials() and method not in ('GET', 'HEAD') and (tenant.get('plan') or 'trial') == 'trial'
            and not trial_active(tenant)):
        raise PlanLimitError("Your free trial has ended. Choose a plan in Settings → Plan & usage to keep "
                             "adding and changing records; everything you saved is still here.",
                             code='trial_ended')

    for prefix, feature in FEATURE_PATHS:
        if path == prefix or path.startswith(prefix + '/'):
            check_feature(tenant, feature)
            break

    if method != 'POST':
        return
    body = body if isinstance(body, dict) else {}
    if path in ('/api/admin/customers', '/api/clients'):
        check_limit(tenant, 'customers')
    elif path == '/api/admin/staff':
        new_role = str(body.get('role') or 'CLIENT').strip().upper()
        check_limit(tenant, 'customers' if new_role == 'CLIENT' else 'users')
    elif path in ('/api/companies', '/api/admin/companies', '/api/admin/companies/import-webfiling'):
        check_limit(tenant, 'companies')
    elif path in ('/api/orders', '/api/admin/orders'):
        check_limit(tenant, 'orders_month')
    elif path in _DOCUMENT_UPLOADS:
        check_limit(tenant, 'storage_gb', adding=_upload_size(body) / 1024 ** 3)
    elif path == '/api/ai/chat':
        check_limit(tenant, 'ai_month')


def cycle_amount(tenant):
    """What one billing period costs this workspace (a month, or a year when billed yearly); 0 when
    there is no price (trial, or Enterprise without a special price)."""
    plan = ((tenant or {}).get('plan') or '').lower()
    if plan not in PAID_PLANS:
        return 0.0
    yearly = ((tenant or {}).get('billing_cycle') or 'monthly') == 'yearly'
    if (tenant or {}).get('price_override') not in (None, ''):
        return round(float(tenant['price_override']) * (12 if yearly else 1), 2)
    info = PLANS[plan]
    return float((info.get('price_year') if yearly else info.get('price_month')) or 0)


def monthly_value(tenant):
    """What this workspace pays a month (0 on trial, cancelled, or Enterprise without a price)."""
    if (tenant or {}).get('subscription_status') not in ('active', 'past_due'):
        return 0.0
    amount = cycle_amount(tenant)
    return round(amount / 12, 2) if (tenant.get('billing_cycle') or 'monthly') == 'yearly' else amount


def summary(tenant):
    """Plan, limits, usage and trial for one workspace (inside its database)."""
    plan = effective(tenant)
    return {
        'plan': plan,
        'usage': usage(),
        'trial_ends_at': (tenant or {}).get('trial_ends_at'),
        'trial_active': trial_active(tenant) if (tenant or {}).get('plan') == 'trial' else None,
        'subscription_status': (tenant or {}).get('subscription_status'),
        'billing_cycle': (tenant or {}).get('billing_cycle'),
        'current_period_end': (tenant or {}).get('current_period_end'),
    }
