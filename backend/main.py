"""Brixen CRM - Main Modular WSGI Application Server
"""
import os
import sys
import json
import urllib.parse
from wsgiref.simple_server import make_server, WSGIServer
from socketserver import ThreadingMixIn

from config import HOST, PORT, ALLOWED_CORS_ORIGINS
from db import ensure_schema
from middleware.cors import handle_cors_headers, handle_options_preflight
from middleware.auth_guard import get_authenticated_user
from utils.response import json_response, error_response
from routes import dispatch_api_routes

class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    """Multi-threaded WSGI Server for parallel API request processing."""
    daemon_threads = True
    block_on_close = False

def app(environ, start_response):
    """Main WSGI Application Handler."""
    method = environ.get('REQUEST_METHOD', 'GET').upper()
    path = environ.get('PATH_INFO', '/')

    # 1. CORS Preflight
    if method == 'OPTIONS':
        return handle_options_preflight(environ, start_response)

    cors_headers = handle_cors_headers(environ)

    # Intercept start_response to always inject CORS headers
    def custom_start_response(status, response_headers, exc_info=None):
        existing_names = {h[0].lower() for h in response_headers}
        for ch in cors_headers:
            if ch[0].lower() not in existing_names:
                response_headers.append(ch)
        if exc_info:
            return start_response(status, response_headers, exc_info)
        return start_response(status, response_headers)

    # 2. Parse Query String
    query_string = environ.get('QUERY_STRING', '')
    query_params = urllib.parse.parse_qs(query_string)

    # 3. Parse JSON Body (if any)
    body = {}
    content_length = environ.get('CONTENT_LENGTH')
    if content_length:
        try:
            cl = int(content_length)
            if cl > 0:
                raw_body = environ['wsgi.input'].read(cl)
                content_type = environ.get('CONTENT_TYPE', '')
                if 'application/json' in content_type:
                    body = json.loads(raw_body.decode('utf-8'))
                elif 'application/x-www-form-urlencoded' in content_type:
                    body = {k: v[0] for k, v in urllib.parse.parse_qs(raw_body.decode('utf-8')).items()}
        except Exception:
            body = {}

    # 4. Authenticate User
    user = get_authenticated_user(environ)

    # 5. Dispatch Modular Routes
    try:
        response = dispatch_api_routes(environ, custom_start_response, path, method, user, body, query_params)
        if response is not None:
            return response
    except Exception as exc:
        print(f"[API Server Error] Path: {path} Method: {method} Error: {exc}")
        import traceback
        traceback.print_exc()
        return error_response(custom_start_response, "Internal Server Error", status_code=500, details=str(exc))

    # 6. Fallback 404
    return error_response(custom_start_response, f"Endpoint not found: {method} {path}", status_code=404)

def run_server():
    """Start the multi-threaded WSGI server."""
    ensure_schema()
    print("=" * 60)
    print(f"🚀 Brixen CRM Modular API Server Started")
    print(f"📡 Listening on http://{HOST}:{PORT}")
    print(f"🔒 CORS Enabled for: {', '.join(ALLOWED_CORS_ORIGINS)}")
    print("=" * 60)

    server = make_server(HOST, PORT, app, server_class=ThreadingWSGIServer)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.server_close()

if __name__ == '__main__':
    run_server()
