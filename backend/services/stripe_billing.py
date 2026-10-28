"""Stripe card payments for Finstap workspaces: their plan (a Stripe subscription that renews by itself) and
Finstap's services (registered office, KYC months), paid on Stripe's own pages.

  * Keys: owner portal › Integrations (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET), else the server env.
  * No products or prices to set up in Stripe: every Checkout carries its own price (price_data) from
    services/plans.py, so the prices on finstap.com are the prices charged (GBP).
  * Card details never reach Finstap: people type them on Stripe Checkout; the Customer Portal lets them
    change the card, see invoices or cancel.
  * Stripe tells Finstap what happened through one webhook (POST /api/platform/stripe/webhook). Each event
    is handled once (stripe_events); each Stripe invoice or checkout is saved once as a payment.
  * Nothing here deletes data. Owner-recorded payments (bank transfer etc.) keep working beside Stripe.
"""
import datetime
import hashlib
import hmac
import json
import time

import requests

from tenancy import _platform_execute, _platform_query, get_tenant
from services import plans
from services.platform_integrations import get as integration

API = 'https://api.stripe.com/v1'
CURRENCY = 'gbp'
CARD = 'Card (Stripe)'
# Stripe asks a trial end to be at least two days away
MIN_TRIAL_SECONDS = 2 * 24 * 3600
STATUS = {'trialing': 'trialing', 'active': 'active', 'past_due': 'past_due', 'unpaid': 'past_due',
          'canceled': 'cancelled', 'incomplete_expired': 'cancelled', 'paused': 'past_due'}


class StripeError(ValueError):
    """Shown to the person as it is."""


def configured():
    return bool(integration('STRIPE_SECRET_KEY'))


def _flatten(data, prefix=''):
    """{'a': {'b': [1]}} → [('a[b][0]', '1')]: the form encoding Stripe's API takes."""
    out = []
    items = data.items() if isinstance(data, dict) else enumerate(data)
    for key, value in items:
        name = f"{prefix}[{key}]" if prefix else str(key)
        if isinstance(value, (dict, list, tuple)):
            out.extend(_flatten(value, name))
        elif value is not None:
            out.append((name, 'true' if value is True else 'false' if value is False else str(value)))
    return out


def _api(method, path, data=None):
    key = integration('STRIPE_SECRET_KEY')
    if not key:
        raise StripeError("Card payments are not switched on yet. Please contact Finstap.")
    try:
        res = requests.request(method, f"{API}{path}", auth=(key, ''), timeout=30,
                               data=_flatten(data) if data and method != 'GET' else None,
                               params=_flatten(data) if data and method == 'GET' else None)
    except requests.RequestException:
        raise StripeError("Stripe could not be reached. Please try again in a minute.")
    body = res.json() if res.content else {}
    if res.status_code >= 400:
        message = (body.get('error') or {}).get('message') or f"Stripe error ({res.status_code})"
        print(f"[Stripe] {method} {path}: {message}")
        raise StripeError(message)
    return body


# ── prices ───────────────────────────────────────────────────────────────────

def price_for(tenant, plan, cycle):
    """(amount in pounds, product name) for one billing period of `plan` for this workspace."""
    if plan not in plans.PLANS or plans.PLANS[plan].get('custom'):
        raise StripeError("Choose Starter, Pro or Business. For Enterprise, please contact Finstap.")
    if cycle not in ('monthly', 'yearly'):
        raise StripeError("Choose monthly or yearly")
    # A special monthly price agreed for this workspace applies to its own plan
    if tenant.get('price_override') not in (None, '') and tenant.get('plan') == plan:
        amount = float(tenant['price_override']) * (12 if cycle == 'yearly' else 1)
    else:
        info = plans.PLANS[plan]
        amount = float(info['price_year'] if cycle == 'yearly' else info['price_month'])
    return round(amount, 2), f"Finstap {plans.PLANS[plan]['name']} ({cycle})"


def _price_data(tenant, plan, cycle):
    amount, name = price_for(tenant, plan, cycle)
    return {'currency': CURRENCY, 'unit_amount': int(round(amount * 100)),
            'product_data': {'name': name},
            'recurring': {'interval': 'year' if cycle == 'yearly' else 'month'}}


# ── customers, checkout, portal ──────────────────────────────────────────────

def _customer(tenant):
    if tenant.get('stripe_customer_id'):
        return tenant['stripe_customer_id']
    customer = _api('POST', '/customers', {
        'email': tenant.get('owner_email') or None, 'name': tenant.get('name'),
        'metadata': {'workspace': tenant['slug']},
    })
    _platform_execute("UPDATE tenants SET stripe_customer_id = ?, updated_at = datetime('now') WHERE slug = ?;",
                      (customer['id'], tenant['slug']))
    return customer['id']


