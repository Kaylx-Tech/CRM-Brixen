"""Document Management Routes (/api/documents)
List/upload/download + admin lifecycle (approve / reject / bulk) — app.py parity.
"""
import base64
import collections
import mimetypes
import os
import os as _os
import re
import threading
import uuid
from services.permissions import check_permission
from services.audit_service import log_activity
from config import BASE_DIR, STORAGE_DIR
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response
from services.storage_service import save_client_file, get_file_download_stream, last_download_error
from services.document_lifecycle import (
    LIFECYCLE_STAGES,
    public_document,
    lifecycle_counts,
    list_lifecycle_documents,
    approve_document,
    reject_document,
    reassign_document,
    bulk_approve_sync,
    bulk_quarantine,
    delete_document,
)

_MIME_BY_EXT = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv',
    '.txt': 'text/plain',
}


def _download_filename(doc, mime_type=None):
    """Header-safe filename that keeps (or infers) the real file extension."""
    name = os.path.basename(str(doc.get('name') or 'document').strip()) or 'document'
    name = re.sub(r'[\r\n"\\/]+', '_', name)
    if not os.path.splitext(name)[1]:
        ext = next((e for e, m in _MIME_BY_EXT.items() if m == mime_type), '')
        name += ext
    return name


def _local_document_path(file_path):
    """Resolve a stored file_path to a real file, only inside known storage roots."""
    file_path = str(file_path or '')
    if not file_path:
        return None
    roots = [os.path.realpath(str(BASE_DIR)), os.path.realpath(STORAGE_DIR)]
    candidates = [file_path] if os.path.isabs(file_path) else []
    rel = file_path.lstrip('/\\')
    candidates += [os.path.join(r, rel) for r in roots]
    for cand in candidates:
        real = os.path.realpath(cand)
        if os.path.isfile(real) and any(real == r or real.startswith(r + os.sep) for r in roots):
            return real
    return None


# Small in-memory LRU for Drive files (speeds up repeated views; a Drive round trip costs 1-3 s).
_DRIVE_CACHE = collections.OrderedDict()   # drive_file_id -> (bytes, meta)
_DRIVE_CACHE_BYTES = 0
_DRIVE_CACHE_MAX_BYTES = 64 * 1024 * 1024
_DRIVE_CACHE_MAX_FILE = 12 * 1024 * 1024
_DRIVE_CACHE_LOCK = threading.Lock()


def _drive_bytes_cached(drive_file_id):
    global _DRIVE_CACHE_BYTES
    with _DRIVE_CACHE_LOCK:
        hit = _DRIVE_CACHE.get(drive_file_id)
        if hit:
            _DRIVE_CACHE.move_to_end(drive_file_id)
            return hit
    content_bytes, meta = get_file_download_stream(drive_file_id)
    if content_bytes and len(content_bytes) <= _DRIVE_CACHE_MAX_FILE:
        with _DRIVE_CACHE_LOCK:
            if drive_file_id not in _DRIVE_CACHE:
                _DRIVE_CACHE[drive_file_id] = (content_bytes, meta)
                _DRIVE_CACHE_BYTES += len(content_bytes)
            while _DRIVE_CACHE_BYTES > _DRIVE_CACHE_MAX_BYTES and _DRIVE_CACHE:
                _, (old, _m) = _DRIVE_CACHE.popitem(last=False)
                _DRIVE_CACHE_BYTES -= len(old)
    return content_bytes, meta


