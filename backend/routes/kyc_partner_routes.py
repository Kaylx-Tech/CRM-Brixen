"""KYC (Brixen): identity checks for Brixen's clients run on Finstap.

Brixen has a KYC workspace on Finstap. Its KYC link opens the form on Brixen's own portal
(portal.brixenconsultants.com/verify/...), which talks to the Finstap API from the browser; Finstap's KYC
team checks what is sent at kyc.finstap.com. These routes give Brixen's team the link, its own record of
the checks, and each check's details and documents to view (read only), from Finstap with the workspace's
API key.

GET /api/admin/kyc                          → {configured, link, workspace, checks: [...]}
GET /api/admin/kyc/<id>                     → one check: the client's answers, the order, the documents list
GET /api/admin/kyc/<id>/files/<file_id>     → one document (photo or PDF)

Env: FINSTAP_KYC_KEY (from admin.finstap.com → KYC → KYC for another website), FINSTAP_KYC_WORKSPACE
(the Finstap workspace's name, default "brixen"), FINSTAP_API_URL (default https://api.finstap.com/api).
"""
import json
import os
import re
import urllib.error
import urllib.request

from utils.response import success_response, error_response

TEAM_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')


def _settings():
    return {
        'key': (os.environ.get('FINSTAP_KYC_KEY') or '').strip(),
        'workspace': (os.environ.get('FINSTAP_KYC_WORKSPACE') or 'brixen').strip().lower(),
        'api': (os.environ.get('FINSTAP_API_URL') or 'https://api.finstap.com/api').strip().rstrip('/'),
    }


def _get(cfg, path):
    """(bytes, content type, error) from Finstap's partner API."""
    req = urllib.request.Request(f"{cfg['api']}/kyc-partner/{path}", headers={
        'X-Tenant': cfg['workspace'], 'X-KYC-Key': cfg['key'], 'Accept': 'application/json',
        # Cloudflare (in front of api.finstap.com) refuses Python's default User-Agent (error 1010)
        'User-Agent': 'BrixenCRM/1.0 (+https://brixenconsultants.com)',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.read(), res.headers.get('Content-Type') or 'application/octet-stream', None
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return None, None, "Finstap refused the KYC key. Make a new key in admin.finstap.com and set FINSTAP_KYC_KEY."
        if exc.code == 404:
            return None, None, ("Not found on Finstap. If nothing loads at all, check FINSTAP_KYC_WORKSPACE "
                                "(the workspace's name).")
        return None, None, f"Finstap answered {exc.code}. Please try again in a moment."
    except Exception as exc:
        print(f"[KYC] Finstap could not be reached: {exc}")
        return None, None, "Finstap could not be reached. Please try again in a moment."


def finstap_kyc_ready():
    """Brixen's KYC runs on Finstap (FINSTAP_KYC_KEY is set): KYC orders start their check there."""
    return bool(_settings()['key'])


def start_for_order(order_number, full_name, email, phone=''):
    """A KYC order: Finstap makes the client's check and emails them the form link (it opens on Brixen's
    portal). Tried twice; a failure goes to GlitchTip. Returns (data, error)."""
    cfg = _settings()
    first, _, last = str(full_name or '').strip().partition(' ')
    body = json.dumps({'first_name': first, 'last_name': last.strip(), 'email': email, 'phone': phone,
                       'reference': order_number}).encode()
    err = None
    for _attempt in range(2):
        req = urllib.request.Request(f"{cfg['api']}/kyc-partner/checks", data=body, method='POST', headers={
            'X-Tenant': cfg['workspace'], 'X-KYC-Key': cfg['key'], 'Content-Type': 'application/json',
            'Accept': 'application/json', 'User-Agent': 'BrixenCRM/1.0 (+https://brixenconsultants.com)',
        })
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return (json.loads(res.read() or b'{}').get('data') or {}), None
        except urllib.error.HTTPError as exc:
            try:
                err = (json.loads(exc.read() or b'{}').get('error')) or f"Finstap answered {exc.code}"
            except ValueError:
                err = f"Finstap answered {exc.code}"
            if exc.code < 500:
                break  # a wrong key or missing email will not change on a second try
        except Exception as exc:
            err = f"Finstap could not be reached: {exc}"
    try:
        from services.error_tracking import report_problem
        report_problem('kyc', f"KYC check for order {order_number} not started on Finstap ({err})",
                       level='error', order=order_number, email=email)
    except ImportError:
        print(f"[KYC] order {order_number}: {err}")
    return None, err


def _fetch(cfg, path='checks'):
    """(data, error): a JSON answer's data."""
    raw, _type, err = _get(cfg, path)
    if err:
        return None, err
    return (json.loads(raw or b'{}').get('data') or {}), None


def handle_kyc_partner_routes(environ, start_response, path, method, user, body, query):
    if path != '/api/admin/kyc' and not path.startswith('/api/admin/kyc/'):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if user.get('role') not in TEAM_ROLES:
        return error_response(start_response, "KYC is for the team only.", status_code=403)
    if method != 'GET':
        return error_response(start_response, "Not found", status_code=404)
    cfg = _settings()
    if path == '/api/admin/kyc':
        if not cfg['key']:
            return success_response(start_response, data={'configured': False, 'link': None, 'checks': []})
        data, err = _fetch(cfg)
        if err:
            return error_response(start_response, err, status_code=502)
        return success_response(start_response, data={'configured': True, **data})

    match = re.match(r'^/api/admin/kyc/(\d+)(?:/files/(\d+))?$', path)
    if not match or not cfg['key']:
        return error_response(start_response, "Not found", status_code=404)
    if match.group(2):
        raw, kind, err = _get(cfg, f"checks/{match.group(1)}/files/{match.group(2)}")
        if err:
            return error_response(start_response, err, status_code=502)
        start_response('200 OK', [('Content-Type', kind), ('Content-Length', str(len(raw))),
                                  ('Cache-Control', 'private, no-store'), ('X-Content-Type-Options', 'nosniff')])
        return [raw]
    data, err = _fetch(cfg, f"checks/{match.group(1)}")
    if err:
        return error_response(start_response, err, status_code=502)
    return success_response(start_response, data=data)