def _has_live_subscription(tenant):
    return bool(tenant.get('stripe_subscription_id')) and tenant.get('subscription_status') in ('active', 'trialing',
                                                                                               'past_due')


def _trial_end(tenant):
    """A workspace still on its free trial is charged when the trial ends, not today."""
    if (tenant.get('plan') or 'trial') != 'trial' or not tenant.get('trial_ends_at'):
        return None
    try:
        ends = datetime.datetime.fromisoformat(str(tenant['trial_ends_at']).replace(' ', 'T')[:19])
    except ValueError:
        return None
    stamp = int(ends.replace(tzinfo=datetime.timezone.utc).timestamp())
    return stamp if stamp - time.time() > MIN_TRIAL_SECONDS else None


def subscribe(slug, plan, cycle, return_url):
    """Start paying for a plan: a Stripe Checkout page (returns its URL), or, when the workspace already
    pays by card, a change of plan on its subscription (returns None)."""
    tenant = get_tenant(slug)
    if _has_live_subscription(tenant):
        change_plan(tenant, plan, cycle)
        return None
    data = {
        'mode': 'subscription', 'customer': _customer(tenant), 'client_reference_id': slug,
        'line_items': [{'price_data': _price_data(tenant, plan, cycle), 'quantity': 1}],
        'success_url': f"{return_url}?paid=1", 'cancel_url': return_url,
        'metadata': {'workspace': slug, 'kind': 'subscription', 'plan': plan, 'cycle': cycle},
        'subscription_data': {'metadata': {'workspace': slug, 'plan': plan, 'cycle': cycle}},
        'allow_promotion_codes': True,
    }
    trial_end = _trial_end(tenant)
    if trial_end:
        data['subscription_data']['trial_end'] = trial_end
    return _api('POST', '/checkout/sessions', data)['url']


def change_plan(tenant, plan, cycle):
    """Move a card subscription to another plan or cycle; Stripe works out the difference (proration)."""
    sub = _api('GET', f"/subscriptions/{tenant['stripe_subscription_id']}")
    item = (sub.get('items') or {}).get('data') or []
    if not item:
        raise StripeError("This subscription has no plan line. Please contact Finstap.")
    sub = _api('POST', f"/subscriptions/{sub['id']}", {
        'items': [{'id': item[0]['id'], 'price_data': {**_price_data(tenant, plan, cycle),
                                                        'product': item[0]['price']['product']}}],
        'proration_behavior': 'create_prorations', 'cancel_at_period_end': False,
        'metadata': {'workspace': tenant['slug'], 'plan': plan, 'cycle': cycle},
    })
    apply_subscription(sub)


def portal(slug, return_url):
    """Stripe's Customer Portal: change card, see invoices, cancel."""
    tenant = get_tenant(slug)
    if not tenant.get('stripe_customer_id'):
        raise StripeError("There is no card on file yet. Choose a plan first.")
    return _api('POST', '/billing_portal/sessions', {'customer': tenant['stripe_customer_id'],
                                                     'return_url': return_url})['url']


# ── services: registered office and KYC ──────────────────────────────────────

def services_due(slug):
    """What the workspace owes Finstap for services: [{ref, label, amount}] and the total."""
    items = []
    for r in _platform_query("""
        SELECT id, company_name, price, start_date, expiry_date FROM ro_requests
        WHERE tenant_slug = ? AND status = 'Active' AND paid = 0 AND COALESCE(price, 0) > 0 ORDER BY id;
    """, (slug,)):
        items.append({'ref': f"ro:{r['id']}", 'label': f"Registered office · {r['company_name']}",
                      'detail': f"{r['start_date'] or ''} – {r['expiry_date'] or ''}".strip(' –'),
                      'amount': round(float(r['price']), 2)})
    for r in _platform_query("""
        SELECT period, checks, amount FROM kyc_billing WHERE tenant_slug = ? AND status = 'invoiced' AND amount > 0
        ORDER BY period;
    """, (slug,)):
        items.append({'ref': f"kyc:{r['period']}", 'label': f"KYC checks · {r['period']}",
                      'detail': f"{r['checks']} check(s)", 'amount': round(float(r['amount']), 2)})
    return {'items': items, 'total': round(sum(i['amount'] for i in items), 2)}


