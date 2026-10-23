#!/usr/bin/env python3
"""Why are documents not on Google Drive? Checks the same path uploads use, for every company workspace.

Run in the Finstap API container terminal (Coolify):
    python /app/scripts/drive_check.py

Prints each step (login settings, Google account, root folder, the company's folder) and how many documents
are still only on the server. Shows no secrets. The only thing it may create is a missing company folder
(Finstap-<workspace>) inside the Drive root, exactly as the first upload would.
After fixing the problem, move the waiting documents with:  python /app/scripts/drive_sync.py --apply
"""
import os
import sys

APP_DIR = '/app' if os.path.isdir('/app/services') else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP_DIR)

from db import query_db  # noqa: E402
from services.google_drive_service import drive_health  # noqa: E402


def report(label):
    health = drive_health()
    print(f"\n=== {label} ===")
    for s in health['steps']:
        print(f"  [{'OK  ' if s['ok'] else 'FAIL'}] {s['step']}{': ' + s['detail'] if s['detail'] else ''}")
    waiting = (query_db("SELECT COUNT(*) AS n FROM documents WHERE COALESCE(drive_file_id, '') = '';",
                        one=True) or {}).get('n', 0)
    on_drive = (query_db("SELECT COUNT(*) AS n FROM documents WHERE COALESCE(drive_file_id, '') != '';",
                         one=True) or {}).get('n', 0)
    print(f"  Documents on Drive: {on_drive} | only on the server (waiting): {waiting}")
    if health['ok']:
        print(f"  -> Drive works. New files go to {health.get('path')}")
    else:
        print(f"  -> PROBLEM: {health['error']}")
    return health['ok']


def main():
    try:
        import tenancy
    except ImportError:
        tenancy = None
    if tenancy is None:
        sys.exit(0 if report('CRM') else 1)
    tenancy.ensure_platform()
    tenants = tenancy.list_tenants()
    if not tenants:
        sys.exit('No workspaces yet.')
    ok = True
    for tenant in tenants:
        with tenancy.use_tenant(tenant):
            ok = report(f"{tenant['slug']} ({tenant['name']})") and ok
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
