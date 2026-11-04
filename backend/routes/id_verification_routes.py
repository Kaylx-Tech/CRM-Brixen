"""ID Verification (Smart Operations): verify the identity of each person on a KYC order.

Finstap runs its own check (services/kyc_form.py): the team adds the people to verify (directors, PSCs …)
to an order, each gets a private link to a step-by-step form (document photos, details, live selfie,
address, proof of address), and the KYC desk reviews what they send. After the ACSP has told Companies
House about the verification, the person's Companies House personal code is saved here.

POST /api/admin/id-verification/orders/<order_id>/people  {full_name, email, person_role}  (+ makes the link)
PUT  /api/admin/id-verification/<id>            any of {full_name, email, person_role, ch_personal_code}
POST /api/admin/id-verification/<id>/session    make the link (again, if it could not be made)
POST /api/admin/id-verification/<id>/email      email the verification link to the person
POST /api/admin/id-verification/<id>/refresh    the latest status
GET  /api/kyc-form/<code>                       the person's form (no login, the private code)
POST /api/kyc-form/<code>/file                  one photo or file {kind, file}
POST /api/kyc-form/<code>/submit                the answers; the check goes to the KYC desk
GET/POST /api/kyc-link/<workspace>.<code>       the workspace's own KYC link: any client starts a check (no order)
GET  /api/kyc-partner/checks                    another website's server (X-KYC-Key): its checks and link
POST /api/kyc-partner/checks                    …starts a check for its order {first_name, last_name, email, reference}
GET  /api/kyc-partner/checks/<id>[/files/<fid>] one check's details, or one of its documents (read only)
POST /api/webhooks/didit                        Didit status updates (older checks; signed, no login)
"""
import json
import re

from services.order_applicant import applicant
from db import query_db, execute_db
from services import didit_service
from utils.validation import validation_error
from utils.response import success_response, error_response
from utils.validation import email_problem

TEAM_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
PERSON_ROLES = ('Director', 'PSC', 'Director & PSC', 'Secretary', 'Member', 'Presenter', 'Other')


def vendor_data_for(verification_id):
    """acme:idv-12 — the workspace is part of it, so two companies on one Didit account never
    pick up each other's session (Didit reuses an unfinished session with the same vendor_data)."""
    from tenancy import current_tenant
    slug = (current_tenant() or {}).get('slug') or ''
    return f"{slug}:idv-{verification_id}" if slug else f"idv-{verification_id}"


def _verification_id_from_vendor_data(value):
    """The verification id, only when vendor_data belongs to the workspace this webhook arrived for."""
    from tenancy import current_tenant
    slug = (current_tenant() or {}).get('slug') or ''
    match = re.match(r'^(?:([a-z0-9-]+):)?idv-(\d+)$', str(value or ''))
    if not match or (match.group(1) or '') != slug:
        return None
    return int(match.group(2))


def serialize(row):
    out = dict(row)
    try:
        out['result'] = json.loads(out.pop('result_json') or '{}')
    except ValueError:
        out['result'] = {}
    return out


def people_for_orders(order_ids):
    """{order_id: [verification, …]} for the ID Verification list."""
    if not order_ids:
        return {}
    marks = ','.join('?' for _ in order_ids)
    rows = query_db(f"SELECT * FROM id_verifications WHERE order_id IN ({marks}) ORDER BY id;",
                    tuple(order_ids)) or []
    out = {}
    for r in rows:
        out.setdefault(r['order_id'], []).append(serialize(r))
    return out


def _row(verification_id):
    return query_db("SELECT * FROM id_verifications WHERE id = ?;", (verification_id,), one=True)


def _order(order_id):
    return query_db("""
        SELECT o.id, o.order_number, o.created_by_id, o.user_id, u.full_name AS customer_name
        FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?;
    """, (order_id,), one=True)


def _can_open(user, order):
    """STAFF only work with the orders they added (as on the Orders page)."""
    if not order:
        return False
    return user.get('role') != 'STAFF' or int(order.get('created_by_id') or 0) == int(user.get('id') or 0)


