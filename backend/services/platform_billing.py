"""Finstap billing: what each workspace owes for its subscription and for Finstap's services, and the
payments the owner records (until online payment exists, payments come in by bank transfer etc.).

  * A paid plan's subscription is paid until tenants.current_period_end. Recording a payment adds one
    billing period (a month, or a year when billed yearly) from that date, or from today when it has
    already passed, and makes the subscription active.
  * Service charges come from services/platform_services.py: registered offices not marked paid, and
    KYC months marked invoiced but not paid.
  * Payments are kept for good; a wrong one is corrected by recording another with a note.
"""
import calendar
import datetime

from tenancy import _platform_execute, _platform_query, get_tenant
from services import plans

METHODS = ('Bank transfer', 'Card', 'Cash', 'Other')


class BillingError(ValueError):
    """Shown to the owner as it is."""


def _date(value):
    try:
        return datetime.date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


def _add_months(day, months):
    month = day.month - 1 + months
    year = day.year + month // 12
    month = month % 12 + 1
    return day.replace(year=year, month=month, day=min(day.day, calendar.monthrange(year, month)[1]))


def _state(tenant, today):
    """trial / paid / due_soon / overdue / cancelled / no_price for one workspace's subscription."""
    plan = (tenant.get('plan') or 'trial').lower()
    if plan == 'trial':
        return 'trial'
    if tenant.get('subscription_status') == 'cancelled':
        return 'cancelled'
    if not plans.cycle_amount(tenant):
        return 'no_price'
    end = _date(tenant.get('current_period_end'))
    if not end or end < today:
        return 'overdue'
    if (end - today).days <= 7:
        return 'due_soon'
    return 'paid'


def overview():
    from services.wallet import balance as wallet_balance
    today = datetime.date.today()
    tenants = [t for t in _platform_query("SELECT * FROM tenants WHERE status != 'Failed' AND deleted_at IS NULL ORDER BY name COLLATE NOCASE;")
               if t.get('plan') != 'legacy']
    ro_unpaid = {r['tenant_slug']: r['amount'] for r in _platform_query("""
        SELECT tenant_slug, SUM(COALESCE(price, 0)) AS amount FROM ro_requests
        WHERE status = 'Active' AND paid = 0 GROUP BY tenant_slug;
    """)}
    kyc_unpaid = {r['tenant_slug']: r['amount'] for r in _platform_query("""
        SELECT tenant_slug, SUM(amount) AS amount FROM kyc_billing WHERE status = 'invoiced' GROUP BY tenant_slug;
    """)}
    last = {r['tenant_slug']: r for r in _platform_query("""
        SELECT p.* FROM subscription_payments p
        JOIN (SELECT tenant_slug, MAX(id) AS id FROM subscription_payments GROUP BY tenant_slug) m ON m.id = p.id;
    """)}
    rows = []
    for t in tenants:
        state = _state(t, today)
        end = _date(t.get('current_period_end'))
        rows.append({
            'slug': t['slug'], 'name': t['name'], 'owner_email': t.get('owner_email'), 'status': t['status'],
            'plan': t.get('plan') or 'trial', 'billing_cycle': t.get('billing_cycle') or 'monthly',
            'subscription_status': t.get('subscription_status'), 'current_period_end': t.get('current_period_end'),
            'trial_ends_at': t.get('trial_ends_at'),
            'cycle_amount': plans.cycle_amount(t), 'monthly_value': plans.monthly_value(t),
            'state': state, 'days_left': (end - today).days if end else None,
            'subscription_due': plans.cycle_amount(t) if state == 'overdue' else 0.0,
            'services_unpaid': round((ro_unpaid.get(t['slug']) or 0) + (kyc_unpaid.get(t['slug']) or 0), 2),
            'balance': wallet_balance(t['slug']),
            'ro_unpaid': round(ro_unpaid.get(t['slug']) or 0, 2),
            'kyc_unpaid': round(kyc_unpaid.get(t['slug']) or 0, 2),
            'last_payment': last.get(t['slug']),
        })
    month_start = today.replace(day=1).isoformat()
    collected = _platform_query("SELECT COALESCE(SUM(amount), 0) AS s FROM subscription_payments "
                                "WHERE date(created_at) >= date(?);", (month_start,), one=True)['s']
    return {
        'workspaces': rows,
        'totals': {
            'mrr': round(sum(r['monthly_value'] for r in rows), 2),
            'collected_this_month': round(collected or 0, 2),
            'overdue': sum(1 for r in rows if r['state'] == 'overdue'),
            'overdue_amount': round(sum(r['subscription_due'] for r in rows), 2),
            'due_soon': sum(1 for r in rows if r['state'] == 'due_soon'),
            'services_unpaid': round(sum(r['services_unpaid'] for r in rows), 2),
        },
        'methods': METHODS,
    }


def payments(slug=None, limit=200):
    if slug:
        return _platform_query("SELECT * FROM subscription_payments WHERE tenant_slug = ? ORDER BY id DESC LIMIT ?;",
                               (slug, limit))
    return _platform_query("SELECT * FROM subscription_payments ORDER BY id DESC LIMIT ?;", (limit,))


def record_payment(slug, admin, amount=None, method='Bank transfer', note='', periods=1):
    """The workspace paid for `periods` billing periods: move its paid-until date on and make it active."""
    tenant = get_tenant(slug)
    if not tenant or tenant.get('plan') == 'legacy':
        raise BillingError("Workspace not found")
    if (tenant.get('plan') or 'trial') not in plans.PAID_PLANS:
        raise BillingError("This workspace is on a free trial. Give it a paid plan first (Workspaces → Subscription).")
    try:
        periods = int(periods or 1)
    except (TypeError, ValueError):
        raise BillingError("Number of periods must be a number")
    if not 1 <= periods <= 24:
        raise BillingError("Choose 1 to 24 periods")
    default = plans.cycle_amount(tenant) * periods
    try:
        amount = round(float(amount), 2) if amount not in (None, '') else default
    except (TypeError, ValueError):
        raise BillingError("Amount must be a number")
    if amount <= 0:
        raise BillingError("Enter the amount that was paid")
    method = method if method in METHODS else 'Other'
    today = datetime.date.today()
    current = _date(tenant.get('current_period_end'))
    start = current if current and current >= today else today
    months = (12 if (tenant.get('billing_cycle') or 'monthly') == 'yearly' else 1) * periods
    end = _add_months(start, months)
    _platform_execute("""
        INSERT INTO subscription_payments (tenant_slug, amount, plan, billing_cycle, period_start, period_end, method,
                                           note, recorded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (slug, amount, tenant.get('plan'), tenant.get('billing_cycle') or 'monthly', start.isoformat(), end.isoformat(),
          method, (note or '').strip()[:500] or None, (admin or {}).get('email')))
    _platform_execute("""
        UPDATE tenants SET current_period_end = ?, subscription_status = 'active',
               billing_cycle = COALESCE(billing_cycle, 'monthly'), updated_at = datetime('now')
        WHERE slug = ?;
    """, (end.isoformat(), slug))
    return {'amount': amount, 'period_start': start.isoformat(), 'period_end': end.isoformat()}
