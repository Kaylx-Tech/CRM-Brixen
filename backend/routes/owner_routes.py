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
  POST /workspaces/<slug>/status {status: Active|Suspended, reason, challenge, code}  (suspending needs the code)
  POST /workspaces/<slug>/code {action: suspend|delete}  emails the signed-in owner a 6-digit code
  POST /workspaces/<slug>/delete {reason, challenge, code}  hidden, nobody signs in, database kept
  GET  /activity                         → what owners changed, newest first
  GET/POST /services/settings            → KYC price per check, registered office price a year, office addresses
  GET  /kyc?period=YYYY-MM               → KYC checks per workspace that month and what to charge
  POST /kyc/billing {slug, period, status: invoiced|paid|''}
  POST /kyc/service {slug, enabled} → switch a workspace's paid KYC service on or off
  POST /kyc/<slug>/<id>/reject {reason} | resubmit {reason?} → new Didit link emailed to the client
  GET  /registered-office?status=        → every workspace's registered office requests
  POST /registered-office/<id>/confirm {address_index, start_date, months, price} | reject {reason}
       | renew {months, price} | end {reason} | paid {paid}
  GET  /billing                          → every workspace's subscription state and unpaid service charges
  GET/POST /billing/<slug>/payments      {amount, method, note, periods} → records a payment
  GET/POST /billing/<slug>/wallet        {amount, note} → a bank transfer top-up of the workspace balance
  GET/POST /content/posts, /content/posts/<id>          blog posts
  GET  /content/newsletter               → subscribers and newsletters
  POST /content/newsletter/issues[/<id>[/test|/send]]   draft, save, test to yourself, send to all
  GET  /admins                           → owner accounts
  GET/POST /integrations {values: {NAME: value}, clear: [NAME]}  → Finstap's API keys for every workspace
       (secrets are never sent back, only whether they are set)
  GET  /integrations/r2  · POST /integrations/r2/test · POST /integrations/r2/move  → R2 check and moving
       documents that are only on the server into R2

KYC desk (kyc.finstap.com): the outside KYC team signs in here too (role 'kyc', login with panel: 'kyc')
and may only use /me, /logout, /account/password and /desk; owners may use /desk as well.
  GET  /desk/checks?period=YYYY-MM&workspace=   → every ID check that month (no prices)
  GET  /desk/checks/<slug>/<id>                 → one check with the person's answers and files
  GET  /desk/checks/<slug>/<id>/files/<file_id> → one photo or PDF the person sent
  POST /desk/checks/<slug>/<id>/status {status: Approved|Declined|In Review, note}  (the person is emailed)
  POST /desk/checks/<slug>/<id>/resubmit {reason?} → new form link emailed to the client
  GET/POST /kyc-users {email, full_name}  · POST /kyc-users/<id>/status {status: Active|Disabled}  (owners only)

Every route except login needs "Authorization: Bearer owner.<token>". Nothing here deletes a workspace
or its data; Brixen's adopted database (plan "legacy") cannot be changed from here.
"""
import json
import os
import re
import sqlite3
import threading
import time

from tenancy import _platform_execute, _platform_query, get_tenant, use_tenant, workspace_url
from utils.response import success_response, error_response
from services import plans
from services import platform_services as svc
from services import platform_billing as billing
from services import platform_content as content
from services import platform_integrations as integrations
from services import kyc_desk
from config import API_PUBLIC_URL, TENANT_BASE_DOMAIN
from services.owner_auth import (
    OwnerAuthError, add_kyc_user, admin_for_token, audit, change_password, kyc_users, link_email, logout,
    request_password_link, resend, set_kyc_user_status, set_password_with_link, start_login, verify,
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


def _kyc_base(environ):
    """The KYC panel's address for links in KYC team emails (a local test page gets itself)."""
    origin = (environ.get('HTTP_ORIGIN') or '').strip().rstrip('/')
    host = re.sub(r'^https?://', '', origin).split(':')[0].lower()
    if host in ('localhost', '127.0.0.1') or (TENANT_BASE_DOMAIN and host == f'kyc.{TENANT_BASE_DOMAIN}'):
        return origin
    return f"https://kyc.{TENANT_BASE_DOMAIN}" if TENANT_BASE_DOMAIN else origin


