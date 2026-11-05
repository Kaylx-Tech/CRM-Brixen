"""KYC (Brixen): identity checks for Brixen's clients run on Finstap.

Brixen has a KYC workspace on Finstap. Its KYC link opens the form on Brixen's own portal
(portal.brixenconsultants.com/verify/...), which talks to the Finstap API from the browser; Finstap's KYC
team checks what is sent at kyc.finstap.com. These routes give Brixen's team the link, its own record of
the checks, and each check's details and documents to view (read only), from Finstap with the workspace's
API key.

GET /api/admin/kyc                          → {configured, link, workspace, checks: [...]}
GET /api/admin/kyc/<id>                     → one check: the client's answers, the order, the documents list
GET /api/admin/kyc/<id>/files/<file_id>     → one document (photo or PDF)
POST /api/admin/kyc/start {order_id}        → start a KYC order's check now (one that was missed) and email the link
POST /api/admin/kyc/ignore {order_id, undo?} → leave a missed KYC order out of the list (no link)
POST /api/admin/kyc/<id>/order {order_number} → link a check to an order (e.g. one from the general KYC link)
POST /api/admin/kyc/<id>/remove             → delete a check the client has not sent yet (admins)

Env: FINSTAP_KYC_KEY (from admin.finstap.com → KYC → KYC for another website), FINSTAP_KYC_WORKSPACE
(the Finstap workspace's name, default "brixen"), FINSTAP_API_URL (default https://api.finstap.com/api).
"""
import json
import os
import re
import urllib.error
import urllib.request

from services.order_applicant import applicant as order_client
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
        # Finstap's own reason (e.g. the workspace is suspended), so the team sees what to fix
        try:
            reason = str(json.loads(exc.read() or b'{}').get('error') or '')
        except ValueError:
            reason = ''
        if 'suspended' in reason.lower():
            return None, None, (f"Brixen's KYC workspace on Finstap (\"{cfg['workspace']}\") is suspended. "
                                "Reactivate it in admin.finstap.com → Workspaces.")
        if reason.lower() == 'workspace not found':
            return None, None, (f"Finstap has no workspace called \"{cfg['workspace']}\". "
                                "Check FINSTAP_KYC_WORKSPACE (the workspace's name).")
        if exc.code == 404:
            return None, None, f"Not found on Finstap{': ' + reason if reason else ''}."
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


def _order_person(order_id):
    """(order_number, name, email, phone) of a KYC order's customer, or None (guest website orders wait)."""
    from db import query_db
    from routes.id_verification_routes import GUEST_EMAIL
    order = query_db("""
        SELECT o.order_number, o.owner_name, o.owner_form_email, o.order_form_values_json, o.checkout_form_json, o.checkout_phone,
               u.full_name, u.email, u.phone
        FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?;
    """, (int(order_id),), one=True)
    if not order or str(order.get('email') or '').lower() == GUEST_EMAIL:
        return None
    name, email = order_client(order)
    if not name or not email:
        return None
    return order.get('order_number') or f"order {order_id}", name, email, order.get('checkout_phone') or order.get('phone') or ''


