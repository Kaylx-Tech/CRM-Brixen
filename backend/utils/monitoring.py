"""Datadog APM (optional).

Off unless the server is told where the Datadog Agent is (DD_AGENT_HOST or DD_TRACE_AGENT_URL)
and the ddtrace package is installed. Without those the app runs exactly as before.

Privacy: traces carry the method, a path with ids replaced by '?', status and timings.
Query strings, request bodies, headers, client IPs and exception messages are never sent.
"""
import os
import re
import sys
import traceback

_enabled = False
_HEALTH_PATHS = ('/', '/api/health', '/health')
# Numbers, uuids and long hex/tokens in a path become '?' so one endpoint is one resource
_ID_SEGMENT = re.compile(r'^(\d+|[0-9a-fA-F-]{16,}|[A-Za-z0-9_-]{24,})$')


def _resource_path(path):
    return '/'.join('?' if _ID_SEGMENT.match(part) else part for part in (path or '/').split('/'))


def _span_modifier(span, environ):
    span.resource = f"{environ.get('REQUEST_METHOD', 'GET')} {_resource_path(environ.get('PATH_INFO', '/'))}"
    span.set_tag('http.route', _resource_path(environ.get('PATH_INFO', '/')))


def enabled():
    return _enabled


def init_monitoring(service_default):
    """Patch libraries for tracing. Call once, before the routes are imported."""
    global _enabled
    if not (os.environ.get('DD_AGENT_HOST') or os.environ.get('DD_TRACE_AGENT_URL')):
        return False
    if os.environ.get('DD_TRACE_ENABLED', 'true').lower() in ('0', 'false', 'no'):
        return False

    os.environ.setdefault('DD_SERVICE', service_default)
    os.environ.setdefault('DD_ENV', os.environ.get('CRM_ENV', 'production'))
    commit = os.environ.get('SOURCE_COMMIT', '')
    if commit:
        os.environ.setdefault('DD_VERSION', commit[:7])
    # Never tag query strings (reset tokens, emails, search terms)
    os.environ.setdefault('DD_HTTP_SERVER_TAG_QUERY_STRING', 'false')
    os.environ.setdefault('DD_TRACE_HTTP_CLIENT_TAG_QUERY_STRING', 'false')
    os.environ.setdefault('DD_TRACE_CLIENT_IP_ENABLED', 'false')

    try:
        from ddtrace import patch
        from ddtrace.trace import tracer, TraceFilter

        class _RequestsOnly(TraceFilter):
            """Drop traces that did not start from a web request (startup migrations, background workers)."""
            def process_trace(self, trace):
                root = getattr(trace[0], '_local_root', None) if trace else None
                return trace if root is not None and root.name.startswith('wsgi.') else None

        tracer.configure(trace_processors=[_RequestsOnly()])
        patch(sqlite3=True, requests=True, raise_errors=False)
    except Exception as exc:
        print(f"[Monitoring] Datadog tracing off: {exc}")
        return False
    _enabled = True
    print(f"[Monitoring] Datadog tracing on (service={os.environ['DD_SERVICE']}, env={os.environ['DD_ENV']})")
    return True


def wrap_wsgi(app):
    """Trace every request except health probes. Returns the app unchanged when tracing is off."""
    if not _enabled:
        return app
    from ddtrace.contrib.wsgi import DDWSGIMiddleware
    traced = DDWSGIMiddleware(app, span_modifier=_span_modifier)

    def monitored_app(environ, start_response):
        if environ.get('REQUEST_METHOD') == 'GET' and environ.get('PATH_INFO') in _HEALTH_PATHS:
            return app(environ, start_response)
        return traced(environ, start_response)

    return monitored_app


def tag_request(key, value):
    """Add a non-personal tag (e.g. the workspace slug) to the current request trace."""
    if not _enabled or not value:
        return
    try:
        from ddtrace.trace import tracer
        span = tracer.current_root_span()
        if span is not None:
            span.set_tag(key, value)
    except Exception:
        pass


def record_exception(exc):
    """Mark the current request trace as an error: exception type and code location only, no message."""
    if not _enabled:
        return
    try:
        from ddtrace.trace import tracer
        span = tracer.current_root_span()
        if span is None:
            return
        span.error = 1
        span.set_tag('error.type', f"{type(exc).__module__}.{type(exc).__name__}")
        span.set_tag('error.message', type(exc).__name__)
        span.set_tag('error.stack', ''.join(traceback.format_tb(sys.exc_info()[2] or exc.__traceback__)))
    except Exception:
        pass
