"""AutoAllot: verify a person, then give out the next numbered item by itself, inside a credit limit.

The same three steps can be used for other Finstap services later (add an entry to KINDS):
  1. Start  — the workspace names an order; the order's customer gets a Didit identity check (link by email).
  2. Allot  — when the check starts, the lowest free number in the kind's sequence is booked for that customer
              (one sequence for all workspaces). When Didit approves, it is theirs and the item is written into
              the workspace. Not verified within 24 hours (or declined): the number goes back and the next
              customer gets it, so the sequence has no gaps. A late approval still gets the next free number.
  3. Credit — a workspace may hold only so many allotted items that Finstap has not been paid for yet
              (per plan). When Finstap is paid (Billing → services, or the owner marks it paid) the credit
              comes back.

First kind: registered office. "Office 1001, 95 Dunstall Hill, Wolverhampton", then Office 1002, … The request is a
ro_requests row (source 'autoallot'), so the owner portal (admin.finstap.com) lists it with the others and Billing
charges it like any registered office. Nothing here deletes data.
"""
import datetime
import json
import sqlite3

from tenancy import _platform_execute, _platform_query, get_tenant, use_tenant

SOURCE = 'autoallot'
VERIFYING = 'Verifying'
FAILED = 'Verification failed'
EXPIRED = 'Expired'  # not verified within the hold time

# Unpaid items a workspace may hold, per plan (a free trial gets 2 to try it): AutoAllot kinds and ID checks
PLAN_CREDITS = {'trial': 2, 'starter': 3, 'pro': 5, 'business': 10, 'enterprise': 20}

KINDS = {
    'registered_office': {
        'label': 'Registered office',
        'prefix': 'Office',
        'first_number': 1001,
        'hold_hours': 24,
        'credits': PLAN_CREDITS,
    },
}

# Finstap's office; the first address in the owner portal (Registered office → Prices & addresses) wins over it
DEFAULT_OFFICE = {'line1': '95 Dunstall Hill', 'line2': '', 'city': 'Wolverhampton', 'postal_code': 'WV6 0SR',
                  'country': 'United Kingdom', 'label': '95 Dunstall Hill, Wolverhampton'}


class AutoAllotError(ValueError):
    """Shown to the person as it is."""


# ── credits ──────────────────────────────────────────────────────────────────

def _limit(tenant, key, table):
    """The plan's number, or the owner portal's own number for this workspace (custom_limits[key])."""
    plan = str((tenant or {}).get('plan') or 'trial').lower()
    try:
        custom = json.loads((tenant or {}).get('custom_limits') or '{}').get(key)
    except (TypeError, ValueError):
        custom = None
    return int(custom) if str(custom or '').isdigit() else table.get(plan, 0)


def credits(tenant, kind='registered_office'):
    """{'limit', 'used', 'available'}: unpaid allotted items (and checks still running) count against the limit."""
    limit = _limit(tenant, f'autoallot_{kind}', KINDS[kind]['credits'])
    expire_stale(kind)
    row = _platform_query("""
        SELECT COUNT(*) AS c FROM ro_requests
        WHERE tenant_slug = ? AND source = ? AND paid = 0 AND status IN (?, 'Active');
    """, (tenant['slug'], SOURCE, VERIFYING), one=True)
    used = int((row or {}).get('c') or 0)
    return {'limit': limit, 'used': used, 'available': max(limit - used, 0)}


def _since(key):
    """The day a credit rule started (saved on first use): older checks never count against it."""
    row = _platform_query("SELECT value FROM platform_settings WHERE key = ?;", (key,), one=True)
    if row and row.get('value'):
        return row['value']
    # UTC, like the created_at it is compared with
    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    _platform_execute("INSERT OR IGNORE INTO platform_settings (key, value, updated_at) VALUES (?, ?, datetime('now'));",
                      (key, today))
    return (_platform_query("SELECT value FROM platform_settings WHERE key = ?;", (key,), one=True) or {}).get('value') \
        or today