def _ensure_ignored():
    from db import execute_db
    execute_db("""
        CREATE TABLE IF NOT EXISTS kyc_ignored_orders (
            order_id INTEGER PRIMARY KEY,
            ignored_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)


def _missing_orders(checks):
    """Open KYC orders from the last 90 days with no check on Finstap yet (e.g. made while Finstap was off),
    with what helps to decide: the order's status, whether the person is already verified (an approved
    older check, or the company's Companies House personal code), and other orders of the same client.
    Completed, cancelled and refunded orders and the ones the team ignored are left out."""
    from db import query_db
    _ensure_ignored()
    have = {str(c.get('order_number') or '').strip() for c in checks}
    rows = query_db("""
        SELECT o.id, o.order_number, o.created_at, o.status, o.owner_name, o.owner_form_email,
               o.order_form_values_json, o.checkout_form_json, u.full_name, u.email,
               COALESCE(u.is_b2b, 0) AS is_b2b, u.client_type,
               NULLIF(TRIM(COALESCE(c.activation_code, '')), '') AS ch_code,
               (SELECT 1 FROM id_verifications v WHERE v.order_id = o.id AND v.status = 'Approved' LIMIT 1)
                   AS approved_before
        FROM orders o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN companies c ON c.id = o.company_id
        WHERE COALESCE(o.is_draft, 0) = 0 AND datetime(o.created_at) >= datetime('now', '-90 days')
          AND o.status NOT IN ('Completed', 'Cancelled', 'Refunded')
          AND o.id NOT IN (SELECT order_id FROM kyc_ignored_orders)
          AND (o.service_name LIKE '%kyc%' OR EXISTS (SELECT 1 FROM order_line_items li
               WHERE li.order_id = o.id AND li.product_name LIKE '%kyc%'))
        ORDER BY o.created_at DESC;
    """) or []
    rows = [dict(r) for r in rows if str(r.get('order_number') or '').strip() not in have]
    for r in rows:
        r['client_name'], r['email'] = order_client(r)
        for key in ('owner_name', 'owner_form_email', 'order_form_values_json', 'checkout_form_json', 'full_name'):
            r.pop(key, None)
    seen = {}
    for r in rows:
        key = str(r.get('email') or '').strip().lower()
        r['verified'] = 'ch_code' if r.pop('ch_code', None) else ('approved' if r.pop('approved_before', None) else '')
        r.pop('approved_before', None)
        r['b2b'] = bool(r.pop('is_b2b')) or str(r.pop('client_type', '') or '').upper() == 'B2B'
        # The newest order of a client is the one to send; older ones of the same email say so
        r['newer_order'] = seen.get(key) if key else None
        if key and key not in seen:
            seen[key] = r['order_number']
    return rows


def _post(cfg, path, payload):
    """(data, error): POST to Finstap's KYC partner API with the workspace's key."""
    req = urllib.request.Request(f"{cfg['api']}/kyc-partner/{path}", data=json.dumps(payload or {}).encode(),
                                 method='POST', headers={'X-Tenant': cfg['workspace'], 'X-KYC-Key': cfg['key'],
                                                         'Content-Type': 'application/json', 'Accept': 'application/json',
                                                         'User-Agent': 'BrixenCRM/1.0 (+https://brixenconsultants.com)'})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return (json.loads(res.read() or b'{}').get('data') or {}), None
    except urllib.error.HTTPError as exc:
        try:
            return None, (json.loads(exc.read() or b'{}').get('error')) or f"Finstap answered {exc.code}"
        except ValueError:
            return None, f"Finstap answered {exc.code}"
    except Exception as exc:
        return None, f"Finstap could not be reached: {exc}"


def _find_order(typed):
    """An order by its number; "BRX-1008" finds "BRX-1008-OCT26" when only one order starts with it."""
    from db import query_db
    number = re.sub(r'\s+', '', str(typed or '')).upper()
    if not number:
        return None
    rows = query_db("SELECT id, order_number FROM orders WHERE UPPER(order_number) = ? OR UPPER(order_number) LIKE ? "
                    "ORDER BY (UPPER(order_number) = ?) DESC LIMIT 2;", (number, f"{number}-%", number)) or []
    if rows and (rows[0]['order_number'].upper() == number or len(rows) == 1):
        return rows[0]
    return None


def _correct_on_finstap(cfg, check_id, name, email):
    """Tell Finstap the applicant of a check that was made with the account holder's details."""
    body = json.dumps({'full_name': name, 'email': email}).encode()
    req = urllib.request.Request(f"{cfg['api']}/kyc-partner/checks/{int(check_id)}/person", data=body, method='POST',
                                 headers={'X-Tenant': cfg['workspace'], 'X-KYC-Key': cfg['key'],
                                          'Content-Type': 'application/json', 'Accept': 'application/json',
                                          'User-Agent': 'BrixenCRM/1.0 (+https://brixenconsultants.com)'})
    try:
        with urllib.request.urlopen(req, timeout=20):
            return True
    except Exception as exc:
        print(f"[KYC] check {check_id}: applicant not corrected on Finstap ({exc})")
        return False


def _with_order_client(checks, cfg=None):
    """A check made for an order shows the applicant as the order says (not the customer account's details).
    One that still carries other details and is not sent yet is corrected on Finstap too (a new email gets
    a fresh link)."""
    from db import query_db
    numbers = [str(c.get('order_number') or '').strip() for c in checks if c.get('order_number')]
    if not numbers:
        return
    marks = ','.join('?' * len(numbers))
    orders = {r['order_number']: r for r in (query_db(f"""
        SELECT o.order_number, o.owner_name, o.owner_form_email, o.order_form_values_json, o.checkout_form_json, u.full_name, u.email
        FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.order_number IN ({marks});
    """, tuple(numbers)) or [])}
    for c in checks:
        order = orders.get(str(c.get('order_number') or '').strip())
        if order:
            name, email = order_client(order)
            differs = (name and name.strip().lower() != str(c.get('full_name') or '').strip().lower()) or \
                (email and email.strip().lower() != str(c.get('email') or '').strip().lower())
            if differs and cfg and c.get('id') and c.get('status') in ('Not Started', 'In Progress', 'Declined'):
                _correct_on_finstap(cfg, c['id'], name or c.get('full_name'), email or c.get('email'))
            c['full_name'] = name or c.get('full_name')
            c['email'] = email or c.get('email')


def handle_kyc_partner_routes(environ, start_response, path, method, user, body, query):
    if path != '/api/admin/kyc' and not path.startswith('/api/admin/kyc/'):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if user.get('role') not in TEAM_ROLES:
        return error_response(start_response, "KYC is for the team only.", status_code=403)
    cfg = _settings()
    if path == '/api/admin/kyc/ignore' and method == 'POST':
        from db import execute_db
        _ensure_ignored()
        order_id = int((body or {}).get('order_id') or 0)
        if (body or {}).get('undo'):
            execute_db("DELETE FROM kyc_ignored_orders WHERE order_id = ?;", (order_id,))
            return success_response(start_response, message="Back in the list.")
        execute_db("INSERT OR IGNORE INTO kyc_ignored_orders (order_id, ignored_by) VALUES (?, ?);",
                   (order_id, user.get('email')))
        return success_response(start_response, message="Removed from the list. No KYC link is sent for it.")
    if path == '/api/admin/kyc/start' and method == 'POST':
        if not cfg['key']:
            return error_response(start_response, "KYC is not connected to Finstap yet.", status_code=400)
        person = _order_person((body or {}).get('order_id') or 0)
        if not person:
            return error_response(start_response, "This order has no customer name and email yet (link the customer "
                                                  "first).", status_code=400)
        data, err = start_for_order(*person)
        if err:
            return error_response(start_response, err, status_code=502)
        return success_response(start_response, data=data, message=(
            f"KYC link emailed to {person[2]}." if data.get('emailed') else "Check started; copy their link to send it."))
    # Link a check to an order (one started from the general KYC link), or delete one the client has not sent
    action = re.match(r'^/api/admin/kyc/(\d+)/(order|remove)$', path)
    if action and method == 'POST':
        if not cfg['key']:
            return error_response(start_response, "KYC is not connected to Finstap yet.", status_code=400)
        if action.group(2) == 'order':
            order = _find_order((body or {}).get('order_number'))
            if not order:
                return error_response(start_response, "No order with that number. Check it and try again.", status_code=400)
            _data, err = _post(cfg, f"checks/{action.group(1)}/order", {'reference': order['order_number']})
            if err:
                return error_response(start_response, err, status_code=400)
            return success_response(start_response, data={'order_number': order['order_number']},
                                    message=f"Linked to {order['order_number']}.")
        if user.get('role') not in ('SUPER_ADMIN', 'ADMIN'):
            return error_response(start_response, "Only an admin can delete a KYC check.", status_code=403)
        _data, err = _post(cfg, f"checks/{action.group(1)}/remove", {})
        if err:
            return error_response(start_response, err, status_code=400)
        return success_response(start_response, message="KYC check deleted. Its link no longer works.")
    if method != 'GET':
        return error_response(start_response, "Not found", status_code=404)
    if path == '/api/admin/kyc':
        if not cfg['key']:
            return success_response(start_response, data={'configured': False, 'link': None, 'checks': []})
        data, err = _fetch(cfg)
        if err:
            return error_response(start_response, err, status_code=502)
        _with_order_client(data.get('checks') or [], cfg)
        try:
            data['missing_orders'] = _missing_orders(data.get('checks') or [])
        except Exception as exc:
            print(f"[KYC] KYC orders without a check: {exc}")
            data['missing_orders'] = []
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
