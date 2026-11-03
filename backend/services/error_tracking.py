"""Error tracking: crashes go to GlitchTip (errors.finstap.com, Sentry-compatible) when SENTRY_DSN is set.

Without SENTRY_DSN (local dev) or without the sentry-sdk package nothing is sent and the API works as before.
No personal data leaves the server: no request bodies, cookies, headers or IP addresses, only the user id.
"""
import os

from config import CRM_ENV

_enabled = False


def init_error_tracking():
    """Start the SDK once at import of main.py; safe to call when not configured."""
    global _enabled
    dsn = (os.environ.get('SENTRY_DSN') or '').strip()
    if not dsn or _enabled:
        return
    try:
        import sentry_sdk
    except ImportError:
        print("[ErrorTracking] SENTRY_DSN is set but sentry-sdk is not installed")
        return
    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get('SENTRY_ENVIRONMENT') or CRM_ENV,
        release=os.environ.get('SOURCE_COMMIT') or None,
        send_default_pii=False,
        max_request_body_size='never',
        # Stack frames hold request bodies, users and customers (passwords too), so their variables stay here
        include_local_variables=False,
        traces_sample_rate=0,
    )
    _enabled = True
    print("[ErrorTracking] Sending errors to GlitchTip")


def capture_api_error(exc, path, method, user=None):
    """Report an exception that the API turned into a 500 (the client only sees "Internal Server Error")."""
    if not _enabled:
        return
    try:
        import sentry_sdk
        with sentry_sdk.new_scope() as scope:
            scope.set_tag('path', path)
            scope.set_tag('method', method)
            if user and user.get('id'):
                scope.set_user({'id': str(user.get('id'))})
                scope.set_tag('role', user.get('role') or '')
            sentry_sdk.capture_exception(exc)
    except Exception as track_exc:
        print(f"[ErrorTracking] Could not report error: {track_exc}")


# The same problem is sent once per REPORT_EVERY seconds (a broken mailbox would otherwise send one per email)
REPORT_EVERY = 600
_reported = {}


def report_problem(area, message, level='warning', **context):
    """A service failed but the person carried on (a fallback took over), or a problem worth a look: always in
    the server log, and in GlitchTip with the area (email, storage, kyc …), the workspace and `context`, so it can
    be found and fixed quickly. Never raises."""
    import time
    try:
        workspace = ''
        try:
            from tenancy import current_tenant
            workspace = (current_tenant() or {}).get('slug') or ''
        except Exception:
            pass
        text = f"{area}: {str(message)[:300]}"
        print(f"[Problem] {text}" + (f" ({workspace})" if workspace else '') +
              (f" {context}" if context else ''))
        if not _enabled:
            return
        key = (area, str(message)[:120], workspace)
        now = time.time()
        if now - _reported.get(key, 0) < REPORT_EVERY:
            return
        _reported[key] = now
        import sentry_sdk
        with sentry_sdk.new_scope() as scope:
            scope.set_tag('area', area)
            if workspace:
                scope.set_tag('workspace', workspace)
            for name, value in context.items():
                scope.set_extra(name, str(value)[:500])
            sentry_sdk.capture_message(text, level=level)
    except Exception as track_exc:
        print(f"[ErrorTracking] Could not report a problem: {track_exc}")
