"""Brixen CRM - Google Drive 5TB Storage Integration Service
Supports direct .env (GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SERVICE_ACCOUNT_BASE64)
without needing any local JSON file.

Folder Hierarchy:
  Brixen-CRM (Finstap: one shared root, e.g. "Finstap", from GOOGLE_DRIVE_FOLDER_ID)
  └── [Finstap-<workspace>]      Finstap only: each company's own folder
      └── Customers
          └── <Customer Name>
              └── [<Order>] <files & documents>
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

def load_dynamic_env():
    env_file = BASE_DIR / '.env'
    if env_file.exists():
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ[k.strip()] = v.strip().strip("'").strip('"')
        except Exception:
            pass

def get_drive_service():
    """Initialize and return authorized Google Drive v3 API service from .env or file."""
    global _drive_service_instance
    if _drive_service_instance is not None:
        return _drive_service_instance

    load_dynamic_env()

    try:
        from google.oauth2 import service_account  # type: ignore
        from googleapiclient.discovery import build  # type: ignore
    except (ImportError, ModuleNotFoundError):
        logger.warning("google-api-python-client is not installed.")
        return None

    credentials = None

    # 1. From OAuth 2.0 User Refresh Token (GOOGLE_REFRESH_TOKEN + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET)
    refresh_token = os.environ.get('GOOGLE_REFRESH_TOKEN', '').strip()
    client_id = os.environ.get('GOOGLE_CLIENT_ID', '').strip()
    client_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '').strip()
    if refresh_token and client_id and client_secret:
        try:
            from google.oauth2.credentials import Credentials as UserCredentials  # type: ignore
            credentials = UserCredentials(
                None,
                refresh_token=refresh_token,
                token_uri='https://oauth2.googleapis.com/token',
                client_id=client_id,
                client_secret=client_secret,
                scopes=SCOPES
            )
            logger.info("Using Google Drive OAuth2 User Credentials (User Quota active)")
        except Exception as e:
            logger.error(f"Failed to initialize OAuth2 User Credentials: {e}")

    # 2. From .env as direct JSON string (GOOGLE_SERVICE_ACCOUNT_JSON)
    if credentials is None:
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

    # Escape single quotes for Drive query language
    safe_name = str(folder_name or '').replace("\\", "\\\\").replace("'", "\\'")
    cache_key = f"{parent_id}_{folder_name}"
    if cache_key in _folder_cache:
        return _folder_cache[cache_key]

    query_parts = [
        f"name = '{safe_name}'",
        "mimeType = 'application/vnd.google-apps.folder'",
        "trashed = false"
    ]
    if parent_id:
        query_parts.append(f"'{parent_id}' in parents")
    else:
        # Search anywhere accessible (including shared with me)
        pass

    query = " and ".join(query_parts)
    try:
        results = service.files().list(
            q=query,
            spaces='drive',
            fields='files(id, name)',
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            pageSize=5
        ).execute()

        files = results.get('files', [])
        if files:
            folder_id = files[0]['id']
            _folder_cache[cache_key] = folder_id
            return folder_id

        # If searching for root folder and not found, check sharedWithMe
        if not parent_id:
            shared_results = service.files().list(
                q=f"name = '{safe_name}' and mimeType = 'application/vnd.google-apps.folder' and sharedWithMe = true and trashed = false",
                spaces='drive',
                fields='files(id, name)',
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                pageSize=5
            ).execute()
            shared_files = shared_results.get('files', [])
            if shared_files:
                folder_id = shared_files[0]['id']
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
            fields='id',
            supportsAllDrives=True
        ).execute()

        folder_id = folder.get('id')
        _folder_cache[cache_key] = folder_id
        return folder_id
    except Exception as e:
        logger.error(f"Failed to get or create folder '{folder_name}': {e}")
        return None

def workspace_folder_name():
    """Finstap: each company's files live in their own folder under the shared root ("Finstap-<workspace>").

    Taken from the workspace name, never from a setting a company could edit, so one company can never
    write into another's folder. Brixen's own database (legacy plan) or no workspace: None (no extra level).
    """
    try:
        from tenancy import current_tenant
    except ImportError:
        return None
    tenant = current_tenant()
    if not tenant or tenant.get('plan') == 'legacy' or not tenant.get('slug'):
        return None
    return f"Finstap-{tenant['slug']}"


def root_folder_name():
    """Name of the root folder when GOOGLE_DRIVE_FOLDER_ID is not set."""
    default = 'Finstap' if workspace_folder_name() else 'Brixen-CRM'
    return os.environ.get('GOOGLE_DRIVE_ROOT_FOLDER', default)


def workspace_base_folder_id():
    """The folder that holds this workspace's Customers folder (the root, or the company's own folder)."""
    root_id = os.environ.get('GOOGLE_DRIVE_FOLDER_ID', '').strip() or get_or_create_folder(root_folder_name())
    if not root_id:
        logger.error("Root Google Drive folder could not be found or created.")
        return None
    name = workspace_folder_name()
    if not name:
        return root_id
    # No fallback to the shared root: a company's files must never land next to another company's
    folder_id = get_or_create_folder(name, parent_id=root_id)
    if not folder_id:
        logger.error(f"Workspace Google Drive folder '{name}' could not be found or created.")
    return folder_id


def drive_folder_path(customer_name, order_name=None, filename=''):
    """Readable path stored with a document, e.g. Finstap/Finstap-acme/Customers/Jane Doe/Order #4/id.pdf"""
    parts = [root_folder_name()]
    if workspace_folder_name():
        parts.append(workspace_folder_name())
    parts += ['Customers', str(customer_name or 'General Client').strip()]
    if order_name:
        parts.append(str(order_name).strip())
    if filename:
        parts.append(filename)
    return '/'.join(parts)