def _serve_document(start_response, doc, inline):
    """Stream a document from Drive, then local disk. When neither has it, say why (and give the
    Drive link) instead of redirecting: the CRM loads files with fetch(), and a redirect to Google
    is blocked by the browser and only shows up as "Failed to fetch"."""
    disposition = 'inline' if inline else 'attachment'

    def _respond(content_bytes, mime):
        filename = _download_filename(doc, mime)
        start_response('200 OK', [
            ('Content-Type', mime),
            ('Content-Disposition', f'{disposition}; filename="{filename}"'),
            ('Content-Length', str(len(content_bytes))),
            ('Cache-Control', 'private, max-age=600'),
            ('X-Content-Type-Options', 'nosniff'),
        ])
        return [content_bytes]

    drive_file_id = doc.get('drive_file_id')
    drive_reason = ''
    if drive_file_id:
        content_bytes, meta = _drive_bytes_cached(drive_file_id)
        if content_bytes:
            return _respond(content_bytes, (meta or {}).get('mimeType') or 'application/octet-stream')
        drive_reason = last_download_error()

    local = _local_document_path(doc.get('file_path'))
    if local:
        with open(local, 'rb') as f:
            content_bytes = f.read()
        ext = os.path.splitext(local)[1].lower()
        mime = _MIME_BY_EXT.get(ext) or doc.get('file_type') or 'application/octet-stream'
        return _respond(content_bytes, mime)

    link = doc.get('drive_web_link')
    link = link if isinstance(link, str) and link.startswith('https://') else ''
    if drive_file_id:
        return error_response(start_response, drive_reason or 'Google Drive did not send this file.',
                              status_code=502, details={'drive_web_link': link} if link else None)
    return error_response(start_response, "This file was never uploaded (it is not on Drive or the server).",
                          status_code=404, details={'drive_web_link': link} if link else None)


