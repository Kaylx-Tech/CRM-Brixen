"""Pure Google Drive Cloud Storage Service
Zero local disk footprint — all files and documents stream directly to/from 5TB Google Drive.

Folder Structure:
  Brixen-CRM
  └── customer
      └── <Customer Name>
          └── <files & documents>
"""
import re
from pathlib import Path
from services.google_drive_service import (
    upload_file_to_google_drive,
    get_drive_service,
    is_drive_configured
)

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

def save_client_file(client_id, customer_name, filename, file_bytes, order_id=None, mime_type=None, order_name=None):
    """Upload directly to Google Drive 5TB storage with zero local disk storage.
    Path on Drive: Brixen-CRM/Customers/<customer_name>/[<order_name>/]<filename>
    """
    clean_name = sanitize_filename(filename)
    mime_type = mime_type or 'application/octet-stream'
    
    order_folder = order_name or (f"Order #{order_id}" if order_id else None)

    # Stream direct to Google Drive
    drive_res = upload_file_to_google_drive(
        customer_name=customer_name,
        filename=clean_name,
        file_bytes=file_bytes,
        mime_type=mime_type,
        order_name=order_folder
    )
    
    if not drive_res.get('success'):
        return {
            "success": False,
            "title": clean_name,
            "file_size": len(file_bytes),
            "mime_type": mime_type,
            "error": drive_res.get('message') or drive_res.get('error', 'Google Drive upload failed.')
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
    """Stream a file directly from Google Drive for client download/viewing."""
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
