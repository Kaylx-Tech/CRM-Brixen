"""Finstap owner portal API (/api/platform/owner) — for the people who run Finstap, not for workspaces.

  POST /login {email, password}          → {challenge, email_hint}: a 6-digit code is emailed
  POST /login/resend {challenge}
  POST /login/verify {challenge, code}   → {token, admin}
  GET  /me                               POST /logout
  GET  /overview                         → totals, money, plans, signups per day, trials ending soon
  GET  /workspaces?search=&plan=&status= → every workspace with its plan and usage
  GET  /workspaces/<slug>                → one workspace: plan, limits, usage, team, history
  POST /workspaces/<slug>/subscription   {plan, billing_cycle, subscription_status, current_period_end,
                                          price_override, custom_limits, owner_notes}
  POST /workspaces/<slug>/trial {days}   → longer free trial
  POST /workspaces/<slug>/status {status: Active|Suspended, reason}
  GET  /activity                         → what owners changed, newest first
  GET  /admins                           → owner accounts

Every route except login needs "Authorization: Bearer owner.<token>". Nothing here deletes a workspace
or its data; Brixen's adopted database (plan "legacy") cannot be changed from here.
"""
import json
import os
import re
import threading
import time

from tenancy import _platform_execute, _platform_query, get_tenant, use_tenant, workspace_url
from utils.response import success_response, error_response
from services import plans
from services.owner_auth import OwnerAuthError, admin_for_token, audit, logout, resend, start_login, verify

PREFIX = '/api/platform/owner'
SUBSCRIPTION_STATUSES = ('trialing', 'active', 'past_due', 'cancelled')
BILLING_CYCLES = ('monthly', 'yearly')

_usage_cache = {}
_usage_lock = threading.Lock()
USAGE_SECONDS = 60


def _token(environ):
    header = environ.get('HTTP_AUTHORIZATION', '')
    return header[7:].strip() if header.startswith('Bearer ') else ''


def _ip(environ):
    return (environ.get('HTTP_CF_CONNECTING_IP') or environ.get('HTTP_X_REAL_IP')
            or (environ.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0] or environ.get('REMOTE_ADDR') or '').strip()


def _q(query, key):
    value = (query or {}).get(key) or ['']
    return str(value[0] if isinstance(value, list) else value).strip()


def _workspace_usage(tenant, fresh=False):
    """Usage of one workspace (cached for a minute, so the list stays quick)."""
    key = tenant['slug']
    now = time.time()
    with _usage_lock:
        hit = _usage_cache.get(key)
        if hit and not fresh and now - hit[0] < USAGE_SECONDS:
            return hit[1]
    data = None
    if tenant['status'] in ('Active', 'Suspended') and os.path.exists(tenant['db_path'] or ''):
        try:
            with use_tenant(tenant):
                from db import query_db
                data = plans.usage()
                last = query_db("SELECT MAX(last_activity_at) AS t FROM user_sessions;", one=True) or {}
                data['last_active_at'] = last.get('t')
        except Exception as exc:
            print(f"[Owner] usage of {key} failed: {exc}")
    with _usage_lock:
        _usage_cache[key] = (now, data)
    return data


def _monthly_value(tenant):
    """What this workspace pays a month (0 on trial, cancelled, or Enterprise without a price)."""
    plan = (tenant.get('plan') or '').lower()
    if plan not in plans.PAID_PLANS or (tenant.get('subscription_status') or '') not in ('active', 'past_due'):
        return 0.0
    if tenant.get('price_override') not in (None, ''):
        return float(tenant['price_override'])
    info = plans.PLANS[plan]
    if (tenant.get('billing_cycle') or 'monthly') == 'yearly' and info.get('price_year'):
        return round(info['price_year'] / 12, 2)
    return float(info.get('price_month') or 0)


def _all_tenants():
    return _platform_query("""
        SELECT *, CASE WHEN trial_ends_at IS NULL OR datetime(trial_ends_at) > datetime('now') THEN 1 ELSE 0 END
                  AS trial_running
        FROM tenants ORDER BY created_at DESC, id DESC;
    """)


