"""Auto-renew for Brixen registered office addresses: a yearly Stripe subscription per company, the same way
Finstap workspaces pay for their plan (services/stripe_billing.py on the finstap branch).

  * Keys: Settings / server env STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. Without a secret key the portal
    simply does not offer auto-renew; the Renew button (Tide link / bank transfer) keeps working.
  * No products or prices to set up in Stripe: each Checkout carries its own price (price_data), £40 a year.
  * Card details never reach the CRM: the customer types them on Stripe Checkout; Stripe's Customer Portal
    lets them change the card or cancel.
  * The first charge is on the day the paid year ends (trial_end), so the year already paid is not charged again.
  * Stripe reports back through one webhook (POST /api/webhooks/stripe). Each event is handled once
    (stripe_events); each paid Stripe invoice becomes one paid renewal order + invoice in the CRM, which moves
    the address a year further (client_portal_routes._address_renewals counts paid renewals).
  * Nothing here deletes data.
"""
import datetime
import hashlib
import hmac
import json
import os
import time

import requests

from db import query_db, execute_db

CURRENCY = 'gbp'
CARD = 'Credit Card (Stripe)'  # the CRM's own name for card payments (invoice_service.ORDER_PAYMENT_MODES)
# Stripe asks a trial end to be at least two days away
MIN_TRIAL_SECONDS = 2 * 24 * 3600
STATUS = {'trialing': 'active', 'active': 'active', 'past_due': 'past_due', 'unpaid': 'past_due',
          'canceled': 'cancelled', 'incomplete_expired': 'cancelled', 'paused': 'past_due'}
LIVE_STATUSES = ('active', 'past_due')


class StripeError(ValueError):
    """Shown to the person as it is."""


def _setting(key):
    try:
        from services.settings_service import get_setting
        return (get_setting(key) or '').strip()
    except Exception:
        return (os.environ.get(key.upper()) or '').strip()


def _api_base():
    # STRIPE_API_BASE only points tests at a local stand-in
    return (os.environ.get('STRIPE_API_BASE') or 'https://api.stripe.com/v1').rstrip('/')


