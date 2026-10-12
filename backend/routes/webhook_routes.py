"""Webhook Endpoints (/api/webhooks)
HMAC-verified WooCommerce/WordPress inbound webhooks (same contract as app.py).
"""
import base64
import hmac
import hashlib
import json
import os
from db import query_db
from utils.response import success_response, error_response
from services.webhook_service import process_woocommerce_order, process_woocommerce_customer


def _webhook_secret():
    row = query_db("SELECT value FROM settings WHERE key = 'wordpress_webhook_secret';", one=True)
    secret = (row['value'] if row and row.get('value') else None) or os.environ.get('WORDPRESS_WEBHOOK_SECRET')
    if secret and str(secret).strip() in ('', 'CHANGE_ME_IN_LOCAL_ENV'):
        return None
    return (secret or '').strip() or None


def _verify_webhook_signature(raw_body_bytes, signature_hdr, secret):
    """WooCommerce signs with base64(HMAC-SHA256); the old Brixen plugin sent hex. Accept either."""
    if not signature_hdr or not secret or not raw_body_bytes:
        return False
    clean_sig = str(signature_hdr).replace('sha256=', '').strip()
    digest = hmac.new(secret.encode('utf-8'), raw_body_bytes, hashlib.sha256).digest()
    try:
        return (hmac.compare_digest(clean_sig, digest.hex())
                or hmac.compare_digest(clean_sig, base64.b64encode(digest).decode('ascii')))
    except Exception:
        return False


def handle_webhook_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/webhooks endpoints."""
    if not path.startswith('/api/webhooks'):
        return None

    # ── POST /api/webhooks/woocommerce ─────────────────────────────────────
    if path == '/api/webhooks/woocommerce' and method == 'POST':
        secret = _webhook_secret()
        if not secret:
            return error_response(start_response, "Webhook secret is not configured", status_code=401)

        # WooCommerce pings a new webhook with just "webhook_id=<n>" (unsigned); answer it, process nothing
        if isinstance(body, dict) and set(body.keys()) == {'webhook_id'}:
            return success_response(start_response, message="Webhook ping received.")

        signature = (
            environ.get('HTTP_X_WC_WEBHOOK_SIGNATURE')
            or environ.get('HTTP_X_BRIXEN_SIGNATURE')
            or environ.get('HTTP_X_WP_SIGNATURE')
            or ''
        )
        raw_body = environ.get('brixen.raw_body')
        if raw_body is None and isinstance(body, dict):
            raw_body = json.dumps(body, separators=(',', ':')).encode('utf-8')
        if isinstance(raw_body, str):
            raw_body = raw_body.encode('utf-8')

        if not _verify_webhook_signature(raw_body, signature, secret):
            return error_response(start_response, "Invalid webhook signature", status_code=401)

        topic = str(environ.get('HTTP_X_WC_WEBHOOK_TOPIC') or '').strip().lower()
        if topic.startswith('customer.'):
            result = process_woocommerce_customer(body or {})
        else:
            result = process_woocommerce_order(body or {})
        if result.get('success'):
            return success_response(start_response, data=result, message="Webhook processed successfully.")
        return error_response(start_response, message=result.get('error', 'Failed to process webhook'), status_code=400)

    return None