def handle_document_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/documents endpoints."""
    if not (path.startswith('/api/documents') or path.startswith('/api/admin/documents')):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    user_name = user.get('name') or user.get('full_name') or 'Client'
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    # ── POST /api/admin/documents/relink ───────────────────────────────────
    # Re-attach an original file to an existing document row that lost its file:
    # matches by file name (+ size), uploads to Drive and links it. Never creates a duplicate row.
    if path == '/api/admin/documents/relink' and method == 'POST':
        if not is_staff or not check_permission(user, 'documents.upload'):
            return error_response(start_response, "Access denied", status_code=403)
        data = body or {}
        filename = _os.path.basename(str(data.get('filename') or '').strip())
        file_base64 = data.get('file_base64') or ''
        if not filename or not file_base64:
            return error_response(start_response, "filename and file_base64 are required", status_code=400)
        try:
            file_bytes = base64.b64decode(file_base64)
        except Exception:
            return error_response(start_response, "Invalid base64 file data", status_code=400)
        if not file_bytes or len(file_bytes) > 25 * 1024 * 1024:
            return error_response(start_response, "File is empty or larger than 25 MB", status_code=400)

        clean = re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)
        rows = query_db(
            """
            SELECT d.id, d.name, d.file_path, d.file_size, d.user_id, d.order_id, u.full_name AS customer
            FROM documents d LEFT JOIN users u ON u.id = d.user_id
            WHERE COALESCE(d.drive_file_id, '') = ''
              AND (lower(d.name) IN (lower(?), lower(?))
                   OR lower(d.file_path) LIKE '%/' || lower(?) OR lower(d.file_path) LIKE '%/' || lower(?));
            """,
            (filename, clean, filename, clean)) or []
        if data.get('document_id'):
            rows = [r for r in rows if str(r['id']) == str(data.get('document_id'))]
        if not rows:
            return success_response(start_response, data={"result": "NOT_FOUND", "filename": filename})

        def _size_ok(r):
            try:
                return int(str(r.get('file_size')).strip()) == len(file_bytes)
            except (TypeError, ValueError):
                return False
        def _size_known(r):
            try:
                int(str(r.get('file_size')).strip())
                return True
            except (TypeError, ValueError):
                return False
        sized = [r for r in rows if _size_ok(r)]
        targets = sized
        if not targets and len(rows) == 1:
            if _size_known(rows[0]) and not data.get('force'):
                return success_response(start_response, data={
                    "result": "SIZE_MISMATCH", "filename": filename, "document_id": rows[0]['id'],
                    "customer": rows[0]['customer'], "expected_size": rows[0]['file_size'], "got_size": len(file_bytes)})
            targets = rows
        if not targets:
            return success_response(start_response, data={
                "result": "AMBIGUOUS", "filename": filename,
                "candidates": [{"id": r['id'], "customer": r['customer']} for r in rows[:8]]})

        mime = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        linked = []
        for r in targets:
            res = save_client_file(
                client_id=r['user_id'], customer_name=r['customer'] or 'General Client', filename=filename,
                file_bytes=file_bytes, order_id=r['order_id'], mime_type=mime)
            if not res.get('success'):
                return error_response(start_response, res.get('error') or 'Drive upload failed', status_code=502)
            execute_db(
                "UPDATE documents SET drive_file_id = ?, drive_web_link = ?, file_path = ?, file_size = ? "
                "WHERE id = ? AND COALESCE(drive_file_id, '') = '';",
                (res.get('drive_file_id'), res.get('drive_web_link'), res.get('file_path'),
                 str(len(file_bytes)), r['id']))
            log_activity(user_id, 'DOCUMENT_RELINKED', 'documents', r['id'], f"Re-attached {filename} to Drive")
            linked.append({"id": r['id'], "customer": r['customer']})
        return success_response(start_response, data={"result": "LINKED", "filename": filename, "linked": linked})

    # ── POST /api/admin/documents/intake/process ───────────────────────────
    if path == '/api/admin/documents/intake/process' and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Access denied", status_code=403)
        try:
            from services.smart_intake import process_smart_intake_files

            files_data = []
            batch_identities = []
            source_mode = 'CUSTOMER_UPLOADS'

            if body and body.get('_files'):
                files = body.get('_files', {})
                source_mode = (body.get('source_mode') or 'CUSTOMER_UPLOADS').strip().upper()
                try:
                    batch_identities = json.loads(body.get('batch_identities') or '[]')
                except Exception:
                    batch_identities = []
                upload = files.get('file') or files.get('document')
                if upload and upload.get('bytes'):
                    fname = (body.get('file_name') or '').strip() or upload.get('filename') or 'document.pdf'
                    folder_path = (body.get('folder_path') or fname).strip()
                    files_data = [{
                        'file_name': fname,
                        'folder_path': folder_path,
                        'document_type': (body.get('document_type') or '').strip(),
                        'allowed_types': (body.get('allowed_types') or '').strip(),
                        'hq_ocr': (body.get('hq_ocr') or '1').strip(),
                        'file_content_base64': base64.b64encode(upload['bytes']).decode('ascii'),
                    }]
            else:
                data = body or {}
                files_data = data.get('files') or []
                batch_identities = data.get('batch_identities') or []
                source_mode = (data.get('source_mode') or 'CUSTOMER_UPLOADS').strip().upper()
                top_type = (data.get('document_type') or '').strip()
                if top_type:
                    for item in files_data:
                        if isinstance(item, dict) and not item.get('document_type'):
                            item['document_type'] = top_type
                for item in files_data:
                    if isinstance(item, dict) and item.get('hq_ocr') is None:
                        item['hq_ocr'] = data.get('hq_ocr', '1')

            payload, err_status = process_smart_intake_files(
                files_data, user,
                batch_identities=batch_identities,
                source_mode=source_mode,
            )
            if err_status:
                status_int = 400
                try:
                    status_int = int(err_status.split()[0])
                except Exception:
                    pass
                return error_response(start_response, payload.get('message', 'Intake failed'), status_code=status_int)
            return json_response(start_response, payload)
        except Exception as err:
            return error_response(start_response, f"Smart intake failed: {err}", status_code=500)

    # ── POST /api/admin/documents/intake/link-company ───────────────────────
    if path == '/api/admin/documents/intake/link-company' and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Access denied", status_code=403)
        try:
            from services.smart_intake import auto_import_companies_house_from_intake, normalize_company_number
            data = body or {}
            client_id = data.get('client_id')
            company_id = data.get('company_id')
            company_number = normalize_company_number(data.get('company_number'))
            document_ids = data.get('document_ids') or []
            if not client_id:
                return error_response(start_response, "client_id is required", status_code=400)
            company_obj = None
            if company_id:
                company_obj = query_db("SELECT * FROM companies WHERE id = ?;", (int(company_id),), one=True)
                if company_obj and client_id and not company_obj.get('user_id'):
                    execute_db("UPDATE companies SET user_id = ? WHERE id = ?;", (int(client_id), company_obj['id']))
                    company_obj = query_db("SELECT * FROM companies WHERE id = ?;", (company_obj['id'],), one=True)
            if not company_obj:
                if not company_number:
                    return error_response(start_response, "company_number or company_id is required", status_code=400)
                company_obj = auto_import_companies_house_from_intake(
                    data.get('company_name'),
                    company_number,
                    client_user_id=int(client_id),
                )
            if not company_obj:
                return error_response(start_response, f"Could not import Companies House company #{company_number}", status_code=404)
            linked = 0
            for raw_id in document_ids:
                try:
                    doc_id = int(raw_id)
                except (TypeError, ValueError):
                    continue
                row = query_db("SELECT id, user_id FROM documents WHERE id = ?;", (doc_id,), one=True)
                if not row or int(row['user_id']) != int(client_id):
                    continue
                execute_db("UPDATE documents SET company_id = ? WHERE id = ?;", (company_obj['id'], doc_id))
                linked += 1
            display_num = company_obj.get('companies_house_number') or company_obj.get('company_number') or company_number or ''
            return json_response(start_response, {
                'status': 'success',
                'message': f"Linked to {company_obj.get('name')} (#{display_num})",
                'company': {
                    'id': company_obj['id'],
                    'name': company_obj.get('name'),
                    'company_number': display_num,
                },
                'documents_linked': linked,
            })
        except Exception as err:
            return error_response(start_response, f"Could not link company: {err}", status_code=500)

    # ── GET /api/admin/documents/lifecycle ─────────────────────────────────
    if path == '/api/admin/documents/lifecycle' and method == 'GET':
        if not is_staff:
            return error_response(start_response, "Access denied", status_code=403)
        stage = (query.get('stage') or [''])[0].strip().upper()
        counts = lifecycle_counts()
        documents = list_lifecycle_documents(stage)
        return json_response(start_response, {
            "success": True,
            "status": "success",
            "counts": counts,
            "documents": documents,
            "data": {"counts": counts, "documents": documents},
        })

    # ── POST /api/admin/documents/<id>/approve ─────────────────────────────
    m_appr = re.match(r'^/api/admin/documents/(\d+)/approve$', path)
    if m_appr and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Access denied", status_code=403)
        doc_id = int(m_appr.group(1))
        updated, err = approve_document(doc_id, user)
        if err:
            code = 404 if err == "Document not found" else 500
            return error_response(start_response, err, status_code=code)
        return json_response(start_response, {
            "success": True,
            "status": "success",
            "message": f"Document '{(updated or {}).get('name') or doc_id}' approved and posted.",
            "document": updated,
            "data": {"document": updated},
        })

    # ── POST /api/admin/documents/<id>/reject ──────────────────────────────
    m_rej = re.match(r'^/api/admin/documents/(\d+)/reject$', path)
    if m_rej and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Access denied", status_code=403)
        doc_id = int(m_rej.group(1))
        reason = ((body or {}).get('reason') or 'Rejected by staff')
        ok, err = reject_document(doc_id, user, reason)
        if not ok:
            return error_response(start_response, err or "Reject failed", status_code=404)
        return json_response(start_response, {
            "success": True,
            "status": "success",
            "message": "Document moved to Quarantine.",
        })

    # ── POST /api/admin/documents/<id>/reassign ────────────────────────────
    m_reassign = re.match(r'^/api/admin/documents/(\d+)/reassign$', path)
    if m_reassign and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Access denied", status_code=403)
        doc_id = int(m_reassign.group(1))
        updated, err = reassign_document(doc_id, user, body or {})
        if err:
            code = 404 if "not found" in err.lower() else 400
            return error_response(start_response, err, status_code=code)
        return json_response(start_response, {
            "success": True,
            "status": "success",
            "message": "Document reassigned.",
            "document": updated,
            "data": {"document": updated},
        })

    # ── POST /api/admin/documents/bulk-approve ─────────────────────────────
    if path == '/api/admin/documents/bulk-approve' and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Access denied", status_code=403)
        doc_ids = (body or {}).get('document_ids') or []
        override = bool((body or {}).get('override_review_required'))
        if not doc_ids:
            return error_response(start_response, "No document_ids provided", status_code=400)
        result = bulk_approve_sync(doc_ids, user, override=override)
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        try:
            execute_db(
                """
                INSERT INTO bulk_approval_jobs (
                    job_id, user_id, total_count, status, approved_count, failed_count, skipped_count, completed_at
                ) VALUES (?, ?, ?, 'COMPLETED', ?, ?, ?, CURRENT_TIMESTAMP);
                """,
                (
                    job_id,
                    user_id,
                    len(doc_ids),
                    result["approved"],
                    result["failed"],
                    result["skipped"],
                ),
            )
        except Exception:
            pass
        return json_response(start_response, {
            "success": True,
            "status": "success",
            "job_id": job_id,
            "total": len(doc_ids),
            "message": (
                f"Bulk approve finished: {result['approved']} approved, "
                f"{result['skipped']} skipped, {result['failed']} failed."
            ),
            "result": result,
            "data": {"job_id": job_id, "result": result},
        })

    # ── GET /api/admin/documents/bulk-jobs/<id> ────────────────────────────
    m_job = re.match(r'^/api/admin/documents/bulk-jobs/([a-zA-Z0-9_\-]+)$', path)
    if m_job and method == 'GET':
        if not is_staff:
            return error_response(start_response, "Access denied", status_code=403)
        job = query_db(
            "SELECT * FROM bulk_approval_jobs WHERE job_id = ?;",
            (m_job.group(1),),
            one=True,
        )
        if not job:
            return error_response(start_response, "Job not found", status_code=404)
        return json_response(start_response, {
            "success": True,
            "status": "success",
            "job": dict(job),
            "data": {"job": dict(job)},
        })

    # ── POST /api/admin/documents/bulk-quarantine ──────────────────────────
    if path == '/api/admin/documents/bulk-quarantine' and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Access denied", status_code=403)
        doc_ids = (body or {}).get('document_ids') or []
        reason = (body or {}).get('reason') or 'Bulk quarantined by staff'
        moved = bulk_quarantine(doc_ids, user, reason)
        return json_response(start_response, {
            "success": True,
            "status": "success",
            "moved": moved,
            "message": f"Moved {moved} document(s) to Quarantine.",
            "data": {"moved": moved},
        })

    # ── DELETE /api/admin/documents/<id> ───────────────────────────────────
    m_del = re.match(r'^/api/admin/documents/(\d+)$', path)
    if m_del and method == 'DELETE':
        if not is_staff:
            return error_response(start_response, "Access denied", status_code=403)
        ok, err = delete_document(int(m_del.group(1)))
        if not ok:
            return error_response(start_response, err or "Delete failed", status_code=404)
        return success_response(start_response, message="Document deleted.")

    # ── GET /api/documents (List Documents) ────────────────────────────────
    if path in ('/api/documents', '/api/admin/documents') and method == 'GET':
        client_id = (query.get('client_id') or [''])[0].strip()
        order_id = (query.get('order_id') or [''])[0].strip()
        doc_type = (query.get('document_type') or [''])[0].strip()
        company_id = (query.get('company_id') or [''])[0].strip()

        params = []
        conditions = []

        if not is_staff:
            conditions.append("d.user_id = ? AND COALESCE(d.client_visible, 0) = 1")
            params.append(user_id)
        elif client_id:
            conditions.append("d.user_id = ?")
            params.append(client_id)

        if order_id:
            conditions.append("d.order_id = ?")
            params.append(order_id)

        if company_id:
            conditions.append("d.company_id = ?")
            params.append(company_id)

        if doc_type:
            conditions.append("d.category = ?")
            params.append(doc_type)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        rows = query_db(f"""
            SELECT d.*, u.full_name as client_name, u.email as client_email,
                   o.order_number, c.name as company_name, c.company_number
            FROM documents d
            LEFT JOIN users u ON d.user_id = u.id
            LEFT JOIN orders o ON d.order_id = o.id
            LEFT JOIN companies c ON d.company_id = c.id
            {where_clause}
            ORDER BY d.created_at DESC;
        """, params)

        return success_response(
            start_response,
            data=[public_document(r) for r in (rows or [])],
        )

    # ── POST /api/documents | /api/documents/upload | /api/admin/documents ─
    if path in (
        '/api/documents',
        '/api/documents/upload',
        '/api/admin/documents',
        '/api/admin/documents/upload',
    ) and method == 'POST':
        data = body or {}
        # Staff deliver from Documents Review uses client_id + name + file_content_base64
        client_id = data.get('client_id') or data.get('user_id')
        try:
            client_id = int(client_id) if client_id not in (None, '') else None
        except (TypeError, ValueError):
            client_id = None

        company_id = data.get('company_id')
        order_id = data.get('order_id')
        try:
            company_id = int(company_id) if company_id not in (None, '') else None
        except (TypeError, ValueError):
            company_id = None
        try:
            order_id = int(order_id) if order_id not in (None, '') else None
        except (TypeError, ValueError):
            order_id = None

        if is_staff and not client_id and company_id:
            company_owner = query_db(
                "SELECT user_id FROM companies WHERE id = ?;", (company_id,), one=True
            )
            if company_owner:
                try:
                    client_id = int(company_owner.get('user_id'))
                except (TypeError, ValueError):
                    client_id = None

        doc_name = (
            (data.get('name') or data.get('title') or data.get('filename') or data.get('file_name') or '')
            .strip()
            or 'Staff_Document.pdf'
        )
        category = (data.get('category') or data.get('document_type') or 'Order Documents').strip() or 'Order Documents'
        client_message = (data.get('client_message') or data.get('description') or '').strip()
        file_base64 = (
            data.get('file_content_base64')
            or data.get('file_data')
            or data.get('file_base64')
            or ''
        )
        upload_filename = (data.get('file_name') or data.get('original_filename') or doc_name).strip()
        mime_type = data.get('mime_type', 'application/pdf')

        if not is_staff:
            client_id = user_id

        if is_staff and path.startswith('/api/admin/documents') and not client_id:
            return error_response(start_response, "Select a customer first.", status_code=400)

        if not file_base64:
            return error_response(start_response, "file_content_base64 is required", status_code=400)

        if isinstance(file_base64, str) and ',' in file_base64 and file_base64.strip().startswith('data:'):
            file_base64 = file_base64.split(',', 1)[1]

        try:
            file_bytes = base64.b64decode(file_base64)
        except Exception:
            return error_response(start_response, "Invalid base64 file data", status_code=400)

        target_client = None
        if client_id:
            target_client = query_db(
                "SELECT id, full_name, email FROM users WHERE id = ? LIMIT 1;",
                (client_id,),
                one=True,
            )
            if not target_client:
                return error_response(start_response, "Client not found", status_code=404)

        target_user_id = (target_client['id'] if target_client else user_id)
        target_user_name = (
            (target_client['full_name'] if target_client else None)
            or data.get('customer_name')
            or user_name
        )

        if order_id and not company_id:
            ord_row = query_db("SELECT company_id FROM orders WHERE id = ?;", (order_id,), one=True)
            if ord_row and ord_row.get('company_id'):
                try:
                    company_id = int(ord_row['company_id'])
                except (TypeError, ValueError):
                    pass

        client_visible_flag = 1
        if 'client_visible' in data:
            cv_val = data.get('client_visible')
            if cv_val is False or cv_val == 0 or str(cv_val).lower() in ('0', 'false', 'off', 'no'):
                client_visible_flag = 0
        if not is_staff:
            # Customer uploads wait for staff review (old portal); they are not auto-approved
            client_visible_flag = 0

        # Staff intentional delivery posts immediately (app.py parity)
        staff_post_now = is_staff and category not in ('Checkout Upload',) and (
            data.get('post_immediately') in (True, 1, '1', 'true', 'True')
            or category in (
                'Posted Documents',
                'Order Documents',
                'Certificate of Incorporation',
                'Memorandum & Articles',
                'Share Certificate',
            )
            or client_visible_flag == 1
            or (data.get('lifecycle_status') or '') == 'POSTED_DOCUMENTS'
        )
        lifecycle = 'POSTED_DOCUMENTS' if staff_post_now else 'READY_FOR_APPROVAL'
        is_posted = 1 if staff_post_now else 0
        review_notes = (
            (data.get('review_notes') or '').strip()
            or ('Delivered to client portal' if client_visible_flag else 'Internal staff document')
        )
        if client_message:
            review_notes = f"{review_notes}. Message: {client_message}"[:500]

        res = save_client_file(
            client_id=target_user_id,
            customer_name=target_user_name,
            filename=upload_filename,
            file_bytes=file_bytes,
            order_id=order_id,
            mime_type=mime_type,
        )

        if not res.get('success'):
            return error_response(
                start_response,
                message=res.get('error', 'Failed to upload to Google Drive'),
                status_code=500,
            )

        drive_path = res.get('file_path')
        file_size = res.get('file_size')
        clean_title = (data.get('name') or '').strip() or res.get('title') or upload_filename
        drive_file_id = res.get('drive_file_id')
        drive_web_link = res.get('drive_web_link')

        doc_id = execute_db("""
            INSERT INTO documents (
                name, category, file_path, file_type, file_size,
                user_id, order_id, company_id, uploaded_by,
                drive_file_id, drive_web_link, lifecycle_status, is_posted,
                client_visible, status, review_notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));
        """, (
            clean_title, category, drive_path, mime_type, str(file_size),
            target_user_id, order_id, company_id, user_name,
            drive_file_id, drive_web_link, lifecycle, is_posted,
            client_visible_flag, 'Approved' if is_posted else 'Pending Review', review_notes,
        ))

        # Tell the customer: a document shared with them, or confirmation of their own upload
        mail = {'notification_created': False, 'email_sent': False, 'email_status': 'not_applicable'}
        if is_staff and client_visible_flag and target_client and target_user_id != user_id:
            from services.client_mail import notify_document_available
            mail = notify_document_available(doc_id, client_message or None, triggered_by=user_id) or mail
        elif not is_staff:
            from services.client_mail import notify_customer_upload_received
            mail = notify_customer_upload_received(user_id, clean_title) or mail

        msg = (
            'Document uploaded successfully.'
            if client_visible_flag
            else 'Document stored. It is saved as an internal document and not visible to the client.'
        )
        if res.get('stored_locally') and is_staff:
            msg += (' Google Drive could not be reached, so the file is kept on the server for now '
                    '(run the Drive sync later). Check Settings > Integrations > Test Google Drive.')
        return json_response(start_response, {
            "success": True,
            "status": "success",
            "message": msg,
            "notification_created": bool(mail.get('notification_created')),
            "email_sent": bool(mail.get('email_sent')),
            "email_status": mail.get('email_status'),
            "document": {"id": doc_id, "name": clean_title, "category": category},
            "data": {
                "id": doc_id,
                "title": clean_title,
                "name": clean_title,
                "google_drive_path": drive_path,
                "google_drive_link": drive_web_link,
                "drive_file_id": drive_file_id,
                "file_size": file_size,
            },
        }, status_code=201)

    # ── GET /api/documents/<id>/download | /view ───────────────────────────
    match_file = re.match(r'^/api/(?:admin/)?documents/(\d+)/(download|view)$', path)
    if match_file and method == 'GET':
        doc_id = int(match_file.group(1))
        inline = match_file.group(2) == 'view'

        doc_row = query_db("SELECT * FROM documents WHERE id = ? LIMIT 1;", (doc_id,), one=True)
        if not doc_row:
            return error_response(start_response, "Document not found", status_code=404)
        doc = dict(doc_row)

        if not is_staff and (doc.get('user_id') != user_id or int(doc.get('client_visible') or 0) != 1):
            # Customers only open documents that were shared with them (not internal files)
            return error_response(start_response, "Access denied", status_code=403)

        return _serve_document(start_response, doc, inline=inline)


    return None
