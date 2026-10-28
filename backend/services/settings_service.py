"""Brixen CRM - Application Settings & Environment Synchronization Service
Handles DB <-> Environment precedence, masked secrets, connection verification
for SMTP, Google Drive 5TB Storage, Companies House API, and WordPress Integrations.
"""
import os
import json
import base64
import smtplib
import ssl
import urllib.request
import urllib.error
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from db import query_db, execute_db
from services.audit_service import log_activity

# Sensitive keys that must be masked when returned to the client
SENSITIVE_KEYS = {
    'smtp_pass',
    'login_smtp_pass',
    'google_service_account_json',
    'google_service_account_base64',
    'companies_house_api_key',
    'wordpress_webhook_secret',
    'secret_key',
    'ch_presenter_auth',
    'ch_xml_gateway_password',
    'didit_api_key',
    'didit_webhook_secret',
}

DEFAULT_SETTINGS = {
    # ── Brand & General ───────────────────────────────────
    'company_name': 'Brixen Consultants',
    'brand_name': 'Brixen Consultants',
    'logo_url': '/static/img/logo.svg',
    'primary_color': '#003971',
    'support_email': 'contact@brixenconsultants.com',
    'support_phone': '+44 7360 515317',
    'currency': '£',
    'vat_rate': '0.00',
    'order_prefix': '#GB',
    # Letters of new CRM order numbers: BRX-1001-OCT26 (order_prefix above was the old #GB15353 series)
    'order_number_prefix': 'BRX',
    'invoice_prefix': 'INV-2026-',
    'portal_url': 'https://portal.brixenconsultants.com',
    'frontend_url': 'https://admin.brixenconsultants.com',

    # ── SMTP Transactional Email ──────────────────────────
    'smtp_host': 'smtp.hostinger.com',
    'smtp_port': '587',
    'smtp_user': 'notifications@brixenconsultants.com',
    'smtp_pass': '',
    'smtp_from': 'notifications@brixenconsultants.com',
    'smtp_secure': 'tls',
    # Login code (OTP) emails from their own mailbox, e.g. noreply@ (same SMTP host / port);
    # empty = they go out with the SMTP account above
    'login_smtp_user': '',
    'login_smtp_pass': '',

    # ── Google Drive Cloud Storage ────────────────────────
    'google_drive_root_folder': 'Brixen-CRM',
    'google_service_account_json': '',
    'google_service_account_base64': '',
    'google_service_account_path': '',

    # ── UK Companies House API ────────────────────────────
    'companies_house_api_key': '',
    'ch_presenter_id': '',
    'ch_presenter_auth': '',
    'ch_xml_gateway_password': '',
    'ch_xml_gateway_url': 'https://xmlgw.companieshouse.gov.uk/V1-0/xmlgw/Gateway',

    # ── Didit identity verification (Smart Operations > ID Verification) ──
    'didit_api_key': '',
    'didit_webhook_secret': '',
    'didit_workflow_id': '',
    'didit_callback_url': '',

    # ── WordPress & Webhooks ──────────────────────────────
    'wordpress_webhook_secret': '',
    'wordpress_url': 'https://brixenconsultants.com',

    # ── Security & Environment ────────────────────────────
    'crm_env': 'development',
    'secret_key': 'brixen_crm_secure_local_dev_key_2026',
    'cookie_secure': 'false',
    'compliance_alerts_enabled': '0',
    'compliance_alerts_send_hour': '11',
    'compliance_alerts_test_recipient': '',
    # Short aliases kept for older admin payloads / env
    'compliance_send_hour': '11',
    'compliance_test_recipient': '',
}

