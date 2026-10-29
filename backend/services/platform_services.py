"""Services Finstap sells to its workspaces, charged on top of the plan:

  * KYC verification: every ID check a workspace starts runs on Finstap's own Didit account
    (services/didit_service.py), so Finstap charges the workspace per check, billed monthly. A check
    counts once its Didit session has started (Didit charges for the session).
  * Registered office: a workspace asks for one of Finstap's own office addresses for a client's
    company; the Finstap owner confirms it (or not) in the owner portal, and it is charged per year.
    A confirmed address is written into the workspace (addresses table), so the client sees it in
    the client portal. Telling Companies House about the new address (AD01) stays with the company.

Prices and Finstap's office addresses are set in the owner portal (platform_settings). Nothing here
deletes data: a cancelled or rejected request is kept with its reason.
"""
import calendar
import datetime
import json
import os
import re

from tenancy import _platform_execute, _platform_query, get_tenant, list_tenants, use_tenant

RO_STATUSES = ('Pending', 'Active', 'Rejected', 'Cancelled')
DEFAULT_MONTHS = 12


class ServiceError(ValueError):
    """Shown to the person as it is."""


# ── settings ────────────────────────────────────────────────────────────────

def _setting(key, default=''):
    row = _platform_query("SELECT value FROM platform_settings WHERE key = ?;", (key,), one=True)
    return row['value'] if row and row['value'] is not None else default


def _money(value, label):
    if value in (None, ''):
        return None
    try:
        number = round(float(value), 2)
    except (TypeError, ValueError):
        raise ServiceError(f"{label} must be a number")
    if number < 0:
        raise ServiceError(f"{label} cannot be below zero")
    return number


def _clean_address(raw):
    a = {k: str((raw or {}).get(k) or '').strip()[:120] for k in ('label', 'line1', 'line2', 'city', 'postal_code',
                                                                     'country')}
    a['country'] = a['country'] or 'United Kingdom'
    if not a['line1'] or not a['city'] or not a['postal_code']:
        raise ServiceError("Each office address needs address line 1, town or city, and postcode")
    a['label'] = a['label'] or f"{a['line1']}, {a['postal_code']}"
    return a


def settings():
    try:
        addresses = json.loads(_setting('ro_addresses', '[]')) or []
    except ValueError:
        addresses = []
    return {
        'kyc_price': _money(_setting('kyc_price'), 'KYC price'),
        'ro_price_year': _money(_setting('ro_price_year'), 'Registered office price'),
        'ro_addresses': addresses,
        'topup_bank_details': _setting('topup_bank_details', ''),
    }


def save_settings(body):
    values = {
        'kyc_price': _money(body.get('kyc_price'), 'KYC price'),
        'ro_price_year': _money(body.get('ro_price_year'), 'Registered office price'),
    }
    addresses = [_clean_address(a) for a in (body.get('ro_addresses') or []) if any(str(v).strip() for v in (a or {}).values())]
    for key, value in values.items():
        _platform_execute("""
            INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
        """, (key, '' if value is None else str(value)))
    if 'topup_bank_details' in body:  # Finstap's account for workspace balance top-ups (services/wallet.py)
        _platform_execute("""
            INSERT INTO platform_settings (key, value, updated_at) VALUES ('topup_bank_details', ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
        """, (str(body.get('topup_bank_details') or '').strip()[:1000],))
    _platform_execute("""
        INSERT INTO platform_settings (key, value, updated_at) VALUES ('ro_addresses', ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
    """, (json.dumps(addresses),))
    return settings()


# ── KYC ─────────────────────────────────────────────────────────────────────

def _period(value):
    value = str(value or '').strip()
    if not re.match(r'^\d{4}-\d{2}$', value):
        value = datetime.date.today().strftime('%Y-%m')
    year, month = int(value[:4]), int(value[5:])
    if not 1 <= month <= 12:
        raise ServiceError("Choose a valid month")
    last = calendar.monthrange(year, month)[1]
    return value, f"{value}-01 00:00:00", f"{value}-{last:02d} 23:59:59"


