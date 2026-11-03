"""KYC for another website through one Finstap workspace (first: Brixen's own portal).

The Finstap owner picks a workspace for the other site (admin.finstap.com → KYC → KYC for another website)
and gives it the site's address. Then:
  * the workspace's KYC links point to that site (https://portal.brixenconsultants.com/verify/...): the site
    shows the same form and talks to the Finstap API straight from the browser (CORS allows it);
  * the KYC desk (kyc.finstap.com) sees and decides those checks like every other workspace's;
  * the site's server reads the checks and its KYC link with an API key (GET /api/kyc-partner/checks,
    headers X-Tenant: <workspace> and X-KYC-Key: <key>), so the site keeps its own record;
  * the checks can be free (kyc_free): no charge, no credit limit.
Only the key's SHA-256 hash is stored; the owner sees a new key once. Nothing here deletes data.
"""
import hashlib
import re
import secrets

from tenancy import _platform_execute, _platform_query, get_tenant
from utils.validation import email_problem


class PartnerError(ValueError):
    """Shown to the owner as it is."""


def _hash(key):
    return hashlib.sha256(str(key or '').encode('utf-8')).hexdigest()


def partners():
    """Workspaces that run KYC for another website."""
    return _platform_query("""
        SELECT slug, name, kyc_form_base_url, COALESCE(kyc_free, 0) AS kyc_free, kyc_enabled_at,
               kyc_api_key_hash IS NOT NULL AS has_key, status, suspended_reason, deleted_at
        FROM tenants WHERE COALESCE(kyc_form_base_url, '') != '' ORDER BY name;
    """)


def reactivate(slug):
    """Turn a KYC partner workspace back on after it was suspended or deleted (its data was kept), so the
    other site's KYC works again."""
    tenant = get_tenant(slug)
    if not tenant or not tenant.get('kyc_form_base_url'):
        raise PartnerError("Workspace not found")
    if tenant.get('status') not in ('Active', 'Suspended'):
        raise PartnerError("This workspace was never set up, so it cannot be turned on")
    _platform_execute("""
        UPDATE tenants SET status = 'Active', suspended_reason = NULL, deleted_at = NULL, deleted_by = NULL,
               updated_at = datetime('now') WHERE slug = ?;
    """, (slug,))
    return get_tenant(slug)


def setup(slug, base_url, free):
    """Point a workspace's KYC links at another website (empty = back to its own address); switch its KYC
    service on and say whether its checks are free."""
    tenant = get_tenant(slug)
    if not tenant or tenant.get('status') != 'Active':
        raise PartnerError("Choose an active workspace")
    if tenant.get('plan') == 'legacy':
        raise PartnerError("Choose a normal workspace, not the adopted Brixen database")
    base_url = str(base_url or '').strip().rstrip('/')
    if base_url and not re.fullmatch(r'https://[a-z0-9.-]+(:\d+)?|http://(localhost|127\.0\.0\.1)(:\d+)?', base_url):
        raise PartnerError("Enter the site's address, like https://portal.brixenconsultants.com")
    _platform_execute("""
        UPDATE tenants SET kyc_form_base_url = ?, kyc_free = ?,
               kyc_enabled_at = CASE WHEN ? != '' THEN COALESCE(kyc_enabled_at, datetime('now')) ELSE kyc_enabled_at END
        WHERE slug = ?;
    """, (base_url or None, 1 if free else 0, base_url, slug))
    return get_tenant(slug)


def new_key(slug):
    """A new API key for the other site's server (the old one stops working). Returned once, never stored."""
    if not get_tenant(slug):
        raise PartnerError("Workspace not found")
    key = 'fkyc_' + secrets.token_urlsafe(32)
    _platform_execute("UPDATE tenants SET kyc_api_key_hash = ? WHERE slug = ?;", (_hash(key), slug))
    return key


def key_ok(tenant, key):
    stored = (get_tenant((tenant or {}).get('slug')) or {}).get('kyc_api_key_hash') if tenant else None
    return bool(stored and key and secrets.compare_digest(stored, _hash(key)))


def create_check(tenant, body):
    """The other site starts a check for one of its orders: the person is emailed their form link (it opens on
    the site). The same order and email again reuse the open check with a new link. Returns
    ({id, link, emailed, reused}, None) or (None, {field: message} | message)."""
    from db import execute_db, query_db
    from services import kyc_billing, kyc_form
    body = body if isinstance(body, dict) else {}
    clean = lambda key, limit=160: re.sub(r'\s+', ' ', str(body.get(key) or '')).strip()[:limit]  # noqa: E731
    name = ' '.join(p for p in (clean('first_name', 80), clean('last_name', 80)) if p) or clean('full_name')
    email, phone, ref = clean('email', 200).lower(), clean('phone', 40), clean('reference', 60)
    errors = {}
    if not name:
        errors['full_name'] = "The person's name is missing."
    if email_problem(email):
        errors['email'] = email_problem(email)
    if errors:
        return None, errors
    if not kyc_billing.enabled(tenant):
        return None, "The KYC service is off for this workspace (admin.finstap.com > KYC)."
    kyc_form.ensure()
    row = query_db("""
        SELECT id FROM id_verifications WHERE source = 'partner' AND LOWER(email) = ? AND COALESCE(external_ref, '') = ?
          AND status IN ('Not Started', 'In Progress', 'Declined') ORDER BY id DESC LIMIT 1;
    """, (email, ref), one=True)
    if row:
        check_id = row['id']
    else:
        check_id = execute_db("""
            INSERT INTO id_verifications (order_id, full_name, email, phone, source, external_ref, created_at, updated_at)
            VALUES (NULL, ?, ?, ?, 'partner', ?, datetime('now'), datetime('now'));
        """, (name, email, phone or None, ref or None))
    fresh = dict(kyc_form.new_link(check_id))
    if not row:
        kyc_billing.charge_check(tenant, check_id, name)
    emailed = kyc_form.email_form_link(fresh, ref)
    return {'id': check_id, 'link': fresh['session_url'], 'emailed': emailed, 'reused': bool(row)}, None


def checks(limit=500):
    """The active workspace's checks for the other site's record (newest first; no files, no prices)."""
    from db import query_db
    from services.kyc_form import ensure
    ensure()
    rows = query_db("""
        SELECT v.id, v.full_name, v.email, v.phone, v.status, v.source, v.created_at, v.submitted_at,
               v.reviewed_at, v.review_note, v.session_url, COALESCE(v.external_ref, o.order_number) AS order_number
        FROM id_verifications v LEFT JOIN orders o ON o.id = v.order_id
        ORDER BY v.id DESC LIMIT ?;
    """, (int(limit),)) or []
    out = []
    for r in rows:
        r = dict(r)
        # The person's own link only while they still have something to do
        if r['status'] not in ('Not Started', 'In Progress', 'Declined'):
            r['session_url'] = None
        r['reason'] = r.pop('review_note') if r['status'] in ('Declined', 'In Review') else None
        out.append(r)
    return out
