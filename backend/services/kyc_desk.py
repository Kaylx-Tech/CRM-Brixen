"""The KYC desk (kyc.finstap.com): the outside KYC team works through every workspace's ID checks.

Didit still runs each check (services/didit_service.py). The team opens a check, looks at the result
and the photos Didit took (ID front and back, selfie, proof of address), and sets the status:
Approved, Declined (with the reason) or In Review. They can also send the client a new Didit link.
What they set is saved in the workspace's own database, so the owner portal and the workspace's
CRM show it at once. Prices, invoices and billing are never sent to the desk.
"""
import json
from urllib.parse import urlsplit

from tenancy import use_tenant
from services import platform_services as svc

STATUSES = ('Approved', 'Declined', 'In Review')

# Money stays with the owner portal
_HIDDEN = ('total', 'payment_status')

# Didit result sections that carry photos or files, and their names on the desk
_MEDIA_SECTIONS = (
    ('id_verifications', 'id_verification', 'ID document'),
    ('liveness_checks', 'liveness', 'Liveness'),
    ('face_matches', 'face_match', 'Face match'),
    ('poa_verifications', 'poa', 'Proof of address'),
)


def _desk_row(row):
    return {k: v for k, v in row.items() if k not in _HIDDEN}


def checks(period=None, slug=None):
    """Every ID check started in the month, newest first, with its workspace, client and order."""
    report = svc.kyc_report(period, slug)
    return {
        'period': report['period'],
        'totals': {k: report['totals'][k] for k in ('checks', 'approved', 'declined', 'pending')},
        'workspaces': [{'slug': w['slug'], 'name': w['name']} for w in report['workspaces']],
        'checks': sorted((_desk_row(c) for c in report['checks']), key=lambda c: c.get('created_at') or '',
                         reverse=True),
    }


def _kind(key, url):
    path = (urlsplit(url).path or '').lower()
    if 'video' in key or path.endswith(('.mp4', '.webm', '.mov')):
        return 'video'
    if path.endswith('.pdf'):
        return 'pdf'
    return 'image'


def _media(decision):
    """The photos and files in a Didit decision (links Didit signs for a short time)."""
    out = []
    if not isinstance(decision, dict):
        return out
    for plural, singular, section in _MEDIA_SECTIONS:
        items = decision.get(plural)
        items = items if isinstance(items, list) else [decision.get(singular)]
        for item in items:
            if not isinstance(item, dict):
                continue
            for key, value in item.items():
                values = value if isinstance(value, list) else [value]
                for n, url in enumerate(v for v in values if isinstance(v, str) and v.startswith('https://')):
                    label = key.removesuffix('_url').replace('_', ' ').capitalize() + (f" {n + 1}" if n else '')
                    out.append({'section': section, 'label': label, 'url': url, 'kind': _kind(key, url)})
    return out


def detail(slug, check_id):
    """One check: what the table shows, the full Didit summary, and Didit's photos fetched now."""
    from db import query_db
    from services import didit_service
    tenant, row = svc._check(slug, check_id)
    with use_tenant(tenant):
        extra = query_db("SELECT result_json, didit_session_id FROM id_verifications WHERE id = ?;",
                         (int(check_id),), one=True) or {}
        order = query_db("""
            SELECT o.order_number, o.service_name, c.name AS company_name, c.company_number
            FROM id_verifications v JOIN orders o ON o.id = v.order_id LEFT JOIN companies c ON c.id = o.company_id
            WHERE v.id = ?;
        """, (int(check_id),), one=True) or {}
        media, media_error = [], ''
        if extra.get('didit_session_id'):
            decision, err = didit_service.get_decision(extra['didit_session_id'])
            media = _media(decision) if decision else []
            media_error = f"Didit did not send the photos just now ({err}). Reload the page to try again." if err else ''
    try:
        result = json.loads(extra.get('result_json') or '{}') or {}
    except ValueError:
        result = {}
    return {
        **_desk_row(row),
        'workspace': tenant['slug'], 'workspace_name': tenant['name'],
        'company_name': order.get('company_name'), 'company_number': order.get('company_number'),
        'result': result,
        'media': media,
        'media_error': media_error,
    }


def set_status(slug, check_id, status, note, reviewer):
    """The desk's decision on a check. Declined needs the reason (the owner and the workspace see it)."""
    from db import execute_db
    from routes.id_verification_routes import apply_result
    status = str(status or '').strip()
    if status not in STATUSES:
        raise svc.ServiceError("Choose Approved, Declined or In Review")
    note = str(note or '').strip()[:300]
    if status == 'Declined' and not note:
        raise svc.ServiceError("Write the reason, so the client knows what to fix")
    tenant, _ = svc._check(slug, check_id)
    with use_tenant(tenant):
        # apply_result also tells whoever started the check and lets a waiting registered office go ahead
        apply_result(int(check_id), status)
        execute_db("""
            UPDATE id_verifications SET review_note = ?, reviewed_by = ?, reviewed_at = datetime('now'),
                   updated_at = datetime('now') WHERE id = ?;
        """, (note or None, (reviewer or {}).get('full_name') or (reviewer or {}).get('email'), int(check_id)))
    return _desk_row(svc._check(slug, check_id)[1])