def get_customer_folder_id(customer_name, order_name=None):
    """Resolve and build the full hierarchy:
    <root> [-> Finstap-<workspace>] -> Customers -> <Customer Name> [-> <Order Name>]
    """
    clean_name = str(customer_name or 'General Client').strip()

    base_id = workspace_base_folder_id()
    if not base_id:
        return None

    # 2. Subfolder: Customers
    customer_base_id = get_or_create_folder('Customers', parent_id=base_id)
    if not customer_base_id:
        customer_base_id = base_id

    # 3. Client Folder: <Customer Name>
    client_folder_id = get_or_create_folder(clean_name, parent_id=customer_base_id)
    if not client_folder_id:
        return customer_base_id

    # 4. Optional Order Folder: <Order Name>
    if order_name:
        clean_order = str(order_name).strip()
        order_folder_id = get_or_create_folder(clean_order, parent_id=client_folder_id)
        if order_folder_id:
            return order_folder_id

    return client_folder_id

def upload_file_to_google_drive(customer_name, filename, file_bytes, mime_type='application/octet-stream', order_name=None):
    """Upload a file to Google Drive under:
    <root>/[Finstap-<workspace>/]Customers/<Customer Name>/[<Order Name>/]<filename>
    """
    service = get_drive_service()
    if not service:
        return {
            "success": False,
            "status": "pending_credentials",
            "message": "Google Drive credentials not found or invalid in .env",
            "folder_path": drive_folder_path(customer_name, order_name, filename)
        }

    try:
        from googleapiclient.http import MediaIoBaseUpload  # type: ignore

        folder_id = get_customer_folder_id(customer_name, order_name=order_name)
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
            fields='id, name, webViewLink, webContentLink, size',
            supportsAllDrives=True
        ).execute()

        file_id = uploaded_file.get('id')
        web_view_link = uploaded_file.get('webViewLink')
        web_content_link = uploaded_file.get('webContentLink')
        folder_path = drive_folder_path(customer_name, order_name, filename)

        return {
            "success": True,
            "drive_file_id": file_id,
            "filename": filename,
            "webViewLink": web_view_link,
            "webContentLink": web_content_link,
            "folder_path": folder_path
        }
    except Exception as e:
        logger.error(f"Google Drive upload failed for {filename}: {e}")
        return {"success": False, "error": str(e)}

def reset_drive_client():
    """Reset cached Google Drive client instance and folder cache."""
    global _drive_service_instance, _folder_cache
    _drive_service_instance = None
    _folder_cache.clear()

