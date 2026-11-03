"""KYC (Brixen): identity checks for Brixen's clients run on Finstap.

Brixen has a KYC workspace on Finstap. Its KYC link opens the form on Brixen's own portal
(portal.brixenconsultants.com/verify/...), which talks to the Finstap API from the browser; Finstap's KYC
team checks what is sent at kyc.finstap.com. This route gives Brixen's team the link and its own record of
the checks, read from Finstap with the workspace's API key.

GET /api/admin/kyc  → {configured, link, workspace, checks: [...]}

Env: FINSTAP_KYC_KEY (from admin.finstap.com → KYC → KYC for another website), FINSTAP_KYC_WORKSPACE
(the Finstap workspace's name, default "brixen"), FINSTAP_API_URL (default https://api.finstap.com/api).
"""
import json
import os
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


def _fetch(cfg):
    """(data, error) from Finstap's partner API."""
    req = urllib.request.Request(f"{cfg['api']}/kyc-partner/checks", headers={
        'X-Tenant': cfg['workspace'], 'X-KYC-Key': cfg['key'], 'Accept': 'application/json',
        # Cloudflare (in front of api.finstap.com) refuses Python's default User-Agent (error 1010)
        'User-Agent': 'BrixenCRM/1.0 (+https://brixenconsultants.com)',
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            return (json.loads(res.read() or b'{}').get('data') or {}), None
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return None, "Finstap refused the KYC key. Make a new key in admin.finstap.com and set FINSTAP_KYC_KEY."
        if exc.code == 404:
            return None, "Finstap does not know this workspace. Check FINSTAP_KYC_WORKSPACE (the workspace's name)."
        return None, f"Finstap answered {exc.code}. Please try again in a moment."
    except Exception as exc:
        print(f"[KYC] Finstap could not be reached: {exc}")
        return None, "Finstap could not be reached. Please try again in a moment."


def handle_kyc_partner_routes(environ, start_response, path, method, user, body, query):
    if path != '/api/admin/kyc':
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if user.get('role') not in TEAM_ROLES:
        return error_response(start_response, "KYC is for the team only.", status_code=403)
    if method != 'GET':
        return error_response(start_response, "Not found", status_code=404)
    cfg = _settings()
    if not cfg['key']:
        return success_response(start_response, data={'configured': False, 'link': None, 'checks': []})
    data, err = _fetch(cfg)
    if err:
        return error_response(start_response, err, status_code=502)
    return success_response(start_response, data={'configured': True, **data})