def _row(tenant, with_usage=True):
    plan = plans.effective(tenant)
    out = {k: tenant.get(k) for k in (
        'slug', 'name', 'status', 'plan', 'trial_ends_at', 'owner_name', 'owner_email', 'created_at',
        'billing_cycle', 'subscription_status', 'current_period_end', 'price_override', 'owner_notes',
        'suspended_reason')}
    out.update({
        'plan_name': plan['name'],
        'trial_running': bool(tenant.get('trial_running')) if tenant.get('plan') == 'trial' else None,
        'monthly_value': _monthly_value(tenant),
        'url': workspace_url(tenant['slug']),
        'limits': plan['limits'],
        'custom_limits': plans._custom_limits(tenant),
    })
    if with_usage:
        out['usage'] = _workspace_usage(tenant)
    return out


def _overview():
    tenants = [t for t in _all_tenants() if t['status'] != 'Failed']
    workspaces = [t for t in tenants if t.get('plan') != 'legacy']
    by_plan = {key: 0 for key in ['trial'] + plans.PLAN_ORDER}
    for t in workspaces:
        by_plan[t.get('plan') or 'trial'] = by_plan.get(t.get('plan') or 'trial', 0) + 1
    mrr = round(sum(_monthly_value(t) for t in workspaces), 2)
    totals = {'users': 0, 'customers': 0, 'companies': 0, 'storage_gb': 0.0}
    for t in workspaces:
        used = _workspace_usage(t) or {}
        for key in totals:
            totals[key] += used.get(key) or 0
    totals['storage_gb'] = round(totals['storage_gb'], 2)
    signups = _platform_query("""
        SELECT date(created_at) AS day, COUNT(*) AS count FROM tenants
        WHERE plan != 'legacy' AND datetime(created_at) >= datetime('now', '-30 days')
        GROUP BY date(created_at) ORDER BY day;
    """)
    ending = _platform_query("""
        SELECT slug, name, owner_email, trial_ends_at FROM tenants
        WHERE plan = 'trial' AND status = 'Active' AND datetime(trial_ends_at) > datetime('now')
          AND datetime(trial_ends_at) <= datetime('now', '+7 days')
        ORDER BY trial_ends_at;
    """)
    return {
        'workspaces': len(workspaces),
        'active': sum(1 for t in workspaces if t['status'] == 'Active'),
        'suspended': sum(1 for t in workspaces if t['status'] == 'Suspended'),
        'on_trial': sum(1 for t in workspaces if t.get('plan') == 'trial' and t['trial_running']),
        'trial_ended': sum(1 for t in workspaces if t.get('plan') == 'trial' and not t['trial_running']),
        'paying': sum(1 for t in workspaces if _monthly_value(t) > 0),
        'past_due': sum(1 for t in workspaces if t.get('subscription_status') == 'past_due'),
        'mrr': mrr,
        'arr': round(mrr * 12, 2),
        'by_plan': by_plan,
        'totals': totals,
        'signups_30d': signups,
        'new_30d': sum(r['count'] for r in signups),
        'trials_ending': ending,
        'recent': [_row(t, with_usage=False) for t in workspaces[:6]],
    }


