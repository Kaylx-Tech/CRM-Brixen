"""Routes Package Dispatcher
"""
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


# Accounts file integration
try:
    from services import accounts_file
except ImportError:
    accounts_file = None

def dispatch_api_routes(environ, start_response, path, method, user, body, query):
    """Try to dispatch to any modular API route handler."""
    
    # 1. Authentication
    res = handle_auth_routes(environ, start_response, path, method, user, body)
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

    # 4. Orders & Services
    res = handle_order_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 5. Invoices & Billing
    res = handle_invoice_routes(environ, start_response, path, method, user, body, query)
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

    # 13. Accountancy & Tax API
    res = handle_accountancy_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res

    # 14. System Settings & Integrations
    res = handle_settings_routes(environ, start_response, path, method, user, body, query)
    if res is not None:
        return res


    # 14. UK Accounts & Tax Engine Fallback
    if accounts_file and (path.startswith('/accounts') or path.startswith('/api/accounts')):
        try:
            return accounts_file.route(path, method, user, body, query)
        except Exception as e:
            print(f"[AccountsFile Error] {e}")

    return None
