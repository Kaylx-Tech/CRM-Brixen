"""Webhook Endpoints (/api/webhooks)
"""
from utils.response import json_response, success_response, error_response
from services.webhook_service import process_woocommerce_order

def handle_webhook_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/webhooks endpoints."""
    if not path.startswith('/api/webhooks'):
        return None

    # ── POST /api/webhooks/woocommerce ─────────────────────────────────────
    if path == '/api/webhooks/woocommerce' and method == 'POST':
        result = process_woocommerce_order(body)
        if result.get('success'):
            return success_response(start_response, data=result, message="Webhook processed successfully.")
        return error_response(start_response, message=result.get('error', 'Failed to process webhook'), status_code=400)

    return None
