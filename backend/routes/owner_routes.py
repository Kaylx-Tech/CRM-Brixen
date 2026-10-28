"""Finstap owner portal API (/api/platform/owner) — for the people who run Finstap, not for workspaces.

  POST /login {email, password}          → {challenge, email_hint}: a 6-digit code is emailed
  POST /login/resend {challenge}
  POST /login/verify {challenge, code}   → {token, admin}
  POST /password-link {email}            → emails a one-time "set your password" link
  GET  /password-link?token=             → the email that link is for
  POST /password {token, password, full_name}
  GET  /me                               POST /logout
  POST /account/password {current_password, new_password}
  GET  /overview                         → totals, money, plans, signups per day, trials ending soon
  GET  /workspaces?search=&plan=&status= → every workspace with its plan and usage
  GET  /workspaces/<slug>                → one workspace: plan, limits, usage, team, history
  POST /workspaces/<slug>/subscription   {plan, billing_cycle, subscription_status, current_period_end,
                                          price_override, custom_limits, owner_notes}
  POST /workspaces/<slug>/trial {days}   → longer free trial
  POST /workspaces/<slug>/status {status: Active|Suspended, reason}
  GET  /activity                         → what owners changed, newest first
  GET/POST /services/settings            → KYC price per check, registered office price a year, office addresses
  GET  /kyc?period=YYYY-MM               → KYC checks per workspace that month and what to charge
  POST /kyc/billing {slug, period, status: invoiced|paid|''}
  POST /kyc/<slug>/<id>/reject {reason} | resubmit {reason?} → new Didit link emailed to the client
  GET  /registered-office?status=        → every workspace's registered office requests
  POST /registered-office/<id>/confirm {address_index, start_date, months, price} | reject {reason}
       | renew {months, price} | end {reason} | paid {paid}
  GET  /billing                          → every workspace's subscription state and unpaid service charges
  GET/POST /billing/<slug>/payments      {amount, method, note, periods} → records a payment
  GET/POST /content/posts, /content/posts/<id>          blog posts
  GET  /content/newsletter               → subscribers and newsletters
  POST /content/newsletter/issues[/<id>[/test|/send]]   draft, save, test to yourself, send to all
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
from services import platform_services as svc
from services import platform_billing as billing
from services import platform_content as content
from config import TENANT_BASE_DOMAIN
from services.owner_auth import (
    OwnerAuthError, admin_for_token, audit, change_password, link_email, logout, request_password_link, resend,
    set_password_with_link, start_login, verify,
)

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


def _portal_base(environ):
    """Where links in owner emails point: the owner portal's own address. A local test page
    (localhost) gets links back to itself; any other page gets the real address."""
    origin = (environ.get('HTTP_ORIGIN') or '').strip().rstrip('/')
    host = re.sub(r'^https?://', '', origin).split(':')[0].lower()
    if host in ('localhost', '127.0.0.1') or (TENANT_BASE_DOMAIN and host == f'admin.{TENANT_BASE_DOMAIN}'):
        return origin
    return f"https://admin.{TENANT_BASE_DOMAIN}" if TENANT_BASE_DOMAIN else origin


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
    return plans.monthly_value(tenant)


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
    # ── set or reset the password with an emailed one-time link ──
    if sub == '/password-link' and method == 'POST':
        try:
            request_password_link(body.get('email'), _portal_base(environ), _ip(environ))
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=429 if exc.wait else 400)
        return success_response(start_response, message="If this email belongs to a Finstap owner, a link is on "
                                                         "its way. It works for 30 minutes.")
    if sub == '/password-link' and method == 'GET':
        email = link_email(_q(query, 'token'))
        if not email:
            return error_response(start_response, "This link has expired or was already used. Ask for a new one.",
                                  status_code=400)
        return success_response(start_response, data={'email': email})
    if sub == '/password' and method == 'POST':
        try:
            email = set_password_with_link(body.get('token'), body.get('password'), body.get('full_name'))
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=400)
        return success_response(start_response, data={'email': email},
                                message="Password saved. Sign in with it now.")

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
    if sub == '/account/password' and method == 'POST':
        try:
            change_password(admin, body.get('current_password'), body.get('new_password'), _token(environ))
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=400)
        return success_response(start_response, message="Password changed. Other devices were signed out.")
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

    # ── services Finstap sells: KYC checks and registered offices (services/platform_services.py) ──
    try:
        if sub == '/services/settings' and method == 'GET':
            return success_response(start_response, data=svc.settings())
        if sub == '/services/settings' and method == 'POST':
            saved = svc.save_settings(body)
            audit(admin, 'SERVICE_PRICES_CHANGED', detail=f"KYC {saved['kyc_price']}, registered office "
                                                         f"{saved['ro_price_year']}/yr, {len(saved['ro_addresses'])} address(es)")
            return success_response(start_response, data=saved, message="Saved.")
        if sub == '/kyc' and method == 'GET':
            return success_response(start_response, data=svc.kyc_report(_q(query, 'period'), _q(query, 'workspace') or None))
        if sub == '/kyc/billing' and method == 'POST':
            svc.set_kyc_billing(body.get('slug'), body.get('period'), body.get('status'))
            audit(admin, 'KYC_BILLING', body.get('slug'), f"{body.get('period')}: {body.get('status') or 'not billed'}")
            return success_response(start_response, message="Billing updated.")
        kyc = re.match(r'^/kyc/([a-z0-9-]+)/(\d+)/(reject|resubmit)$', sub)
        if kyc and method == 'POST':
            slug, check_id, act = kyc.group(1), int(kyc.group(2)), kyc.group(3)
            if act == 'reject':
                row = svc.reject_check(slug, check_id, body.get('reason'))
                audit(admin, 'KYC_REJECTED', slug, f"{row['full_name']} ({row.get('order_number') or 'no order'}): "
                                                   f"{row.get('reason')}")
                return success_response(start_response, data=row, message="Marked as rejected.")
            row, emailed = svc.resubmit_check(slug, check_id, body.get('reason'))
            audit(admin, 'KYC_RESUBMIT', slug, f"{row['full_name']} ({row.get('order_number') or 'no order'}): "
                                               f"new link{' emailed' if emailed else ', not emailed'}"
                                               f"{'; ' + body.get('reason') if body.get('reason') else ''}")
            return success_response(start_response, data=row, message=(
                "New link emailed to the client." if emailed
                else "New link made, but the email was not sent. Copy the link and send it yourself."))
        if sub == '/registered-office' and method == 'GET':
            return success_response(start_response, data={
                'requests': svc.ro_requests(status=_q(query, 'status') or None),
                'settings': svc.settings(),
            })
        ro = re.match(r'^/registered-office/(\d+)/(confirm|reject|renew|end|paid)$', sub)
        if ro and method == 'POST':
            request_id, act = int(ro.group(1)), ro.group(2)
            if act == 'confirm':
                row = svc.confirm_ro(request_id, admin, body.get('address_index'), body.get('start_date'),
                                     body.get('months'), body.get('price'))
                message = "Registered office confirmed. The client can see it in their portal."
            elif act == 'reject':
                row = svc.reject_ro(request_id, admin, body.get('reason'))
                message = "Request rejected."
            elif act == 'renew':
                row = svc.renew_ro(request_id, body.get('months'), body.get('price'))
                message = f"Renewed until {row['expiry_date']}."
            elif act == 'end':
                row = svc.end_ro(request_id, admin, body.get('reason'))
                message = "Registered office ended."
            else:
                row = svc.set_ro_paid(request_id, bool(body.get('paid')))
                message = "Marked as paid." if row['paid'] else "Marked as unpaid."
            audit(admin, f"REGISTERED_OFFICE_{act.upper()}", row['tenant_slug'], f"{row['company_name']}: {message}")
            return success_response(start_response, data=row, message=message)
    except svc.ServiceError as exc:
        return error_response(start_response, str(exc), status_code=400)

    # ── billing: subscriptions and service charges (services/platform_billing.py) ──
    try:
        if sub == '/billing' and method == 'GET':
            data = billing.overview()
            data['payments'] = billing.payments(limit=50)
            return success_response(start_response, data=data)
        pay = re.match(r'^/billing/([a-z0-9-]+)/payments$', sub)
        if pay and method == 'GET':
            return success_response(start_response, data={'payments': billing.payments(pay.group(1))})
        if pay and method == 'POST':
            done = billing.record_payment(pay.group(1), admin, body.get('amount'), body.get('method'), body.get('note'),
                                          body.get('periods'))
            audit(admin, 'PAYMENT_RECORDED', pay.group(1),
                  f"£{done['amount']} for {done['period_start']} – {done['period_end']}")
            return success_response(start_response, data=done, message=f"Payment saved. Paid until {done['period_end']}.")
    except billing.BillingError as exc:
        return error_response(start_response, str(exc), status_code=400)

    # ── content: blog posts and the newsletter (services/platform_content.py) ──
    try:
        if sub == '/content/posts' and method == 'GET':
            return success_response(start_response, data={'posts': content.list_posts()})
        if sub == '/content/posts' and method == 'POST':
            post = content.save_post(body, admin)
            audit(admin, 'BLOG_POST_CREATED', detail=post['title'])
            return success_response(start_response, data=post, message="Post saved.", status_code=201)
        post_match = re.match(r'^/content/posts/(\d+)$', sub)
        if post_match and method == 'GET':
            post = content.get_post(post_id=int(post_match.group(1)))
            return (success_response(start_response, data=post) if post
                    else error_response(start_response, "Post not found", status_code=404))
        if post_match and method == 'POST':
            post = content.save_post(body, admin, int(post_match.group(1)))
            audit(admin, 'BLOG_POST_SAVED', detail=f"{post['title']} ({post['status']})")
            return success_response(start_response, data=post, message="Post saved.")
        if sub == '/content/newsletter' and method == 'GET':
            return success_response(start_response, data={**content.subscribers(), 'issues': content.list_issues()})
        if sub == '/content/newsletter/issues' and method == 'POST':
            issue = content.save_issue(body, admin)
            return success_response(start_response, data=issue, message="Draft saved.", status_code=201)
        issue_match = re.match(r'^/content/newsletter/issues/(\d+)(/test|/send)?$', sub)
        if issue_match and method == 'POST':
            issue_id, act = int(issue_match.group(1)), issue_match.group(2)
            if act == '/test':
                content.send_test(issue_id, admin['email'])
                return success_response(start_response, message=f"Test sent to {admin['email']}.")
            if act == '/send':
                count = content.send_issue(issue_id, f"https://{TENANT_BASE_DOMAIN}" if TENANT_BASE_DOMAIN
                                           else (environ.get('HTTP_ORIGIN') or ''))
                audit(admin, 'NEWSLETTER_SENT', detail=f"issue {issue_id} to {count} subscriber(s)")
                return success_response(start_response, message=f"Sending to {count} subscriber(s)…")
            issue = content.save_issue(body, admin, issue_id)
            return success_response(start_response, data=issue, message="Draft saved.")
    except content.ContentError as exc:
        return error_response(start_response, str(exc), status_code=400)

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
