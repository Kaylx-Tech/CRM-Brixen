"""Finstap's own identity check: the person fills a step-by-step form on a private link, no outside provider.

The workspace adds the person to a KYC order (or the order adds its customer by itself) and the person is
emailed acme.finstap.com/verify/<code>. There they pick their document (ID card, driving licence or
passport), photograph it, type their details, take a live selfie, give their address and upload a proof of
address. Once they send it, the check is "Submitted": the Finstap owner and the KYC desk (kyc.finstap.com)
open it, look at the files and set Approved, In Review or Declined (services/kyc_desk.py). A rejected
person gets an email with the reason and a new link.

The code in the link starts with the workspace name ('acme.<code>') so the form page knows which company's
database to ask; only its SHA-256 hash is stored for the lookup. Files go to the workspace's private R2
folder (or local storage when R2 is not set up) and are only served to the owner and the KYC desk.
"""
import hashlib
import json
import os
import re
import secrets
import uuid
from datetime import date

from db import execute_db, query_db

LINK_DAYS = 14
MAX_BYTES = 10 * 1024 * 1024
TOKEN_RE = re.compile(r'^(?:[a-z0-9-]{1,40}\.)?[A-Za-z0-9_-]{30,64}$')

# The document the person verifies with, and the photos it needs (a passport only has its photo page)
ID_TYPES = {
    'id_card': ('ID card', ('id_front', 'id_back')),
    'driving_licence': ('Driving licence', ('id_front', 'id_back')),
    'passport': ('Passport', ('id_front',)),
}
POA_TYPES = {
    'bank_statement': 'Bank statement',
    'utility_bill': 'Utility bill',
    'government_document': 'Government-issued document',
}
FILE_KINDS = {'id_front': 'Front', 'id_back': 'Back', 'selfie': 'Selfie', 'poa': 'Proof of address'}

# While the status is one of these the form takes answers (Declined: the person sends it again)
OPEN_STATUSES = ('Not Started', 'In Progress', 'Declined', 'Expired')


