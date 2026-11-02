"""The KYC service: a paid Finstap service a workspace switches on itself (Billing), on any plan.

  * Off by default. A workspace admin turns it on in Billing after seeing the price per check; the Finstap
    owner can also turn it on or off for a workspace (admin.finstap.com → KYC). Brixen's own database
    (plan "legacy") always has it. Turning it off only stops NEW checks: running ones carry on.
  * Every check whose link was made counts once, in the month it started, at the owner's price per check
    (KYC → Price per check). The owner marks a month invoiced, then paid (kyc_billing in platform.db); an
    invoiced month shows as due in the workspace's Billing and is paid by card or from the balance.
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
    """The workspace may start ID checks."""
    if not tenant:
        return False
    if (tenant.get('plan') or '') == 'legacy':
        return True
    fresh = get_tenant(tenant['slug']) or tenant  # the switch may have changed since the request began
    return bool(fresh.get('kyc_enabled_at'))


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


def _month_counts():
    """{'YYYY-MM': checks} for the active workspace (checks whose link was made)."""
    from db import query_db
    from services.kyc_form import ensure
    try:
        ensure()
        rows = query_db(f"""
            SELECT strftime('%Y-%m', created_at) AS period, COUNT(*) AS c FROM id_verifications
            WHERE {COUNTED_SQL} GROUP BY period;
        """) or []
    except Exception:
        return {}
    return {r['period']: int(r['c'] or 0) for r in rows if r['period']}


def summary(tenant):
    """The workspace's KYC service for its Billing page (run inside the workspace's database)."""
    from services.autoallot import kyc_credits
    each = price()
    counts = _month_counts()
    billed = {r['period']: r for r in _platform_query(
        "SELECT period, checks, amount, status FROM kyc_billing WHERE tenant_slug = ?;", (tenant['slug'],))}
    this_month = datetime.date.today().strftime('%Y-%m')
    periods = sorted(set(counts) | set(billed) | {this_month}, reverse=True)[:MONTHS_SHOWN]
    months = []
    for period in periods:
        bill = billed.get(period) or {}
        checks = int(bill['checks']) if bill else counts.get(period, 0)
        amount = float(bill['amount']) if bill else round(counts.get(period, 0) * each, 2)
        status = bill.get('status') or ('running' if period == this_month else 'not_billed' if checks else '')
        months.append({'period': period, 'checks': checks, 'amount': round(amount, 2), 'status': status})
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
        'total_checks': sum(counts.values()),
        'unpaid': round(sum(m['amount'] for m in months if m['status'] in ('invoiced', 'not_billed', 'running')), 2),
    }
