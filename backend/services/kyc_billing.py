"""The KYC service: a paid Finstap service a workspace switches on itself (Billing), on any plan.

  * Off by default. A workspace admin turns it on in Billing after seeing the price per check; the Finstap
    owner can also turn it on or off for a workspace (admin.finstap.com → KYC). Brixen's own database
    (plan "legacy") always has it. Turning it off only stops NEW checks: running ones carry on.
  * Every check is charged once, at the owner's price per check (KYC → Price per check), the moment it
    counts (its link was made; one from the workspace's KYC link once it is sent): a kyc_charges row, paid
    from the workspace's balance straight away when it covers it, else due (Billing → Services) until a
    top-up or a card payment pays it. Checks from before per-check charging are billed by the month as
    before: the owner marks a month invoiced, then paid (kyc_billing).
  * The workspace's Billing shows this month so far and the months before, with their status.
"""
import datetime
import secrets

from tenancy import _platform_execute, _platform_query, get_tenant, workspace_url

MONTHS_SHOWN = 12

# Which checks are charged: every check whose link was made, except one a visitor started on the workspace's
# own KYC link and never sent (anyone can open that link, so only finished ones count)
def counted_sql(alias=''):
    """The WHERE part for charged checks; `alias` is the table alias ('v.') when the query joins."""
    a = alias
    return (f"{a}session_url IS NOT NULL AND {a}session_url != '' "
            f"AND (COALESCE({a}source, '') != 'link' OR {a}submitted_at IS NOT NULL)")


COUNTED_SQL = counted_sql()


def link_url(tenant):
    """The workspace's own KYC link (made on first use), to send to any client: no order needed."""
    fresh = get_tenant(tenant['slug']) or tenant
    code = fresh.get('kyc_link_code')
    if not code:
        code = secrets.token_urlsafe(9)
        _platform_execute("UPDATE tenants SET kyc_link_code = COALESCE(kyc_link_code, ?) WHERE slug = ?;",
                          (code, tenant['slug']))
        code = (get_tenant(tenant['slug']) or {}).get('kyc_link_code') or code
    path = f"/verify/start/{tenant['slug']}.{code}"
    if (fresh.get('kyc_form_base_url') or '').strip():  # KYC for another website (e.g. Brixen's portal)
        return fresh['kyc_form_base_url'].strip().rstrip('/') + path
    url = workspace_url(tenant['slug'], path)
    if url:
        return url
    import os
    from config import FRONTEND_URL
    return f"{(os.environ.get('KYC_FORM_BASE_URL') or FRONTEND_URL).rstrip('/')}{path}"


def new_link_code(slug):
    """A new code for the workspace's KYC link; the old link stops working (e.g. it was shared too widely)."""
    _platform_execute("UPDATE tenants SET kyc_link_code = ? WHERE slug = ?;", (secrets.token_urlsafe(9), slug))


def tenant_for_link(code):
    """The workspace whose KYC link this is ('acme.<code>'), or None."""
    slug, _, secret = str(code or '').partition('.')
    tenant = get_tenant(slug) if slug and secret else None
    if not tenant or tenant.get('status') != 'Active' or not tenant.get('kyc_link_code'):
        return None
    return tenant if secrets.compare_digest(str(tenant['kyc_link_code']), secret) else None


class KycServiceError(ValueError):
    """Shown to the person as it is."""


def enabled(tenant):
    """The workspace may start ID checks: always (every workspace has the KYC service from the start, there is
    no switch any more; each check is still charged and limited by credits)."""
    return bool(tenant)


def price():
    from services.platform_services import settings
    return float(settings().get('kyc_price') or 0)


def off_message():
    amount = price()
    cost = f" (£{amount:.2f} a check)" if amount else ''
    return f"The KYC service is not switched on for this workspace. An admin can turn it on in Billing{cost}."


def set_enabled(slug, on, by):
    """Switch the service on or off for one workspace. `by` says who (shown to the owner)."""
    tenant = get_tenant(slug)
    if not tenant:
        raise KycServiceError("Workspace not found")
    if tenant.get('plan') == 'legacy':
        raise KycServiceError("This workspace always has the KYC service")
    if on:
        _platform_execute("UPDATE tenants SET kyc_enabled_at = COALESCE(kyc_enabled_at, datetime('now')), "
                          "kyc_enabled_by = ? WHERE slug = ?;", (str(by or '')[:120], slug))
    else:
        _platform_execute("UPDATE tenants SET kyc_enabled_at = NULL, kyc_enabled_by = ? WHERE slug = ?;",
                          (str(by or '')[:120], slug))
    return get_tenant(slug)


