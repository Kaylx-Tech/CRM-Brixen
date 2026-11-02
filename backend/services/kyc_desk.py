"""The KYC desk (kyc.finstap.com): the outside KYC team works through every workspace's ID checks.

Each person fills Finstap's own form (services/kyc_form.py): document photos, their details, a live selfie,
their address and a proof of address. The team opens a check, looks at what was sent, and sets the status:
Approved, Declined (with the reason) or In Review. The person is emailed the decision; a declined person
gets a new link to send it again. What the team sets is saved in the workspace's own database, so the owner
portal and the workspace's CRM show it at once. Prices, invoices and billing are never sent to the desk.

Older checks that ran on Didit still show Didit's result and photos (fetched live from Didit).
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

# The form's files, in the order the desk shows them
_FILE_SECTIONS = {'id_front': ('ID document', 'Front'), 'id_back': ('ID document', 'Back'),
                  'selfie': ('Selfie', 'Live photo'), 'poa': ('Proof of address', 'Document')}


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


def _form_files(check_id):
    """The form's files, newest round first: [{round, files: [{id, section, label, kind, created_at}]}]."""
    from services import kyc_form
    rounds = {}
    for f in kyc_form.files_for(check_id):
        rounds.setdefault(f['form_round'], []).append(f)
    order = list(_FILE_SECTIONS)
    out = []
    for number in sorted(rounds, reverse=True):
        files = sorted(rounds[number], key=lambda f: order.index(f['kind']) if f['kind'] in order else 9)
        out.append({'round': number, 'files': [{
            'id': f['id'], 'section': _FILE_SECTIONS.get(f['kind'], ('File', f['kind']))[0],
            'label': _FILE_SECTIONS.get(f['kind'], ('File', f['kind']))[1],
            'kind': 'pdf' if f['mime_type'] == 'application/pdf' else 'image',
            'created_at': f['created_at'],
        } for f in files]})
    return out


def detail(slug, check_id):
    """One check: what the table shows, the person's answers and files (or Didit's, for older checks)."""
    from db import query_db
    from services import didit_service, kyc_form
    tenant, row = svc._check(slug, check_id)
    with use_tenant(tenant):
        kyc_form.ensure()
        extra = query_db("SELECT result_json, didit_session_id, submitted_at FROM id_verifications WHERE id = ?;",
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
        submissions = _form_files(check_id)
    try:
        result = json.loads(extra.get('result_json') or '{}') or {}
    except ValueError:
        result = {}
    return {
        **_desk_row(row),
        'workspace': tenant['slug'], 'workspace_name': tenant['name'],
        'company_name': order.get('company_name'), 'company_number': order.get('company_number'),
        'submitted_at': extra.get('submitted_at'),
        'result': result,
        'submissions': submissions,
        'media': media,
        'media_error': media_error,
    }


def file(slug, check_id, file_id):
    """(bytes, mime) of one file the person sent, only when it belongs to that check."""
    from db import query_db
    from services import kyc_form
    tenant, _ = svc._check(slug, check_id)
    with use_tenant(tenant):
        kyc_form.ensure()
        row = query_db("SELECT * FROM id_verification_files WHERE id = ? AND verification_id = ?;",
                       (int(file_id), int(check_id)), one=True)
        return kyc_form.read_file(row) if row else (None, None)


def set_status(slug, check_id, status, note, reviewer):
    """The desk's decision on a check. Declined needs the reason (the owner, the workspace and the person
    see it); the person is emailed when it is Approved or Declined, and a declined person gets a new link."""
    from db import execute_db, query_db
    from routes.id_verification_routes import apply_result
    from services import kyc_form
    status = str(status or '').strip()
    if status not in STATUSES:
        raise svc.ServiceError("Choose Approved, Declined or In Review")
    note = str(note or '').strip()[:300]
    if status == 'Declined' and not note:
        raise svc.ServiceError("Write the reason, so the client knows what to fix")
    tenant, before = svc._check(slug, check_id)
    with use_tenant(tenant):
        # apply_result also tells whoever started the check and lets a waiting registered office go ahead
        apply_result(int(check_id), status)
        execute_db("""
            UPDATE id_verifications SET review_note = ?, reviewed_by = ?, reviewed_at = datetime('now'),
                   updated_at = datetime('now') WHERE id = ?;
        """, (note or None, (reviewer or {}).get('full_name') or (reviewer or {}).get('email'), int(check_id)))
        if status != before.get('status') and status in ('Approved', 'Declined'):
            if status == 'Declined':
                kyc_form.new_link(int(check_id), status='Declined')
            row = query_db("SELECT * FROM id_verifications WHERE id = ?;", (int(check_id),), one=True)
            if not row.get('email') and before.get('client_email'):
                row = {**row, 'email': before['client_email']}
            kyc_form.email_decision(row, status, note, before.get('order_number'))
    return _desk_row(svc._check(slug, check_id)[1])
