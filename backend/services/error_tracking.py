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


def capture_api_error(exc, path, method, user=None, workspace=None):
    """Report an exception that the API turned into a 500 (the client only sees "Internal Server Error").
    `workspace` is the Finstap workspace slug, so an error shows which company it happened in."""
    if not _enabled:
        return
    try:
        import sentry_sdk
        with sentry_sdk.new_scope() as scope:
            scope.set_tag('path', path)
            scope.set_tag('method', method)
            if workspace:
                scope.set_tag('workspace', workspace)
            if user and user.get('id'):
                scope.set_user({'id': str(user.get('id'))})
                scope.set_tag('role', user.get('role') or '')
            sentry_sdk.capture_exception(exc)
    except Exception as track_exc:
        print(f"[ErrorTracking] Could not report error: {track_exc}")