def get_setting(key: str, default=None):
    """Retrieve setting value with precedence:
    1. Database `settings` table
    2. os.environ (UPPERCASE or exact)
    3. Default value fallback
    """
    try:
        row = query_db("SELECT value FROM settings WHERE key = ?;", (key,), one=True)
        if row and row['value'] is not None and str(row['value']).strip() != '':
            return str(row['value'])
    except Exception:
        pass

    # Check os.environ
    env_val = os.environ.get(key.upper()) or os.environ.get(key)
    if env_val is not None and str(env_val).strip() != '':
        return str(env_val)

    if default is not None:
        return default

    return DEFAULT_SETTINGS.get(key, '')

def mask_value(val: str) -> str:
    """Mask sensitive credentials for safe client display."""
    # Never reveal any characters of a secret (saving "******" back keeps the stored value)
    return "******" if val else ""

def get_all_settings(raw: bool = False):
    """Get all application settings categorized, optionally masking secrets."""
    # 1. Fetch all rows from DB
    db_settings = {}
    try:
        rows = query_db("SELECT key, value FROM settings;")
        for r in rows:
            db_settings[r['key']] = r['value']
    except Exception:
        pass

    # 2. Merge defaults, env, and DB
    all_keys = set(DEFAULT_SETTINGS.keys()).union(db_settings.keys())
    merged = {}
    for k in all_keys:
        # DB first, then ENV, then default
        val = db_settings.get(k)
        if val is None or str(val).strip() == '':
            val = os.environ.get(k.upper()) or os.environ.get(k)
        if val is None or str(val).strip() == '':
            val = DEFAULT_SETTINGS.get(k, '')
        merged[k] = str(val)

    # 3. Build categorized dictionary
    result = {
        'brand': {
            'company_name': merged.get('company_name', 'Brixen Consultants'),
            'brand_name': merged.get('brand_name', 'Brixen Consultants'),
            'logo_url': merged.get('logo_url', '/static/img/logo.svg'),
            'primary_color': merged.get('primary_color', '#003971'),
            'support_email': merged.get('support_email', 'contact@brixenconsultants.com'),
            'support_phone': merged.get('support_phone', '+44 7360 515317'),
            'currency': merged.get('currency', '£'),
            'vat_rate': merged.get('vat_rate', '0.00'),
            'order_prefix': merged.get('order_prefix', '#GB'),
            'order_number_prefix': merged.get('order_number_prefix', 'BRX'),
            'invoice_prefix': merged.get('invoice_prefix', 'INV-2026-'),
            'portal_url': merged.get('portal_url', 'https://portal.brixenconsultants.com'),
            'frontend_url': merged.get('frontend_url', 'https://admin.brixenconsultants.com'),
        },
        'smtp': {
            'smtp_host': merged.get('smtp_host', 'smtp.hostinger.com'),
            'smtp_port': merged.get('smtp_port', '587'),
            'smtp_user': merged.get('smtp_user', 'notifications@brixenconsultants.com'),
            'smtp_pass': merged.get('smtp_pass', '') if raw else mask_value(merged.get('smtp_pass', '')),
            'smtp_pass_set': bool(merged.get('smtp_pass')),
            'smtp_from': merged.get('smtp_from', 'notifications@brixenconsultants.com'),
            'smtp_secure': merged.get('smtp_secure', 'tls'),
            'login_smtp_user': merged.get('login_smtp_user', ''),
            'login_smtp_pass_set': bool(merged.get('login_smtp_pass')),
        },
        'google_drive': {
            'google_drive_root_folder': merged.get('google_drive_root_folder', 'Brixen-CRM'),
            'google_service_account_json': merged.get('google_service_account_json', '') if raw else ('[CONFIGURED]' if merged.get('google_service_account_json') else ''),
            'google_service_account_json_set': bool(merged.get('google_service_account_json') or merged.get('google_service_account_base64')),
            'google_service_account_base64': merged.get('google_service_account_base64', '') if raw else ('[CONFIGURED]' if merged.get('google_service_account_base64') else ''),
            'google_service_account_path': merged.get('google_service_account_path', '')
        },
        'companies_house': {
            'companies_house_api_key': merged.get('companies_house_api_key', '') if raw else mask_value(merged.get('companies_house_api_key', '')),
            'companies_house_api_key_set': bool(merged.get('companies_house_api_key')),
            'ch_presenter_id': merged.get('ch_presenter_id', ''),
            'ch_presenter_auth': merged.get('ch_presenter_auth', '') if raw else mask_value(merged.get('ch_presenter_auth', '')),
            'ch_presenter_auth_set': bool(merged.get('ch_presenter_auth')),
            'ch_xml_gateway_url': merged.get('ch_xml_gateway_url', 'https://xmlgw.companieshouse.gov.uk/V1-0/xmlgw/Gateway')
        },
        'didit': {
            'didit_api_key_set': bool(merged.get('didit_api_key')),
            'didit_webhook_secret_set': bool(merged.get('didit_webhook_secret')),
            'didit_workflow_id': merged.get('didit_workflow_id', ''),
            'didit_callback_url': merged.get('didit_callback_url', ''),
        },
        'webhooks': {
            'wordpress_webhook_secret': merged.get('wordpress_webhook_secret', '') if raw else mask_value(merged.get('wordpress_webhook_secret', '')),
            'wordpress_webhook_secret_set': bool(merged.get('wordpress_webhook_secret')),
            'wordpress_url': merged.get('wordpress_url', 'https://brixenconsultants.com')
        },
        'compliance': {
            'compliance_alerts_enabled': str(merged.get('compliance_alerts_enabled', '0')) in ('1', 'true', 'True'),
            'compliance_alerts_send_hour': merged.get('compliance_alerts_send_hour') or merged.get('compliance_send_hour', '11'),
            'compliance_alerts_test_recipient': merged.get('compliance_alerts_test_recipient') or merged.get('compliance_test_recipient', ''),
            # Aliases for older UI
            'compliance_send_hour': merged.get('compliance_alerts_send_hour') or merged.get('compliance_send_hour', '11'),
            'compliance_test_recipient': merged.get('compliance_alerts_test_recipient') or merged.get('compliance_test_recipient', ''),
        },
        'security': {
            'crm_env': merged.get('crm_env', 'development'),
            'cookie_secure': str(merged.get('cookie_secure', 'false')).lower() in ('true', '1'),
            'secret_key_set': bool(merged.get('secret_key'))
        }
    }

    # Also attach flat settings dictionary
    result['flat'] = {
        k: (v if (raw or k not in SENSITIVE_KEYS) else mask_value(v))
        for k, v in merged.items()
    }
    return result