def _parse_subscription(body, tenant):
    """Check the owner's form; returns the columns to save."""
    plan = str(body.get('plan') or tenant.get('plan') or 'trial').strip().lower()
    if plan not in ['trial'] + plans.PLAN_ORDER:
        raise ValueError("Unknown plan")
    cycle = str(body.get('billing_cycle') or '').strip().lower()
    if cycle and cycle not in BILLING_CYCLES:
        raise ValueError("Billing must be monthly or yearly")
    status = str(body.get('subscription_status') or '').strip().lower()
    if status and status not in SUBSCRIPTION_STATUSES:
        raise ValueError("Unknown subscription status")
    period_end = str(body.get('current_period_end') or '').strip()
    if period_end and not re.match(r'^\d{4}-\d{2}-\d{2}$', period_end):
        raise ValueError("Paid until must be a date (YYYY-MM-DD)")
    price = body.get('price_override')
    if price in (None, ''):
        price = None
    else:
        try:
            price = round(float(price), 2)
        except (TypeError, ValueError):
            raise ValueError("Special price must be a number")
        if price < 0:
            raise ValueError("Special price cannot be below zero")
    limits = body.get('custom_limits') or {}
    if not isinstance(limits, dict):
        raise ValueError("Custom limits are not valid")
    clean = {}
    for key, value in limits.items():
        if key not in plans.LIMITS or value in ('', 'default'):
            continue
        if value in (None, 'unlimited'):
            clean[key] = None
            continue
        try:
            number = int(float(value))
        except (TypeError, ValueError):
            raise ValueError(f"{plans.LIMITS[key]} must be a number or unlimited")
        if number < 0:
            raise ValueError(f"{plans.LIMITS[key]} cannot be below zero")
        clean[key] = number
    return {
        'plan': plan,
        'billing_cycle': cycle or None,
        'subscription_status': status or ('trialing' if plan == 'trial' else None),
        'current_period_end': period_end or None,
        'price_override': price,
        'custom_limits': json.dumps(clean) if clean else None,
        'owner_notes': str(body.get('owner_notes') or '').strip()[:4000] or None,
    }


