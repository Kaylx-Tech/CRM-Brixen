"""The KYC desk (kyc.finstap.com): the outside KYC team works through every workspace's ID checks.

Each person fills Finstap's own form (services/kyc_form.py): document photos, their details, a live selfie,
their address and a proof of address. The team opens a check, looks at what was sent, and sets the status:
Approved, Declined (with the reason) or In Review. The person is emailed the decision; a declined person
gets a new link to send it again. What the team sets is saved in the workspace's own database, so the owner
portal and the workspace's CRM show it at once. Prices, invoices and billing are never sent to the desk.

Older checks that ran on Didit still show Didit's result and photos (fetched live from Didit).
"""
import hashlib
import hmac
import json
import secrets
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


# What the KYC team sees, set by the owner on the KYC page (the owner always sees everything):
# {name: (platform setting, default '1' shown / '0' hidden, the fields it covers)}
VIEW = {
    'workspace': ('kyc_desk_show_workspace', '0', ('workspace_name',)),
    'email': ('kyc_desk_show_email', '1', ('email', 'client_email')),
    'phone': ('kyc_desk_show_phone', '1', ('phone',)),
}


def _desk_row(row):
    return {k: v for k, v in row.items() if k not in _HIDDEN}


def team_view():
    """{'workspace': bool, 'email': bool, 'phone': bool}: what the KYC team is shown (email and phone start
    from the older single "contact" setting)."""
    contact = svc._setting('kyc_desk_show_contact', '1')
    return {name: svc._setting(key, contact if name in ('email', 'phone') else default) == '1'
            for name, (key, default, _) in VIEW.items()}


def set_team_view(values):
    from tenancy import _platform_execute
    for name, (key, _, _) in VIEW.items():
        if name in (values or {}):
            _platform_execute("""
                INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
            """, (key, '1' if values[name] else '0'))
    return team_view()


def _salt():
    """A random key kept in the platform settings, so a workspace's desk reference cannot be guessed."""
    from tenancy import _platform_execute
    salt = svc._setting('kyc_desk_ref_salt')
    if not salt:
        _platform_execute("INSERT OR IGNORE INTO platform_settings (key, value, updated_at) "
                          "VALUES ('kyc_desk_ref_salt', ?, datetime('now'));", (secrets.token_hex(16),))
        salt = svc._setting('kyc_desk_ref_salt')
    return salt


def ref(slug):
    """The workspace as the KYC team sees it in links when its name is hidden: 'w' + 12 hex characters."""
    return 'w' + hmac.new(_salt().encode(), str(slug).encode(), hashlib.sha256).hexdigest()[:12]


def resolve(key):
    """The workspace slug for a slug or a desk reference."""
    from tenancy import list_tenants
    if len(key) == 13 and key.startswith('w'):
        for tenant in list_tenants():
            if hmac.compare_digest(ref(tenant['slug']), key):
                return tenant['slug']
    return key


def shown(row, team, view=None):
    """A check as the caller may see it: the KYC team gets only what the owner allows."""
    out = _desk_row(row)
    if not team:
        return out
    view = view or team_view()
    for name, (_, _, fields) in VIEW.items():
        if not view[name]:
            for field in fields:
                out.pop(field, None)
    if not view['workspace'] and out.get('workspace'):
        out['workspace'] = ref(out['workspace'])
    return out