def _clean_person(body, partial=False):
    body = body if isinstance(body, dict) else {}
    out = {}
    for key, limit in (('full_name', 160), ('email', 200), ('person_role', 40), ('ch_personal_code', 40)):
        if key in body or (not partial and key != 'ch_personal_code'):
            out[key] = str(body.get(key) or '').strip()[:limit]
    if 'full_name' in out and not out['full_name']:
        return None, {'full_name': "Full name is required."}
    if out.get('email') and email_problem(out['email']):
        return None, {'email': email_problem(out['email'])}
    if out.get('person_role') and out['person_role'] not in PERSON_ROLES:
        out['person_role'] = 'Other'
    # Companies House personal code: 11 letters and numbers, given once the identity is verified
    if out.get('ch_personal_code'):
        out['ch_personal_code'] = re.sub(r'[\s-]', '', out['ch_personal_code']).upper()
        if not re.fullmatch(r'[A-Z0-9]{11}', out['ch_personal_code']):
            return None, {'ch_personal_code': "Personal code must be 11 letters and numbers."}
    return out, None


def kyc_off_reason():
    """Why this workspace may not start ID checks (the paid KYC service is off), or None."""
    try:
        from tenancy import current_tenant
        from services import kyc_billing
    except ImportError:
        return None
    return None if kyc_billing.enabled(current_tenant()) else kyc_billing.off_message()


def start_session(verification_id):
    """Make the person's private form link (a new one replaces the last). Returns (row, error)."""
    from services import kyc_form
    row = _row(verification_id)
    if not row.get('session_url'):
        off = kyc_off_reason()
        if off:
            return dict(row), off
        # Finstap: a new check needs an ID check credit (unpaid checks per plan, services/autoallot.py)
        try:
            from tenancy import current_tenant
            from services.autoallot import AutoAllotError, check_kyc_credit
            check_kyc_credit(current_tenant())
        except ImportError:
            pass
        except AutoAllotError as exc:
            return dict(row), str(exc)
    if row['status'] not in kyc_form.OPEN_STATUSES:
        return dict(row), "This person has already sent their documents."
    status = 'Declined' if row['status'] == 'Declined' else 'Not Started'
    first = not row.get('session_url')
    fresh = dict(kyc_form.new_link(verification_id, status=status))
    if first:  # the check counts now: charged from the workspace's balance (services/kyc_billing.py)
        try:
            from tenancy import current_tenant
            from services.kyc_billing import charge_check
            charge_check(current_tenant(), verification_id, row['full_name'])
        except ImportError:
            pass
    return fresh, None


def apply_result(verification_id, status, decision=None):
    """Save a status (and the result summary) from Didit; tells whoever started it once it is final."""
    row = _row(verification_id)
    if not row:
        return
    sets, params = ["status = ?", "updated_at = datetime('now')"], [status or row['status']]
    if decision:
        sets.append("result_json = ?")
        params.append(json.dumps(didit_service.summarise_decision(decision)))
    execute_db(f"UPDATE id_verifications SET {', '.join(sets)} WHERE id = ?;", tuple(params + [verification_id]))
    if status != row['status'] and status in didit_service.FINAL_STATUSES:
        # Finstap AutoAllot: a registered office waiting for this check is allotted (or stopped) now
        try:
            from tenancy import current_tenant
            from services.autoallot import verification_finished
            verification_finished(current_tenant(), verification_id, status)
        except ImportError:
            pass
        except Exception as exc:
            print(f"[AutoAllot] check {verification_id}: {exc}")
    if status != row['status'] and status in didit_service.FINAL_STATUSES + ('In Review', 'Submitted') \
            and row.get('created_by'):
        try:
            from services.notification_service import create_notification
            order = _order(row['order_id']) or {}
            words = 'sent their documents for review' if status == 'Submitted' else status
            create_notification(
                row['created_by'], f"ID verification: {status}",
                f"{row['full_name']} ({order.get('order_number') or 'order'}): {words}.",
                ntype='success' if status == 'Approved' else 'warning',
                link='/admin/smart-operations')
        except Exception:
            pass


