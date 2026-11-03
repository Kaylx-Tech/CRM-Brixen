"""Workspace wallet: a balance a workspace keeps with Finstap to pay for services (ID checks, registered offices).

  * Top up online by card (Stripe Checkout; the webhook adds it, services/stripe_billing.top_up), or by regular
    bank transfer to Finstap: the workspace says what it sent (wallet_topup_requests, Pending) and the owner portal
    approves it when the money arrives (or rejects it with a reason). The owner can also add a transfer directly.
    The workspace's admins see the bank details and their reference in the Balance button.
  * Services that come due are paid from the balance by themselves (settle): each due item once (ref ro:<id> /
    kyc:<month>, unique), oldest first, while the balance covers it. Paid items free their AutoAllot / ID check
    credit, exactly as a card payment does.
  * Or pay what is due online by card (Stripe Checkout, services/stripe_billing.pay_services).
  * Each ID check is charged the moment it counts (services/kyc_billing.charge_check) and paid from here.
  * The plan can be paid from the balance too (pay_plan): one period, the paid-until date moves on.
Nothing here deletes data: every top-up and charge stays in wallet_entries.
"""
from tenancy import _platform_execute, _platform_query


class WalletError(ValueError):
    """Shown to the person as it is."""


def balance(slug):
    row = _platform_query("SELECT COALESCE(SUM(amount), 0) AS b FROM wallet_entries WHERE tenant_slug = ?;",
                          (slug,), one=True)
    return round(float((row or {}).get('b') or 0), 2)


def entries(slug, limit=50):
    return _platform_query("""
        SELECT id, amount, kind, ref, note, created_by, created_at FROM wallet_entries
        WHERE tenant_slug = ? ORDER BY id DESC LIMIT ?;
    """, (slug, limit))


def _mark_paid(slug, ref):
    what, _, key = ref.partition(':')
    if what == 'ro' and key.isdigit():
        _platform_execute("UPDATE ro_requests SET paid = 1, updated_at = datetime('now') WHERE id = ? AND tenant_slug = ?;",
                          (int(key), slug))
    elif what == 'kyc':
        _platform_execute("UPDATE kyc_billing SET status = 'paid', updated_at = datetime('now') "
                          "WHERE tenant_slug = ? AND period = ?;", (slug, key))
    elif what == 'kycc' and key.isdigit():
        _platform_execute("UPDATE kyc_charges SET status = 'paid', paid_at = datetime('now') "
                          "WHERE id = ? AND tenant_slug = ?;", (int(key), slug))


def settle(slug):
    """Pay due services from the balance, oldest first, while it covers them. Returns what was paid."""
    from services.stripe_billing import services_due
    paid = []
    for item in services_due(slug)['items']:
        if balance(slug) + 1e-9 < item['amount']:
            break
        try:
            _platform_execute("""
                INSERT INTO wallet_entries (tenant_slug, amount, kind, ref, note, created_by)
                VALUES (?, ?, 'charge', ?, ?, 'Finstap');
            """, (slug, -item['amount'], item['ref'], item['label']))
        except Exception as exc:
            if 'unique' in str(exc).lower():  # charged already (another request at the same moment)
                _mark_paid(slug, item['ref'])
                continue
            raise
        _mark_paid(slug, item['ref'])
        paid.append(item)
    return paid


def top_up(slug, amount, note, admin):
    """The owner records a bank transfer that arrived; due services are then paid from it."""
    try:
        amount = round(float(amount), 2)
    except (TypeError, ValueError):
        raise WalletError("Enter the amount received")
    if not 0 < amount <= 100000:
        raise WalletError("Amount must be between £0.01 and £100,000")
    _platform_execute("""
        INSERT INTO wallet_entries (tenant_slug, amount, kind, note, created_by) VALUES (?, ?, 'topup', ?, ?);
    """, (slug, amount, (str(note or '').strip() or 'Bank transfer')[:300], (admin or {}).get('email')))
    return settle(slug)