def _ensure_review_note():
    """The reason the Finstap team gives when it rejects a check (column added on first use)."""
    from db import query_db, execute_db
    columns = {c['name'] for c in (query_db("PRAGMA table_info(id_verifications);") or [])}
    if columns and 'review_note' not in columns:
        execute_db("ALTER TABLE id_verifications ADD COLUMN review_note TEXT;")


def _didit_reason(result):
    """Why Didit did not approve a check, in a few words, from the saved result summary."""
    parts = []
    for key, label in (('id_status', 'ID document'), ('liveness_status', 'Liveness'), ('face_match_status', 'Face match')):
        if result.get(key) in ('Declined', 'In Review'):
            parts.append(f"{label}: {result[key].lower()}")
    poa = result.get('poa') or {}
    if poa.get('status') in ('Declined', 'In Review'):
        parts.append('Proof of address: ' + (', '.join(poa.get('warnings') or []) or poa['status'].lower()))
    aml = result.get('aml') or {}
    if aml.get('open_hits') or aml.get('total_hits'):
        parts.append('AML: possible match')
    return ' · '.join(parts)


def _check_row(row):
    """One check as the owner's KYC table shows it: the client, the order and the result."""
    out = dict(row)
    try:
        result = json.loads(out.pop('result_json', None) or '{}') or {}
    except ValueError:
        result = {}
    poa = result.get('poa') or {}
    out['address'] = poa.get('address') or result.get('address') or out.pop('client_address', None) or ''
    out.pop('client_address', None)
    out['reason'] = out.get('review_note') or (_didit_reason(result) if out.get('status') != 'Approved' else '')
    invoice = out.pop('invoice_status', None)
    out['payment_status'] = '' if not invoice else ('Paid' if invoice == 'Paid' else
                                                     'Partly paid' if invoice == 'Partial Paid' else
                                                     'Cancelled' if invoice == 'Cancelled' else 'Unpaid')
    return out


def _workspace_checks(tenant, start, end, check_id=None):
    """The ID checks one workspace started in the period (empty for workspaces without the table), with the
    client, the order and its invoice for the owner's KYC table."""
    from db import query_db
    where = "v.id = ?" if check_id else """v.didit_session_id IS NOT NULL AND v.didit_session_id != ''
                  AND datetime(v.created_at) BETWEEN datetime(?) AND datetime(?)"""
    args = (check_id,) if check_id else (start, end)
    with use_tenant(tenant):
        try:
            _ensure_review_note()
            rows = query_db(f"""
                SELECT v.id, v.order_id, v.full_name, v.email, v.person_role, v.status, v.ch_personal_code,
                       v.result_json, v.review_note, v.session_url, v.link_sent_at, v.created_at, v.updated_at,
                       o.order_number, o.service_name, o.total, o.status AS order_status, o.created_at AS order_date,
                       u.full_name AS client_name, u.email AS client_email, u.address AS client_address,
                       COALESCE(NULLIF(o.end_client_phone, ''), NULLIF(o.checkout_phone, ''), u.phone) AS phone,
                       (SELECT i.status FROM invoices i WHERE i.order_id = o.id ORDER BY i.id DESC LIMIT 1)
                           AS invoice_status
                FROM id_verifications v
                LEFT JOIN orders o ON o.id = v.order_id
                LEFT JOIN users u ON u.id = o.user_id
                WHERE {where}
                ORDER BY v.created_at DESC;
            """, args) or []
            return [_check_row(r) for r in rows]
        except Exception:
            # Older workspace databases: status only
            try:
                return query_db(f"""
                    SELECT v.id, v.full_name, v.person_role, v.status, v.ch_personal_code, v.created_at,
                           v.updated_at, o.order_number
                    FROM id_verifications v LEFT JOIN orders o ON o.id = v.order_id
                    WHERE {where}
                    ORDER BY v.created_at DESC;
                """, args) or []
            except Exception:
                return []