def _email_link(row, user):
    from services.client_mail import compose_client_email
    from services.email_service import send_email, last_failure_reason
    if not row.get('email'):
        return "Add the person's email address first."
    if not row.get('session_url'):
        return "Start the verification first."
    order = _order(row['order_id']) or {}
    subject, text, html = compose_client_email(
        subject='Verify your identity',
        headline='Verify your identity',
        greeting=row['full_name'],
        message=("To complete your order we need to verify your identity, as Companies House requires for "
                 "directors and people with significant control. It takes about five minutes: follow the secure "
                 "link below, best on your phone."),
        points=['Have your ID card, driving licence or passport ready: you will photograph it and take a live '
                'selfie.',
                'Have a proof of address from the last 3 months ready (bank statement, utility bill or a '
                'government letter), as a photo or PDF, to upload.',
                'Your details are sent securely and only seen by the team checking them.'],
        details=[('Order', order.get('order_number'))],
        cta_label='Verify my identity', cta_url=row['session_url'], category='ORDER')
    ok = send_email(row['email'], subject, html, text, category='ORDER', user_id=order.get('user_id'), mailbox='kyc',
                    order_id=row['order_id'], triggered_by=user.get('id'))
    if not ok:
        return f"The email was not sent: {last_failure_reason() or 'email is not set up'}"
    execute_db("UPDATE id_verifications SET link_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?;",
               (row['id'],))
    return None


def _client_step(status):
    """What the customer sees: never the AML or document details, only what they need to do."""
    if status == 'Approved':
        return 'verified'
    if status in ('In Review', 'Resubmitted', 'Submitted'):
        return 'checking'
    if status in ('Declined',):
        return 'not_verified'
    if status in ('Expired', 'Kyc Expired', 'Abandoned'):
        return 'expired'
    return 'action_needed'


def _client_view(user):
    """The identity checks on the customer's own orders (client portal)."""
    rows = query_db("""
        SELECT v.id, v.order_id, v.full_name, v.person_role, v.status, v.session_url, v.ch_personal_code,
               v.updated_at, o.order_number
        FROM id_verifications v JOIN orders o ON o.id = v.order_id
        WHERE o.user_id = ? AND COALESCE(o.is_draft, 0) = 0
        ORDER BY v.id DESC;
    """, (user.get('id'),)) or []
    out = []
    for r in rows:
        step = _client_step(r['status'])
        out.append({
            'id': r['id'], 'order_id': r['order_id'], 'order_number': r['order_number'],
            'full_name': r['full_name'], 'person_role': r['person_role'], 'step': step,
            # The link only while there is something to do
            'verify_url': r['session_url'] if step == 'action_needed' else None,
            'ch_personal_code': r['ch_personal_code'] if step == 'verified' else None,
        })
    return out


GUEST_EMAIL = 'guest.unlinked@brixenconsultants.com'


def is_kyc_order(order_id):
    return bool(query_db("""
        SELECT 1 FROM orders o WHERE o.id = ? AND COALESCE(o.is_draft, 0) = 0
          AND (o.service_name LIKE '%kyc%' OR EXISTS (SELECT 1 FROM order_line_items li
               WHERE li.order_id = o.id AND li.product_name LIKE '%kyc%'));
    """, (order_id,), one=True))


def _auto_start(order_id, triggered_by):
    """Add the customer as the first person to verify, start Didit and email them the link."""
    try:
        if not is_kyc_order(order_id) or kyc_off_reason():
            return
        if query_db("SELECT 1 FROM id_verifications WHERE order_id = ? LIMIT 1;", (order_id,), one=True):
            return
        order = query_db("""
            SELECT o.id, o.owner_name, o.owner_form_email, o.order_form_values_json, o.created_by_id, u.full_name, u.email
            FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?;
        """, (order_id,), one=True)
        # Website guest orders wait until the team links the real customer
        if not order or str(order.get('email') or '').lower() == GUEST_EMAIL:
            return
        # Always the applicant (the order form's person), not the account that placed the order
        name, email = applicant(order)
        if not name:
            return
        verification_id = execute_db("""
            INSERT INTO id_verifications (order_id, full_name, email, person_role, created_by, created_at, updated_at)
            VALUES (?, ?, ?, 'Director', ?, datetime('now'), datetime('now'));
        """, (order_id, name, email or None, triggered_by or order.get('created_by_id')))
        row, err = start_session(verification_id)
        if err:
            print(f"[ID Verification] order {order_id}: {err}")
            return
        if email:
            err = _email_link(dict(row), {'id': triggered_by})
            if err:
                print(f"[ID Verification] order {order_id}: {err}")
    except Exception as exc:
        print(f"[ID Verification] auto-start for order {order_id} failed: {exc}")
    finally:
        from db import close_db
        close_db()  # this background thread's own connection


