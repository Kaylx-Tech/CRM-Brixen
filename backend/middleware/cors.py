"""CORS Middleware for Brixen CRM
"""
from urllib.parse import urlsplit

from config import ALLOWED_CORS_ORIGINS, IS_PRODUCTION, TENANT_BASE_DOMAIN


def _is_workspace_origin(origin):
    """A Finstap company subdomain (https://acme.finstap.com); plain http only outside production."""
    if not TENANT_BASE_DOMAIN or not origin:
        return False
    parts = urlsplit(origin)
    if parts.scheme != 'https' and (IS_PRODUCTION or parts.scheme != 'http'):
        return False
    host = (parts.hostname or '').lower()
    return host == TENANT_BASE_DOMAIN or host.endswith('.' + TENANT_BASE_DOMAIN)


def handle_cors_headers(environ):
    """Generate CORS headers for a given request origin."""
    origin = environ.get('HTTP_ORIGIN', '')

    # Always vary on Origin so caches never serve one origin's ACAO to another.
    headers = [('Vary', 'Origin')]

    # Allow explicitly listed origins, local dev ports, or owned subdomains.
    # NOTE: no broad "*.vercel.app" — the specific Vercel app is in
    # ALLOWED_CORS_ORIGINS. Reflecting arbitrary origins with credentials=true
    # would let any third-party site make authenticated cross-origin requests.
    is_allowed = (
        origin in ALLOWED_CORS_ORIGINS or
        origin.startswith('http://localhost:') or
        origin.startswith('https://localhost:') or
        origin.startswith('http://127.0.0.1:') or
        origin.startswith('https://127.0.0.1:') or
        origin.endswith('.brixenconsultants.com') or
        _is_workspace_origin(origin)
    )

    if is_allowed and origin:
        headers.append(('Access-Control-Allow-Origin', origin))
        headers.append(('Access-Control-Allow-Credentials', 'true'))
        headers.append(('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS'))
        headers.append(('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Session-Token, X-Tenant, Accept, Origin'))
        headers.append(('Access-Control-Max-Age', '86400'))

    return headers

def handle_options_preflight(environ, start_response):
    """Handle preflight HTTP OPTIONS request."""
    cors_headers = handle_cors_headers(environ)
    start_response('204 No Content', cors_headers)
    return [b'']
    