def ensure():
    """Columns and the files table, added on first use (older workspace databases)."""
    columns = {c['name'] for c in (query_db("PRAGMA table_info(id_verifications);") or [])}
    for column, kind in (('form_token_hash', 'TEXT'), ('form_expires_at', 'TEXT'), ('submitted_at', 'TEXT'),
                         ('form_round', 'INTEGER NOT NULL DEFAULT 0')):
        if columns and column not in columns:
            execute_db(f"ALTER TABLE id_verifications ADD COLUMN {column} {kind};")
    execute_db("""
        CREATE TABLE IF NOT EXISTS id_verification_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            verification_id INTEGER NOT NULL,
            form_round INTEGER NOT NULL DEFAULT 1,
            kind TEXT NOT NULL,
            file_ref TEXT NOT NULL,
            mime_type TEXT,
            size INTEGER,
            replaced INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)
    execute_db("CREATE INDEX IF NOT EXISTS idx_idv_files_verification ON id_verification_files(verification_id);")


def _hash(token):
    return hashlib.sha256(str(token).encode('utf-8')).hexdigest()


def _slug():
    try:
        from tenancy import current_tenant
        return str((current_tenant() or {}).get('slug') or '').lower()
    except ImportError:
        return ''


def form_url(token):
    """The person's link: the workspace's own address, so the page carries its logo."""
    try:
        from tenancy import workspace_url
        url = workspace_url(_slug(), f'/verify/{token}')
    except ImportError:
        url = ''
    if url:
        return url
    from config import FRONTEND_URL
    base = os.environ.get('KYC_FORM_BASE_URL') or FRONTEND_URL
    return f"{base.rstrip('/')}/verify/{token}"


def new_link(verification_id, status='Not Started'):
    """A new private link for the person (the old one stops working); their next answers start a new round,
    so the earlier files stay on record. Returns the row."""
    ensure()
    slug = _slug()
    code = secrets.token_urlsafe(32)
    token = f'{slug}.{code}' if slug else code
    execute_db("""
        UPDATE id_verifications SET form_token_hash = ?, form_expires_at = datetime('now', ?),
               session_url = ?, status = ?, form_round = COALESCE(form_round, 0) + 1,
               updated_at = datetime('now')
        WHERE id = ?;
    """, (_hash(token), f'+{LINK_DAYS} days', form_url(token), status, int(verification_id)))
    return query_db("SELECT * FROM id_verifications WHERE id = ?;", (int(verification_id),), one=True)


def verification_for_token(token):
    """(row, None) for a working link, or (None, 'invalid' | 'expired')."""
    token = str(token or '').strip()
    if not TOKEN_RE.match(token):
        return None, 'invalid'
    ensure()
    row = query_db("SELECT *, form_expires_at > datetime('now') AS live FROM id_verifications "
                   "WHERE form_token_hash = ?;", (_hash(token),), one=True)
    if not row:
        return None, 'invalid'
    if not row['live'] and row['status'] in OPEN_STATUSES:
        return None, 'expired'
    return dict(row), None


def files_for(verification_id, form_round=None, include_replaced=False):
    ensure()
    sql = "SELECT * FROM id_verification_files WHERE verification_id = ?"
    args = [int(verification_id)]
    if form_round is not None:
        sql += " AND form_round = ?"
        args.append(int(form_round))
    if not include_replaced:
        sql += " AND replaced = 0"
    return query_db(sql + " ORDER BY id;", tuple(args)) or []


def public_view(row):
    """What the form page needs: never the decision details beyond the reason to fix."""
    try:
        from tenancy import current_tenant
        workspace = (current_tenant() or {}).get('name') or ''
    except ImportError:
        workspace = ''
    status = row['status']
    step = 'approved' if status == 'Approved' else 'open' if status in OPEN_STATUSES else 'submitted'
    return {
        'full_name': row['full_name'],
        'workspace': workspace,
        'step': step,
        'reason': row.get('review_note') if status == 'Declined' else None,
        'uploaded': sorted({f['kind'] for f in files_for(row['id'], row.get('form_round') or 1)}),
        'id_types': [{'value': k, 'label': v[0], 'sides': list(v[1])} for k, v in ID_TYPES.items()],
        'poa_types': [{'value': k, 'label': v} for k, v in POA_TYPES.items()],
    }


def _sniff(data):
    """The real type from the first bytes (the browser's own label is not trusted)."""
    if data[:3] == b'\xff\xd8\xff':
        return 'image/jpeg', 'jpg'
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png', 'png'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp', 'webp'
    if data[:5] == b'%PDF-':
        return 'application/pdf', 'pdf'
    return None, None


def _save_to_r2(check_id, name, data, mime):
    """Store the file in the workspace's R2 folder (<workspace>/kyc/...); "r2:<key>", or None when R2 is
    not set up or refused it twice (the reason goes to the server log and GlitchTip)."""
    from services import r2_storage
    if not r2_storage.is_configured():
        print(f"[KYC form] R2 is not set up ({', '.join(r2_storage.missing_settings())}): check {check_id} "
              "kept on the server")
        return None
    key = f"{r2_storage.workspace_prefix()}/kyc/{name}"
    res = r2_storage.upload(key, data, mime)
    if not res.get('success'):
        r2_storage.reset_client()  # a stale connection or changed keys: try once more with a fresh client
        res = r2_storage.upload(key, data, mime)
    if res.get('success'):
        return res['ref']
    reason = res.get('error') or 'unknown error'
    print(f"[KYC form] R2 upload failed for check {check_id}: {reason}")
    try:
        import sentry_sdk
        sentry_sdk.capture_message(f"KYC form: R2 upload failed: {reason}", level='error')
    except Exception:
        pass
    return None


def save_file(row, kind, upload):
    """Store one photo or file for the person's current round; a new one replaces the last of that kind.
    Returns an error message or None."""
    if row['status'] not in OPEN_STATUSES:
        return "These details have already been sent."
    if kind not in FILE_KINDS:
        return "Unknown document."
    data = (upload or {}).get('bytes') or b''
    if not data:
        return "Choose a file to upload."
    if len(data) > MAX_BYTES:
        return "The file is too large. Use a photo or PDF under 10 MB."
    mime, ext = _sniff(data)
    if not mime or (ext == 'pdf' and kind != 'poa'):
        return "Upload a photo (JPG, PNG or WebP)" + (" or a PDF." if kind == 'poa' else ".")

    form_round = row.get('form_round') or 1
    name = f"idv-{row['id']}-r{form_round}-{kind}-{uuid.uuid4().hex[:10]}.{ext}"
    ref = _save_to_r2(row['id'], name, data, mime)
    if not ref:
        # R2 is not set up or refused the file: keep it on the server so the person is never stuck
        from config import STORAGE_DIR
        sub = os.path.join('workspaces', _slug() or 'crm', 'kyc')
        os.makedirs(os.path.join(STORAGE_DIR, sub), exist_ok=True)
        with open(os.path.join(STORAGE_DIR, sub, name), 'wb') as fh:
            fh.write(data)
        ref = 'local:' + os.path.join(sub, name).replace('\\', '/')

    execute_db("UPDATE id_verification_files SET replaced = 1 WHERE verification_id = ? AND form_round = ? AND kind = ?;",
               (row['id'], form_round, kind))
    execute_db("""
        INSERT INTO id_verification_files (verification_id, form_round, kind, file_ref, mime_type, size)
        VALUES (?, ?, ?, ?, ?, ?);
    """, (row['id'], form_round, kind, ref, mime, len(data)))
    if row['status'] in ('Not Started', 'Expired'):
        execute_db("UPDATE id_verifications SET status = 'In Progress', updated_at = datetime('now') WHERE id = ?;",
                   (row['id'],))
    return None


def read_file(file_row):
    """(bytes, mime) of a stored file, or (None, None)."""
    ref = str(file_row.get('file_ref') or '')
    if ref.startswith('local:'):
        from config import STORAGE_DIR
        root = os.path.realpath(STORAGE_DIR)
        path = os.path.realpath(os.path.join(root, ref[len('local:'):]))
        if not path.startswith(root + os.sep) or not os.path.isfile(path):
            return None, None
        with open(path, 'rb') as fh:
            return fh.read(), file_row.get('mime_type')
    from services import r2_storage
    data, meta = r2_storage.download(ref)
    return data, (file_row.get('mime_type') or (meta or {}).get('mimeType'))


def _text(body, key, limit=160):
    return re.sub(r'\s+', ' ', str((body or {}).get(key) or '')).strip()[:limit]


def _date_of_birth(value):
    """'dd/mm/yyyy' (or yyyy-mm-dd) → date, only for people aged 16 to 120."""
    match = re.fullmatch(r'(\d{2})/(\d{2})/(\d{4})', value) or None
    try:
        if match:
            born = date(int(match.group(3)), int(match.group(2)), int(match.group(1)))
        else:
            born = date.fromisoformat(value)
    except ValueError:
        return None
    today = date.today()
    age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    return born if 16 <= age <= 120 else None


def submit(row, body):
    """Check and save the person's answers. Returns (None, None) or (message, {field: message})."""
    if row['status'] not in OPEN_STATUSES:
        return "These details have already been sent.", None
    body = body if isinstance(body, dict) else {}
    errors = {}
    id_type = _text(body, 'id_type', 40)
    if id_type not in ID_TYPES:
        errors['id_type'] = "Choose your document."
    fields = {key: _text(body, key) for key in ('full_name', 'date_of_birth', 'id_number', 'address_line1',
                                                'address_line2', 'city', 'region', 'postal_code', 'country')}
    for key, message in (('full_name', "Enter your full name as shown on your document."),
                         ('id_number', "Enter your document number."),
                         ('address_line1', "Enter your address."),
                         ('city', "Enter your city."),
                         ('region', "Enter your state or region."),
                         ('postal_code', "Enter your postal code."),
                         ('country', "Choose your country.")):
        if not fields[key]:
            errors[key] = message
    born = _date_of_birth(fields['date_of_birth'])
    if not born:
        errors['date_of_birth'] = "Enter your date of birth as DD/MM/YYYY (you must be 16 or over)."
    poa_type = _text(body, 'poa_type', 40)
    if poa_type not in POA_TYPES:
        errors['poa_type'] = "Choose the kind of proof of address."
    if errors:
        return "Please check the highlighted answers.", errors

    have = {f['kind'] for f in files_for(row['id'], row.get('form_round') or 1)}
    needed = list(ID_TYPES[id_type][1]) + ['selfie', 'poa']
    missing = [FILE_KINDS[k].lower() for k in needed if k not in have]
    if missing:
        return f"Please add: {', '.join(missing)}.", None

    address = {k: fields[k] for k in ('address_line1', 'address_line2', 'city', 'region', 'postal_code', 'country')}
    result = {
        'source': 'form',
        'id_type': id_type,
        'document_type': ID_TYPES[id_type][0],
        'full_name': fields['full_name'],
        'date_of_birth': born.strftime('%d/%m/%Y'),
        'document_number': fields['id_number'],
        'address': ', '.join(v for v in address.values() if v),
        'address_parts': address,
        'poa': {'document': POA_TYPES[poa_type], 'address': ', '.join(v for v in address.values() if v)},
    }
    execute_db("""
        UPDATE id_verifications SET result_json = ?, submitted_at = datetime('now'), review_note = NULL,
               updated_at = datetime('now') WHERE id = ?;
    """, (json.dumps(result), row['id']))
    from routes.id_verification_routes import apply_result
    apply_result(row['id'], 'Submitted')
    return None, None


def email_decision(row, status, note, order_number=None):
    """Tell the person the desk's decision: verified, or what to fix with their new link (made by the caller,
    services/kyc_desk.py). Returns True when sent."""
    from services.client_mail import compose_client_email
    from services.email_service import send_email, last_failure_reason
    email = row.get('email')
    if not email or status not in ('Approved', 'Declined'):
        return False
    if status == 'Approved':
        subject, text, html = compose_client_email(
            subject='Your identity is verified', headline='Your identity is verified', greeting=row['full_name'],
            message="Thank you. We have checked your documents and your identity is now verified. "
                    "There is nothing else you need to do.",
            details=[('Order', order_number)], category='ORDER')
    else:
        subject, text, html = compose_client_email(
            subject='Please verify your identity again', headline='Please verify your identity again',
            greeting=row['full_name'],
            message="We could not accept the documents you sent. Please follow the secure link below and send "
                    "them again: it takes about five minutes.",
            points=[f"What to fix: {note}" if note else '',
                    'Use clear, uncut photos of your document, with all four corners showing.',
                    'Upload an original proof of address from the last 3 months. Edited or screenshot '
                    'documents are not accepted.'],
            details=[('Order', order_number)],
            cta_label='Verify my identity', cta_url=row['session_url'], category='ORDER')
    ok = send_email(email, subject, html, text, category='ORDER', order_id=row.get('order_id'))
    if ok:
        execute_db("UPDATE id_verifications SET link_sent_at = datetime('now') WHERE id = ?;", (row['id'],))
    else:
        print(f"[KYC form] decision email for check {row['id']}: {last_failure_reason() or 'not sent'}")
    return ok