def handle_owner_routes(environ, start_response, path, method, body, query):
    if not (path == PREFIX or path.startswith(PREFIX + '/')):
        return None
    sub = path[len(PREFIX):] or '/'
    body = body if isinstance(body, dict) else {}

    # ── sign-in (no session yet) ──
    if sub == '/login' and method == 'POST':
        try:
            challenge, hint = start_login(body.get('email'), body.get('password'), _ip(environ))
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=429 if exc.wait else 400)
        return success_response(start_response, data={'challenge': challenge, 'email_hint': hint,
                                                      'resend_after': 60})
    if sub == '/login/resend' and method == 'POST':
        try:
            resend(body.get('challenge'))
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=429 if exc.wait else 400)
        return success_response(start_response, data={'resend_after': 60}, message="A new code is on its way.")
    if sub == '/login/verify' and method == 'POST':
        try:
            token, admin = verify(body.get('challenge'), body.get('code'), _ip(environ),
                                  environ.get('HTTP_USER_AGENT', ''))
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=400)
        return success_response(start_response, data={'token': token, 'admin': admin})

    admin = admin_for_token(_token(environ))
    if not admin:
        return error_response(start_response, "Please sign in to the owner portal.", status_code=401)

    if sub == '/me' and method == 'GET':
        return success_response(start_response, data={'admin': admin})
    if sub == '/logout' and method == 'POST':
        logout(_token(environ))
        audit(admin, 'SIGNED_OUT')
        return success_response(start_response, message="Signed out.")

    if sub == '/overview' and method == 'GET':
        return success_response(start_response, data=_overview())

    if sub == '/workspaces' and method == 'GET':
        search = _q(query, 'search').lower()
        plan_filter = _q(query, 'plan').lower()
        status_filter = _q(query, 'status')
        rows = []
        for tenant in _all_tenants():
            if tenant.get('plan') == 'legacy':
                continue
            if plan_filter and (tenant.get('plan') or '') != plan_filter:
                continue
            if status_filter and tenant['status'] != status_filter:
                continue
            haystack = ' '.join(str(tenant.get(k) or '') for k in ('slug', 'name', 'owner_name', 'owner_email')).lower()
            if search and search not in haystack:
                continue
            rows.append(_row(tenant))
        return success_response(start_response, data={'workspaces': rows, 'plans': plans.public_plans()})

    if sub == '/activity' and method == 'GET':
        rows = _platform_query("SELECT * FROM platform_audit ORDER BY id DESC LIMIT 200;")
        return success_response(start_response, data={'activity': rows})

    if sub == '/admins' and method == 'GET':
        rows = _platform_query("SELECT id, email, full_name, status, last_login_at, created_at FROM platform_admins "
                               "ORDER BY id;")
        return success_response(start_response, data={'admins': rows})

    match = re.match(r'^/workspaces/([a-z0-9-]+)(/[a-z]+)?$', sub)
    if not match:
        return error_response(start_response, "Not found", status_code=404)
    slug, action = match.group(1), match.group(2) or ''
    tenant = next((t for t in _all_tenants() if t['slug'] == slug), None)
    if not tenant or tenant.get('plan') == 'legacy':
        return error_response(start_response, "Workspace not found", status_code=404)

    if action == '' and method == 'GET':
        data = _row(tenant)
        data['usage'] = _workspace_usage(tenant, fresh=True)
        team = []
        if tenant['status'] in ('Active', 'Suspended') and os.path.exists(tenant['db_path'] or ''):
            with use_tenant(tenant):
                from db import query_db
                team = query_db("""
                    SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at,
                           (SELECT MAX(last_activity_at) FROM user_sessions s WHERE s.user_id = u.id) AS last_active_at
                    FROM users u WHERE u.role != 'CLIENT' ORDER BY u.id;
                """) or []
        data['team'] = team
        data['history'] = _platform_query("SELECT * FROM platform_audit WHERE tenant_slug = ? ORDER BY id DESC LIMIT 50;",
                                          (slug,))
        return success_response(start_response, data=data)

    if action == '/subscription' and method == 'POST':
        try:
            values = _parse_subscription(body, tenant)
        except ValueError as exc:
            return error_response(start_response, str(exc), status_code=400)
        changed = [f"{k}: {tenant.get(k) or '-'} → {v if v is not None else '-'}" for k, v in values.items()
                   if str(tenant.get(k) or '') != str(v if v is not None else '')]
        if not changed:
            return success_response(start_response, data=_row(get_tenant(slug)), message="Nothing changed.")
        _platform_execute(f"""
            UPDATE tenants SET {', '.join(f'{k} = ?' for k in values)}, updated_at = datetime('now') WHERE slug = ?;
        """, (*values.values(), slug))
        audit(admin, 'SUBSCRIPTION_CHANGED', slug, '; '.join(changed))
        return success_response(start_response, data=_row(get_tenant(slug)), message="Subscription saved.")

    if action == '/trial' and method == 'POST':
        if tenant.get('plan') != 'trial':
            return error_response(start_response, "This workspace is not on a free trial.", status_code=400)
        try:
            days = int(body.get('days') or 0)
        except (TypeError, ValueError):
            days = 0
        if not 1 <= days <= 90:
            return error_response(start_response, "Choose between 1 and 90 days.", status_code=400)
        _platform_execute("""
            UPDATE tenants SET trial_ends_at = datetime(
                CASE WHEN trial_ends_at IS NOT NULL AND datetime(trial_ends_at) > datetime('now')
                     THEN trial_ends_at ELSE datetime('now') END, ?), updated_at = datetime('now')
            WHERE slug = ?;
        """, (f'+{days} days', slug))
        audit(admin, 'TRIAL_EXTENDED', slug, f"+{days} days (was {tenant.get('trial_ends_at') or '-'})")
        return success_response(start_response, data=_row(get_tenant(slug)), message=f"Trial extended by {days} days.")

    if action == '/status' and method == 'POST':
        status = str(body.get('status') or '').strip().title()
        if status not in ('Active', 'Suspended'):
            return error_response(start_response, "Status must be Active or Suspended.", status_code=400)
        if tenant['status'] not in ('Active', 'Suspended'):
            return error_response(start_response, "This workspace was never set up, so it cannot be changed.",
                                  status_code=400)
        reason = str(body.get('reason') or '').strip()[:500] or None
        if status == 'Suspended' and not reason:
            return error_response(start_response, "Write why the workspace is suspended.", status_code=400)
        _platform_execute("UPDATE tenants SET status = ?, suspended_reason = ?, updated_at = datetime('now') "
                          "WHERE slug = ?;", (status, reason if status == 'Suspended' else None, slug))
        audit(admin, 'WORKSPACE_SUSPENDED' if status == 'Suspended' else 'WORKSPACE_REACTIVATED', slug, reason)
        return success_response(start_response, data=_row(get_tenant(slug)),
                                message="Workspace suspended." if status == 'Suspended' else "Workspace reactivated.")

    return error_response(start_response, "Not found", status_code=404)