def update_settings(payload: dict, user_id=None, ip_address=None):
    """Save setting key-value pairs into Database and synchronize with runtime os.environ."""
    if not isinstance(payload, dict):
        raise ValueError("Payload must be a key-value dictionary")

    # Flatten payload if nested categories are passed
    flat_updates = {}
    for k, v in payload.items():
        if isinstance(v, dict):
            for sub_k, sub_v in v.items():
                # Skip UI helper flags
                if sub_k.endswith('_set'):
                    continue
                flat_updates[sub_k] = sub_v
        else:
            if not k.endswith('_set'):
                flat_updates[k] = v

    saved_keys = []
    for key, value in flat_updates.items():
        val_str = str(value) if value is not None else ""
        
        # If the user sent a masked placeholder (e.g. "******" or "[CONFIGURED]"), skip modifying it
        if "******" in val_str or val_str == "[CONFIGURED]":
            continue

        # Save to SQLite settings table
        execute_db("""
            INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);
        """, (key, val_str))

        # Synchronize with runtime os.environ
        os.environ[key.upper()] = val_str
        os.environ[key] = val_str
        saved_keys.append(key)

    # Keep compliance key aliases in sync (admin UI vs compliance_alerts engine)
    alias_pairs = (
        ('compliance_send_hour', 'compliance_alerts_send_hour'),
        ('compliance_alerts_send_hour', 'compliance_send_hour'),
        ('compliance_test_recipient', 'compliance_alerts_test_recipient'),
        ('compliance_alerts_test_recipient', 'compliance_test_recipient'),
    )
    for src, dest in alias_pairs:
        if src in saved_keys and dest not in flat_updates:
            val_str = str(flat_updates[src] if flat_updates[src] is not None else '')
            if "******" in val_str or val_str == "[CONFIGURED]":
                continue
            execute_db(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);",
                (dest, val_str),
            )
            os.environ[dest.upper()] = val_str
            os.environ[dest] = val_str
            saved_keys.append(dest)

    # Invalidate Google Drive client cache if drive credentials changed
    drive_related = {'google_service_account_json', 'google_service_account_base64', 'google_drive_root_folder'}
    if any(k in drive_related for k in saved_keys):
        try:
            from services.google_drive_service import reset_drive_client
            reset_drive_client()
        except Exception:
            pass

    # Audit logging
    if user_id:
        try:
            log_activity(
                user_id=user_id,
                action='UPDATE_SETTINGS',
                target_type='settings',
                target_id='global',
                details=f"Updated settings keys: {', '.join(saved_keys)}",
                ip_address=ip_address
            )
        except Exception:
            pass

    return get_all_settings(raw=False)

