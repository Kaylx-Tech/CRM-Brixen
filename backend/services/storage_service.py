"""Pure Google Drive Cloud Storage Service
Zero local disk footprint — all files and documents stream directly to/from 5TB Google Drive.

Folder Structure:
  Brixen-CRM
  └── customer
      └── <Customer Name>
          └── <files & documents>
"""
import os
import re
import uuid
from pathlib import Path
from services.google_drive_service import (
    upload_file_to_google_drive,
    get_drive_service,
    is_drive_configured
)
from services import r2_storage

ALLOWED_EXTENSIONS = {
    '.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx',
    '.xls', '.xlsx', '.csv', '.zip', '.txt'
}

def sanitize_filename(filename):
    """Sanitize uploaded filenames to prevent unsafe characters."""
    clean = re.sub(r'[^a-zA-Z0-9_.-]', '_', str(filename or 'document.pdf'))
    clean = re.sub(r'_+', '_', clean)
    return clean

def is_allowed_file(filename):
    ext = Path(filename).suffix.lower()
    return ext in ALLOWED_EXTENSIONS

def _save_local_copy(client_id, order_id, clean_name, file_bytes):
    """Write the file under STORAGE_DIR/[workspaces/<workspace>/]customer_uploads/<client>/<order|general>/ and
    return its relative path (Finstap: each company's files in its own folder, as on Drive)."""
    from config import STORAGE_DIR
    from services.google_drive_service import workspace_folder_name
    sub = os.path.join('customer_uploads', str(client_id or 'unassigned'), f"order_{order_id}" if order_id else 'general')
    if workspace_folder_name():
        sub = os.path.join('workspaces', workspace_folder_name(), sub)
    folder = os.path.join(STORAGE_DIR, sub)
    os.makedirs(folder, exist_ok=True)
    name = f"{uuid.uuid4().hex[:10]}_{clean_name}"
    with open(os.path.join(folder, name), 'wb') as fh:
        fh.write(file_bytes)
    return os.path.join(sub, name).replace('\\', '/')


def save_client_file(client_id, customer_name, filename, file_bytes, order_id=None, mime_type=None, order_name=None):
    """Upload directly to Google Drive 5TB storage with zero local disk storage.
    Path on Drive: Brixen-CRM/Customers/<customer_name>/[<order_name>/]<filename>
    """
    clean_name = sanitize_filename(filename)
    mime_type = mime_type or 'application/octet-stream'
    
    order_folder = order_name or (f"Order #{order_id}" if order_id else None)

    if r2_storage.is_configured():
        # Cloudflare R2 (Finstap): private bucket, the company's own prefix
        key = r2_storage.object_key(customer_name, order_folder, clean_name)
        r2_res = r2_storage.upload(key, file_bytes, mime_type)
        if r2_res.get('success'):
            return {
                "success": True,
                "title": clean_name,
                "file_size": len(file_bytes),
                "mime_type": mime_type,
                "file_path": key,
                "drive_file_id": r2_res['ref'],
                "drive_web_link": None,
                "drive_download_link": None,
            }
        drive_res = {'success': False, 'error': f"R2: {r2_res.get('error')}"}
    else:
        # Stream direct to Google Drive
        drive_res = upload_file_to_google_drive(
            customer_name=customer_name,
            filename=clean_name,
            file_bytes=file_bytes,
            mime_type=mime_type,
            order_name=order_folder
        )

    if not drive_res.get('success'):
        # Never lose an upload because R2 / Drive is down or its token expired: keep the file on the server's
        # persistent storage; scripts/r2_sync.py (or drive_sync.py) moves it later (rows without a drive_file_id).
        drive_error = drive_res.get('message') or drive_res.get('error') or 'Google Drive upload failed.'
        print(f"[Storage] Drive upload failed ({drive_error}); saving {clean_name} locally")
        try:
            local_rel = _save_local_copy(client_id, order_id, clean_name, file_bytes)
        except OSError as exc:
            return {
                "success": False,
                "title": clean_name,
                "file_size": len(file_bytes),
                "mime_type": mime_type,
                "error": f"Upload failed: Google Drive ({drive_error}) and local storage ({exc}) are both unavailable."
            }
        return {
            "success": True,
            "title": clean_name,
            "file_size": len(file_bytes),
            "mime_type": mime_type,
            "file_path": local_rel,
            "drive_file_id": None,
            "drive_web_link": None,
            "drive_download_link": None,
            "stored_locally": True,
            "drive_error": drive_error,
        }

    return {
        "success": True,
        "title": clean_name,
        "file_size": len(file_bytes),
        "mime_type": mime_type,
        "file_path": drive_res.get('folder_path'),
        "drive_file_id": drive_res.get('drive_file_id'),
        "drive_web_link": drive_res.get('webViewLink'),
        "drive_download_link": drive_res.get('webContentLink')
    }

def get_file_download_stream(file_id):
    """Stream a file directly from Google Drive (or R2 for "r2:<key>") for client download/viewing."""
    if r2_storage.is_r2_ref(file_id):
        return r2_storage.download(file_id)
    service = get_drive_service()
    if not service:
        return None, None

    try:
        from googleapiclient.http import MediaIoBaseDownload  # type: ignore
        import io

        file_meta = service.files().get(fileId=file_id, fields='name, mimeType, size').execute()
        request = service.files().get_media(fileId=file_id)
        
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            status, done = downloader.next_chunk()

        fh.seek(0)
        return fh.read(), file_meta
    except Exception as e:
        print(f"[Google Drive Download Error] {e}")
        return None, None