def kyc_credits(tenant):
    """ID checks the active workspace started that Finstap has not been paid for (months not marked paid in the
    owner portal's KYC billing), against the plan's number. Unlimited when no KYC price is set (nothing to pay)."""
    from db import query_db
    from services.platform_services import settings
    if not tenant or tenant.get('plan') == 'legacy' or not settings().get('kyc_price'):
        return {'limit': None, 'used': 0, 'available': None}
    limit = _limit(tenant, 'id_checks', PLAN_CREDITS)
    paid = {r['period'] for r in _platform_query(
        "SELECT period FROM kyc_billing WHERE tenant_slug = ? AND status = 'paid';", (tenant['slug'],))}
    rows = query_db("""
        SELECT strftime('%Y-%m', created_at) AS period, COUNT(*) AS c FROM id_verifications
        WHERE didit_session_id IS NOT NULL AND didit_session_id != '' AND date(created_at) >= date(?)
        GROUP BY period;
    """, (_since('kyc_credits_since'),)) or []
    used = sum(int(r['c'] or 0) for r in rows if r['period'] not in paid)
    return {'limit': limit, 'used': used, 'available': max(limit - used, 0)}


def check_kyc_credit(tenant):
    """Raise AutoAllotError when the workspace has no ID check credit left."""
    left = kyc_credits(tenant)
    if left['available'] is not None and left['available'] < 1:
        raise AutoAllotError(
            f"Your plan allows {left['limit']} unpaid ID check(s) and this workspace has {left['used']}. "
            "Pay the KYC checks in Billing to free a credit, or upgrade your plan.")


# ── sequence ─────────────────────────────────────────────────────────────────

def _take_number(kind, request_id, status, hours=None):
    """The lowest free number of this kind, held (for `hours`) or allotted to the request. Runs under one write
    lock (BEGIN IMMEDIATE) and a unique index, so customers applying at the same moment each get their own number.
    A request that already holds a number keeps it."""
    from tenancy import _platform_conn, ensure_platform
    ensure_platform()
    held_until = f"+{int(hours)} hours" if hours else None
    conn = _platform_conn()
    try:
        conn.execute("BEGIN IMMEDIATE;")
        mine = conn.execute("""
            SELECT id, number FROM autoallot_slots WHERE kind = ? AND request_id = ? AND status IN ('held', 'allotted')
            ORDER BY id DESC LIMIT 1;
        """, (kind, request_id)).fetchone()
        if mine:
            conn.execute("UPDATE autoallot_slots SET status = ?, held_until = datetime('now', ?), "
                         "updated_at = datetime('now') WHERE id = ?;", (status, held_until, mine['id']))
            conn.commit()
            return mine['number']
        # Holds that ran out go back first
        conn.execute("""
            UPDATE autoallot_slots SET status = 'released', updated_at = datetime('now')
            WHERE kind = ? AND status = 'held' AND held_until < datetime('now');
        """, (kind,))
        number = KINDS[kind]['first_number']
        for (taken,) in conn.execute("""
            SELECT number FROM autoallot_slots WHERE kind = ? AND status IN ('held', 'allotted') AND number >= ?
            ORDER BY number;
        """, (kind, number)).fetchall():
            if taken != number:
                break
            number += 1
        conn.execute("""
            INSERT INTO autoallot_slots (kind, number, request_id, status, held_until)
            VALUES (?, ?, ?, ?, datetime('now', ?));
        """, (kind, number, request_id, status, held_until))
        conn.commit()
        return number
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _release(request_id):
    """The request's held number goes back to the queue."""
    _platform_execute("UPDATE autoallot_slots SET status = 'released', updated_at = datetime('now') "
                      "WHERE request_id = ? AND status = 'held';", (request_id,))


def expire_stale(kind='registered_office'):
    """Requests whose customer did not pass the ID check within the hold time: their number goes to the next
    customer. Called whenever requests are listed or started (cheap: one indexed query)."""
    hours = KINDS[kind]['hold_hours']
    rows = _platform_query("""
        SELECT * FROM ro_requests WHERE source = ? AND status = ? AND datetime(created_at) < datetime('now', ?);
    """, (SOURCE, VERIFYING, f"-{hours} hours"))
    for row in rows:
        _platform_execute("""
            UPDATE ro_requests SET status = ?, reason = ?, updated_at = datetime('now') WHERE id = ? AND status = ?;
        """, (EXPIRED, f"Not verified within {hours} hours: Office {row.get('office_number') or ''} went to the next "
                       "customer. Start again to book a new number.", row['id'], VERIFYING))
        _release(row['id'])
        _tell_workspace(get_tenant(row['tenant_slug']), row, 'Registered office booking expired',
                        f"{row['company_name']}: the ID check was not done within {hours} hours, so the booked "
                        "office number was released.")
    return len(rows)


