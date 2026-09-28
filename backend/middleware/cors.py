"""CORS Middleware for Brixen CRM
"""
from config import ALLOWED_CORS_ORIGINS

def handle_cors_headers(environ):
    """Generate CORS headers for a given request origin."""
    origin = environ.get('HTTP_ORIGIN', '')
    headers = []
    
    # Allow all listed origins or local/tunnel dev origins
    is_allowed = (
        origin in ALLOWED_CORS_ORIGINS or
        origin.startswith('http://localhost:') or
        origin.startswith('http://127.0.0.1:') or
        origin.endswith('.brixenconsultants.com') or
        origin.endswith('.vercel.app')
    )
    
    if is_allowed and origin:
        headers.append(('Access-Control-Allow-Origin', origin))
        headers.append(('Access-Control-Allow-Credentials', 'true'))
        headers.append(('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS'))
        headers.append(('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Session-Token, Accept, Origin'))
        headers.append(('Access-Control-Max-Age', '86400'))
    
    return headers

def handle_options_preflight(environ, start_response):
    """Handle preflight HTTP OPTIONS request."""
    cors_headers = handle_cors_headers(environ)
    start_response('204 No Content', cors_headers)
    return [b'']
    