def auto_start_for_order(order_id, triggered_by=None):
    """A new KYC order starts its identity verification by itself, in the background (sending the email
    takes a moment), so placing the order is never slowed down or blocked by it."""
    if not order_id:
        return
    try:
        from tenancy import run_in_thread  # Finstap: keep the request's workspace database
    except ImportError:
        import threading

        def run_in_thread(target, *args):
            threading.Thread(target=target, args=args, daemon=True).start()
    run_in_thread(_auto_start, order_id, triggered_by)


def _handle_webhook(environ, start_response, body):
    headers = {
        'signature_v2': environ.get('HTTP_X_SIGNATURE_V2'),
        'signature': environ.get('HTTP_X_SIGNATURE'),
        'timestamp': environ.get('HTTP_X_TIMESTAMP'),
    }
    if not didit_service.config()['webhook_secret']:
        return error_response(start_response, "Didit webhook secret is not configured", status_code=401)
    if not didit_service.verify_webhook(body, environ.get('brixen.raw_body'), headers):
        return error_response(start_response, "Invalid webhook signature", status_code=401)
    body = body if isinstance(body, dict) else {}

    # Didit retries and fans out with the same event_id: handle each event once
    event_id = str(body.get('event_id') or '').strip()
    if event_id:
        if query_db("SELECT 1 FROM id_verification_events WHERE event_id = ?;", (event_id,), one=True):
            return success_response(start_response, message="Already received.")
        execute_db("INSERT OR IGNORE INTO id_verification_events (event_id) VALUES (?);", (event_id,))

    session_id = str(body.get('session_id') or '').strip()
    row = query_db("SELECT id FROM id_verifications WHERE didit_session_id = ? LIMIT 1;", (session_id,), one=True) \
        if session_id else None
    verification_id = row['id'] if row else _verification_id_from_vendor_data(body.get('vendor_data'))
    if not verification_id or not _row(verification_id):
        # Not one of ours (another app on the same Didit account): accept so Didit stops retrying
        return success_response(start_response, message="Unknown session.")
    if session_id and not row:
        execute_db("UPDATE id_verifications SET didit_session_id = ? WHERE id = ? AND didit_session_id IS NULL;",
                   (session_id, verification_id))
    apply_result(verification_id, body.get('status'), body.get('decision'))
    return success_response(start_response, message="Received.")


def handle_didit_webhook(environ, start_response, body):
    """Finstap: one webhook URL for every company. vendor_data ("acme:idv-12") names the workspace,
    so the result is saved in that company's database; without a name the request's own workspace is used."""
    from tenancy import current_tenant, get_tenant, use_tenant
    match = re.match(r'^([a-z0-9-]+):idv-\d+$', str((body or {}).get('vendor_data') or '')) \
        if isinstance(body, dict) else None
    if not match:
        if not current_tenant():
            return success_response(start_response, message="Unknown workspace.")
        return _handle_webhook(environ, start_response, body)
    tenant = get_tenant(match.group(1))
    if not tenant or tenant.get('status') != 'Active':
        return success_response(start_response, message="Unknown workspace.")
    with use_tenant(tenant):
        return _handle_webhook(environ, start_response, body)


def _handle_form(start_response, path, method, body):
    """The person's own form (no login): the private code in the link opens their check only."""
    from services import kyc_form
    match = re.match(r'^/api/kyc-form/([^/]+)(/file|/submit)?$', path)
    if not match:
        return error_response(start_response, "Not found", status_code=404)
    row, problem = kyc_form.verification_for_token(match.group(1))
    if problem == 'expired':
        return error_response(start_response, "This link has expired. Please ask for a new one.", status_code=410)
    if not row:
        return error_response(start_response, "This link is not valid. Check you opened the latest email.",
                              status_code=404)
    action = match.group(2) or ''
    if action == '' and method == 'GET':
        return success_response(start_response, data=kyc_form.public_view(row))
    if action == '/file' and method == 'POST':
        body = body if isinstance(body, dict) else {}
        err = kyc_form.save_file(row, str(body.get('kind') or ''), (body.get('_files') or {}).get('file'))
        if err:
            return error_response(start_response, err, status_code=400)
        return success_response(start_response, data=kyc_form.public_view(_row(row['id'])), message="Uploaded.")
    if action == '/submit' and method == 'POST':
        message, errors = kyc_form.submit(row, body)
        if errors:
            return validation_error(start_response, errors)
        if message:
            return error_response(start_response, message, status_code=400)
        return success_response(start_response, message="Thank you. Your details have been sent.")
    return error_response(start_response, "Not found", status_code=404)


