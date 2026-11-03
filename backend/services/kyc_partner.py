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


class PartnerError(ValueError):
    """Shown to the owner as it is."""


def _hash(key):
    return hashlib.sha256(str(key or '').encode('utf-8')).hexdigest()


def partners():
    """Workspaces that run KYC for another website."""
    return _platform_query("""
        SELECT slug, name, kyc_form_base_url, COALESCE(kyc_free, 0) AS kyc_free, kyc_enabled_at,
               kyc_api_key_hash IS NOT NULL AS has_key
        FROM tenants WHERE COALESCE(kyc_form_base_url, '') != '' ORDER BY name;
    """)


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


def checks(limit=500):
    """The active workspace's checks for the other site's record (newest first; no files, no prices)."""
    from db import query_db
    from services.kyc_form import ensure
    ensure()
    rows = query_db("""
        SELECT v.id, v.full_name, v.email, v.phone, v.status, v.source, v.created_at, v.submitted_at,
               v.reviewed_at, v.review_note, v.session_url, o.order_number
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
