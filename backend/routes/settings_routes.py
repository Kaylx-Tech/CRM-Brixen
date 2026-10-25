"""Application Settings & Integration Routes (/api/admin/settings & /api/settings/public)
Provides endpoints to manage system configuration (Brand, SMTP, Google Drive, Companies House, Webhooks)
from database settings with fallback to environment variables.
"""
from utils.response import success_response, error_response
from services.settings_service import (
    get_all_settings,
    update_settings,
    get_setting,
    test_smtp_connection,
    test_google_drive_connection,
    test_companies_house_connection
)

STAFF_ROLES = {'SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF'}
ADMIN_ROLES = {'SUPER_ADMIN', 'ADMIN'}

def handle_settings_routes(environ, start_response, path, method, user, body, query):
    """Route dispatcher for settings and configuration endpoints."""
    
    # ── 1. GET /api/settings/public or /api/public/settings ────────────────
    if path in ('/api/settings/public', '/api/public/settings') and method == 'GET':
        public_data = {
            'company_name': get_setting('company_name', 'Brixen Consultants'),
            'brand_name': get_setting('brand_name', 'Brixen Consultants'),
            'logo_url': get_setting('logo_url', '/static/img/logo.svg'),
            'primary_color': get_setting('primary_color', '#003971'),
            'support_email': get_setting('support_email', 'contact@brixenconsultants.com'),
            'support_phone': get_setting('support_phone', '+44 7360 515317'),
            'currency': get_setting('currency', '£'),
            'portal_url': get_setting('portal_url', 'https://portal.brixenconsultants.com'),
            'frontend_url': get_setting('frontend_url', 'https://admin.brixenconsultants.com')
        }
        return success_response(start_response, data=public_data)

    # All subsequent endpoints require /api/admin/settings prefix
    if not path.startswith('/api/admin/settings'):
        return None

    # Check authentication
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = str(user.get('role', '')).upper()
    if user_role not in STAFF_ROLES:
        return error_response(start_response, "Access denied. Staff privilege required.", status_code=403)
    # Old portal: system settings (and the integration tests) need settings.manage, i.e. admins only
    if user_role not in ADMIN_ROLES:
        return error_response(start_response, "System settings are available to administrators only.", status_code=403)

    # ── 2. GET /api/admin/settings ───────────────────────────────────────────
    if path == '/api/admin/settings' and method == 'GET':
        try:
            settings_data = get_all_settings(raw=False)
            return success_response(start_response, data=settings_data)
        except Exception as e:
            return error_response(start_response, f"Failed to load settings: {e}", status_code=500)

    # ── 3. POST / PUT /api/admin/settings ────────────────────────────────────
    if path == '/api/admin/settings' and method in ('POST', 'PUT'):
        if user_role not in ADMIN_ROLES:
            return error_response(start_response, "Only Administrators can modify system settings.", status_code=403)

        if not body or not isinstance(body, dict):
            return error_response(start_response, "Invalid JSON payload", status_code=400)

        try:
            ip_addr = environ.get('HTTP_X_FORWARDED_FOR') or environ.get('REMOTE_ADDR')
            updated = update_settings(body, user_id=user.get('id'), ip_address=ip_addr)
            return success_response(start_response, data=updated, message="System settings updated successfully")
        except Exception as e:
            return error_response(start_response, f"Failed to save settings: {e}", status_code=500)

    # ── 4. POST /api/admin/settings/test-smtp | test-email (legacy app.js) ──
    if path in ('/api/admin/settings/test-smtp', '/api/admin/settings/test-email') and method == 'POST':
        test_email = None
        custom_cfg = None
        if isinstance(body, dict):
            test_email = body.get('test_email') or body.get('email') or user.get('email')
            custom_cfg = body.get('smtp_config')
            if body.get('sender') == 'login':
                # The login code mailbox (e.g. noreply@): typed values first, else the saved ones
                cfg = dict(custom_cfg or {})
                login_user = (cfg.get('smtp_user') or get_setting('login_smtp_user') or '').strip()
                custom_cfg = {**cfg, 'smtp_user': login_user, 'smtp_from': login_user,
                              'smtp_pass': cfg.get('smtp_pass') or get_setting('login_smtp_pass') or ''}

        result = test_smtp_connection(test_email=test_email, custom_cfg=custom_cfg)
        if result.get('success'):
            return success_response(start_response, data=result, message=result.get('message'))
        return error_response(start_response, result.get('error', 'SMTP Test Failed'), status_code=400, details=result)

    # ── 5. POST /api/admin/settings/test-google-drive ────────────────────────
    if path == '/api/admin/settings/test-google-drive' and method == 'POST':
        custom_json = body.get('google_service_account_json') if isinstance(body, dict) else None
        result = test_google_drive_connection(custom_json=custom_json)
        if result.get('success'):
            return success_response(start_response, data=result, message=result.get('message'))
        return error_response(start_response, result.get('error', 'Google Drive Test Failed'), status_code=400, details=result)

    # ── 6. POST /api/admin/settings/test-companies-house ────────────────────
    if path == '/api/admin/settings/test-companies-house' and method == 'POST':
        custom_api_key = body.get('companies_house_api_key') if isinstance(body, dict) else None
        result = test_companies_house_connection(custom_api_key=custom_api_key)
        if result.get('success'):
            return success_response(start_response, data=result, message=result.get('message'))
        return error_response(start_response, result.get('error', 'Companies House Test Failed'), status_code=400, details=result)

    # ── 7. POST /api/admin/settings/test-wordpress (Application Password check) ──
    if path == '/api/admin/settings/test-wordpress' and method == 'POST':
        from services import wordpress_service
        result = wordpress_service.connection_status()
        if result.get('ok'):
            return success_response(start_response, data=result, message=result.get('message'))
        return error_response(start_response, result.get('message') or 'WordPress connection failed', status_code=400)

    # ── 8. POST /api/admin/settings/wordpress-webhooks (create signup webhook on WooCommerce) ──
    if path == '/api/admin/settings/wordpress-webhooks' and method == 'POST':
        if user_role not in ADMIN_ROLES:
            return error_response(start_response, "Only Administrators can set up webhooks.", status_code=403)
        from services import wordpress_service
        from routes.webhook_routes import _webhook_secret
        secret = _webhook_secret()
        if not secret:
            return error_response(start_response, "Set WORDPRESS_WEBHOOK_SECRET on the server first.", status_code=400)
        proto = (environ.get('HTTP_X_FORWARDED_PROTO') or environ.get('wsgi.url_scheme') or 'https').split(',')[0].strip()
        host = (environ.get('HTTP_X_FORWARDED_HOST') or environ.get('HTTP_HOST') or '').split(',')[0].strip()
        if not host or host.split(':')[0] in ('localhost', '127.0.0.1', '0.0.0.0'):
            return error_response(start_response, "Run this from the live CRM; the website cannot reach a local server.",
                                  status_code=400)
        delivery_url = f"{proto}://{host}/api/webhooks/woocommerce"
        result = wordpress_service.ensure_webhook('customer.created', delivery_url, secret)
        if result.get('ok'):
            return success_response(start_response, data={**result, 'delivery_url': delivery_url},
                                    message=result.get('message'))
        return error_response(start_response, result.get('message') or 'Could not create the webhook', status_code=400)

    return None