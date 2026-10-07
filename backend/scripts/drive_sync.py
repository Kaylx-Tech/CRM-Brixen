#!/usr/bin/env python3
"""Reconcile CRM documents with Google Drive — safe, resumable, never deletes anything.

For every document without a drive_file_id:
  MATCH    the file is already on Drive (e.g. an interrupted upload) -> link it after a size check
  UPLOAD   not on Drive but a local copy exists -> upload, verify MD5, then link
  MISSING  neither on Drive nor on disk -> listed in the report for a manual decision

Run (inside the backend container terminal):
  python /app/scripts/drive_sync.py                      # report only, changes nothing
  python /app/scripts/drive_sync.py --apply --limit 5    # try on 5 documents first
  python /app/scripts/drive_sync.py --apply              # everything (safe to re-run / resume)

Long runs (survive a closed terminal) and live progress:
  nohup python /app/scripts/drive_sync.py --apply > /app/data/drive_sync.log 2>&1 &
  tail -f /app/data/drive_sync.log

Files written next to the database: drive_sync_report.csv, drive_sync_progress.json
Only the three Drive columns of `documents` are written, and only where drive_file_id is empty.
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time

APP_DIR = '/app' if os.path.isdir('/app/services') else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP_DIR)

from db import DB_PATH, get_db, query_db  # noqa: E402
from services.google_drive_service import get_drive_service, get_customer_folder_id  # noqa: E402
from services.storage_service import sanitize_filename  # noqa: E402

FOLDER_MIME = 'application/vnd.google-apps.folder'
STORAGE_ROOTS = [p for p in (os.environ.get('STORAGE_PATH'), '/app/storage', '/var/www/brixen-crm/storage') if p]
OUT_DIR = os.path.dirname(DB_PATH)
PROGRESS_FILE = os.path.join(OUT_DIR, 'drive_sync_progress.json')


def fmt_time(sec):
    sec = int(max(sec, 0))
    return f"{sec // 3600:d}:{sec % 3600 // 60:02d}:{sec % 60:02d}" if sec >= 3600 else f"{sec // 60:d}:{sec % 60:02d}"


def human(n):
    n = float(n or 0)
    for unit in ('B', 'KB', 'MB', 'GB'):
        if n < 1024 or unit == 'GB':
            return f"{n:.0f} {unit}" if unit == 'B' else f"{n:.1f} {unit}"
        n /= 1024


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
    index, by_name = {}, {}
    customers = root_id
    for f in list_children(svc, root_id):
        if f['mimeType'] == FOLDER_MIME and f['name'] == 'Customers':
            customers = f['id']
    stack, folders, files = [(customers, [])], 0, 0
    while stack:
        fid, path = stack.pop()
        for f in list_children(svc, fid):
            if f['mimeType'] == FOLDER_MIME:
                folders += 1
                stack.append((f['id'], path + [f['name']]))
                if folders % 50 == 0:
                    print(f"  ...scanned {folders} Drive folders, {files} files so far", flush=True)
                continue
            files += 1
            meta = dict(f, path=path)
            index.setdefault((path[0] if path else None, path[1] if len(path) > 1 else None, f['name']), []).append(meta)
            by_name.setdefault(f['name'], []).append(meta)
    return index, by_name, folders, files


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
    mode = 'APPLY' if args.apply else 'REPORT ONLY (nothing is changed)'

    print('=' * 70)
    print(f' Brixen CRM  ->  Google Drive document sync   |   mode: {mode}')
    print('=' * 70, flush=True)

    svc = get_drive_service()
    if not svc:
        sys.exit('Google Drive is not configured (GOOGLE_* env missing).')
    root_id = (os.environ.get('GOOGLE_DRIVE_FOLDER_ID') or '').strip()
    if not root_id:
        sys.exit('GOOGLE_DRIVE_FOLDER_ID is required.')
    try:
        about = svc.about().get(fields='user(emailAddress)').execute()
        print(f"Drive account: {about['user']['emailAddress']}")
        print('Step 1/2: scanning Drive (Brixen-CRM/Customers) ...', flush=True)
        index, by_name, folders, files = build_drive_index(svc, root_id)
    except Exception as exc:  # noqa: BLE001
        if 'invalid_grant' in str(exc) or 'RefreshError' in type(exc).__name__:
            sys.exit('Google token expired/revoked (invalid_grant). Update GOOGLE_REFRESH_TOKEN in Coolify and redeploy.')
        raise
    print(f"  Drive has {files} files in {folders} folders.\n", flush=True)

    docs = query_db(
        """SELECT d.id, d.user_id, d.order_id, d.name, d.file_path, d.file_size, d.file_type, u.full_name AS customer
           FROM documents d LEFT JOIN users u ON u.id = d.user_id
           WHERE COALESCE(d.drive_file_id, '') = '' ORDER BY d.id;""") or []
    if args.limit:
        docs = docs[:args.limit]
    total = len(docs)
    print(f"Step 2/2: processing {total} documents that are not linked to Drive yet\n", flush=True)

    conn = get_db()
    rows, counts, moved_bytes = [], {}, 0
    t0 = time.time()

    def write_progress(i, current, finished=False):
        try:
            with open(PROGRESS_FILE, 'w', encoding='utf-8') as fh:
                json.dump({'mode': 'apply' if args.apply else 'report', 'total': total, 'done': i, 'counts': counts,
                           'current': current, 'elapsed_sec': int(time.time() - t0), 'finished': finished,
                           'updated_at': time.strftime('%Y-%m-%d %H:%M:%S')}, fh)
        except OSError:
            pass

    def record(i, doc, action, meta=None, note='', size=0):
        counts[action] = counts.get(action, 0) + 1
        rows.append([doc['id'], doc['user_id'], doc['name'], action, (meta or {}).get('id', ''), note])
        elapsed = time.time() - t0
        eta = elapsed / i * (total - i) if i else 0
        label = (doc['name'] or '')[:46]
        extra = f" ({human(size)})" if size else ''
        print(f"[{i}/{total}] {i / total * 100:5.1f}%  {action:<15} #{doc['id']:<6} {label}{extra}"
              f"   | elapsed {fmt_time(elapsed)}  ETA {fmt_time(eta)}", flush=True)
        write_progress(i, label)

    for i, doc in enumerate(docs, 1):
        try:
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
            if not cands:  # same customer, any order folder
                for n in names:
                    cands += [m for m in by_name.get(n, []) if m['path'][:1] == [customer]]
            if want_size is not None and cands:
                sized = [m for m in cands if str(m.get('size', '')) == str(want_size)]
                if sized:
                    cands = sized
                elif all(m.get('size') for m in cands):
                    cands = []  # same name, different size -> not the same file
            cands = list({m['id']: m for m in cands}.values())

            if cands:
                meta = cands[0]
                note = f'ambiguous: {len(cands)} candidates, first used' if len(cands) > 1 else ''
                if args.apply:
                    conn.execute(
                        "UPDATE documents SET drive_file_id = ?, drive_web_link = ?, file_path = ? "
                        "WHERE id = ? AND COALESCE(drive_file_id, '') = '';",
                        (meta['id'], meta.get('webViewLink'), drive_path(meta), doc['id']))
                    conn.commit()
                record(i, doc, 'MATCH_LINKED' if args.apply else 'MATCH', meta, note, int(meta.get('size') or 0))
                continue

            local = local_path_for(doc['file_path'])
            if not local:
                record(i, doc, 'MISSING', note='not on Drive, no local file')
                continue
            size = os.path.getsize(local)
            if not args.apply:
                record(i, doc, 'UPLOAD_PENDING', note=local, size=size)
                continue

            from googleapiclient.http import MediaFileUpload  # type: ignore
            folder_id = get_customer_folder_id(customer, order_name=order)
            if not folder_id:
                record(i, doc, 'ERROR', note='could not create Drive folder')
                continue
            fname = sanitize_filename(base or doc['name'])
            print(f"   uploading {fname} -> Brixen-CRM/Customers/{customer}/{order or ''} ...", flush=True)
            media = MediaFileUpload(local, mimetype=doc['file_type'] or 'application/octet-stream', resumable=True)
            up = svc.files().create(
                body={'name': fname, 'parents': [folder_id]}, media_body=media,
                fields='id,name,size,md5Checksum,webViewLink', supportsAllDrives=True).execute()
            if up.get('md5Checksum') and up['md5Checksum'] != md5_of(local):
                record(i, doc, 'ERROR', up, 'md5 mismatch after upload - NOT linked')
                continue
            path_parts = ['Brixen-CRM', 'Customers', customer] + ([order] if order else []) + [fname]
            conn.execute(
                "UPDATE documents SET drive_file_id = ?, drive_web_link = ?, file_path = ? "
                "WHERE id = ? AND COALESCE(drive_file_id, '') = '';",
                (up['id'], up.get('webViewLink'), '/'.join(path_parts), doc['id']))
            conn.commit()
            moved_bytes += size
            record(i, doc, 'UPLOADED_LINKED', up, size=size)
        except KeyboardInterrupt:
            print('\nStopped by user. Re-run the same command to continue (already linked documents are skipped).')
            break
        except Exception as exc:  # noqa: BLE001 - one bad file must not stop the whole run
            record(i, doc, 'ERROR', note=str(exc)[:160])

    report = os.path.join(OUT_DIR, 'drive_sync_report.csv')
    with open(report, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(['doc_id', 'user_id', 'name', 'action', 'drive_file_id', 'note'])
        w.writerows(rows)
    write_progress(len(rows), '', finished=True)
    print('\n' + '=' * 70)
    print(' SUMMARY', counts)
    print(f" uploaded {human(moved_bytes)} | time {fmt_time(time.time() - t0)}")
    print(f" report: {report}")
    print('=' * 70)


if __name__ == '__main__':
    main()