def pay_services(slug, return_url):
    """One Stripe Checkout page for everything the workspace owes for services. Returns its URL."""
    tenant = get_tenant(slug)
    due = services_due(slug)
    if not due['items']:
        raise StripeError("There is nothing to pay for services.")
    return _api('POST', '/checkout/sessions', {
        'mode': 'payment', 'customer': _customer(tenant), 'client_reference_id': slug,
        'line_items': [{'quantity': 1, 'price_data': {
            'currency': CURRENCY, 'unit_amount': int(round(i['amount'] * 100)),
            'product_data': {'name': i['label'], **({'description': i['detail']} if i['detail'] else {})}}}
            for i in due['items']],
        'invoice_creation': {'enabled': True},
        'success_url': f"{return_url}?paid=1", 'cancel_url': return_url,
        'metadata': {'workspace': slug, 'kind': 'services', 'items': ','.join(i['ref'] for i in due['items'])[:500]},
    })['url']


# ── webhook ──────────────────────────────────────────────────────────────────

def verify(raw_body, header, tolerance=300):
    """Stripe-Signature: t=<time>,v1=<hmac of "t.body" with the webhook secret>."""
    secret = integration('STRIPE_WEBHOOK_SECRET')
    if not secret or not raw_body or not header:
        return False
    parts = {}
    for piece in str(header).split(','):
        k, _, v = piece.strip().partition('=')
        parts.setdefault(k, []).append(v)
    try:
        stamp = int((parts.get('t') or ['0'])[0])
    except ValueError:
        return False
    if abs(time.time() - stamp) > tolerance:
        return False
    payload = f"{stamp}.".encode() + (raw_body if isinstance(raw_body, bytes) else str(raw_body).encode())
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, sig) for sig in parts.get('v1') or [])


