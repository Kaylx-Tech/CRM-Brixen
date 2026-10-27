"""Routes Package Dispatcher
"""
import re
import json

from .auth_routes import handle_auth_routes
from .stats_routes import handle_stats_routes
from .company_routes import handle_company_routes
from .order_routes import handle_order_routes
from .invoice_routes import handle_invoice_routes
from .client_routes import handle_client_routes
from .task_routes import handle_task_routes
from .document_routes import handle_document_routes
from .catalog_routes import handle_catalog_routes
from .notification_routes import handle_notification_routes
from .audit_routes import handle_audit_routes
from .webhook_routes import handle_webhook_routes
from .accounts_routes import handle_accountancy_routes
from .settings_routes import handle_settings_routes
from .client_portal_routes import handle_client_portal_routes
from .email_log_routes import handle_email_log_routes
from .ticket_routes import handle_ticket_routes
from .website_routes import handle_website_routes
from .smart_link_routes import handle_smart_link_routes
from .id_verification_routes import handle_id_verification_routes
from .ai_routes import handle_ai_routes
from .finance_routes import handle_finance_routes


# Accounts file integration
try:
    from services import accounts_file
except ImportError:
    accounts_file = None

def dispatch_api_routes(environ, start_response, path, method, user, body, query):
    """Try to dispatch to any modular API route handler."""
    
    # 1. Authentication
    res = handle_auth_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 1b. Customer portal (/api/client/*, CLIENT role only; orders/accountancy/notifications fall through)
    res = handle_client_portal_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 1c. AI assistant (team only, read-only)
    res = handle_ai_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 2. Dashboard Analytics & Stats
    res = handle_stats_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 3. Companies & Formations
    res = handle_company_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 4. Orders
    res = handle_order_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 5. Invoices & Billing
    res = handle_invoice_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 5b. Revenue & Balance Sheet (admins)
    res = handle_finance_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 6. Clients CRM
    res = handle_client_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 7. Internal Tasks
    res = handle_task_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 8. Documents & Storage
    res = handle_document_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 9. Product & Pricing Catalog
    res = handle_catalog_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 10. In-App Notifications
    res = handle_notification_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 11. Activity Logs & Audit Trail
    res = handle_audit_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 12. External Webhooks
    res = handle_webhook_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 12b. Website (WordPress plugin) client panel + SSO, signed requests
    res = handle_website_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 13. Accountancy & Tax API
    res = handle_accountancy_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 14. System Settings & Integrations
    res = handle_settings_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 14a. Support tickets (team side)
    res = handle_ticket_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 14b. Email log (admins)
    res = handle_email_log_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 14c. Smart Operations quick links (team)
    res = handle_smart_link_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 14d. ID Verification (Didit) for KYC orders, and Didit's webhook
    res = handle_id_verification_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res


    # 15. UK Accounts & Tax Engine Fallback (accounts-file / accounts)
    if accounts_file and (path.startswith('/accounts') or path.startswith('/api/accounts') or 'accounts-file' in path):
        try:
            result = accounts_file.route(path, method, user, body, query)
            if result is not None:
                kind = result[0]
                status_str = result[1] if len(result) > 1 else '200 OK'
                if kind == 'file':
                    payload = result[2] if len(result) > 2 else b''
                    file_type = result[3] if len(result) > 3 else 'application/octet-stream'
                    filename = result[4] if len(result) > 4 else 'download'
                    if isinstance(payload, str):
                        payload = payload.encode('utf-8')
                    elif not isinstance(payload, (bytes, bytearray)):
                        payload = b''
                    safe_name = re.sub(r'[^A-Za-z0-9._-]+', '_', str(filename or 'download'))
                    start_response(status_str, [
                        ('Content-Type', file_type or 'application/octet-stream'),
                        ('Content-Length', str(len(payload))),
                        ('Content-Disposition', f'attachment; filename="{safe_name}"'),
                    ])
                    return [bytes(payload)]
                
                payload = result[2] if len(result) > 2 else {'status': 'error', 'message': 'Route not found'}
                body_bytes = json.dumps(payload).encode('utf-8')
                start_response(status_str, [
                    ('Content-Type', 'application/json; charset=utf-8'),
                    ('Content-Length', str(len(body_bytes)))
                ])
                return [body_bytes]
        except Exception as e:
            print(f"[AccountsFile Error] {e}")

    return None
