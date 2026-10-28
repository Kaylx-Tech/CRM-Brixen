"""Owner portal › Integrations › Cloudflare R2: check R2 works, and move documents that only exist on the
server's own disk (an upload falls back there when R2 fails, so nothing is lost) into R2.

The same as scripts/r2_sync.py, from a button. Never deletes anything: the server copy is kept, and a
document is only linked to R2 ("r2:<key>") after R2 has the file.
"""
import mimetypes
import os

from tenancy import list_tenants, use_tenant
from services import r2_storage


def _server_only(query_db):
    return query_db("""
        SELECT d.id, d.name, d.file_path, d.order_id, u.full_name AS customer
        FROM documents d LEFT JOIN users u ON u.id = d.user_id
        WHERE COALESCE(d.drive_file_id, '') = '' ORDER BY d.id;
    """) or []


def _workspaces():
    return [t for t in list_tenants() if t.get('plan') != 'legacy' and os.path.exists(t.get('db_path') or '')]


def overview():
    """Per workspace: documents in R2 and documents only on the server."""
    from db import query_db
    rows = []
    for tenant in _workspaces():
        with use_tenant(tenant):
            try:
                in_r2 = (query_db("SELECT COUNT(*) AS n FROM documents WHERE drive_file_id LIKE 'r2:%';", one=True)
                         or {}).get('n', 0)
                server = len(_server_only(query_db))
            except Exception:
                continue
        rows.append({'slug': tenant['slug'], 'name': tenant['name'], 'in_r2': in_r2, 'server_only': server})
    return {'workspaces': rows, 'in_r2': sum(r['in_r2'] for r in rows),
            'server_only': sum(r['server_only'] for r in rows)}


def move(limit=200):
    """Move up to `limit` server-only documents into R2. Returns the counts and the first errors."""
    from db import query_db, execute_db
    from scripts.drive_sync import local_path_for
    from services.storage_service import sanitize_filename

    health = r2_storage.health()
    if not health['ok']:
        return {'ok': False, 'error': health['error'], 'steps': health['steps']}
    moved = failed = missing = 0
    errors = []
    for tenant in _workspaces():
        if moved + failed >= limit:
            break
        with use_tenant(tenant):
            for doc in _server_only(query_db):
                if moved + failed >= limit:
                    break
                local = local_path_for(doc['file_path'])
                if not local:
                    missing += 1
                    continue
                fname = sanitize_filename(os.path.basename(local).split('_', 1)[-1] or doc['name'])
                order = f"Order #{doc['order_id']}" if doc['order_id'] else None
                key = r2_storage.object_key(doc['customer'] or 'General Client', order, fname)
                with open(local, 'rb') as fh:
                    res = r2_storage.upload(key, fh.read(),
                                            mimetypes.guess_type(fname)[0] or 'application/octet-stream')
                if not res['success']:
                    failed += 1
                    if len(errors) < 5:
                        errors.append(f"{tenant['slug']} #{doc['id']} {doc['name']}: {res['error']}")
                    continue
                execute_db("UPDATE documents SET drive_file_id = ?, file_path = ? "
                           "WHERE id = ? AND COALESCE(drive_file_id, '') = '';", (res['ref'], key, doc['id']))
                moved += 1
    left = overview()['server_only']
    return {'ok': failed == 0, 'moved': moved, 'failed': failed, 'missing': missing, 'left': left, 'errors': errors}