def configured():
    return bool(_setting('stripe_secret_key'))


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
    key = _setting('stripe_secret_key')
    if not key:
        raise StripeError("Card auto-renew is not switched on yet. Please use Renew or contact us.")
    try:
        res = requests.request(method, f"{_api_base()}{path}", auth=(key, ''), timeout=30,
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


def _when(stamp):
    return datetime.datetime.fromtimestamp(int(stamp), datetime.timezone.utc).strftime('%Y-%m-%d') \
        if stamp else None


# ── what the portal shows ────────────────────────────────────────────────────

def subscription_for(company_id):
    """The company's auto-renew subscription that is still on (active / payment failed), or None."""
    marks = ','.join('?' for _ in LIVE_STATUSES)
    return query_db(f"""
        SELECT id, stripe_subscription_id, status, current_period_end, cancel_at FROM address_subscriptions
        WHERE company_id = ? AND status IN ({marks}) ORDER BY id DESC LIMIT 1;
    """, (company_id, *LIVE_STATUSES), one=True)


# ── checkout and portal ──────────────────────────────────────────────────────

def _customer(user):
    row = query_db("SELECT stripe_customer_id, email, full_name FROM users WHERE id = ?;", (user['id'],), one=True) or {}
    if row.get('stripe_customer_id'):
        return row['stripe_customer_id']
    customer = _api('POST', '/customers', {
        'email': row.get('email') or user.get('email') or None, 'name': row.get('full_name') or user.get('full_name'),
        'metadata': {'crm_user_id': user['id']},
    })
    execute_db("UPDATE users SET stripe_customer_id = ? WHERE id = ?;", (customer['id'], user['id']))
    return customer['id']


def start_auto_renew(user, company, expiry_date, price, return_url):
    """Stripe Checkout for a yearly subscription on this company's address. Returns the page URL."""
    if subscription_for(company['id']):
        raise StripeError("Auto-renew is already on for this address.")
    data = {
        'mode': 'subscription', 'customer': _customer(user), 'client_reference_id': str(user['id']),
        'line_items': [{'quantity': 1, 'price_data': {
            'currency': CURRENCY, 'unit_amount': int(round(float(price) * 100)),
            'product_data': {'name': f"Registered Office Address · {company.get('name') or 'company'}"},
            'recurring': {'interval': 'year'}}}],
        'success_url': f"{return_url}?auto_renew=1", 'cancel_url': return_url,
        'metadata': {'kind': 'address', 'company_id': company['id'], 'user_id': user['id']},
        'subscription_data': {'metadata': {'kind': 'address', 'company_id': company['id'], 'user_id': user['id']}},
    }
    # First charge when the paid year ends; an address already due is charged today
    if expiry_date:
        ends = datetime.datetime.combine(expiry_date, datetime.time(9, 0), tzinfo=datetime.timezone.utc)
        stamp = int(ends.timestamp())
        if stamp - time.time() > MIN_TRIAL_SECONDS:
            data['subscription_data']['trial_end'] = stamp
    return _api('POST', '/checkout/sessions', data)['url']


def portal(user, return_url):
    """Stripe's Customer Portal: change the card, see receipts, cancel auto-renew."""
    row = query_db("SELECT stripe_customer_id FROM users WHERE id = ?;", (user['id'],), one=True) or {}
    if not row.get('stripe_customer_id'):
        raise StripeError("There is no card on file yet. Turn on auto-renew first.")
    return _api('POST', '/billing_portal/sessions', {'customer': row['stripe_customer_id'],
                                                     'return_url': return_url})['url']


# ── webhook ──────────────────────────────────────────────────────────────────

def verify(raw_body, header, tolerance=300):
    """Stripe-Signature: t=<time>,v1=<hmac of "t.body" with the webhook secret>."""
    secret = _setting('stripe_webhook_secret')
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


def _company_for(meta, sub_id=None):
    """(company row, user id) from the subscription's metadata, else from the saved subscription."""
    company_id = str((meta or {}).get('company_id') or '').strip()
    if not company_id.isdigit() and sub_id:
        row = query_db("SELECT company_id FROM address_subscriptions WHERE stripe_subscription_id = ?;",
                       (sub_id,), one=True)
        company_id = str((row or {}).get('company_id') or '')
    if not company_id.isdigit():
        return None
    return query_db("SELECT id, name, user_id FROM companies WHERE id = ?;", (int(company_id),), one=True)


def apply_subscription(sub):
    """Save a Stripe subscription for its company: status, next charge date, cancel date."""
    if (sub.get('metadata') or {}).get('kind') not in (None, '', 'address'):
        return None
    company = _company_for(sub.get('metadata'), sub.get('id'))
    if not company:
        return None
    status = STATUS.get(sub.get('status'))
    if not status:  # incomplete: the first payment has not gone through yet
        return company['id']
    item = ((sub.get('items') or {}).get('data') or [{}])[0]
    period_end = sub.get('trial_end') if sub.get('status') == 'trialing' else None
    period_end = period_end or sub.get('current_period_end') or item.get('current_period_end')
    cancel_at = sub.get('cancel_at') or (period_end if sub.get('cancel_at_period_end') else None)
    values = (status, _when(period_end), _when(cancel_at) if status != 'cancelled' else None, sub.get('customer'))
    if query_db("SELECT 1 FROM address_subscriptions WHERE stripe_subscription_id = ?;", (sub['id'],), one=True):
        execute_db("""
            UPDATE address_subscriptions SET status = ?, current_period_end = COALESCE(?, current_period_end),
                   cancel_at = ?, stripe_customer_id = COALESCE(?, stripe_customer_id), updated_at = datetime('now')
            WHERE stripe_subscription_id = ?;
        """, (*values, sub['id']))
    else:
        execute_db("""
            INSERT INTO address_subscriptions (status, current_period_end, cancel_at, stripe_customer_id,
                                               stripe_subscription_id, company_id, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (*values, sub['id'], company['id'], company['user_id']))
    return company['id']


def _record_paid_year(company, stripe_invoice):
    """A paid Stripe invoice is one more paid year: pay the open renewal invoice, or place a paid renewal order."""
    ref = stripe_invoice['id']
    if query_db("SELECT 1 FROM address_renewal_payments WHERE stripe_invoice_id = ?;", (ref,), one=True):
        return False
    from routes.client_portal_routes import ADDRESS_RENEWAL_SERVICE, _address_renewals
    from services.invoice_service import ensure_invoice_for_order, update_admin_invoice
    from services.notification_service import notify_staff, notify_user
    amount = round((stripe_invoice.get('amount_paid') or 0) / 100, 2)
    _paid_years, open_invoice = _address_renewals(company['id'])
    if open_invoice:
        invoice_id = open_invoice['id']
        _updated, error, _mail = update_admin_invoice(invoice_id, {'status': 'Paid', 'payment_method': CARD})
        if error:
            # Stripe sends the event again later
            raise StripeError(f"Renewal invoice {open_invoice.get('invoice_number')} could not be marked paid: {error}")
        order_id = (query_db("SELECT order_id FROM invoices WHERE id = ?;", (invoice_id,), one=True) or {}).get('order_id')
    else:
        from services.order_numbers import next_order_number
        owner = query_db("SELECT full_name, email FROM users WHERE id = ?;", (company['user_id'],), one=True) or {}
        order_number = next_order_number()
        order_id = execute_db("""
            INSERT INTO orders (
                order_number, user_id, company_id, service_name, price, vat, total, status, notes, payment_mode,
                owner_name, owner_form_email, is_draft, current_step, created_at
            ) VALUES (?, ?, ?, ?, ?, 0, ?, 'Completed', ?, ?, ?, ?, 0, 5, datetime('now'));
        """, (order_number, company['user_id'], company['id'], ADDRESS_RENEWAL_SERVICE, amount, amount,
              f"Auto-renewed by card (Stripe invoice {stripe_invoice.get('number') or ref})", CARD,
              owner.get('full_name'), owner.get('email')))
        invoice_id = ensure_invoice_for_order(order_id, paid=True)
    execute_db("""
        INSERT INTO address_renewal_payments (stripe_invoice_id, company_id, order_id, invoice_id, amount, receipt_url)
        VALUES (?, ?, ?, ?, ?, ?);
    """, (ref, company['id'], order_id, invoice_id, amount, stripe_invoice.get('hosted_invoice_url')))
    notify_staff('Address auto-renewed',
                 f"{company.get('name')}: registered office renewed by card (£{amount:.2f}).",
                 'payment_received', '/admin/payments')
    notify_user(company['user_id'], 'Address renewed',
                f"Your registered office for {company.get('name')} was renewed for another year (£{amount:.2f}).",
                'payment_received', '/portal/addresses')
    return True


def handle_event(event):
    """Act on one Stripe event (already verified). Returns a short note for the log."""
    kind = event.get('type') or ''
    obj = (event.get('data') or {}).get('object') or {}

    if kind == 'checkout.session.completed':
        if (obj.get('metadata') or {}).get('kind') != 'address' or not obj.get('subscription'):
            return 'ignored'
        if obj.get('customer') and str((obj.get('metadata') or {}).get('user_id') or '').isdigit():
            execute_db("UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, ?) WHERE id = ?;",
                       (obj['customer'], int(obj['metadata']['user_id'])))
        return 'auto-renew on' if apply_subscription(_api('GET', f"/subscriptions/{obj['subscription']}")) \
            else 'unknown company'

    if kind in ('customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'):
        return 'subscription updated' if apply_subscription(obj) else 'ignored'

    if kind in ('invoice.paid', 'invoice.payment_failed'):
        # Older Stripe API versions put the subscription on the invoice, newer ones under parent
        details = (obj.get('parent') or {}).get('subscription_details') or obj.get('subscription_details') or {}
        sub_id = obj.get('subscription') or details.get('subscription')
        meta = details.get('metadata') or {}
        if not sub_id or meta.get('kind') not in (None, '', 'address'):
            return 'ignored'
        company = _company_for(meta, sub_id)
        if not company:
            return 'unknown company'
        if kind == 'invoice.payment_failed':
            execute_db("UPDATE address_subscriptions SET status = 'past_due', updated_at = datetime('now') "
                       "WHERE stripe_subscription_id = ?;", (sub_id,))
            from services.notification_service import notify_staff, notify_user
            notify_staff('Address renewal payment failed',
                         f"{company.get('name')}: the card payment for the registered office renewal failed.",
                         'payment_failed', '/admin/payments')
            notify_user(company['user_id'], 'Address renewal payment failed',
                        f"We could not take the renewal payment for {company.get('name')}. "
                        "Please update your card or use Renew on the Addresses page.",
                        'payment_failed', '/portal/addresses')
            return 'payment failed'
        if not obj.get('amount_paid'):
            return 'nothing paid (free until the year ends)'
        return 'paid year saved' if _record_paid_year(company, obj) else 'already saved'

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
    if event_id and query_db("SELECT 1 FROM stripe_events WHERE event_id = ?;", (event_id,), one=True):
        return 200, "Already handled"
    try:
        note = handle_event(event)
    except StripeError as exc:
        # Stripe tries again later
        return 500, str(exc)
    if event_id:
        execute_db("INSERT OR IGNORE INTO stripe_events (event_id, type) VALUES (?, ?);", (event_id, event.get('type')))
    return 200, note