def _when(stamp):
    return datetime.datetime.fromtimestamp(int(stamp), datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S') \
        if stamp else None


def _tenant_for(obj):
    slug = ((obj.get('metadata') or {}).get('workspace') or obj.get('client_reference_id') or '').strip()
    tenant = get_tenant(slug) if slug else None
    if tenant:
        return tenant
    sub_id = obj.get('subscription') or (obj.get('id') if obj.get('object') == 'subscription' else None)
    for column, value in (('stripe_subscription_id', sub_id), ('stripe_customer_id', obj.get('customer'))):
        if value:
            row = _platform_query(f"SELECT slug FROM tenants WHERE {column} = ? LIMIT 1;", (value,), one=True)
            if row:
                return get_tenant(row['slug'])
    return None


def apply_subscription(sub):
    """Copy a Stripe subscription onto the workspace: plan, cycle, status and paid-until date."""
    tenant = _tenant_for(sub)
    if not tenant or tenant.get('plan') == 'legacy':
        return None
    meta = sub.get('metadata') or {}
    item = ((sub.get('items') or {}).get('data') or [{}])[0]
    period_end = sub.get('current_period_end') or item.get('current_period_end')
    status = STATUS.get(sub.get('status'))
    if not status:  # incomplete: the first payment has not gone through yet
        return tenant['slug']
    if status == 'trialing' and sub.get('trial_end'):
        period_end = sub['trial_end']
    plan = meta.get('plan') if meta.get('plan') in plans.PAID_PLANS else tenant.get('plan')
    cycle = meta.get('cycle') if meta.get('cycle') in ('monthly', 'yearly') else tenant.get('billing_cycle')
    cancel_at = sub.get('cancel_at') or (period_end if sub.get('cancel_at_period_end') else None)
    _platform_execute("""
        UPDATE tenants SET plan = ?, billing_cycle = ?, subscription_status = ?, current_period_end = ?,
               stripe_subscription_id = ?, stripe_customer_id = COALESCE(?, stripe_customer_id), cancel_at = ?,
               updated_at = datetime('now')
        WHERE slug = ?;
    """, (plan, cycle, status, _when(period_end) or tenant.get('current_period_end'), sub.get('id'),
          sub.get('customer'), _when(cancel_at) if status != 'cancelled' else None, tenant['slug']))
    return tenant['slug']


def _save_payment(slug, amount, kind, ref, receipt_url=None, note=None, period=(None, None), tenant=None):
    if _platform_query("SELECT 1 FROM subscription_payments WHERE stripe_ref = ?;", (ref,), one=True):
        return False
    tenant = tenant or get_tenant(slug) or {}
    _platform_execute("""
        INSERT INTO subscription_payments (tenant_slug, amount, plan, billing_cycle, period_start, period_end, method,
                                           note, recorded_by, kind, stripe_ref, receipt_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Stripe', ?, ?, ?);
    """, (slug, amount, tenant.get('plan') if kind == 'subscription' else None,
          tenant.get('billing_cycle') if kind == 'subscription' else None,
          (period[0] or '')[:10] or None, (period[1] or '')[:10] or None, CARD, note, kind, ref, receipt_url))
    return True


def handle_event(event):
    """Act on one Stripe event (already verified). Returns a short note for the log."""
    kind = event.get('type') or ''
    obj = (event.get('data') or {}).get('object') or {}

    if kind == 'checkout.session.completed':
        meta = obj.get('metadata') or {}
        tenant = _tenant_for(obj)
        if not tenant:
            return 'unknown workspace'
        if meta.get('kind') == 'subscription' and obj.get('subscription'):
            _platform_execute("UPDATE tenants SET stripe_customer_id = ?, stripe_subscription_id = ? WHERE slug = ?;",
                              (obj.get('customer'), obj['subscription'], tenant['slug']))
            apply_subscription(_api('GET', f"/subscriptions/{obj['subscription']}"))
            return 'subscription started'
        if meta.get('kind') == 'services' and obj.get('payment_status') == 'paid':
            refs = [r for r in (meta.get('items') or '').split(',') if r]
            for ref in refs:
                what, _, key = ref.partition(':')
                if what == 'ro' and key.isdigit():
                    _platform_execute("UPDATE ro_requests SET paid = 1, updated_at = datetime('now') "
                                      "WHERE id = ? AND tenant_slug = ?;", (int(key), tenant['slug']))
                elif what == 'kyc':
                    _platform_execute("UPDATE kyc_billing SET status = 'paid', updated_at = datetime('now') "
                                      "WHERE tenant_slug = ? AND period = ?;", (tenant['slug'], key))
            _save_payment(tenant['slug'], round((obj.get('amount_total') or 0) / 100, 2), 'services', obj['id'],
                          note='Services: ' + ', '.join(refs), tenant=tenant)
            return 'services paid'
        return 'ignored'

    if kind in ('customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'):
        return 'subscription updated' if apply_subscription(obj) else 'unknown workspace'

    if kind in ('invoice.paid', 'invoice.payment_failed'):
        # Older Stripe API versions put the subscription on the invoice, newer ones under parent
        details = (obj.get('parent') or {}).get('subscription_details') or obj.get('subscription_details') or {}
        sub_id = obj.get('subscription') or details.get('subscription')
        if not sub_id:
            return 'not a subscription invoice'
        tenant = _tenant_for({'subscription': sub_id, 'customer': obj.get('customer'),
                              'metadata': details.get('metadata') or {}})
        if kind == 'invoice.payment_failed':
            if tenant:
                _platform_execute("UPDATE tenants SET subscription_status = 'past_due', updated_at = datetime('now') "
                                  "WHERE slug = ?;", (tenant['slug'],))
            return 'payment failed'
        if not obj.get('amount_paid'):
            return 'nothing paid (trial)'
        if not tenant:
            return 'unknown workspace'
        line = ((obj.get('lines') or {}).get('data') or [{}])[-1].get('period') or {}
        _save_payment(tenant['slug'], round(obj['amount_paid'] / 100, 2), 'subscription', obj['id'],
                      receipt_url=obj.get('hosted_invoice_url'), note=obj.get('number'),
                      period=(_when(line.get('start')), _when(line.get('end'))), tenant=tenant)
        return 'payment saved'

    return 'ignored'


def handle_webhook(raw_body, signature):
    """(status_code, message). Verifies, skips events already handled, acts on the rest."""
    if not verify(raw_body, signature):
        return 400, "Invalid signature"
    try:
        event = json.loads(raw_body)
    except (TypeError, ValueError):
        return 400, "Invalid payload"
    event_id = event.get('id') or ''
    if event_id and _platform_query("SELECT 1 FROM stripe_events WHERE event_id = ?;", (event_id,), one=True):
        return 200, "Already handled"
    try:
        note = handle_event(event)
    except StripeError as exc:
        # Stripe tries again later
        return 500, str(exc)
    if event_id:
        _platform_execute("INSERT OR IGNORE INTO stripe_events (event_id, type) VALUES (?, ?);",
                          (event_id, event.get('type')))
    return 200, note


# ── what the workspace sees ──────────────────────────────────────────────────

def payments_for(slug, limit=50):
    return _platform_query("""
        SELECT id, amount, plan, billing_cycle, period_start, period_end, method, note, kind, receipt_url, created_at
        FROM subscription_payments WHERE tenant_slug = ? ORDER BY id DESC LIMIT ?;
    """, (slug, limit))