def _desk(environ, start_response, sub, method, admin, body, query):
    """The KYC desk's routes (KYC team and owners). The team sees only what the owner allows (kyc_desk.VIEW);
    deleting a person's data is for the owner only."""
    team = admin.get('role') == 'kyc'
    owner = (admin.get('role') or 'owner') == 'owner'
    try:
        if sub == '/desk/checks' and method == 'GET':
            return success_response(start_response, data=kyc_desk.checks(_q(query, 'period'),
                                                                          _q(query, 'workspace') or None, team))
        if sub == '/desk/view' and method == 'GET' and owner:
            return success_response(start_response, data=kyc_desk.team_view())
        if sub == '/desk/view' and method == 'POST' and owner:
            view = kyc_desk.set_team_view(body)
            audit(admin, 'KYC_DESK_VIEW_CHANGED', detail=', '.join(f"{k}: {'shown' if v else 'hidden'}"
                                                                   for k, v in view.items()))
            return success_response(start_response, data=view, message="Saved.")
        match = re.match(r'^/desk/checks/([a-z0-9-]+)/(\d+)/files/(\d+)/delete$', sub)
        if match and method == 'POST':
            if not owner:
                return error_response(start_response, "Only the Finstap owner can delete a document.", status_code=403)
            slug = kyc_desk.resolve(match.group(1))
            if not kyc_desk.owner_delete_file(slug, int(match.group(2)), int(match.group(3))):
                return error_response(start_response, "Document not found", status_code=404)
            audit(admin, 'KYC_DOCUMENT_DELETED', slug, f"check {match.group(2)}: file {match.group(3)}")
            return success_response(start_response, data={'id': int(match.group(3))}, message="Document deleted.")
        match = re.match(r'^/desk/checks/([a-z0-9-]+)/(\d+)/files/(\d+)$', sub)
        if match and method == 'GET':
            data, mime = kyc_desk.file(kyc_desk.resolve(match.group(1)), int(match.group(2)), int(match.group(3)))
            if data is None:
                return error_response(start_response, "File not found", status_code=404)
            start_response('200 OK', [('Content-Type', mime or 'application/octet-stream'),
                                      ('Content-Length', str(len(data))), ('Cache-Control', 'private, no-store'),
                                      ('X-Content-Type-Options', 'nosniff')])
            return [data]
        match = re.match(r'^/desk/checks/([a-z0-9-]+)/(\d+)(?:/(status|resubmit|delete-data|remove|upload))?$', sub)
        if not match:
            return error_response(start_response, "Not found", status_code=404)
        slug, check_id, act = kyc_desk.resolve(match.group(1)), int(match.group(2)), match.group(3)
        if not act and method == 'GET':
            return success_response(start_response, data=kyc_desk.detail(slug, check_id, team, owner))
        if act == 'status' and method == 'POST':
            row = kyc_desk.set_status(slug, check_id, body.get('status'), body.get('note'), admin)
            try:
                from services import kyc_payouts
                kyc_payouts.record(slug, check_id, admin, row.get('status'))
            except Exception as exc:
                print(f"[KYC payouts] check {check_id}: {exc}")
            audit(admin, f"KYC_{row['status'].upper().replace(' ', '_')}", slug,
                  f"{row['full_name']} ({row.get('order_number') or 'no order'})"
                  f"{': ' + row['review_note'] if row.get('review_note') else ''}")
            return success_response(start_response, data=kyc_desk.shown(row, team), message=f"Saved as {row['status']}.")
        if act == 'resubmit' and method == 'POST':
            row, emailed = svc.resubmit_check(slug, check_id, body.get('reason'))
            audit(admin, 'KYC_RESUBMIT', slug, f"{row['full_name']} ({row.get('order_number') or 'no order'}): "
                                               f"new link{' emailed' if emailed else ', not emailed'}"
                                               f"{'; ' + body.get('reason') if body.get('reason') else ''}")
            return success_response(start_response, data=kyc_desk.shown(row, team), message=(
                "New link emailed to the client." if emailed
                else "New link made, but the email was not sent. Copy the link and send it yourself."))
        if act == 'upload' and method == 'POST':
            if not owner:
                return error_response(start_response, "Only the Finstap owner can change a check's documents.",
                                      status_code=403)
            import base64
            try:
                data = base64.b64decode(str((body or {}).get('data') or '').split(',')[-1], validate=False)
            except (ValueError, TypeError):
                return error_response(start_response, "The file could not be read", status_code=400)
            kind = str((body or {}).get('kind') or '')
            kyc_desk.owner_put_file(slug, check_id, kind, data)
            audit(admin, 'KYC_DOCUMENT_SET', slug, f"check {check_id}: {kind}")
            return success_response(start_response, data={'id': check_id}, message="Document saved.")
        if act == 'remove' and method == 'POST':
            if not owner:
                return error_response(start_response, "Only the Finstap owner can remove a check.", status_code=403)
            row = kyc_desk.remove_check(slug, check_id)
            audit(admin, 'KYC_CHECK_REMOVED', slug, f"{row['full_name']} ({row.get('order_number') or 'no order'})")
            return success_response(start_response, data={'id': check_id}, message="Check removed.")
        if act == 'delete-data' and method == 'POST':
            if not owner:
                return error_response(start_response, "Only the Finstap owner can delete KYC data.", status_code=403)
            row, files = kyc_desk.delete_data(slug, check_id)
            audit(admin, 'KYC_DATA_DELETED', slug, f"{row['full_name']} ({row.get('order_number') or 'no order'}): "
                                                   f"{files} file(s), answers and result deleted")
            return success_response(start_response, data={'files': files},
                                    message=f"KYC data deleted ({files} file{'' if files == 1 else 's'}).")
    except svc.ServiceError as exc:
        return error_response(start_response, str(exc), status_code=400)
    return error_response(start_response, "Not found", status_code=404)


