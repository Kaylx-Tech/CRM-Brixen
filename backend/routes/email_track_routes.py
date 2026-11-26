"""Email opens and clicks (services/email_tracking.py). No sign-in: mail apps and readers call these.

  GET /api/public/email/o/<token>.gif   the 1x1 picture at the end of an email: counts an open
  GET /api/public/email/c/<token>/<n>   a link in an email: counts a click, then goes to where the link pointed
"""
import re


def handle_email_track_routes(environ, start_response, path, method, user, body, query):
    if not path.startswith('/api/public/email/') or method not in ('GET', 'HEAD'):
        return None
    from services import email_tracking

    m = re.match(r'^/api/public/email/o/([A-Za-z0-9_-]{16,64})(?:\.gif)?$', path)
    if m:
        try:
            email_tracking.record_open(m.group(1))
        except Exception as exc:
            print(f"[Email tracking] open: {exc}")
        start_response('200 OK', [('Content-Type', 'image/gif'), ('Content-Length', str(len(email_tracking.PIXEL))),
                                  ('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')])
        return [email_tracking.PIXEL]

    m = re.match(r'^/api/public/email/c/([A-Za-z0-9_-]{16,64})/(\d{1,4})$', path)
    if m:
        url = None
        try:
            url = email_tracking.record_click(m.group(1), m.group(2))
        except Exception as exc:
            print(f"[Email tracking] click: {exc}")
        if not url:
            start_response('404 Not Found', [('Content-Type', 'text/plain; charset=utf-8')])
            return [b'This link is not valid any more.']
        start_response('302 Found', [('Location', url), ('Cache-Control', 'no-store')])
        return [b'']
    return None
