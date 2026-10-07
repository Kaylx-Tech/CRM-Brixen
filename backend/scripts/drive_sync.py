#!/usr/bin/env python3
"""Reconcile CRM documents with Google Drive — safe, resumable, never deletes anything.

What it does for every document that has no drive_file_id:
  1. MATCH   – the file is already on Drive (e.g. an interrupted upload): link it (drive_file_id,
               drive_web_link, file_path) after checking the size.
  2. UPLOAD  – not on Drive but a local copy exists: upload it, verify the MD5, then link it.
  3. MISSING – neither on Drive nor on disk: listed in the report for a manual decision.

Modes:
  python scripts/drive_sync.py                 # report only (default, changes nothing)
  python scripts/drive_sync.py --apply         # link matches + upload local files
  python scripts/drive_sync.py --apply --limit 5   # try on 5 documents first

Output: /app/data/drive_sync_report.csv (or <DB folder>/drive_sync_report.csv).
Local files and Drive files are never deleted or overwritten; only the three Drive columns of
`documents` are written, and only where drive_file_id is still empty.
"""
import argparse
import csv
import hashlib
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db import DB_PATH, get_db, query_db  # noqa: E402
from services.google_drive_service import get_drive_service, get_customer_folder_id  # noqa: E402
from services.storage_service import sanitize_filename  # noqa: E402

FOLDER_MIME = 'application/vnd.google-apps.folder'
STORAGE_ROOTS = [p for p in (os.environ.get('STORAGE_PATH'), '/app/storage', '/var/www/brixen-crm/storage') if p]


def local_path_for(file_path):
    """Find the document on local disk (old absolute path or relocated under STORAGE_PATH)."""
    if not file_path:
        return None
    if os.path.isfile(file_path):
        return file_path
    m = re.search(r'storage/(.*)$', file_path)
    rel = m.group(1) if m else file_path.lstrip('/')
    for root in STORAGE_ROOTS:
        cand = os.path.join(root, rel)
        if os.path.isfile(cand):
            return cand
    return None


def list_children(svc, parent_id):
    token = None
    while True:
        res = svc.files().list(
            q=f"'{parent_id}' in parents and trashed = false",
            fields='nextPageToken, files(id,name,mimeType,size,md5Checksum,webViewLink)',
            pageSize=1000, pageToken=token, supportsAllDrives=True, includeItemsFromAllDrives=True,
        ).execute()
        for f in res.get('files', []):
            yield f
        token = res.get('nextPageToken')
        if not token:
            break


def build_drive_index(svc, root_id):
    """Walk Brixen-CRM/Customers once: {(customer, order_or_None, filename): [meta, ...]}."""
    index = {}
    by_name = {}
    customers = None
    for f in list_children(svc, root_id):
        if f['mimeType'] == FOLDER_MIME and f['name'] == 'Customers':
            customers = f['id']
    if not customers:
        customers = root_id
    stack = [(customers, [])]
    folders = 0
    while stack:
        fid, path = stack.pop()
        for f in list_children(svc, fid):
            if f['mimeType'] == FOLDER_MIME:
                folders += 1
                stack.append((f['id'], path + [f['name']]))
                continue
            customer = path[0] if path else None
            order = path[1] if len(path) > 1 else None
            meta = dict(f, path=path)
            index.setdefault((customer, order, f['name']), []).append(meta)
            by_name.setdefault(f['name'], []).append(meta)
    return index, by_name, folders