def _office_address(number):
    from services.platform_services import settings
    base = (settings().get('ro_addresses') or [DEFAULT_OFFICE])[0]
    street = ', '.join(p for p in (base.get('line1'), base.get('line2')) if p)
    return {'label': f"{KINDS['registered_office']['prefix']} {number}", 'line1': f"Office {number}",
            'line2': street, 'city': base.get('city') or '', 'postal_code': base.get('postal_code') or '',
            'country': base.get('country') or 'United Kingdom'}


# ── 1. start ─────────────────────────────────────────────────────────────────

def _order(order_number):
    from db import query_db
    number = str(order_number or '').strip().lstrip('#')
    if not number:
        raise AutoAllotError("Enter the order number")
    order = query_db("""
        SELECT o.id, o.order_number, o.user_id, o.company_id, o.owner_name, o.owner_form_email, c.name AS company_name,
               c.company_number, u.full_name, u.email
        FROM orders o LEFT JOIN companies c ON c.id = o.company_id LEFT JOIN users u ON u.id = o.user_id
        WHERE COALESCE(o.is_draft, 0) = 0 AND (o.order_number = ? OR o.order_number = ?) LIMIT 1;
    """, (number, f"#{number}"), one=True)
    if not order:
        raise AutoAllotError(f"No order {number} in this workspace")
    if not order.get('company_id'):
        raise AutoAllotError("This order has no company. Add the company to the order first.")
    return order


def _verification_for(order, user):
    """The order's identity check: an approved one is reused, a running one is picked up, else a new one starts."""
    from db import execute_db, query_db
    from routes.id_verification_routes import start_session, _email_link
    from services import didit_service
    row = query_db("""
        SELECT * FROM id_verifications WHERE order_id = ? AND status NOT IN ('Declined', 'Abandoned', 'Expired', 'Kyc Expired')
        ORDER BY CASE WHEN status = 'Approved' THEN 0 ELSE 1 END, id DESC LIMIT 1;
    """, (order['id'],), one=True)
    if row and (row['status'] == 'Approved' or row.get('session_url')):
        return dict(row), None
    if not didit_service.is_configured():
        raise AutoAllotError("Identity checks (Didit) are not set up yet. Please contact Finstap.")
    name = (order.get('owner_name') or order.get('full_name') or '').strip()
    email = (order.get('owner_form_email') or order.get('email') or '').strip()
    if not name:
        raise AutoAllotError("The order has no customer name to verify")
    verification_id = execute_db("""
        INSERT INTO id_verifications (order_id, full_name, email, person_role, created_by, created_at, updated_at)
        VALUES (?, ?, ?, 'Director', ?, datetime('now'), datetime('now'));
    """, (order['id'], name, email or None, user.get('id')))
    row, err = start_session(verification_id)
    if err:
        raise AutoAllotError(f"The identity check could not start: {err}")
    mail_error = _email_link(dict(row), user) if email else "The customer has no email address: send them the link."
    return dict(row), mail_error