def _bucket(status):
    if status == 'Approved':
        return 'approved'
    if status in ('Declined', 'Abandoned', 'Expired', 'Kyc Expired'):
        return 'declined'
    return 'pending'


def kyc_report(period=None, slug=None):
    """KYC checks per workspace for one month, with what to charge and whether it was billed."""
    period, start, end = _period(period)
    price = settings()['kyc_price'] or 0
    billing = {r['tenant_slug']: r for r in _platform_query("SELECT * FROM kyc_billing WHERE period = ?;", (period,))}
    workspaces, checks = [], []
    for tenant in list_tenants():
        if tenant.get('plan') == 'legacy' or not os.path.exists(tenant['db_path'] or ''):
            continue
        if slug and tenant['slug'] != slug:
            continue
        rows = _workspace_checks(tenant, start, end)
        if not rows and tenant['slug'] not in billing:
            continue
        counts = {'approved': 0, 'declined': 0, 'pending': 0}
        for r in rows:
            counts[_bucket(r['status'])] += 1
            checks.append({**r, 'workspace': tenant['slug'], 'workspace_name': tenant['name']})
        bill = billing.get(tenant['slug']) or {}
        workspaces.append({
            'slug': tenant['slug'], 'name': tenant['name'], 'owner_email': tenant.get('owner_email'),
            'checks': len(rows), **counts,
            'amount': round(len(rows) * price, 2),
            'billing_status': bill.get('status') or '',
            'billed_amount': bill.get('amount'),
            'billed_checks': bill.get('checks'),
        })
    workspaces.sort(key=lambda w: (-w['checks'], w['name'].lower()))
    return {
        'period': period,
        'price': price,
        'totals': {
            'checks': sum(w['checks'] for w in workspaces),
            'approved': sum(w['approved'] for w in workspaces),
            'declined': sum(w['declined'] for w in workspaces),
            'pending': sum(w['pending'] for w in workspaces),
            'amount': round(sum(w['amount'] for w in workspaces), 2),
            'paid': round(sum((w['billed_amount'] or 0) for w in workspaces if w['billing_status'] == 'paid'), 2),
        },
        'workspaces': workspaces,
        'checks': checks,
    }


def set_kyc_billing(slug, period, status):
    """Mark one workspace's month as invoiced or paid (the count and amount are kept as billed)."""
    period, _, _ = _period(period)
    status = str(status or '').strip().lower()
    if status not in ('', 'invoiced', 'paid'):
        raise ServiceError("Status must be invoiced or paid")
    if not status:
        _platform_execute("DELETE FROM kyc_billing WHERE tenant_slug = ? AND period = ?;", (slug, period))
        return
    row = next((w for w in kyc_report(period, slug)['workspaces'] if w['slug'] == slug), None)
    if not row:
        raise ServiceError("This workspace has no KYC checks in that month")
    _platform_execute("""
        INSERT INTO kyc_billing (tenant_slug, period, checks, amount, status, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(tenant_slug, period) DO UPDATE SET checks = excluded.checks, amount = excluded.amount,
            status = excluded.status, updated_at = excluded.updated_at;
    """, (slug, period, row['checks'], row['amount'], status))
    if status == 'invoiced':  # paid from the workspace balance when it covers it
        from services.wallet import settle
        settle(slug)


def _check(slug, check_id):
    tenant = get_tenant(slug)
    if not tenant or not os.path.exists(tenant.get('db_path') or ''):
        raise ServiceError("Workspace not found")
    rows = _workspace_checks(tenant, None, None, int(check_id))
    if not rows:
        raise ServiceError("Check not found")
    return tenant, rows[0]