def _api_base(environ):
    """This API's public address (for the Didit webhook URL the owner pastes into Didit)."""
    if API_PUBLIC_URL:
        return API_PUBLIC_URL
    scheme = environ.get('HTTP_X_FORWARDED_PROTO') or environ.get('wsgi.url_scheme') or 'https'
    return f"{scheme}://{environ.get('HTTP_HOST') or f'api.{TENANT_BASE_DOMAIN}'}"


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


def _purge_workspace(tenant):
    """Remove a deleted workspace for good: its database file, its files on the server and in R2, and its
    record (billing history rows stay for the books). Returns a short summary."""
    import shutil
    from config import STORAGE_DIR
    slug = tenant['slug']
    db = tenant.get('db_path') or ''
    for path in (db, db + '-wal', db + '-shm'):
        if path and os.path.isfile(path):
            os.remove(path)
    folder = os.path.realpath(os.path.join(STORAGE_DIR, 'workspaces', slug))
    if slug and folder.startswith(os.path.realpath(STORAGE_DIR) + os.sep) and os.path.isdir(folder):
        shutil.rmtree(folder, ignore_errors=True)
    files = 0
    try:
        from services import r2_storage
        files = r2_storage.delete_prefix(slug)
    except Exception as exc:
        print(f"[Owner] R2 files of {slug} not deleted: {exc}")
    _platform_execute("DELETE FROM tenants WHERE slug = ? AND deleted_at IS NOT NULL;", (slug,))
    return f"database and files removed ({files} in R2)"