def pay_plan(slug, user, plan, cycle):
    """Pay one period of `plan` from the balance: the plan is set, its paid-until date moves on and the
    payment is in Payments (method Balance). Returns {amount, period_start, period_end}."""
    from services import plans
    from services.platform_billing import BillingError, record_payment
    from services.stripe_billing import StripeError, price_for
    from tenancy import get_tenant
    tenant = get_tenant(slug)
    if not tenant or tenant.get('plan') == 'legacy':
        raise WalletError("Workspace not found")
    if tenant.get('stripe_subscription_id') and tenant.get('subscription_status') in ('active', 'trialing', 'past_due'):
        raise WalletError("Your plan is paid by card every period. Cancel the card payments first "
                          "(Card, invoices & cancel) to pay from your balance.")
    plan = str(plan or '').lower()
    cycle = str(cycle or 'monthly').lower()
    try:
        amount, label = price_for(tenant, plan, cycle)
    except StripeError as exc:
        raise WalletError(str(exc))
    if balance(slug) + 1e-9 < amount:
        raise WalletError(f"Your balance is £{balance(slug):.2f} and the {plans.PLANS[plan]['name']} plan costs "
                          f"£{amount:.2f}. Top up first, or pay by card.")
    who = (user or {}).get('email') or 'workspace'
    _platform_execute("INSERT INTO wallet_entries (tenant_slug, amount, kind, note, created_by) "
                      "VALUES (?, ?, 'charge', ?, ?);", (slug, -amount, label, who))
    # A plan change takes effect now; the period then runs from the old paid-until date (or today)
    _platform_execute("UPDATE tenants SET plan = ?, billing_cycle = ?, updated_at = datetime('now') WHERE slug = ?;",
                      (plan, cycle, slug))
    try:
        return record_payment(slug, {'email': who}, amount=amount, method='Balance', note=f"{label}, paid from balance")
    except BillingError as exc:
        raise WalletError(str(exc))


MIN_TOP_UP = 10
MAX_TOP_UP = 1000


def _amount(value, label="Amount"):
    try:
        amount = round(float(str(value).replace('£', '').replace(',', '').strip()), 2)
    except (TypeError, ValueError):
        raise WalletError(f"Enter the {label.lower()}")
    if not MIN_TOP_UP <= amount <= MAX_TOP_UP:
        raise WalletError(f"{label} must be between £{MIN_TOP_UP} and £{MAX_TOP_UP:,}")
    return amount


def credit_card_topup(slug, amount, stripe_ref):
    """A card top-up Stripe confirmed (saved once per Checkout session); due services are then paid from it."""
    try:
        _platform_execute("""
            INSERT INTO wallet_entries (tenant_slug, amount, kind, ref, note, created_by)
            VALUES (?, ?, 'topup', ?, 'Card top-up', 'Stripe');
        """, (slug, amount, f"stripe:{stripe_ref}"))
    except Exception as exc:
        if 'unique' not in str(exc).lower():
            raise
    return settle(slug)


def request_transfer(slug, user, amount, reference):
    """The workspace says it sent a bank transfer; Finstap approves it in the owner portal when it arrives."""
    amount = _amount(amount, "Amount sent")
    request_id = _platform_execute("""
        INSERT INTO wallet_topup_requests (tenant_slug, amount, reference, requested_by) VALUES (?, ?, ?, ?);
    """, (slug, amount, (str(reference or '').strip() or f"FINSTAP-{slug.upper()}")[:120], (user or {}).get('email')))
    _tell_owners(slug, amount)
    return _platform_query("SELECT * FROM wallet_topup_requests WHERE id = ?;", (request_id,), one=True)