def reject_check(slug, check_id, reason):
    """The Finstap team rejects a check (for example an edited bank statement) and says why; the client can
    then be sent a new link with Resubmit."""
    from db import execute_db
    reason = str(reason or '').strip()[:300]
    if not reason:
        raise ServiceError("Write the reason, so the client knows what to fix")
    tenant, _ = _check(slug, check_id)
    with use_tenant(tenant):
        execute_db("UPDATE id_verifications SET status = 'Declined', review_note = ?, updated_at = datetime('now') "
                   "WHERE id = ?;", (reason, int(check_id)))
    return _check(slug, check_id)[1]


def resubmit_check(slug, check_id, reason=None):
    """Start a new Didit session for the person and email them the link, with what to fix.
    Returns (row, emailed). The earlier reason stays in the owner activity log."""
    from db import execute_db
    from routes.id_verification_routes import start_session
    from services.client_mail import compose_client_email
    from services.email_service import send_email, last_failure_reason
    tenant, row = _check(slug, check_id)
    reason = str(reason or row.get('reason') or '').strip()[:300]
    emailed = False
    with use_tenant(tenant):
        fresh, err = start_session(int(check_id))
        if err:
            raise ServiceError(err)
        execute_db("UPDATE id_verifications SET review_note = NULL WHERE id = ?;", (int(check_id),))
        email = fresh.get('email') or row.get('client_email')
        if email and fresh.get('session_url'):
            subject, text, html = compose_client_email(
                subject='Please verify your identity again',
                headline='Please verify your identity again',
                greeting=fresh['full_name'],
                message=("We could not accept your last identity check. Please follow the secure link below and "
                         "do it again: it takes about five minutes."),
                points=[f"What to fix: {reason}" if reason else '',
                        'Have your passport or driving licence ready: you will photograph it and take a short selfie.',
                        'Upload an original proof of address from the last 3 months (utility bill, bank statement or '
                        'council tax bill). Edited or screenshot documents are not accepted.'],
                details=[('Order', row.get('order_number'))],
                cta_label='Verify my identity', cta_url=fresh['session_url'], category='ORDER')
            emailed = send_email(email, subject, html, text, category='ORDER', order_id=row.get('order_id'))
            if emailed:
                execute_db("UPDATE id_verifications SET link_sent_at = datetime('now') WHERE id = ?;", (int(check_id),))
            else:
                print(f"[KYC resubmit] {slug} check {check_id}: {last_failure_reason() or 'email not sent'}")
    return _check(slug, check_id)[1], emailed


# ── registered office ───────────────────────────────────────────────────────

def _ro_row(row):
    out = dict(row)
    try:
        out['address'] = json.loads(out.pop('address_json') or 'null')
    except ValueError:
        out['address'] = None
    return out


def ro_requests(slug=None, status=None):
    from services.autoallot import expire_stale
    expire_stale()  # AutoAllot bookings older than 24 hours go back before anyone sees the list
    sql, args = "SELECT * FROM ro_requests WHERE 1 = 1", []
    if slug:
        sql += " AND tenant_slug = ?"
        args.append(slug)
    if status:
        sql += " AND status = ?"
        args.append(status)
    rows = [_ro_row(r) for r in _platform_query(sql + " ORDER BY id DESC;", tuple(args))]
    names = {t['slug']: t['name'] for t in list_tenants()}
    for r in rows:
        r['workspace_name'] = names.get(r['tenant_slug'], r['tenant_slug'])
    return rows


def _ro(request_id):
    row = _platform_query("SELECT * FROM ro_requests WHERE id = ?;", (request_id,), one=True)
    if not row:
        raise ServiceError("Request not found")
    return row