def _handle_workspace_link(environ, start_response, path, method, body):
    """The workspace's own KYC link (no login, no order): the visitor gives their name and email, then
    fills the same form. GET says whether the link works; POST starts their check → {token}."""
    from services import kyc_billing, kyc_form
    from tenancy import use_tenant
    match = re.match(r'^/api/kyc-link/([^/]+)$', path)
    tenant = kyc_billing.tenant_for_link(match.group(1)) if match else None
    if not tenant:
        return error_response(start_response, "This verification link is not valid.", status_code=404)
    with use_tenant(tenant):
        if method == 'GET':
            off = kyc_form.link_unavailable(tenant)
            return success_response(start_response, data={'workspace': tenant.get('name'), 'available': not off,
                                                          'message': off})
        if method == 'POST':
            ip = (environ.get('HTTP_CF_CONNECTING_IP') or environ.get('HTTP_X_REAL_IP')
                  or (environ.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0] or environ.get('REMOTE_ADDR') or '')
            token, problem = kyc_form.start_from_link(tenant, body, ip.strip())
            if isinstance(problem, dict):
                return validation_error(start_response, problem)
            if problem:
                return error_response(start_response, problem, status_code=400)
            return success_response(start_response, data={'token': token})
    return error_response(start_response, "Not found", status_code=404)


