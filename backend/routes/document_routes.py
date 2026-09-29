"""Document Management Routes (/api/documents)
100% Cloud-Powered via Google Drive 5TB Storage.
"""
import base64
import re
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response
from services.storage_service import save_client_file, get_file_download_stream

def handle_document_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/documents endpoints."""
    if not path.startswith('/api/documents'):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    user_name = user.get('name', 'Client')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    # ── GET /api/documents (List Documents) ────────────────────────────────
    if path == '/api/documents' and method == 'GET':
        client_id = (query.get('client_id') or [''])[0].strip()
        order_id = (query.get('order_id') or [''])[0].strip()
        doc_type = (query.get('document_type') or [''])[0].strip()

        params = []
        conditions = []

        if not is_staff:
            conditions.append("d.user_id = ?")
            params.append(user_id)
        elif client_id:
            conditions.append("d.user_id = ?")
            params.append(client_id)

        if order_id:
            conditions.append("d.order_id = ?")
            params.append(order_id)

        if doc_type:
            conditions.append("d.category = ?")
            params.append(doc_type)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        rows = query_db(f"""
            SELECT d.*, u.full_name as client_name, o.order_number
            FROM documents d
            LEFT JOIN users u ON d.user_id = u.id
            LEFT JOIN orders o ON d.order_id = o.id
            {where_clause}
            ORDER BY d.created_at DESC;
        """, params)

        return success_response(start_response, data=[dict(r) for r in rows])

    # ── POST /api/documents/upload (Upload directly to Google Drive) ───────
    if path == '/api/documents/upload' and method == 'POST':
        filename = body.get('filename') or body.get('title')
        file_base64 = body.get('file_data') or body.get('file_base64')
        mime_type = body.get('mime_type', 'application/pdf')
        doc_type = body.get('document_type', 'KYC')
        target_user_id = (body.get('user_id') or user_id) if is_staff else user_id
        target_user_name = (body.get('customer_name') or user_name) if is_staff else user_name
        order_id = body.get('order_id')
        company_id = body.get('company_id')

        if not filename or not file_base64:
            return error_response(start_response, "filename and file_data (base64) are required", status_code=400)

        try:
            file_bytes = base64.b64decode(file_base64)
        except Exception:
            return error_response(start_response, "Invalid base64 file data", status_code=400)

        # Upload directly to Google Drive (Zero local storage)
        res = save_client_file(
            client_id=target_user_id,
            customer_name=target_user_name,
            filename=filename,
            file_bytes=file_bytes,
            order_id=order_id,
            mime_type=mime_type
        )

        if not res.get('success'):
            return error_response(start_response, message=res.get('error', 'Failed to upload to Google Drive'), status_code=500)

        # Save record in Database (column names must match the `documents` schema)
        drive_path = res.get('file_path')
        file_size = res.get('file_size')
        clean_title = res.get('title')
        drive_file_id = res.get('drive_file_id')
        drive_web_link = res.get('drive_web_link')

        doc_id = execute_db("""
            INSERT INTO documents (
                name, category, file_path, file_type, file_size,
                user_id, order_id, company_id, uploaded_by,
                drive_file_id, drive_web_link, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'));
        """, (clean_title, doc_type, drive_path, mime_type, str(file_size),
              target_user_id, order_id, company_id, user_name,
              drive_file_id, drive_web_link))

        return success_response(start_response, data={
            "id": doc_id,
            "title": clean_title,
            "google_drive_path": drive_path,
            "google_drive_link": drive_web_link,
            "drive_file_id": drive_file_id,
            "file_size": file_size
        }, message="Document uploaded directly to Google Drive.", status_code=201)

    # ── GET /api/documents/<id>/download (Stream from Google Drive) ────────
    match_download = re.match(r'^/api/documents/(\d+)/download$', path)
    if match_download and method == 'GET':
        doc_id = int(match_download.group(1))

        doc = query_db("SELECT * FROM documents WHERE id = ? LIMIT 1;", (doc_id,), one=True)
        if not doc:
            return error_response(start_response, "Document not found", status_code=404)

        if not is_staff and doc['user_id'] != user_id:
            return error_response(start_response, "Access denied", status_code=403)

        # Stream directly from Google Drive
        drive_file_id = doc.get('drive_file_id')
        if drive_file_id:
            content_bytes, meta = get_file_download_stream(drive_file_id)
            if content_bytes:
                start_response('200 OK', [
                    ('Content-Type', meta.get('mimeType', 'application/octet-stream')),
                    ('Content-Disposition', f'attachment; filename="{doc.get("name") or "document"}"'),
                    ('Content-Length', str(len(content_bytes)))
                ])
                return [content_bytes]

        return success_response(start_response, data=dict(doc))

    return None