def charge_check(tenant, check_id, label=''):
    """Charge one ID check, once: paid from the balance now when it covers it, else due until it is paid."""
    if not tenant or (tenant.get('plan') or '') == 'legacy' or (get_tenant(tenant['slug']) or {}).get('kyc_free'):
        return  # Brixen's own database, or a workspace the owner made free (e.g. Brixen's KYC)
    each = price()
    if each <= 0:
        return
    try:
        _platform_execute("""
            INSERT OR IGNORE INTO kyc_charges (tenant_slug, check_id, label, amount) VALUES (?, ?, ?, ?);
        """, (tenant['slug'], int(check_id), str(label or '')[:160] or None, each))
        from services.wallet import settle
        settle(tenant['slug'])
    except Exception as exc:
        print(f"[KYC billing] check {check_id} of {tenant['slug']} not charged: {exc}")


def charges(slug):
    """{check_id: {amount, status}} for one workspace."""
    return {r['check_id']: r for r in _platform_query(
        "SELECT check_id, amount, status FROM kyc_charges WHERE tenant_slug = ?;", (slug,))}


def counted_checks():
    """[(check_id, 'YYYY-MM')] for the active workspace: the checks that are charged."""
    from db import query_db
    from services.kyc_form import ensure
    try:
        ensure()
        rows = query_db(f"SELECT id, strftime('%Y-%m', created_at) AS period FROM id_verifications "
                        f"WHERE {COUNTED_SQL};") or []
    except Exception:
        return []
    return [(r['id'], r['period']) for r in rows if r['period']]


def month_rows(slug, checks, each, billed=None):
    """Per month: {period: {checks, amount, due, paid, legacy}}; a check with a charge counts at its
    charge, one without (from before per-check charging) at the price (or the month's billed amount)."""
    paid_for = charges(slug)
    out = {}
    for check_id, period in checks:
        m = out.setdefault(period, {'checks': 0, 'amount': 0.0, 'due': 0, 'paid': 0, 'legacy': 0})
        m['checks'] += 1
        charge = paid_for.get(check_id)
        if charge:
            m['amount'] += float(charge['amount'])
            m['paid' if charge['status'] == 'paid' else 'due'] += 1
        else:
            m['legacy'] += 1
            m['amount'] += each
    for period, bill in (billed or {}).items():
        m = out.setdefault(period, {'checks': 0, 'amount': 0.0, 'due': 0, 'paid': 0, 'legacy': 0})
        if m['legacy'] or not m['checks']:  # the month was billed by hand: its billed amount stands
            m['amount'] = m['amount'] - m['legacy'] * each + float(bill['amount'] or 0)
            m['checks'] = max(m['checks'], int(bill['checks'] or 0))
    return out


def month_status(m, bill, current):
    """How a month reads: paid, invoiced (due), running (this month) or not_billed."""
    if m['due'] or (bill and bill.get('status') == 'invoiced'):
        return 'invoiced'
    if m['legacy'] and not bill:
        return 'running' if current else 'not_billed'
    if bill and bill.get('status') != 'paid':
        return bill.get('status')
    return 'paid' if m['checks'] else ('running' if current else '')


def summary(tenant):
    """The workspace's KYC service for its Billing page (run inside the workspace's database)."""
    from services.autoallot import kyc_credits
    each = price()
    checks = counted_checks()
    billed = {r['period']: r for r in _platform_query(
        "SELECT period, checks, amount, status FROM kyc_billing WHERE tenant_slug = ?;", (tenant['slug'],))}
    by_month = month_rows(tenant['slug'], checks, each, billed)
    this_month = datetime.date.today().strftime('%Y-%m')
    periods = sorted(set(by_month) | {this_month}, reverse=True)[:MONTHS_SHOWN]
    months = []
    for period in periods:
        m = by_month.get(period) or {'checks': 0, 'amount': 0.0, 'due': 0, 'paid': 0, 'legacy': 0}
        months.append({'period': period, 'checks': m['checks'], 'amount': round(m['amount'], 2),
                       'status': month_status(m, billed.get(period), period == this_month)})
    fresh = get_tenant(tenant['slug']) or tenant
    on = enabled(fresh)
    return {
        'enabled': on,
        'enabled_at': fresh.get('kyc_enabled_at'),
        'link': link_url(fresh) if on else None,
        'price': each,
        'credits': kyc_credits(fresh),
        'this_month': next(m for m in months if m['period'] == this_month),
        'months': [m for m in months if m['checks'] or m['period'] == this_month],
        'total_checks': len(checks),
        'unpaid': round(sum(m['amount'] for m in months if m['status'] in ('invoiced', 'not_billed', 'running')), 2),
    }
