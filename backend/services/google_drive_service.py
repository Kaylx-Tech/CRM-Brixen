"""Brixen CRM - Google Drive 5TB Storage Integration Service
Supports direct .env (GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SERVICE_ACCOUNT_BASE64)
without needing any local JSON file.

Folder Hierarchy:
  Brixen-CRM
  └── customer
      └── <Customer Name>
          └── <files & documents>
"""
import os
import io
import json
import base64
import logging
from pathlib import Path
from config import BASE_DIR

logger = logging.getLogger("GoogleDriveService")

SCOPES = ['https://www.googleapis.com/auth/drive']

_drive_service_instance = None
_folder_cache = {}

def get_drive_service():
    """Initialize and return authorized Google Drive v3 API service from .env or file."""
    global _drive_service_instance
    if _drive_service_instance is not None:
        return _drive_service_instance

    try:
        from google.oauth2 import service_account  # type: ignore
        from googleapiclient.discovery import build  # type: ignore
    except (ImportError, ModuleNotFoundError):
        logger.warning("google-api-python-client is not installed.")
        return None

    credentials = None

    # 1. From .env as direct JSON string (GOOGLE_SERVICE_ACCOUNT_JSON)
    raw_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON', '').strip()
    if raw_json:
        try:
            info = json.loads(raw_json)
            credentials = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
        except Exception as e:
            logger.error(f"Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON from .env: {e}")

    # 2. From .env as Base64 string (GOOGLE_SERVICE_ACCOUNT_BASE64)
    if credentials is None:
        raw_b64 = os.environ.get('GOOGLE_SERVICE_ACCOUNT_BASE64', '').strip()
        if raw_b64:
            try:
                decoded = base64.b64decode(raw_b64).decode('utf-8')
                info = json.loads(decoded)
                credentials = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
            except Exception as e:
                logger.error(f"Failed to parse GOOGLE_SERVICE_ACCOUNT_BASE64 from .env: {e}")

    # 3. From file path (GOOGLE_SERVICE_ACCOUNT_PATH or credentials/google_service_account.json)
    if credentials is None:
        path_candidate = os.environ.get('GOOGLE_SERVICE_ACCOUNT_PATH') or str(BASE_DIR / 'credentials' / 'google_service_account.json')
        if os.path.exists(path_candidate):
            try:
                credentials = service_account.Credentials.from_service_account_file(path_candidate, scopes=SCOPES)
            except Exception as e:
                logger.error(f"Failed to load service account file at {path_candidate}: {e}")

    if credentials is None:
        return None

    try:
        _drive_service_instance = build('drive', 'v3', credentials=credentials, cache_discovery=False)
        return _drive_service_instance
    except Exception as e:
        logger.error(f"Failed to build Google Drive client: {e}")
        return None

def is_drive_configured():
    """Check if Google Drive credentials are configured and active."""
    return get_drive_service() is not None

def get_or_create_folder(folder_name, parent_id=None):
    """Find or create a Google Drive folder under an optional parent folder."""
    service = get_drive_service()
    if not service:
        return None

    cache_key = f"{parent_id}_{folder_name}"
    if cache_key in _folder_cache:
        return _folder_cache[cache_key]

    query_parts = [
        f"name = '{folder_name}'",
        "mimeType = 'application/vnd.google-apps.folder'",
        "trashed = false"
    ]
    if parent_id:
        query_parts.append(f"'{parent_id}' in parents")

    query = " and ".join(query_parts)
    try:
        results = service.files().list(
            q=query,
            spaces='drive',
            fields='files(id, name)',
            pageSize=1
        ).execute()

        files = results.get('files', [])
        if files:
            folder_id = files[0]['id']
            _folder_cache[cache_key] = folder_id
            return folder_id

        # Create new folder
        folder_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        if parent_id:
            folder_metadata['parents'] = [parent_id]

        folder = service.files().create(
            body=folder_metadata,
            fields='id'
        ).execute()

        folder_id = folder.get('id')
        _folder_cache[cache_key] = folder_id
        return folder_id
    except Exception as e:
        logger.error(f"Failed to get or create folder '{folder_name}': {e}")
        return None

def get_customer_folder_id(customer_name):
    """Resolve and build the full hierarchy:
    Brixen-CRM -> customer -> <Customer Name>
    """
    clean_name = str(customer_name or 'General Client').strip()
    root_folder_name = os.environ.get('GOOGLE_DRIVE_ROOT_FOLDER', 'Brixen-CRM')
    
    # 1. Root: Brixen-CRM
    root_id = get_or_create_folder(root_folder_name)
    if not root_id:
        return None

    # 2. Subfolder: customer
    customer_base_id = get_or_create_folder('customer', parent_id=root_id)
    if not customer_base_id:
        return None

    # 3. Client Folder: <Customer Name>
    client_folder_id = get_or_create_folder(clean_name, parent_id=customer_base_id)
    return client_folder_id

def upload_file_to_google_drive(customer_name, filename, file_bytes, mime_type='application/octet-stream'):
    """Upload a file to Google Drive under:
    Brixen-CRM/customer/<Customer Name>/<filename>
    """
    service = get_drive_service()
    if not service:
        return {
            "success": False,
            "status": "pending_credentials",
            "message": "Google Drive Service Account key not found in .env (GOOGLE_SERVICE_ACCOUNT_JSON)",
            "folder_path": f"Brixen-CRM/customer/{customer_name}/{filename}"
        }

    try:
        from googleapiclient.http import MediaIoBaseUpload  # type: ignore

        folder_id = get_customer_folder_id(customer_name)
        if not folder_id:
            return {"success": False, "error": "Could not create or access customer folder on Google Drive."}

        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        media = MediaIoBaseUpload(
            io.BytesIO(file_bytes),
            mimetype=mime_type or 'application/octet-stream',
            resumable=True
        )

        uploaded_file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink, webContentLink, size'
        ).execute()

        file_id = uploaded_file.get('id')
        web_view_link = uploaded_file.get('webViewLink')
        web_content_link = uploaded_file.get('webContentLink')

        return {
            "success": True,
            "drive_file_id": file_id,
            "filename": filename,
            "webViewLink": web_view_link,
            "webContentLink": web_content_link,
            "folder_path": f"Brixen-CRM/customer/{customer_name}/{filename}"
        }
    except Exception as e:
        logger.error(f"Google Drive upload failed for {filename}: {e}")
        return {"success": False, "error": str(e)}
