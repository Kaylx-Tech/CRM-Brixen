"""ID Verification (Smart Operations): verify the identity of each person on a KYC order through Didit.

The team adds the people to verify (directors, PSCs …) to an order, starts a Didit session for each,
copies the link or emails it, and Didit posts the result back to /api/webhooks/didit. After the ACSP has
told Companies House about the verification, the person's Companies House personal code is saved here.

POST /api/admin/id-verification/orders/<order_id>/people  {full_name, email, person_role}  (+ starts Didit)
PUT  /api/admin/id-verification/<id>            any of {full_name, email, person_role, ch_personal_code}
POST /api/admin/id-verification/<id>/session    start the Didit session (again, if it could not start)
POST /api/admin/id-verification/<id>/email      email the verification link to the person
POST /api/admin/id-verification/<id>/refresh    fetch the latest result from Didit
POST /api/webhooks/didit                        Didit status updates (signed, no login)
"""
import json
import re

from db import query_db, execute_db
from services import didit_service
from utils.validation import validation_error
from utils.response import success_response, error_response

TEAM_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
PERSON_ROLES = ('Director', 'PSC', 'Director & PSC', 'Secretary', 'Member', 'Presenter', 'Other')


def vendor_data_for(verification_id):
    return f"idv-{verification_id}"


def _verification_id_from_vendor_data(value):
    match = re.match(r'^idv-(\d+)$', str(value or ''))
    return int(match.group(1)) if match else None


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
    if out.get('email') and not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', out['email']):
        return None, {'email': "Enter a valid email address, like name@example.com."}
    if out.get('person_role') and out['person_role'] not in PERSON_ROLES:
        out['person_role'] = 'Other'
    # Companies House personal code: 11 letters and numbers, given once the identity is verified
    if out.get('ch_personal_code'):
        out['ch_personal_code'] = re.sub(r'[\s-]', '', out['ch_personal_code']).upper()
        if not re.fullmatch(r'[A-Z0-9]{11}', out['ch_personal_code']):
            return None, {'ch_personal_code': "Personal code must be 11 letters and numbers."}
    return out, None


def start_session(verification_id):
    """Start (or pick up) the person's Didit session. Returns (row, error)."""
    row = _row(verification_id)
    order = _order(row['order_id'])
    session, err = didit_service.create_session(
        vendor_data=vendor_data_for(verification_id), full_name=row['full_name'], email=row.get('email') or '',
        order_number=(order or {}).get('order_number') or '')
    if err:
        return dict(row), err
    execute_db("""
        UPDATE id_verifications SET didit_session_id = ?, session_url = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?;
    """, (session['session_id'], session['url'], session.get('status') or 'Not Started', verification_id))
    return _row(verification_id), None


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
    if status != row['status'] and status in didit_service.FINAL_STATUSES + ('In Review',) and row.get('created_by'):
        try:
            from services.notification_service import create_notification
            order = _order(row['order_id']) or {}
            create_notification(
                row['created_by'], f"ID verification: {status}",
                f"{row['full_name']} ({order.get('order_number') or 'order'}): {status}.",
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
                 "link below on your phone or computer."),
        points=['Have your passport or driving licence ready: you will photograph it and take a short selfie.',
                'Have a proof of address from the last 3 months ready (utility bill, bank statement or council '
                'tax bill), as a photo or PDF, to upload.',
                'The check is run by our verification partner Didit; your details are handled securely.'],
        details=[('Order', order.get('order_number'))],
        cta_label='Verify my identity', cta_url=row['session_url'], category='ORDER')
    ok = send_email(row['email'], subject, html, text, category='ORDER', user_id=order.get('user_id'),
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
    if status in ('In Review', 'Resubmitted'):
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
        if not didit_service.is_configured() or not is_kyc_order(order_id):
            return
        if query_db("SELECT 1 FROM id_verifications WHERE order_id = ? LIMIT 1;", (order_id,), one=True):
            return
        order = query_db("""
            SELECT o.id, o.owner_name, o.owner_form_email, o.created_by_id, u.full_name, u.email
            FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?;
        """, (order_id,), one=True)
        # Website guest orders wait until the team links the real customer
        if not order or str(order.get('email') or '').lower() == GUEST_EMAIL:
            return
        name = (order.get('owner_name') or order.get('full_name') or '').strip()
        email = (order.get('owner_form_email') or order.get('email') or '').strip()
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
    """A new KYC order starts its identity verification by itself, in the background (Didit can take a few
    seconds), so placing the order is never slowed down or blocked by it."""
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


def handle_id_verification_routes(environ, start_response, path, method, user, body, query):
    if path == '/api/webhooks/didit' and method == 'POST':
        return _handle_webhook(environ, start_response, body)
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
            'didit_configured': didit_service.is_configured(),
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
        row, session_err = start_session(verification_id) if didit_service.is_configured() else (_row(verification_id), None)
        message = f"Person added, but {session_err[0].lower()}{session_err[1:]}" if session_err else (
            "Verification started." if didit_service.is_configured()
            else "Person added. Add the Didit keys in Settings > Integrations to start the verification.")
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
        return success_response(start_response, data=serialize(row), message="Verification started.")

    if action == '/email' and method == 'POST':
        err = _email_link(dict(row), user)
        if err:
            return error_response(start_response, err, status_code=400)
        return success_response(start_response, data=serialize(_row(verification_id)),
                                message=f"Link emailed to {row['email']}.")

    if action == '/refresh' and method == 'POST':
        if not row.get('didit_session_id'):
            return error_response(start_response, "Start the verification first.", status_code=400)
        decision, err = didit_service.get_decision(row['didit_session_id'])
        if err:
            return error_response(start_response, err, status_code=400)
        apply_result(verification_id, decision.get('status'), decision)
        return success_response(start_response, data=serialize(_row(verification_id)), message="Result updated.")

    return error_response(start_response, "Not found", status_code=404)
