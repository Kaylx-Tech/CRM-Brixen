"""Workspace wallet: a balance a workspace keeps with Finstap to pay for services (ID checks, registered offices).

  * Top up by regular bank transfer to Finstap: the owner portal records the money when it arrives (wallet_entries,
    kind 'topup'). The workspace's admins see the bank details and their reference in the Balance button.
  * Services that come due are paid from the balance by themselves (settle): each due item once (ref ro:<id> /
    kyc:<month>, unique), oldest first, while the balance covers it. Paid items free their AutoAllot / ID check
    credit, exactly as a card payment does.
  * Or pay what is due online by card (Stripe Checkout, services/stripe_billing.pay_services); the plan
    subscription is paid as before and never from the balance.
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
    }
