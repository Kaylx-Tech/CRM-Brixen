"""Brixen CRM - Main Modular WSGI Application Server
"""
import os
import sys
import json
import email
import email.policy
import urllib.parse
from wsgiref.simple_server import make_server, WSGIServer
from socketserver import ThreadingMixIn

from config import HOST, PORT, ALLOWED_CORS_ORIGINS
from db import ensure_schema, TenantRequiredError
from middleware.cors import handle_cors_headers, handle_options_preflight
from middleware.auth_guard import get_authenticated_user, extract_session_token
from utils.response import json_response, error_response
from routes import dispatch_api_routes
from services.price_privacy import hides_prices, applies_to_path, blocked_path, strip_incoming, scrub_json_payload
from routes.platform_routes import handle_platform_routes
from tenancy import (
    activate, deactivate, ensure_platform, for_each_tenant, resolve_request_tenant, seed_workspace_settings,
)


class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    """Multi-threaded WSGI Server for parallel API request processing."""
    daemon_threads = True
    block_on_close = False


def parse_multipart_form(raw_body, content_type):
    """Parse multipart/form-data into (fields_dict, files_dict)."""
    if not raw_body or 'multipart/form-data' not in (content_type or '').lower():
        return {}, {}
    header = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode('utf-8', errors='ignore')
    try:
        msg = email.message_from_bytes(header + raw_body, policy=email.policy.default)
    except Exception:
        return {}, {}
    fields = {}
    files = {}
    if not msg.is_multipart():
        return {}, {}
    for part in msg.iter_parts():
        name = part.get_param('name', header='content-disposition')
        if not name:
            continue
        filename = part.get_filename()
        payload = part.get_payload(decode=True)
        if payload is None:
            payload = b''
        if isinstance(payload, str):
            payload = payload.encode('utf-8', errors='ignore')
        if filename:
            files[name] = {
                'filename': filename,
                'content_type': part.get_content_type() or 'application/octet-stream',
                'bytes': payload,
            }
        else:
            try:
                fields[name] = payload.decode('utf-8', errors='replace')
            except Exception:
                fields[name] = ''
    return fields, files


def _dispatch_without_prices(environ, start_response, path, method, user, body, query_params):
    """Run the route, then blank every money field in its JSON reply before it leaves the server."""
    held = {}

    def hold_start_response(status, response_headers, exc_info=None):
        held['status'], held['headers'] = status, list(response_headers)
        return lambda _data: None

    response = dispatch_api_routes(environ, hold_start_response, path, method, user, body, query_params)
    if response is None:
        return error_response(start_response, f"Endpoint not found: {method} {path}", status_code=404)
    headers = held.get('headers', [])
    is_json = any(k.lower() == 'content-type' and 'json' in v.lower() for k, v in headers)
    payload = scrub_json_payload(response) if is_json else b''.join(response)
    headers = [(k, v) for k, v in headers if k.lower() != 'content-length'] + [('Content-Length', str(len(payload)))]
    start_response(held.get('status', '200 OK'), headers)
    return [payload]


def app(environ, start_response):
    """Main WSGI Application Handler."""
    method = environ.get('REQUEST_METHOD', 'GET').upper()
    path = environ.get('PATH_INFO', '/')

    # Coolify / load-balancer health probes (no auth)
    if method == 'GET' and path in ('/', '/api/health', '/health'):
        payload = b'{"success":true,"status":"ok","service":"brixen-crm-api"}'
        start_response('200 OK', [
            ('Content-Type', 'application/json; charset=utf-8'),
            ('Content-Length', str(len(payload))),
            ('Cache-Control', 'no-store'),
        ])
        return [payload]

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

    # 3. Parse Body (JSON / form / multipart)
    body = {}
    content_length = environ.get('CONTENT_LENGTH')
    if content_length:
        try:
            cl = int(content_length)
            if cl > 0:
                raw_body = environ['wsgi.input'].read(cl)
                environ['brixen.raw_body'] = raw_body
                content_type = environ.get('CONTENT_TYPE', '')
                if 'application/json' in content_type:
                    body = json.loads(raw_body.decode('utf-8'))
                elif 'multipart/form-data' in content_type.lower():
                    fields, files = parse_multipart_form(raw_body, content_type)
                    body = dict(fields)
                    if files:
                        body['_files'] = files
                elif 'application/x-www-form-urlencoded' in content_type:
                    body = {k: v[0] for k, v in urllib.parse.parse_qs(raw_body.decode('utf-8')).items()}
        except Exception:
            body = {}

    # 4. Pick the workspace database (Finstap: one database per company)
    tenant, tenant_error = resolve_request_tenant(environ, query_params, extract_session_token(environ))
    activate(tenant)

    try:
        # Signup and workspace lookup work without a workspace
        response = handle_platform_routes(environ, custom_start_response, path, method, body, query_params)
        if response is not None:
            return response
        if tenant_error:
            return error_response(custom_start_response, tenant_error, status_code=404)

        # 5. Authenticate User
        user = get_authenticated_user(environ) if tenant else None

        # 5b. Operations staff never see or set money (services/price_privacy.py)
        if hides_prices(user) and applies_to_path(path):
            if blocked_path(path):
                return error_response(custom_start_response, "Prices and invoices are not available to Operations staff.",
                                      status_code=403)
            return _dispatch_without_prices(environ, custom_start_response, path, method, user,
                                            strip_incoming(body), query_params)

        # 6. Dispatch Modular Routes
        response = dispatch_api_routes(environ, custom_start_response, path, method, user, body, query_params)
        if response is not None:
            return response
    except TenantRequiredError:
        return error_response(custom_start_response, "Workspace is required", status_code=400)
    except Exception as exc:
        print(f"[API Server Error] Path: {path} Method: {method} Error: {exc}")
        import traceback
        traceback.print_exc()
        # Do not leak exception details to clients
        return error_response(custom_start_response, "Internal Server Error", status_code=500)
    finally:
        deactivate()

    # 7. Fallback 404
    return error_response(custom_start_response, f"Endpoint not found: {method} {path}", status_code=404)


def run_server():
    """Start the multi-threaded WSGI server (Waitress in production)."""
    # Bring every workspace database up to date (Brixen's existing one is adopted on first run)
    ensure_platform()

    def _startup(tenant):
        ensure_schema()
        # Company workspaces made before their own settings existed get them (empty keys only)
        filled = seed_workspace_settings(tenant)
        if filled:
            print(f"[Tenancy] {tenant['slug']}: filled {filled} starting settings")
        try:
            from services.permanent_purge import enforce_live_database
            enforce_live_database()
            print(f"[PermanentPurge] {tenant['slug']}: live database enforcement complete")
        except Exception as exc:
            print(f"[PermanentPurge] {tenant['slug']}: startup enforce skipped: {exc}")

    for_each_tenant(_startup)

    # Pending (not yet registered) companies are checked at Companies House every 5 minutes, in every workspace
    from services.order_companies import start_pending_registration_worker
    start_pending_registration_worker(lambda job: for_each_tenant(lambda _tenant: job()))

    print("=" * 60)
    print("Brixen CRM Modular API Server Started")
    print(f"Listening on http://{HOST}:{PORT}")
    print(f"CORS Enabled for: {', '.join(sorted(ALLOWED_CORS_ORIGINS))}")
    print("=" * 60)

    try:
        from waitress import serve
        serve(app, host=HOST, port=PORT, threads=8, ident='brixen-crm')
        return
    except ImportError:
        pass

    server = make_server(HOST, PORT, app, server_class=ThreadingWSGIServer)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        server.server_close()


if __name__ == '__main__':
    run_server()