def checks(period=None, slug=None, team=False):
    """Every ID check started in the month, newest first, with its workspace, client and order."""
    view = team_view()
    report = svc.kyc_report(period, resolve(slug) if slug else None)
    hide_workspace = team and not view['workspace']
    return {
        'period': report['period'],
        'totals': {k: report['totals'][k] for k in ('checks', 'approved', 'declined', 'pending')},
        'workspaces': [] if hide_workspace else [{'slug': w['slug'], 'name': w['name']} for w in report['workspaces']],
        'view': view if team else None,
        'checks': sorted((shown(c, team, view) for c in report['checks']), key=lambda c: c.get('created_at') or '',
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


def _sent(check_id, f):
    """A file shows only once the person sent the form: an earlier round, or the current one after Send.
    What they upload and have not sent yet (a draft) is never shown."""
    from db import query_db
    from services import kyc_form
    row = query_db("SELECT form_round, submitted_at, status FROM id_verifications WHERE id = ?;", (int(check_id),),
                   one=True) or {}
    current = row.get('form_round') or 1
    sent = bool(row.get('submitted_at')) and row.get('status') not in kyc_form.OPEN_STATUSES
    return (f.get('form_round') or 1) < current or sent


def _form_files(check_id):
    """The sent form's files, newest round first: [{round, files: [{id, section, label, kind, created_at}]}]."""
    from services import kyc_form
    rounds = {}
    for f in kyc_form.files_for(check_id):
        if not _sent(check_id, f):
            continue
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


def detail(slug, check_id, team=False, can_delete=False):
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
        **shown({**row, 'workspace': tenant['slug'], 'workspace_name': tenant['name']}, team),
        'company_name': order.get('company_name'), 'company_number': order.get('company_number'),
        'submitted_at': extra.get('submitted_at'),
        'can_delete': bool(can_delete),
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
        return kyc_form.read_file(row) if row and _sent(check_id, row) else (None, None)


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


def remove_stored(file_row):
    """Delete one stored file's bytes (R2 or the server); the caller removes its row."""
    import os
    from services import r2_storage
    ref_ = str(file_row.get('file_ref') or '')
    try:
        if ref_.startswith('local:'):
            from config import STORAGE_DIR
            root = os.path.realpath(STORAGE_DIR)
            path = os.path.realpath(os.path.join(root, ref_[len('local:'):]))
            if path.startswith(root + os.sep) and os.path.isfile(path):
                os.remove(path)
        elif r2_storage.is_r2_ref(ref_):
            r2_storage.delete(ref_)
    except Exception as exc:
        print(f"[KYC desk] could not delete a file of check {file_row.get('verification_id')}: {exc}")


def wipe(check_id):
    """Delete what the person sent for one check (run inside its workspace): their photos and files (from R2
    or the server), their answers and Didit's result. Returns how many files were deleted."""
    from db import execute_db, query_db
    from services import kyc_form
    kyc_form.ensure()
    files = query_db("SELECT * FROM id_verification_files WHERE verification_id = ?;", (int(check_id),)) or []
    for f in files:
        remove_stored(f)
    execute_db("DELETE FROM id_verification_files WHERE verification_id = ?;", (int(check_id),))
    execute_db("""
        UPDATE id_verifications SET result_json = NULL, didit_session_id = NULL, submitted_at = NULL,
               updated_at = datetime('now') WHERE id = ?;
    """, (int(check_id),))
    return len(files)


def delete_data(slug, check_id):
    """The owner deletes what the person sent. The check stays (marked deleted) so the month's KYC count and
    the order stay right; the client's current link keeps working. Returns (row, how many files were deleted)."""
    from db import execute_db
    tenant, row = svc._check(slug, check_id)
    with use_tenant(tenant):
        files = wipe(check_id)
        execute_db("UPDATE id_verifications SET data_deleted_at = datetime('now') WHERE id = ?;", (int(check_id),))
    return row, files


def remove_check(slug, check_id):
    """The owner removes a check completely (e.g. a test): its files, the check itself and its charge if it was
    not paid yet. Returns the removed row."""
    from db import execute_db
    from tenancy import _platform_execute
    tenant, row = svc._check(slug, check_id)
    with use_tenant(tenant):
        wipe(check_id)
        execute_db("DELETE FROM id_verifications WHERE id = ?;", (int(check_id),))
    _platform_execute("DELETE FROM kyc_charges WHERE tenant_slug = ? AND check_id = ? AND status != 'paid';",
                      (tenant['slug'], int(check_id)))
    return row


def tell_team(tenant, row):
    """The person sent the form: every active KYC team member is emailed to check it."""
    from config import TENANT_BASE_DOMAIN
    from tenancy import _platform_query
    from services.email_service import send_email
    people = _platform_query("SELECT email FROM platform_admins WHERE role = 'kyc' AND status = 'Active';") or []
    if not people:
        return 0
    view = team_view()
    key = tenant['slug'] if view['workspace'] else ref(tenant['slug'])
    base = f"https://kyc.{TENANT_BASE_DOMAIN}" if TENANT_BASE_DOMAIN and TENANT_BASE_DOMAIN != 'localhost' \
        else 'http://localhost:5180'
    url = f"{base}/kyc/checks/{key}/{row['id']}"
    name = row.get('full_name') or 'A client'
    where = f" ({tenant['name']})" if view['workspace'] else ''
    subject = f"ID check to review: {name}"
    text = (f"{name}{where} has verified their identity and sent their documents.\n\n"
            f"Please perform the checks and set the status:\n{url}")
    html = (f'<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;'
            f'padding:32px 16px;color:#111827;"><p style="font-size:20px;font-weight:700;margin:0 0 16px;">'
            f'ID check to review</p><p style="margin:0 0 24px;color:#4b5563;"><b>{_esc(name)}</b>{_esc(where)} '
            f'has verified their identity and sent their documents. Please perform the checks and set the status.'
            f'</p><p style="margin:0 0 24px;"><a href="{url}" style="display:inline-block;background:#5f5cff;'
            f'color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;">'
            f'Open the check</a></p></div>')
    sent = 0
    with use_tenant(None):
        for person in people:
            if send_email(person['email'], subject, html, text, category='ORDER', log=False,
                          sender_name='Finstap', mailbox='platform'):
                sent += 1
    if not sent:
        print(f"[KYC desk] team email for check {row['id']}: not sent ({url})")
    return sent


def _esc(text):
    import html
    return html.escape(str(text or ''))