def _all_tenants():
    return _platform_query("""
        SELECT *, CASE WHEN trial_ends_at IS NULL OR datetime(trial_ends_at) > datetime('now') THEN 1 ELSE 0 END
                  AS trial_running
        FROM tenants WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC;
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
            started = start_login(body.get('email'), body.get('password'), _ip(environ),
                                  panel='kyc' if body.get('panel') == 'kyc' else 'owner',
                                  device_id=body.get('device_id'), user_agent=environ.get('HTTP_USER_AGENT', ''))
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=429 if exc.wait else 400)
        except sqlite3.OperationalError as exc:
            print(f"[Owner login] sign-in busy: {exc}")
            return error_response(start_response, "The server was busy for a moment. Please try again.",
                                  status_code=503)
        if started.get('token'):
            # This browser entered a code in the last 30 days: signed in without a new one
            return success_response(start_response, data=started)
        return success_response(start_response, data={**started, 'resend_after': 60})
    if sub == '/login/resend' and method == 'POST':
        try:
            resend(body.get('challenge'))
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=429 if exc.wait else 400)
        return success_response(start_response, data={'resend_after': 60}, message="A new code is on its way.")
    # ── set or reset the password with an emailed one-time link ──
    if sub == '/password-link' and method == 'POST':
        try:
            request_password_link(body.get('email'), _portal_base(environ), _ip(environ), _kyc_base(environ))
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
                                  environ.get('HTTP_USER_AGENT', ''), device_id=body.get('device_id'))
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=400)
        except sqlite3.OperationalError as exc:
            # The platform database was busy (another write at that moment): nothing was counted, try again
            print(f"[Owner login] code check busy: {exc}")
            return error_response(start_response, "The server was busy for a moment. Please enter the code again.",
                                  status_code=503)
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

    # ── KYC desk (kyc.finstap.com); the KYC team can use nothing else ──
    if sub.startswith('/desk/'):
        return _desk(environ, start_response, sub, method, admin, body, query)
    if admin.get('role') != 'owner':
        return error_response(start_response, "This is for the Finstap owner only.", status_code=403)

    if sub == '/kyc-users' and method == 'GET':
        from services import kyc_payouts
        try:
            kyc_payouts.backfill()  # checks the team decided before are owed too
        except Exception as exc:
            print(f"[KYC payouts] backfill: {exc}")
        totals = kyc_payouts.team_totals()
        users = [{**u, **(totals.get(u['id']) or {'rate': None, 'checks': 0, 'due': 0.0, 'paid': 0.0})}
                 for u in kyc_users()]
        return success_response(start_response, data={'users': users})
    if sub == '/kyc-payouts' and method == 'GET':
        from services import kyc_payouts
        return success_response(start_response, data={'entries': kyc_payouts.entries()})
    pay = re.match(r'^/kyc-users/(\d+)/(rate|paid)$', sub)
    if pay and method == 'POST':
        from services import kyc_payouts
        member_id = int(pay.group(1))
        if pay.group(2) == 'rate':
            try:
                rate = kyc_payouts.set_rate(member_id, (body or {}).get('rate'))
            except ValueError as exc:
                return error_response(start_response, str(exc), status_code=400)
            audit(admin, 'KYC_TEAM_RATE', None, f"member {member_id}: {rate if rate is not None else 'no rate'}")
            return success_response(start_response, message=(f"Rate set to £{rate:g} per check." if rate is not None
                                                             else "Rate removed."))
        amount = kyc_payouts.mark_paid(member_id, (body or {}).get('period'))
        audit(admin, 'KYC_TEAM_PAID', None, f"member {member_id}: £{amount}")
        return success_response(start_response, message=f"Marked £{amount:g} as paid.")
    if sub == '/kyc-users' and method == 'POST':
        try:
            user, emailed = add_kyc_user(admin, body.get('email'), body.get('full_name'), _kyc_base(environ))
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=400)
        return success_response(start_response, data={'user': user}, status_code=201, message=(
            f"Added. {user['email']} got a link to set a password." if emailed
            else "Added, but the email was not sent. They can use Forgot password on the KYC panel."))
    kyc_user = re.match(r'^/kyc-users/(\d+)/status$', sub)
    if kyc_user and method == 'POST':
        try:
            user = set_kyc_user_status(admin, int(kyc_user.group(1)), body.get('status'))
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=400)
        return success_response(start_response, data={'user': user},
                                message="Turned on." if user['status'] == 'Active' else "Turned off and signed out.")

    if sub == '/overview' and method == 'GET':
        return success_response(start_response, data=_overview())

    # Workspaces the list hides: deleted ones (data kept) and suspended adopted/partner ones, to turn back on
    if sub == '/workspaces/hidden' and method == 'GET':
        hidden = _platform_query("""
            SELECT slug, name, owner_email, status, plan, suspended_reason, deleted_at, deleted_by,
                   COALESCE(kyc_form_base_url, '') AS kyc_form_base_url
            FROM tenants
            WHERE deleted_at IS NOT NULL OR (plan = 'legacy' AND status = 'Suspended')
            ORDER BY COALESCE(deleted_at, updated_at) DESC;
        """)
        return success_response(start_response, data={'workspaces': hidden})
    restore = re.match(r'^/workspaces/([a-z0-9-]+)/restore$', sub)
    if restore and method == 'POST':
        slug = restore.group(1)
        tenant = get_tenant(slug)
        if not tenant or tenant['status'] not in ('Active', 'Suspended'):
            return error_response(start_response, "This workspace was never set up, so it cannot be turned on.",
                                  status_code=400)
        _platform_execute("""
            UPDATE tenants SET status = 'Active', suspended_reason = NULL, deleted_at = NULL, deleted_by = NULL,
                   updated_at = datetime('now') WHERE slug = ?;
        """, (slug,))
        audit(admin, 'WORKSPACE_REACTIVATED', slug, 'turned back on from Deleted and hidden')
        return success_response(start_response, data={'slug': slug},
                                message=f"{tenant['name']} is on again. Its data was kept.")

    # A deleted workspace can be removed for good: its database, its files (server and R2) and its record.
    # Only after it was deleted, and only with a code emailed to the signed-in owner.
    purge = re.match(r'^/workspaces/([a-z0-9-]+)/purge(-code)?$', sub)
    if purge and method == 'POST':
        slug = purge.group(1)
        tenant = get_tenant(slug)
        if not tenant or not tenant.get('deleted_at') or tenant.get('plan') == 'legacy':
            return error_response(start_response, "Only a deleted workspace can be removed for good.", status_code=400)
        from services.owner_auth import confirm_action_code, request_action_code
        try:
            if purge.group(2):
                challenge = request_action_code(admin, 'purge', slug)
                return success_response(start_response, data={'challenge': challenge},
                                        message=f"We emailed a 6-digit code to {admin['email']}.")
            confirm_action_code(admin, body.get('challenge'), body.get('code'), 'purge', slug)
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=400)
        removed = _purge_workspace(tenant)
        audit(admin, 'WORKSPACE_PURGED', slug, f"{tenant['name']}: {removed}")
        return success_response(start_response, data={'slug': slug},
                                message=f"{tenant['name']} is deleted for good.")

    # Partner Perks for every workspace (services/partner_perks.py)
    perk = re.match(r'^/perks(?:/(\d+))?$', sub)
    if perk:
        from services import partner_perks
        try:
            if method == 'GET' and not perk.group(1):
                return success_response(start_response, data={'perks': partner_perks.all_perks()})
            if method in ('POST', 'PUT'):
                perks = partner_perks.save(body, perk.group(1))
                audit(admin, 'PARTNER_PERK_SAVED', None, f"{(body or {}).get('category')}: {(body or {}).get('title')}")
                return success_response(start_response, data={'perks': perks}, message="Saved. Every workspace sees it.")
            if method == 'DELETE' and perk.group(1):
                perks = partner_perks.remove(perk.group(1))
                audit(admin, 'PARTNER_PERK_REMOVED', None, f"perk {perk.group(1)}")
                return success_response(start_response, data={'perks': perks}, message="Removed from every workspace.")
        except partner_perks.PerkError as exc:
            return error_response(start_response, str(exc), status_code=400)

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
                               "WHERE COALESCE(role, 'owner') = 'owner' ORDER BY id;")
        return success_response(start_response, data={'admins': rows})

    # ── integrations: Finstap's API keys for every workspace (services/platform_integrations.py) ──
    if sub == '/integrations' and method == 'GET':
        return success_response(start_response, data={
            'groups': integrations.overview(),
            'didit_webhook_url': f"{_api_base(environ)}/api/webhooks/didit",
            'stripe_webhook_url': f"{_api_base(environ)}/api/platform/stripe/webhook",
        })
    if sub == '/integrations' and method == 'POST':
        try:
            changed = integrations.save((body or {}).get('values'), (body or {}).get('clear'))
        except integrations.IntegrationError as exc:
            return error_response(start_response, str(exc), status_code=400)
        if any(name.startswith('R2_') for name in changed):
            from services.r2_storage import reset_client
            reset_client()
        if changed:
            # Names only: the values (keys, passwords) never go into the log
            audit(admin, 'INTEGRATIONS_CHANGED', detail=', '.join(changed))
        return success_response(start_response, data={'groups': integrations.overview()},
                                message="Saved." if changed else "Nothing changed.")

    # Cloudflare R2: test it, see how many documents are still only on the server, move them in
    if sub == '/integrations/r2' and method == 'GET':
        from services import r2_migrate
        return success_response(start_response, data=r2_migrate.overview())
    if sub == '/integrations/r2/test' and method == 'POST':
        from services import r2_storage
        health = r2_storage.health()
        return success_response(start_response, data=health,
                                message="R2 works." if health['ok'] else health['error'])
    if sub == '/integrations/r2/move' and method == 'POST':
        from services import r2_migrate
        result = r2_migrate.move(limit=200)
        if result.get('moved'):
            audit(admin, 'R2_FILES_MOVED', detail=f"{result['moved']} moved, {result['failed']} failed, "
                                                  f"{result['left']} left")
        message = result.get('error') or (f"{result['moved']} file(s) moved to R2"
                                          + (f", {result['failed']} failed" if result['failed'] else '')
                                          + (f", {result['left']} still on the server" if result['left'] else '') + '.')
        return success_response(start_response, data=result, message=message)

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
        if sub == '/kyc/price' and method == 'POST':
            from services import kyc_billing
            try:
                amount = kyc_billing.set_price(body.get('slug'), body.get('price'))
            except kyc_billing.KycServiceError as exc:
                return error_response(start_response, str(exc), status_code=400)
            audit(admin, 'KYC_PRICE_CHANGED', body.get('slug'),
                  f"£{amount:.2f} a check" if amount is not None else "back to the general price")
            return success_response(start_response, message=(
                f"Price set to £{amount:.2f} a check for this workspace." if amount is not None
                else "This workspace uses the general price again."))
        if sub == '/kyc/service' and method == 'POST':
            from services import kyc_billing
            on = bool(body.get('enabled'))
            try:
                kyc_billing.set_enabled(body.get('slug'), on, f"Finstap ({admin.get('email')})")
            except kyc_billing.KycServiceError as exc:
                return error_response(start_response, str(exc), status_code=400)
            audit(admin, 'KYC_SERVICE_ON' if on else 'KYC_SERVICE_OFF', body.get('slug'), '')
            return success_response(start_response, message=f"KYC service turned {'on' if on else 'off'}.")
        # KYC for another website (e.g. Brixen's portal): its address, free checks, its API key
        if sub == '/kyc/partners' and method == 'GET':
            from services import kyc_partner
            return success_response(start_response, data={'partners': kyc_partner.partners()})
        if sub == '/kyc/partners/reactivate' and method == 'POST':
            from services import kyc_partner
            slug = str(body.get('slug') or '').strip().lower()
            try:
                kyc_partner.reactivate(slug)
            except kyc_partner.PartnerError as exc:
                return error_response(start_response, str(exc), status_code=400)
            audit(admin, 'WORKSPACE_REACTIVATED', slug, 'KYC partner turned back on')
            return success_response(start_response, data={'partners': kyc_partner.partners()},
                                    message="Turned back on. The site's KYC works again.")
        if sub in ('/kyc/partners', '/kyc/partners/key') and method == 'POST':
            from services import kyc_partner
            slug = str(body.get('slug') or '').strip().lower()
            try:
                if sub == '/kyc/partners':
                    kyc_partner.setup(slug, body.get('base_url'), bool(body.get('free')))
                    audit(admin, 'KYC_PARTNER_SET', slug, f"{body.get('base_url') or 'own address'}"
                                                         f"{', free' if body.get('free') else ''}")
                    return success_response(start_response, data={'partners': kyc_partner.partners()},
                                            message="Saved.")
                key = kyc_partner.new_key(slug)
                audit(admin, 'KYC_PARTNER_KEY', slug, 'new API key')
                return success_response(start_response, data={'key': key},
                                        message="New key made. Copy it now: it is not shown again.")
            except kyc_partner.PartnerError as exc:
                return error_response(start_response, str(exc), status_code=400)
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
        if sub == '/billing/revenue' and method == 'GET':
            return success_response(start_response, data=billing.revenue(_q(query, 'period')))
        pay = re.match(r'^/billing/([a-z0-9-]+)/payments$', sub)
        if pay and method == 'GET':
            return success_response(start_response, data={'payments': billing.payments(pay.group(1))})
        if pay and method == 'POST':
            done = billing.record_payment(pay.group(1), admin, body.get('amount'), body.get('method'), body.get('note'),
                                          body.get('periods'))
            audit(admin, 'PAYMENT_RECORDED', pay.group(1),
                  f"£{done['amount']} for {done['period_start']} – {done['period_end']}")
            return success_response(start_response, data=done, message=f"Payment saved. Paid until {done['period_end']}.")
        if sub == '/billing/topups' and method == 'GET':
            from services import wallet
            return success_response(start_response, data={
                'requests': wallet.topup_requests(status=_q(query, 'status') or None)})
        decide = re.match(r'^/billing/topups/(\d+)/(approve|reject)$', sub)
        if decide and method == 'POST':
            from services import wallet
            approve = decide.group(2) == 'approve'
            done = wallet.decide_transfer(int(decide.group(1)), admin, approve, body.get('amount'), body.get('reason'))
            req = done['request']
            audit(admin, 'WALLET_TOPUP_' + ('APPROVED' if approve else 'REJECTED'), req['tenant_slug'],
                  f"£{req.get('approved_amount') or req['amount']} {req.get('reference') or ''}".strip())
            msg = (f"Approved: £{req['approved_amount']:.2f} added to the balance."
                   + (f" {len(done['paid'])} due service(s) paid from it." if done['paid'] else '')) if approve \
                else "Rejected. The workspace sees the reason."
            return success_response(start_response, data=done, message=msg)
        top = re.match(r'^/billing/([a-z0-9-]+)/wallet$', sub)
        if top and method == 'GET':
            from services import wallet
            return success_response(start_response, data={'balance': wallet.balance(top.group(1)),
                                                          'entries': wallet.entries(top.group(1))})
        if top and method == 'POST':
            from services import wallet
            paid = wallet.top_up(top.group(1), body.get('amount'), body.get('note'), admin)
            audit(admin, 'WALLET_TOP_UP', top.group(1), f"£{body.get('amount')} ({body.get('note') or 'bank transfer'})")
            return success_response(start_response, data={'balance': wallet.balance(top.group(1)), 'paid': paid},
                                    message=f"Balance topped up. {len(paid)} due service(s) paid from it."
                                    if paid else "Balance topped up.")
    except billing.BillingError as exc:
        return error_response(start_response, str(exc), status_code=400)
    except ValueError as exc:  # wallet.WalletError
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

    # Suspend and delete need a code emailed to the signed-in owner
    if action == '/code' and method == 'POST':
        from services.owner_auth import request_action_code
        what = str(body.get('action') or '').strip().lower()
        try:
            challenge = request_action_code(admin, what, slug)
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=400)
        return success_response(start_response, data={'challenge': challenge},
                                message=f"We emailed a 6-digit code to {admin['email']}.")

    if action == '/delete' and method == 'POST':
        from services.owner_auth import confirm_action_code
        reason = str(body.get('reason') or '').strip()[:500]
        if not reason:
            return error_response(start_response, "Write why the workspace is deleted.", status_code=400)
        try:
            confirm_action_code(admin, body.get('challenge'), body.get('code'), 'delete', slug)
        except OwnerAuthError as exc:
            return error_response(start_response, str(exc), status_code=400)
        # Nothing is erased: the workspace is hidden, nobody can sign in, and its database stays where it is.
        # The address stays taken (the workspace's files are stored under it).
        _platform_execute("""
            UPDATE tenants SET status = CASE WHEN status = 'Active' THEN 'Suspended' ELSE status END,
                   suspended_reason = ?, deleted_at = datetime('now'), deleted_by = ?, updated_at = datetime('now')
            WHERE slug = ? AND deleted_at IS NULL;
        """, (f"Deleted: {reason}", admin.get('email'), slug))
        audit(admin, 'WORKSPACE_DELETED', slug, reason)
        return success_response(start_response, data={'slug': slug}, message="Workspace deleted. Its data is kept.")

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
        if status == 'Suspended':
            from services.owner_auth import confirm_action_code
            try:
                confirm_action_code(admin, body.get('challenge'), body.get('code'), 'suspend', slug)
            except OwnerAuthError as exc:
                return error_response(start_response, str(exc), status_code=400)
        _platform_execute("UPDATE tenants SET status = ?, suspended_reason = ?, updated_at = datetime('now') "
                          "WHERE slug = ?;", (status, reason if status == 'Suspended' else None, slug))
        audit(admin, 'WORKSPACE_SUSPENDED' if status == 'Suspended' else 'WORKSPACE_REACTIVATED', slug, reason)
        return success_response(start_response, data=_row(get_tenant(slug)),
                                message="Workspace suspended." if status == 'Suspended' else "Workspace reactivated.")

    return error_response(start_response, "Not found", status_code=404)