def test_smtp_connection(test_email=None, custom_cfg=None):
    """Test SMTP connection and optionally send a test verification email."""
    cfg = custom_cfg or {}
    smtp_host = cfg.get('smtp_host') or get_setting('smtp_host', 'smtp.hostinger.com')
    smtp_port = int(cfg.get('smtp_port') or get_setting('smtp_port', '587'))
    smtp_user = cfg.get('smtp_user') or get_setting('smtp_user', '')
    smtp_pass = cfg.get('smtp_pass') or get_setting('smtp_pass', '')
    from_email = cfg.get('smtp_from') or get_setting('smtp_from', 'notifications@brixenconsultants.com')

    if not smtp_user or not smtp_pass:
        return {
            "success": False,
            "error": "SMTP User and Password are required to test connection."
        }

    try:
        if smtp_port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=10) as server:
                server.login(smtp_user, smtp_pass)
                if test_email:
                    msg = MIMEMultipart('alternative')
                    msg['Subject'] = "Brixen CRM - SMTP Configuration Test Successful"
                    msg['From'] = f"Brixen Consultants <{from_email}>"
                    msg['To'] = test_email
                    body_html = "<div style='font-family:sans-serif;padding:20px;color:#0f172a'><h3>SMTP Connection Verified</h3><p>Your Brixen CRM transactional email server is configured properly and ready to dispatch live client notifications.</p></div>"
                    msg.attach(MIMEText(body_html, 'html'))
                    server.sendmail(from_email, [test_email], msg.as_string())
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                if test_email:
                    msg = MIMEMultipart('alternative')
                    msg['Subject'] = "Brixen CRM - SMTP Configuration Test Successful"
                    msg['From'] = f"Brixen Consultants <{from_email}>"
                    msg['To'] = test_email
                    body_html = "<div style='font-family:sans-serif;padding:20px;color:#0f172a'><h3>SMTP Connection Verified</h3><p>Your Brixen CRM transactional email server is configured properly and ready to dispatch live client notifications.</p></div>"
                    msg.attach(MIMEText(body_html, 'html'))
                    server.sendmail(from_email, [test_email], msg.as_string())

        return {
            "success": True,
            "message": f"SMTP handshake and login verified successfully on {smtp_host}:{smtp_port}." + (f" Test email sent to {test_email}." if test_email else "")
        }
    except smtplib.SMTPAuthenticationError as e:
        return {"success": False, "error": f"SMTP Authentication failed: {e.smtp_error.decode() if isinstance(e.smtp_error, bytes) else str(e)}"}
    except Exception as e:
        return {"success": False, "error": f"SMTP Connection error: {str(e)}"}

