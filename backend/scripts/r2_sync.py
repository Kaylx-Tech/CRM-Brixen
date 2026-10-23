#!/usr/bin/env python3
"""Check Cloudflare R2 and move documents that are only on the server into R2. Never deletes anything.

Run in the Finstap API container terminal (Coolify):
  python /app/scripts/r2_sync.py                      # check R2 + report only, changes nothing
  python /app/scripts/r2_sync.py --apply --limit 5    # move 5 documents first
  python /app/scripts/r2_sync.py --apply              # everything (safe to re-run: done ones are skipped)
  python /app/scripts/r2_sync.py --workspace acme     # one company only

For every company workspace: checks R2 can write and read in that company's folder, then for each
document without cloud storage (no drive_file_id) whose file is on the server, uploads it to
<bucket>/<workspace>/customers/<customer>/<order>/, checks the stored copy and links it ("r2:<key>").
The server copy is kept. Documents already on Google Drive are left where they are.
"""
import argparse
import mimetypes
import os
import sys

APP_DIR = '/app' if os.path.isdir('/app/services') else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP_DIR)

from db import execute_db, query_db  # noqa: E402
from services import r2_storage  # noqa: E402
from services.storage_service import sanitize_filename  # noqa: E402
from scripts.drive_sync import human, local_path_for  # noqa: E402


def sync_workspace(args, label):
    print(f"\n=== {label} ===", flush=True)
    health = r2_storage.health()
    for s in health['steps']:
        print(f"  [{'OK  ' if s['ok'] else 'FAIL'}] {s['step']}{': ' + s['detail'] if s['detail'] else ''}")
    if not health['ok']:
        print(f"  -> PROBLEM: {health['error']}")
        return False
    docs = query_db("""
        SELECT d.id, d.name, d.file_path, d.order_id, u.full_name AS customer
        FROM documents d LEFT JOIN users u ON u.id = d.user_id
        WHERE COALESCE(d.drive_file_id, '') = '' ORDER BY d.id;
    """) or []
    in_r2 = (query_db("SELECT COUNT(*) AS n FROM documents WHERE drive_file_id LIKE 'r2:%';", one=True) or {}).get('n', 0)
    print(f"  In R2: {in_r2} | only on the server: {len(docs)}", flush=True)
    if args.limit:
        docs = docs[:args.limit]
    moved = missing = failed = 0
    for doc in docs:
        local = local_path_for(doc['file_path'])
        if not local:
            missing += 1
            print(f"  MISSING  #{doc['id']} {doc['name']} (no file on the server)")
            continue
        size = os.path.getsize(local)
        if not args.apply:
            print(f"  WAITING  #{doc['id']} {doc['name']} ({human(size)})")
            continue
        fname = sanitize_filename(os.path.basename(local).split('_', 1)[-1] or doc['name'])
        order = f"Order #{doc['order_id']}" if doc['order_id'] else None
        key = r2_storage.object_key(doc['customer'] or 'General Client', order, fname)
        with open(local, 'rb') as fh:
            res = r2_storage.upload(key, fh.read(), mimetypes.guess_type(fname)[0] or 'application/octet-stream')
        if not res['success']:
            failed += 1
            print(f"  ERROR    #{doc['id']} {doc['name']}: {res['error']}")
            continue
        execute_db("UPDATE documents SET drive_file_id = ?, file_path = ? WHERE id = ? AND COALESCE(drive_file_id, '') = '';",
                   (res['ref'], key, doc['id']))
        moved += 1
        print(f"  MOVED    #{doc['id']} {doc['name']} -> {key}", flush=True)
    if args.apply:
        print(f"  Done: {moved} moved, {missing} missing, {failed} failed")
    else:
        print("  (report only: add --apply to move them)")
    return failed == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='move the documents (default: report only)')
    ap.add_argument('--limit', type=int, default=0, help='only the first N documents per workspace')
    ap.add_argument('--workspace', default='', help='Finstap: only this company workspace')
    args = ap.parse_args()
    try:
        import tenancy
    except ImportError:
        tenancy = None
    if tenancy is None:
        sys.exit(0 if sync_workspace(args, 'CRM') else 1)
    tenancy.ensure_platform()
    tenants = [t for t in tenancy.list_tenants() if not args.workspace or t['slug'] == args.workspace]
    if not tenants:
        sys.exit(f"No workspace '{args.workspace}'." if args.workspace else 'No workspaces yet.')
    ok = True
    for tenant in tenants:
        with tenancy.use_tenant(tenant):
            ok = sync_workspace(args, f"{tenant['slug']} ({tenant['name']})") and ok
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