def handle_id_verification_routes(environ, start_response, path, method, user, body, query):
    if path == '/api/webhooks/didit' and method == 'POST':
        return _handle_webhook(environ, start_response, body)
    if path.startswith('/api/kyc-link/'):
        return _handle_workspace_link(environ, start_response, path, method, body)
    # Another website's server (e.g. Brixen's) starts a check for one of its orders
    if path == '/api/kyc-partner/checks' and method == 'POST':
        from tenancy import current_tenant
        from services import kyc_partner
        tenant = current_tenant()
        if not kyc_partner.key_ok(tenant, environ.get('HTTP_X_KYC_KEY')):
            return error_response(start_response, "Invalid KYC key", status_code=401)
        data, problem = kyc_partner.create_check(tenant, body)
        if isinstance(problem, dict):
            return validation_error(start_response, problem)
        if problem:
            return error_response(start_response, problem, status_code=400)
        return success_response(start_response, data=data, status_code=201)
    # Another website's server (e.g. Brixen's) reads its checks and KYC link with its API key
    if path == '/api/kyc-partner/checks' and method == 'GET':
        from tenancy import current_tenant
        from services import kyc_billing, kyc_partner
        tenant = current_tenant()
        if not kyc_partner.key_ok(tenant, environ.get('HTTP_X_KYC_KEY')):
            return error_response(start_response, "Invalid KYC key", status_code=401)
        on = kyc_billing.enabled(tenant)
        return success_response(start_response, data={
            'workspace': tenant.get('name'), 'enabled': on,
            'link': kyc_billing.link_url(tenant) if on else None,
            'checks': kyc_partner.checks(),
        })
    # …corrects who a check is for (its applicant), before the person sent the form
    match = re.match(r'^/api/kyc-partner/checks/(\d+)/person$', path)
    if match and method == 'POST':
        from tenancy import current_tenant
        from services import kyc_partner
        tenant = current_tenant()
        if not kyc_partner.key_ok(tenant, environ.get('HTTP_X_KYC_KEY')):
            return error_response(start_response, "Invalid KYC key", status_code=401)
        data, problem = kyc_partner.correct_person(int(match.group(1)), body)
        if problem:
            return error_response(start_response, problem, status_code=400)
        return success_response(start_response, data=data)
    # …and one check's details and documents, to view them on the site (read only)
    match = re.match(r'^/api/kyc-partner/checks/(\d+)(?:/files/(\d+))?$', path)
    if match and method == 'GET':
        from tenancy import current_tenant
        from services import kyc_desk, kyc_partner
        from services.platform_services import ServiceError
        tenant = current_tenant()
        if not kyc_partner.key_ok(tenant, environ.get('HTTP_X_KYC_KEY')):
            return error_response(start_response, "Invalid KYC key", status_code=401)
        try:
            if match.group(2):
                data, mime = kyc_desk.file(tenant['slug'], int(match.group(1)), int(match.group(2)))
                if data is None:
                    return error_response(start_response, "File not found", status_code=404)
                start_response('200 OK', [('Content-Type', mime or 'application/octet-stream'),
                                          ('Content-Length', str(len(data))), ('Cache-Control', 'private, no-store'),
                                          ('X-Content-Type-Options', 'nosniff')])
                return [data]
            return success_response(start_response, data=kyc_desk.detail(tenant['slug'], int(match.group(1))))
        except ServiceError as exc:
            return error_response(start_response, str(exc), status_code=404)
    if path.startswith('/api/kyc-form/'):
        return _handle_form(start_response, path, method, body)
    if path == '/api/client/id-verification' and method == 'GET':
        if not user:
            return error_response(start_response, "Authentication required", status_code=401)
        return success_response(start_response, data={'verifications': _client_view(user)})
    if not path.startswith('/api/admin/id-verification'):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if user.get('role') not in TEAM_ROLES:
        return error_response(start_response, "ID Verification is for the team only.", status_code=403)

    # The order view: this order's people and their verification
    match = re.match(r'^/api/admin/id-verification/orders/(\d+)$', path)
    if match and method == 'GET':
        order = _order(int(match.group(1)))
        if not _can_open(user, order):
            return error_response(start_response, "Order not found", status_code=404)
        return success_response(start_response, data={
            'is_kyc': is_kyc_order(order['id']),
            'didit_configured': not kyc_off_reason(),  # the paid KYC service is on
            'people': people_for_orders([order['id']]).get(order['id'], []),
        })

    match = re.match(r'^/api/admin/id-verification/orders/(\d+)/people$', path)
    if match and method == 'POST':
        order = _order(int(match.group(1)))
        if not _can_open(user, order):
            return error_response(start_response, "Order not found", status_code=404)
        fields, err = _clean_person(body)
        if err:
            return validation_error(start_response, err)
        verification_id = execute_db("""
            INSERT INTO id_verifications (order_id, full_name, email, person_role, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'));
        """, (order['id'], fields['full_name'], fields['email'] or None, fields['person_role'] or None, user.get('id')))
        row, session_err = start_session(verification_id)
        message = f"Person added, but {session_err[0].lower()}{session_err[1:]}" if session_err else \
            "Verification link made."
        return success_response(start_response, data=serialize(row), message=message, status_code=201)

    match = re.match(r'^/api/admin/id-verification/(\d+)(/[a-z]+)?$', path)
    if not match:
        return error_response(start_response, "Not found", status_code=404)
    verification_id, action = int(match.group(1)), match.group(2) or ''
    row = _row(verification_id)
    if not row or not _can_open(user, _order(row['order_id'])):
        return error_response(start_response, "Verification not found", status_code=404)

    if action == '' and method in ('PUT', 'PATCH'):
        fields, err = _clean_person(body, partial=True)
        if err:
            return validation_error(start_response, err)
        if fields:
            sets = [f"{k} = ?" for k in fields]
            params = [v or None for v in fields.values()]
            if 'ch_personal_code' in fields:
                sets.append("ch_reported_at = CASE WHEN ? IS NULL THEN NULL ELSE COALESCE(ch_reported_at, datetime('now')) END")
                params.append(fields['ch_personal_code'] or None)
            execute_db(f"UPDATE id_verifications SET {', '.join(sets)}, updated_at = datetime('now') WHERE id = ?;",
                       tuple(params + [verification_id]))
        return success_response(start_response, data=serialize(_row(verification_id)), message="Saved.")

    if action == '/session' and method == 'POST':
        row, err = start_session(verification_id)
        if err:
            return error_response(start_response, err, status_code=400)
        return success_response(start_response, data=serialize(row), message="New verification link made.")

    if action == '/email' and method == 'POST':
        err = _email_link(dict(row), user)
        if err:
            return error_response(start_response, err, status_code=400)
        return success_response(start_response, data=serialize(_row(verification_id)),
                                message=f"Link emailed to {row['email']}.")

    if action == '/refresh' and method == 'POST':
        if not row.get('didit_session_id'):
            # Finstap's own form: the status is already here
            return success_response(start_response, data=serialize(row), message="Up to date.")
        decision, err = didit_service.get_decision(row['didit_session_id'])
        if err:
            return error_response(start_response, err, status_code=400)
        apply_result(verification_id, decision.get('status'), decision)
        return success_response(start_response, data=serialize(_row(verification_id)), message="Result updated.")

    return error_response(start_response, "Not found", status_code=404)