def md5_of(path):
    h = hashlib.md5()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def drive_path(meta):
    return '/'.join(['Brixen-CRM', 'Customers'] + meta['path'] + [meta['name']])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='write links / upload (default: report only)')
    ap.add_argument('--limit', type=int, default=0, help='only process the first N documents')
    args = ap.parse_args()

    svc = get_drive_service()
    if not svc:
        sys.exit('Google Drive is not configured (GOOGLE_* env missing).')
    root_id = (os.environ.get('GOOGLE_DRIVE_FOLDER_ID') or '').strip()
    try:
        about = svc.about().get(fields='user(emailAddress)').execute()
        if not root_id:
            sys.exit('GOOGLE_DRIVE_FOLDER_ID is required.')
        index, by_name, folders = build_drive_index(svc, root_id)
    except Exception as exc:  # noqa: BLE001
        if 'invalid_grant' in str(exc) or 'RefreshError' in type(exc).__name__:
            sys.exit('Google token expired/revoked (invalid_grant). Generate a new GOOGLE_REFRESH_TOKEN first.')
        raise
    print(f"Drive account: {about['user']['emailAddress']} | folders scanned: {folders} | files indexed: "
          f"{sum(len(v) for v in index.values())}")

    docs = query_db(
        """SELECT d.id, d.user_id, d.order_id, d.name, d.file_path, d.file_size, d.file_type, u.full_name AS customer
           FROM documents d LEFT JOIN users u ON u.id = d.user_id
           WHERE COALESCE(d.drive_file_id, '') = '' ORDER BY d.id;""") or []
    if args.limit:
        docs = docs[:args.limit]
    print(f"Documents without Drive link: {len(docs)} | mode: {'APPLY' if args.apply else 'REPORT ONLY'}")

    conn = get_db()
    rows, counts = [], {}

    def record(doc, action, meta=None, note=''):
        counts[action] = counts.get(action, 0) + 1
        rows.append([doc['id'], doc['user_id'], doc['name'], action, (meta or {}).get('id', ''), note])

    for doc in docs:
        base = os.path.basename(doc['file_path'] or '')
        names = []
        for n in (sanitize_filename(base), base, sanitize_filename(doc['name']), doc['name']):
            if n and n not in names:
                names.append(n)
        customer = (doc['customer'] or 'General Client').strip()
        order = f"Order #{doc['order_id']}" if doc['order_id'] else None
        try:
            want_size = int(str(doc['file_size']).strip())
        except (TypeError, ValueError):
            want_size = None

        cands = []
        for n in names:
            cands += index.get((customer, order, n), [])
        if not cands:  # fall back to same customer, any order folder
            for n in names:
                cands += [m for m in by_name.get(n, []) if m['path'][:1] == [customer]]
        if want_size is not None and cands:
            sized = [m for m in cands if str(m.get('size', '')) == str(want_size)]
            if sized:
                cands = sized
            elif all(m.get('size') for m in cands):
                cands = []  # same name but different size → not the same file, don't link
        uniq = {m['id']: m for m in cands}
        cands = list(uniq.values())

        if len(cands) >= 1:
            meta = cands[0]
            note = 'ambiguous: %d candidates, first used' % len(cands) if len(cands) > 1 else ''
            if args.apply:
                conn.execute(
                    "UPDATE documents SET drive_file_id = ?, drive_web_link = ?, file_path = ? "
                    "WHERE id = ? AND COALESCE(drive_file_id, '') = '';",
                    (meta['id'], meta.get('webViewLink'), drive_path(meta), doc['id']))
                conn.commit()
            record(doc, 'MATCH_LINKED' if args.apply else 'MATCH', meta, note)
            continue

        local = local_path_for(doc['file_path'])
        if local:
            if not args.apply:
                record(doc, 'UPLOAD_PENDING', note=local)
                continue
            from googleapiclient.http import MediaFileUpload  # type: ignore
            folder_id = get_customer_folder_id(customer, order_name=order)
            if not folder_id:
                record(doc, 'ERROR', note='could not create Drive folder')
                continue
            fname = sanitize_filename(base or doc['name'])
            media = MediaFileUpload(local, mimetype=doc['file_type'] or 'application/octet-stream', resumable=True)
            up = svc.files().create(
                body={'name': fname, 'parents': [folder_id]}, media_body=media,
                fields='id,name,size,md5Checksum,webViewLink', supportsAllDrives=True).execute()
            if up.get('md5Checksum') and up['md5Checksum'] != md5_of(local):
                record(doc, 'ERROR', up, 'md5 mismatch after upload — NOT linked')
                continue
            path_parts = ['Brixen-CRM', 'Customers', customer] + ([order] if order else []) + [fname]
            conn.execute(
                "UPDATE documents SET drive_file_id = ?, drive_web_link = ?, file_path = ? "
                "WHERE id = ? AND COALESCE(drive_file_id, '') = '';",
                (up['id'], up.get('webViewLink'), '/'.join(path_parts), doc['id']))
            conn.commit()
            record(doc, 'UPLOADED_LINKED', up)
            continue

        record(doc, 'MISSING', note='not on Drive, no local file')

    report = os.path.join(os.path.dirname(DB_PATH), 'drive_sync_report.csv')
    with open(report, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(['doc_id', 'user_id', 'name', 'action', 'drive_file_id', 'note'])
        w.writerows(rows)
    print('Summary:', counts)
    print('Report written to', report)


if __name__ == '__main__':
    main()