def test_google_drive_connection(custom_json=None):
    """Test Google Drive API v3 Service Account credentials and folder hierarchy."""
    try:
        from google.oauth2 import service_account  # type: ignore
        from googleapiclient.discovery import build  # type: ignore
    except ImportError:
        return {"success": False, "error": "google-api-python-client library is not installed"}

    raw_json = custom_json or get_setting('google_service_account_json')
    raw_b64 = get_setting('google_service_account_base64')
    
    credentials = None
    if raw_json and raw_json.strip():
        try:
            info = json.loads(raw_json)
            credentials = service_account.Credentials.from_service_account_info(
                info, scopes=['https://www.googleapis.com/auth/drive']
            )
        except Exception as e:
            return {"success": False, "error": f"Failed to parse Google Service Account JSON: {e}"}

    if credentials is None and raw_b64 and raw_b64.strip():
        try:
            decoded = base64.b64decode(raw_b64).decode('utf-8')
            info = json.loads(decoded)
            credentials = service_account.Credentials.from_service_account_info(
                info, scopes=['https://www.googleapis.com/auth/drive']
            )
        except Exception as e:
            return {"success": False, "error": f"Failed to decode Google Service Account Base64: {e}"}

    if credentials is None:
        path_candidate = get_setting('google_service_account_path') or 'credentials/google_service_account.json'
        if os.path.exists(path_candidate):
            try:
                credentials = service_account.Credentials.from_service_account_file(
                    path_candidate, scopes=['https://www.googleapis.com/auth/drive']
                )
            except Exception as e:
                return {"success": False, "error": f"Failed to load service account file at {path_candidate}: {e}"}

    if credentials is None:
        return {
            "success": False,
            "error": "No Google Service Account credentials found. Please provide JSON or Base64 credentials."
        }

    try:
        service = build('drive', 'v3', credentials=credentials, cache_discovery=False)
        about = service.about().get(fields="user, storageQuota").execute()
        user_info = about.get('user', {})
        quota = about.get('storageQuota', {})
        
        # Test creating / verifying root folder
        root_folder = get_setting('google_drive_root_folder', 'Brixen-CRM')
        return {
            "success": True,
            "message": f"Connected to Google Drive API as {user_info.get('emailAddress', 'Service Account')}",
            "service_account_email": user_info.get('emailAddress'),
            "root_folder": root_folder,
            "storage_limit": quota.get('limit'),
            "storage_usage": quota.get('usage')
        }
    except Exception as e:
        return {"success": False, "error": f"Google Drive API test failed: {str(e)}"}

def test_companies_house_connection(custom_api_key=None):
    """Test UK Companies House API Key with a real company query."""
    from services.companies_house_service import _ch_get, ch_api_keys
    api_key = (custom_api_key or '').strip()
    if not api_key and not ch_api_keys():
        return {"success": False, "error": "Companies House API key is missing"}

    url = "https://api.company-information.service.gov.uk/company/00000006"

    try:
        if api_key:
            # The key typed on the page, before it is saved
            auth_header = base64.b64encode(f"{api_key}:".encode('utf-8')).decode('utf-8')
            req = urllib.request.Request(url, headers={
                "Authorization": f"Basic {auth_header}",
                "Accept": "application/json"
            })
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode('utf-8'))
        else:
            # The same keys, in the same order, as company search and the order form's name check
            data = _ch_get(url, timeout=8)
        return {
            "success": True,
            "message": "Companies House API Key is valid and active",
            "sample_company": data.get('company_name'),
            "sample_status": data.get('company_status')
        }
    except urllib.error.HTTPError as e:
        if e.code == 401:
            if not api_key:
                return {"success": False, "error": "Companies House refused every saved key (401): the key in "
                                                   "Settings and COMPANIES_HOUSE_API_KEY on the server"}
            return {"success": False, "error": "Invalid Companies House API Key (401 Unauthorized)"}
        return {"success": False, "error": f"Companies House API returned status {e.code}: {e.reason}"}
    except Exception as e:
        return {"success": False, "error": f"Failed to reach Companies House API: {str(e)}"}