def request_ro(tenant, user, company_id, notes=''):
    """A workspace asks Finstap for a registered office for one of its client companies."""
    from db import query_db
    company = query_db("""
        SELECT c.id, c.name, c.company_number, c.user_id, u.full_name, u.email
        FROM companies c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?;
    """, (company_id,), one=True)
    if not company:
        raise ServiceError("Choose a company from your Companies list")
    open_one = _platform_query("""
        SELECT id, status FROM ro_requests WHERE tenant_slug = ? AND company_id = ? AND status IN ('Pending', 'Verifying', 'Active');
    """, (tenant['slug'], company['id']), one=True)
    if open_one:
        raise ServiceError(f"This company already has a {open_one['status'].lower()} registered office request")
    request_id = _platform_execute("""
        INSERT INTO ro_requests (tenant_slug, company_id, company_name, company_number, client_user_id, client_name,
                                 client_email, notes, price, requested_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (tenant['slug'], company['id'], company['name'], company.get('company_number'), company.get('user_id'),
          company.get('full_name'), company.get('email'), (notes or '').strip()[:1000] or None,
          settings()['ro_price_year'], user.get('email')))
    _tell_owners(tenant, company)
    return _ro_row(_ro(request_id))


def cancel_ro_request(tenant, request_id):
    """The workspace takes back a request Finstap has not confirmed yet."""
    row = _ro(request_id)
    if row['tenant_slug'] != tenant['slug']:
        raise ServiceError("Request not found")
    if row['status'] != 'Pending':
        raise ServiceError("Only a pending request can be cancelled here. Contact Finstap for an active one.")
    _platform_execute("UPDATE ro_requests SET status = 'Cancelled', reason = 'Cancelled by the workspace', "
                      "updated_at = datetime('now') WHERE id = ?;", (request_id,))


def _add_months(day, months):
    month = day.month - 1 + months
    year = day.year + month // 12
    month = month % 12 + 1
    return day.replace(year=year, month=month, day=min(day.day, calendar.monthrange(year, month)[1]))


def _workspace_address(row, tenant, address, start, expiry, price, status='Active'):
    """Write (or update) the address in the workspace, so the client portal shows it."""
    from db import execute_db, query_db
    with use_tenant(tenant):
        if row.get('workspace_address_id') and query_db("SELECT 1 FROM addresses WHERE id = ?;",
                                                       (row['workspace_address_id'],), one=True):
            execute_db("UPDATE addresses SET expiry_date = ?, status = ? WHERE id = ?;",
                       (expiry, status, row['workspace_address_id']))
            return row['workspace_address_id']
        if not row.get('client_user_id') or not address:
            return None
        return execute_db("""
            INSERT INTO addresses (user_id, company_id, type, line1, line2, city, postal_code, country, start_date,
                                   expiry_date, status, service_name, price)
            VALUES (?, ?, 'Registered Office', ?, ?, ?, ?, ?, ?, ?, ?, 'Registered Office Address', ?);
        """, (row['client_user_id'], row.get('company_id'), address['line1'], address.get('line2') or None,
              address['city'], address['postal_code'], address.get('country') or 'United Kingdom', start, expiry,
              status, price or 0))


def confirm_ro(request_id, admin, address_index, start_date=None, months=DEFAULT_MONTHS, price=None):
    row = _ro(request_id)
    if row['status'] != 'Pending':
        raise ServiceError("Only a pending request can be confirmed")
    offices = settings()['ro_addresses']
    try:
        address = offices[int(address_index)]
    except (TypeError, ValueError, IndexError):
        raise ServiceError("Choose one of your office addresses (add them under Settings in this tab)")
    try:
        start = datetime.date.fromisoformat(str(start_date or datetime.date.today().isoformat()))
        months = int(months or DEFAULT_MONTHS)
    except ValueError:
        raise ServiceError("Start date or length is not valid")
    if not 1 <= months <= 60:
        raise ServiceError("Length must be 1 to 60 months")
    expiry = _add_months(start, months)
    price = _money(price, 'Price') if price not in (None, '') else (row['price'] or settings()['ro_price_year'])
    tenant = get_tenant(row['tenant_slug'])
    address_id = _workspace_address(row, tenant, address, start.isoformat(), expiry.isoformat(), price) if tenant else None
    _platform_execute("""
        UPDATE ro_requests SET status = 'Active', address_json = ?, start_date = ?, expiry_date = ?, price = ?,
               paid = 0, workspace_address_id = ?, decided_by = ?, decided_at = datetime('now'), reason = NULL,
               updated_at = datetime('now')
        WHERE id = ?;
    """, (json.dumps(address), start.isoformat(), expiry.isoformat(), price, address_id, (admin or {}).get('email'),
          request_id))
    return _ro_row(_ro(request_id))


def reject_ro(request_id, admin, reason):
    row = _ro(request_id)
    if row['status'] != 'Pending':
        raise ServiceError("Only a pending request can be rejected")
    reason = str(reason or '').strip()[:500]
    if not reason:
        raise ServiceError("Write why the request is rejected (the workspace sees it)")
    _platform_execute("UPDATE ro_requests SET status = 'Rejected', reason = ?, decided_by = ?, decided_at = datetime('now'), "
                      "updated_at = datetime('now') WHERE id = ?;", (reason, (admin or {}).get('email'), request_id))
    return _ro_row(_ro(request_id))


def renew_ro(request_id, months=DEFAULT_MONTHS, price=None):
    """Another period from the current expiry date; it is a new charge, so it starts unpaid."""
    row = _ro(request_id)
    if row['status'] != 'Active':
        raise ServiceError("Only an active registered office can be renewed")
    months = int(months or DEFAULT_MONTHS)
    if not 1 <= months <= 60:
        raise ServiceError("Length must be 1 to 60 months")
    current = datetime.date.fromisoformat(row['expiry_date'])
    expiry = _add_months(max(current, datetime.date.today()), months)
    price = _money(price, 'Price') if price not in (None, '') else row['price']
    tenant = get_tenant(row['tenant_slug'])
    if tenant:
        _workspace_address(row, tenant, json.loads(row['address_json']), row['start_date'], expiry.isoformat(), price)
    _platform_execute("UPDATE ro_requests SET expiry_date = ?, price = ?, paid = 0, updated_at = datetime('now') WHERE id = ?;",
                      (expiry.isoformat(), price, request_id))
    return _ro_row(_ro(request_id))


def end_ro(request_id, admin, reason):
    """Stop an active registered office (the client stops using Finstap's address)."""
    row = _ro(request_id)
    if row['status'] != 'Active':
        raise ServiceError("Only an active registered office can be ended")
    reason = str(reason or '').strip()[:500]
    if not reason:
        raise ServiceError("Write why it is ended")
    tenant = get_tenant(row['tenant_slug'])
    if tenant and row.get('workspace_address_id'):
        _workspace_address(row, tenant, None, None, row['expiry_date'], row['price'], status='Expired')
    _platform_execute("UPDATE ro_requests SET status = 'Cancelled', reason = ?, decided_by = ?, updated_at = datetime('now') "
                      "WHERE id = ?;", (reason, (admin or {}).get('email'), request_id))
    return _ro_row(_ro(request_id))


def set_ro_paid(request_id, paid):
    _ro(request_id)
    _platform_execute("UPDATE ro_requests SET paid = ?, updated_at = datetime('now') WHERE id = ?;",
                      (1 if paid else 0, request_id))
    return _ro_row(_ro(request_id))


def _tell_owners(tenant, company):
    """Email the Finstap owners that a registered office is waiting for them (never blocks the request)."""
    try:
        from services.email_service import send_email
        from services.owner_auth import OWNER_EMAILS
        text = (f"{tenant['name']} ({tenant['slug']}) asked for a registered office for {company['name']}"
                f"{' (' + company['company_number'] + ')' if company.get('company_number') else ''}.\n\n"
                f"Confirm or reject it in the owner portal: https://admin.finstap.com/owner/registered-office")
        with use_tenant(None):
            for email in OWNER_EMAILS:
                send_email(email, f"Registered office request from {tenant['name']}", None, text,
                           category='SECURITY', log=False, sender_name='Finstap', mailbox='platform')
    except Exception as exc:
        print(f"[Services] owner email about a registered office request failed: {exc}")