def start(tenant, user, order_number, kind='registered_office'):
    """Begin an AutoAllot for an order. Returns (request, message)."""
    order = _order(order_number)
    open_one = _platform_query("""
        SELECT id, status FROM ro_requests WHERE tenant_slug = ? AND company_id = ? AND status IN ('Pending', ?, 'Active');
    """, (tenant['slug'], order['company_id'], VERIFYING), one=True)
    if open_one:
        raise AutoAllotError(f"{order['company_name']} already has a registered office ({open_one['status'].lower()})")
    left = credits(tenant, kind)
    if left['available'] < 1:
        raise AutoAllotError(
            f"Your plan allows {left['limit']} unpaid registered office address(es) and you have {left['used']}. "
            "Pay the open addresses in Billing to free a credit, or upgrade your plan.")
    verification, mail_error = _verification_for(order, user)
    from services.platform_services import settings
    request_id = _platform_execute("""
        INSERT INTO ro_requests (tenant_slug, company_id, company_name, company_number, client_user_id, client_name,
                                 client_email, notes, status, price, requested_by, source, order_id, order_number,
                                 verification_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (tenant['slug'], order['company_id'], order['company_name'], order.get('company_number'), order.get('user_id'),
          order.get('owner_name') or order.get('full_name'), order.get('owner_form_email') or order.get('email'),
          f"AutoAllot from order {order['order_number']}", VERIFYING, settings()['ro_price_year'], user.get('email'),
          SOURCE, order['id'], order['order_number'], verification['id']))
    if verification['status'] == 'Approved':
        return allot(request_id), "Identity already verified: the address was allotted."
    hours = KINDS[kind]['hold_hours']
    number = _take_number(kind, request_id, 'held', hours)
    _platform_execute("UPDATE ro_requests SET office_number = ? WHERE id = ?;", (number, request_id))
    message = (f"Office {number} is booked for {hours} hours. The customer was sent the ID check; the address is "
               "theirs as soon as Didit approves it." if not mail_error
               else f"Office {number} is booked for {hours} hours. {mail_error}")
    return {**request(request_id), 'verification_link': verification.get('session_url')}, message


# ── 2. allot ─────────────────────────────────────────────────────────────────

def allot(request_id):
    """Give the next Office number to a verified request and write the address into the workspace."""
    from services.platform_services import DEFAULT_MONTHS, _add_months, _workspace_address
    row = _platform_query("SELECT * FROM ro_requests WHERE id = ?;", (request_id,), one=True)
    if not row or row['status'] not in (VERIFYING, EXPIRED):
        return request(request_id) if row else None
    # The booked number, or (approved after the booking ran out) the next free one
    number = _take_number('registered_office', request_id, 'allotted')
    address = _office_address(number)
    start_day = datetime.date.today()
    expiry = _add_months(start_day, DEFAULT_MONTHS)
    tenant = get_tenant(row['tenant_slug'])
    address_id = _workspace_address(row, tenant, address, start_day.isoformat(), expiry.isoformat(),
                                    row['price']) if tenant else None
    _platform_execute("""
        UPDATE ro_requests SET status = 'Active', office_number = ?, address_json = ?, start_date = ?, expiry_date = ?,
               workspace_address_id = ?, allotted_at = datetime('now'), decided_by = 'AutoAllot',
               decided_at = datetime('now'), reason = NULL, updated_at = datetime('now')
        WHERE id = ? AND status IN (?, ?);
    """, (number, json.dumps(address), start_day.isoformat(), expiry.isoformat(), address_id, request_id, VERIFYING,
          EXPIRED))
    _tell_workspace(tenant, row, f"Office {number} allotted",
                    f"{row['company_name']}: registered office Office {number} is active (order {row['order_number']}).")
    try:  # paid from the workspace balance straight away when it covers it
        from services.wallet import settle
        settle(row['tenant_slug'])
    except Exception as exc:
        print(f"[AutoAllot] balance not charged for request {request_id}: {exc}")
    return request(request_id)


def verification_finished(tenant, verification_id, status):
    """Called when Didit gives a final result for a check in this workspace."""
    if not tenant:
        return None
    row = _platform_query("""
        SELECT id, status FROM ro_requests WHERE tenant_slug = ? AND verification_id = ? AND status IN (?, ?)
        ORDER BY id DESC LIMIT 1;
    """, (tenant['slug'], verification_id, VERIFYING, EXPIRED), one=True)
    if not row:
        return None
    if status == 'Approved':
        return allot(row['id'])
    if row['status'] == VERIFYING and status in ('Declined', 'Abandoned', 'Expired', 'Kyc Expired'):
        _release(row['id'])
        _platform_execute("UPDATE ro_requests SET status = ?, reason = ?, updated_at = datetime('now') WHERE id = ?;",
                          (FAILED, f"Identity check {status.lower()}", row['id']))
        req = _platform_query("SELECT * FROM ro_requests WHERE id = ?;", (row['id'],), one=True)
        _tell_workspace(tenant, req, 'Registered office not allotted',
                        f"{req['company_name']}: the identity check was {status.lower()}, so no address was given.")
    return request(row['id'])


def _tell_workspace(tenant, row, title, message):
    """In-app notification for whoever started it (never blocks the allotment)."""
    if not tenant or not row:
        return
    try:
        from db import query_db
        from services.notification_service import create_notification
        with use_tenant(tenant):
            who = query_db("SELECT id FROM users WHERE email = ? LIMIT 1;", (row.get('requested_by'),), one=True)
            if who:
                create_notification(who['id'], title, message, ntype='info', link='/admin/smart-operations')
    except Exception as exc:
        print(f"[AutoAllot] notification failed: {exc}")


def request(request_id):
    from services.platform_services import _ro_row
    row = _platform_query("SELECT * FROM ro_requests WHERE id = ?;", (request_id,), one=True)
    return _ro_row(row) if row else None