def topup_requests(slug=None, status=None, limit=100):
    sql, args = "SELECT r.*, t.name AS workspace_name FROM wallet_topup_requests r " \
                "LEFT JOIN tenants t ON t.slug = r.tenant_slug WHERE 1 = 1", []
    if slug:
        sql += " AND r.tenant_slug = ?"
        args.append(slug)
    if status:
        sql += " AND r.status = ?"
        args.append(status)
    return _platform_query(sql + " ORDER BY r.id DESC LIMIT ?;", tuple(args + [limit]))


def decide_transfer(request_id, admin, approve, amount=None, reason=''):
    """The owner approves a transfer that arrived (the amount received may differ) or rejects it."""
    row = _platform_query("SELECT * FROM wallet_topup_requests WHERE id = ?;", (request_id,), one=True)
    if not row:
        raise WalletError("Top-up request not found")
    if row['status'] != 'Pending':
        raise WalletError(f"This request is already {row['status'].lower()}")
    who = (admin or {}).get('email')
    if not approve:
        reason = str(reason or '').strip()[:300]
        if not reason:
            raise WalletError("Write why it is rejected (the workspace sees it)")
        _platform_execute("""
            UPDATE wallet_topup_requests SET status = 'Rejected', reason = ?, decided_by = ?, decided_at = datetime('now')
            WHERE id = ? AND status = 'Pending';
        """, (reason, who, request_id))
        return {'request': _platform_query("SELECT * FROM wallet_topup_requests WHERE id = ?;", (request_id,), one=True),
                'paid': []}
    received = _amount(amount, "Amount received") if amount not in (None, '') else row['amount']
    done = _platform_execute("""
        UPDATE wallet_topup_requests SET status = 'Approved', approved_amount = ?, decided_by = ?, decided_at = datetime('now')
        WHERE id = ? AND status = 'Pending';
    """, (received, who, request_id))
    try:
        _platform_execute("""
            INSERT INTO wallet_entries (tenant_slug, amount, kind, ref, note, created_by) VALUES (?, ?, 'topup', ?, ?, ?);
        """, (row['tenant_slug'], received, f"transfer:{request_id}", f"Bank transfer {row['reference'] or ''}".strip(), who))
    except Exception as exc:
        if 'unique' not in str(exc).lower():  # approved twice at the same moment: added once
            raise
    return {'request': _platform_query("SELECT * FROM wallet_topup_requests WHERE id = ?;", (request_id,), one=True),
            'paid': settle(row['tenant_slug'])}


def _tell_owners(slug, amount):
    """Email the Finstap owners that a transfer is waiting for approval (never blocks the request)."""
    try:
        from services import platform_mail
        from services.owner_auth import OWNER_EMAILS
        text = f"Workspace {slug} says it sent £{amount:.2f} by bank transfer. Approve it in the owner portal (Billing)."
        page = platform_mail.html(f"Balance top-up to approve: {slug}", [
            f"Workspace {slug} says it sent £{amount:.2f} by bank transfer.",
            "When the money arrives, approve it in the owner portal (Billing); the workspace's balance then goes up.",
        ])
        for email in OWNER_EMAILS:
            platform_mail.send(email, f"Balance top-up to approve: {slug}", text, page)
    except Exception as exc:
        print(f"[Wallet] owners not told about {slug}'s transfer: {exc}")


def bank_details():
    """Finstap's account for top-ups (owner portal → Registered office → Prices & addresses)."""
    row = _platform_query("SELECT value FROM platform_settings WHERE key = 'topup_bank_details';", one=True)
    return (row or {}).get('value') or ''


def summary(slug):
    """What the Balance button shows."""
    from services.stripe_billing import configured, services_due
    settle(slug)
    due = services_due(slug)
    return {
        'balance': balance(slug),
        'due': due,
        'entries': entries(slug, 20),
        'bank_details': bank_details(),
        'reference': f"FINSTAP-{slug.upper()}",
        'card': configured(),
        'transfers': topup_requests(slug, limit=10),
        'min_top_up': MIN_TOP_UP,
        'max_top_up': MAX_TOP_UP,
    }
