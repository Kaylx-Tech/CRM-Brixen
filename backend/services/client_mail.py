"""Client notification emails (ported from app.py notify_client / notify_activity_done and friends).

notify_client() always creates the in-app notification and then emails the client, using the same recipient
rules as the old portal:
  * B2B accounts: only the B2B account owner (notification email, else login email) — never end-company contacts.
  * Everyone else: the company's registered email, then the order form email, then the client's notification
    email, then the login email.
Every email goes through email_service.send_email, so it lands in the Email log with its status.
Email problems never break the action that triggered them.
"""
from __future__ import annotations

import os
from html import escape as html_escape

from db import query_db
from services import email_engine as eng
from services.email_service import send_email
from services.notification_service import create_notification
from services.portal_compat import brand_settings

PLACEHOLDER_DOMAINS = ('@brixen-pending.local',)


def client_panel_url():
    """Where customers open their account (the website client panel), as in app.py client_website_url."""
    configured = (os.environ.get('CLIENT_PANEL_URL') or '').strip()
    if configured:
        return configured.rstrip('/')
    try:
        from services.settings_service import get_setting
        value = str(get_setting('client_panel_url', '') or '').strip()
        if value:
            return value.rstrip('/')
    except Exception:
        pass
    return 'https://brixenconsultants.com/client-panel/customer-messages'


def _usable(email):
    email = str(email or '').strip().lower()
    if not email or '@' not in email or any(email.endswith(d) for d in PLACEHOLDER_DOMAINS):
        return ''
    return email


def _client(user_id):
    if not user_id:
        return None
    row = query_db("""
        SELECT id, email, notification_email, full_name, role, is_b2b, client_type, status
        FROM users WHERE id = ? AND role = 'CLIENT' LIMIT 1;
    """, (user_id,), one=True)
    return dict(row) if row else None


def _is_b2b(client):
    return bool(client) and (int(client.get('is_b2b') or 0) == 1 or str(client.get('client_type') or '').upper() == 'B2B')


def resolve_recipient(client, *, company=None, order=None, email_to=None):
    """Who gets the email (see module docstring)."""
    owner = _usable(client.get('notification_email')) or _usable(client.get('email'))
    if _is_b2b(client) or (order or {}).get('b2b_client_id'):
        return owner
    explicit = _usable(email_to)
    if explicit:
        return explicit
    if company and _usable(company.get('registered_email')):
        return _usable(company.get('registered_email'))
    if order and _usable(order.get('owner_form_email')):
        return _usable(order.get('owner_form_email'))
    return owner


def _greeting(client, order=None):
    for candidate in ((order or {}).get('owner_name'), client.get('full_name')):
        text = str(candidate or '').strip()
        if text:
            return text.split()[0]
    return 'there'


def compose_client_email(*, subject, headline, greeting, message, points=None, details=None,
                         cta_label=None, cta_url=None, category='ORDER'):
    """Brixen transactional email (same shell as the invoice emails). Returns (subject, text, html)."""
    brand = brand_settings()
    brand_for_sig = {**brand, 'legal_name': brand.get('legal_name') or 'Brixen Consultants Ltd'}
    points = [str(p).strip() for p in (points or []) if str(p).strip()]
    details = [(k, v) for k, v in (details or []) if str(v or '').strip()]

    points_html = ''.join(
        f'<p style="margin:6px 0 0;font-size:14px;line-height:1.5;color:#111827;">{html_escape(p)}</p>'
        for p in points)
    details_html = ''
    if details:
        rows = ''.join(
            f'<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;vertical-align:top;">{html_escape(str(k))}</td>'
            f'<td style="padding:6px 0 6px 16px;color:#111827;font-size:13px;font-weight:600;text-align:right;">'
            f'{html_escape(str(v))}</td></tr>' for k, v in details)
        details_html = (
            '<div style="margin:16px 0 0;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">'
            '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '
            f'style="width:100%;border-collapse:collapse;">{rows}</table></div>')
    cta_html = ''
    if cta_label and cta_url:
        cta_html = (
            f'<p style="margin:20px 0 0;"><a href="{html_escape(cta_url)}" '
            'style="display:inline-block;padding:11px 18px;background:#003971;color:#ffffff;text-decoration:none;'
            f'border-radius:8px;font-size:14px;font-weight:600;">{html_escape(cta_label)}</a></p>')

    body_inner = (
        f'<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#111827;">Hello {html_escape(greeting)},</p>'
        f'<p style="margin:0;font-size:15px;line-height:1.55;color:#374151;">'
        f'{html_escape(message).replace(chr(10), "<br>")}</p>'
        f'{points_html}{details_html}{cta_html}'
    )
    hero = (
        f'<tr><td style="padding:24px 24px 8px;background:#ffffff;">'
        f'<p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#003971;font-weight:700;">'
        f'{html_escape(brand.get("company_name") or "Brixen Consultants")}</p>'
        f'<h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#111827;">{html_escape(headline)}</h1>'
        f'</td></tr>'
    )
    html = eng.build_transactional_shell_html(
        subject=subject,
        head_html=f'<head><meta charset="utf-8"><title>{html_escape(subject)}</title></head>',
        hero_html=hero,
        body_inner_html=body_inner,
        signature_html=eng.email_signature_html(brand_for_sig),
        disclaimer_html=eng.email_disclaimer_html(eng.category_disclaimer(category)),
    )
    text_lines = [f"Hello {greeting},", '', message, *points]
    text_lines += [f"{k}: {v}" for k, v in details]
    if cta_label and cta_url:
        text_lines += ['', f"{cta_label}: {cta_url}"]
    return subject, '\n'.join(text_lines), html


def notify_client(user_id, *, title, message, ntype='info', link=None, email=True, subject=None, headline=None,
                  points=None, details=None, cta_label='Open your client panel', cta_url=None, category='ORDER',
                  company=None, order=None, email_to=None, triggered_by=None):
    """In-app notification + email for a client. Returns {notification_created, email_sent, email_status, email_to}."""
    result = {'notification_created': False, 'email_sent': False, 'email_status': 'Not sent'}
    try:
        client = _client(user_id)
        if not client:
            result['email_status'] = 'Client not found'
            return result
        result['notification_created'] = bool(create_notification(client['id'], title, message, ntype, link))
        if not email:
            result['email_status'] = 'In-app only'
            return result
        recipient = resolve_recipient(client, company=company, order=order, email_to=email_to)
        if not recipient:
            result['email_status'] = 'No email address'
            return result
        company_name = brand_settings().get('company_name') or 'Brixen Consultants'
        subj, text, html = compose_client_email(
            subject=subject or f"{title} — {company_name}",
            headline=headline or title,
            greeting=_greeting(client, order),
            message=message,
            points=points,
            details=details,
            cta_label=cta_label,
            # B2B accounts use the CRM portal; everyone else uses the website client panel
            cta_url=cta_url or (_crm_url('/portal') if _is_b2b(client) else client_panel_url()),
            category=category,
        )
        ok = send_email(recipient, subj, html, text_content=text, category=category, user_id=client['id'],
                        order_id=(order or {}).get('id'), company_id=(company or {}).get('id'),
                        triggered_by=triggered_by)
        result.update(email_sent=bool(ok), email_status='sent' if ok else 'failed', email_to=recipient)
    except Exception as exc:  # emails must never break the action that triggered them
        print(f"[Client mail] {title}: {exc}")
        result['email_status'] = f'error: {exc}'
    return result


# ── Team emails (app.py notify_staff_task / email_team_about_clients) ──────────────────────────

def _crm_url(path=''):
    try:
        from config import FRONTEND_URL
        from services.settings_service import get_setting
        base = (get_setting('frontend_url', '') or FRONTEND_URL or 'https://admin.brixenconsultants.com').rstrip('/')
    except Exception:
        base = 'https://admin.brixenconsultants.com'
    return f"{base}{path}"


def team_mailboxes():
    """Settings > Team notification emails (comma / semicolon / new-line separated)."""
    try:
        from services.settings_service import get_setting
        raw = str(get_setting('team_notification_emails', '') or '')
    except Exception:
        raw = ''
    out = []
    for part in raw.replace(';', ',').replace('\n', ',').split(','):
        email = _usable(part)
        if email and email not in out:
            out.append(email)
    return out


def _staff_email(*, to, subject, headline, greeting, message, link_path, category='STAFF', triggered_by=None,
                 order_id=None):
    subj, text, html = compose_client_email(
        subject=subject, headline=headline, greeting=greeting, message=message,
        cta_label='Open the CRM', cta_url=_crm_url(link_path), category=category)
    return send_email(to, subj, html, text_content=text, category=category, triggered_by=triggered_by,
                      order_id=order_id)


def email_team(subject, message, link_path='/admin', order_id=None):
    """Same alert to every team mailbox (new website order, new support ticket). Returns the number sent."""
    sent = 0
    try:
        for email in team_mailboxes():
            if _staff_email(to=email, subject=subject, headline=subject.split(' — ')[0], greeting='team',
                            message=message, link_path=link_path, order_id=order_id):
                sent += 1
    except Exception as exc:
        print(f"[Team mail] {subject}: {exc}")
    return sent


def email_staff_member(user_id, title, message, link_path='/admin/tasks', triggered_by=None):
    """Email one team member (task assigned / completed). Skips customers and the person who did it."""
    try:
        if not user_id or (triggered_by is not None and str(user_id) == str(triggered_by)):
            return False
        member = query_db("""
            SELECT id, email, full_name, role FROM users
            WHERE id = ? AND role != 'CLIENT' AND COALESCE(status, 'Active') = 'Active' LIMIT 1;
        """, (user_id,), one=True)
        if not member or not _usable(member.get('email')):
            return False
        return _staff_email(to=_usable(member['email']), subject=f"{title} — Brixen Consultants", headline=title,
                            greeting=str(member.get('full_name') or 'there').split()[0], message=message,
                            link_path=link_path, triggered_by=triggered_by)
    except Exception as exc:
        print(f"[Staff mail] {title}: {exc}")
        return False


# ── Activity emails (copy from app.py) ──────────────────────────────────────────────────────────

def _classify(service):
    text = str(service or '').lower()
    if any(t in text for t in ('formation', 'incorporat', 'company registration', 'register a company')):
        return 'formation'
    if any(t in text for t in ('identity', 'idv', 'kyc')):
        return 'identity'
    if 'psc' in text or 'person of significant' in text:
        return 'psc'
    if any(t in text for t in ('account', 'confirmation statement', 'bookkeep', 'compliance')):
        return 'accounts'
    if 'vat' in text:
        return 'vat'
    if any(t in text for t in ('bank', 'tide', 'wise')):
        return 'bank'
    if any(t in text for t in ('registered office', 'mail', 'virtual office', 'address')):
        return 'office'
    if any(t in text for t in ('document', 'file', 'certificate')):
        return 'files'
    return 'service'


def product_completion_points(order):
    service = str(order.get('service_name') or 'Your order').strip()
    points = {
        'formation': ['✅ Company formation is complete', '📄 Your company files are ready',
                      '🏦 You can now open a UK business bank account'],
        'office': ['✅ Registered office is active', '📬 Mail handling is in place',
                   '🏢 Banks and Companies House can use this address'],
        'accounts': ['✅ Accounts work is complete', '📄 Confirmation statement and yearly accounts are filed',
                     '📅 We will remind you before the next deadline'],
        'vat': ['✅ VAT registration is complete', '🧾 Your VAT details are ready for invoices'],
        'bank': ['✅ Business bank account setup is complete', '🏦 Your account is ready for payments'],
        'identity': ['✅ Identity verification is complete', '🪪 Companies House can now accept your filings'],
        'psc': ['✅ PSC verification is complete', '👥 People with significant control are confirmed'],
        'files': ['✅ Your company files are ready', '📁 Open your client panel to download them'],
    }.get(_classify(service), [f'✅ {service} is complete'])
    if order.get('company_name'):
        points.append(f"🏢 {order['company_name']}")
    if order.get('order_number'):
        points.append(f"📦 Order {order['order_number']}")
    return points


def _order_context(order_id):
    row = query_db("""
        SELECT o.*, c.name AS company_name, c.registered_email AS company_registered_email
        FROM orders o LEFT JOIN companies c ON c.id = o.company_id
        WHERE o.id = ? LIMIT 1;
    """, (order_id,), one=True)
    if not row:
        return None, None
    order = dict(row)
    company = ({'id': order.get('company_id'), 'name': order.get('company_name'),
                'registered_email': order.get('company_registered_email')} if order.get('company_id') else None)
    return order, company


def notify_order_status_changed(order_id, old_status, triggered_by=None):
    """Order status changed by the team: 'complete' email when Completed, otherwise a status update."""
    order, company = _order_context(order_id)
    if not order or int(order.get('is_draft') or 0) or order.get('status') == old_status:
        return None
    status = order.get('status') or 'Pending'
    number = order.get('order_number') or f"#{order_id}"
    service = str(order.get('service_name') or 'Your order').strip()
    brand = brand_settings().get('company_name') or 'Brixen Consultants'
    if status == 'Completed':
        return notify_client(
            order['user_id'], title=f'{service} is complete', headline=f'{service} is done',
            message='Good news — this order is now Completed.', ntype='order_complete', link='/orders',
            subject=f'{service} is complete — {brand}', points=product_completion_points(order),
            details=[('Order', number)], cta_label='View in your client panel', category='ORDER',
            company=company, order=order, triggered_by=triggered_by)
    progress = order.get('progress_percent')
    status_text = f"{status} ({progress}% complete)" if progress not in (None, '') else status
    return notify_client(
        order['user_id'], title='Order status updated',
        message=f"Order {number} status changed to '{status}'.", ntype='order_update', link='/orders',
        subject=f'Order update — {number} — {brand}', headline='Your order status has changed',
        points=[f'✅ {service}', f'📦 Order {number}'], details=[('Status', status_text)],
        cta_label='Track your order', category='ORDER', company=company, order=order, triggered_by=triggered_by)


def notify_document_available(document_id, client_message=None, triggered_by=None):
    """A document was shared with the customer (uploaded as visible, approved, or made visible)."""
    doc = query_db("""
        SELECT d.id, d.name, d.user_id, d.order_id, d.company_id, c.name AS company_name,
               c.registered_email AS company_registered_email, o.order_number, o.owner_form_email, o.owner_name,
               o.b2b_client_id
        FROM documents d
        LEFT JOIN companies c ON c.id = d.company_id
        LEFT JOIN orders o ON o.id = d.order_id
        WHERE d.id = ? LIMIT 1;
    """, (document_id,), one=True)
    if not doc or not doc.get('user_id'):
        return None
    doc = dict(doc)
    name = doc.get('name') or 'Document'
    details = [('Document', name), ('Company', doc.get('company_name')), ('Order', doc.get('order_number'))]
    if client_message:
        details.append(('Message', client_message))
    company = ({'id': doc['company_id'], 'name': doc.get('company_name'),
                'registered_email': doc.get('company_registered_email')} if doc.get('company_id') else None)
    order = ({'id': doc['order_id'], 'owner_form_email': doc.get('owner_form_email'),
              'owner_name': doc.get('owner_name'), 'b2b_client_id': doc.get('b2b_client_id')}
             if doc.get('order_id') else None)
    return notify_client(
        doc['user_id'], title='New document available',
        message='Brixen Consultants has uploaded a new document to your client portal. Log in to view and download it.',
        ntype='document_uploaded', link='/documents',
        subject=f'New document ready — {name}', headline='A new document is available in your client portal',
        details=details, cta_label='View your documents', category='DOCUMENT',
        company=company, order=order, triggered_by=triggered_by)


def notify_customer_upload_received(user_id, doc_name, order_number=None):
    """Confirmation to a customer who uploaded a document in the portal."""
    return notify_client(
        user_id, title='Document uploaded',
        message=f"Your document '{doc_name}' was uploaded successfully and is queued for review.",
        ntype='document', link='/documents',
        subject=f'We received your document — {doc_name}', headline='Thanks, we received your document',
        details=[('Document', doc_name), ('Order', order_number)], cta_label='View your documents',
        category='CUSTOMER_UPLOAD')


def notify_compliance_done(company_id, events, triggered_by=None):
    """Identity and/or PSC verification marked as verified by the team."""
    company = query_db("SELECT id, user_id, name, registered_email FROM companies WHERE id = ?;", (company_id,), one=True)
    if not company or not events:
        return None
    company = dict(company)
    name = str(company.get('name') or 'Your company').strip()
    points, titles = [f'🏢 {name}'], []
    if 'identity' in events:
        titles.append('Identity verification')
        points += ['✅ Identity verification is complete', '🪪 Companies House can now accept your filings']
    if 'psc' in events:
        titles.append('PSC verification')
        points += ['✅ PSC verification is complete', '👥 People with significant control are confirmed']
    headline = ' and '.join(titles) + ' is done'
    brand = brand_settings().get('company_name') or 'Brixen Consultants'
    return notify_client(
        company['user_id'], title=headline, headline=headline,
        message='A required company check is now complete.', ntype='compliance_complete', link='/companies',
        subject=f'{headline} — {name} — {brand}', points=points, details=[('Company', name)],
        cta_label='View your company', category='KYC', company=company, triggered_by=triggered_by)


def notify_accounts_filed(company_id, period_end=None, confirmation=None, triggered_by=None):
    """Yearly accounts marked as filed."""
    company = query_db("SELECT id, user_id, name, registered_email FROM companies WHERE id = ?;", (company_id,), one=True)
    if not company:
        return None
    company = dict(company)
    name = str(company.get('name') or 'Your company').strip()
    points = ['✅ Yearly accounts are filed', f'🏢 {name}']
    if period_end:
        points.append(f'📅 Period ending {period_end}')
    if confirmation:
        points.append(f'📄 Confirmation {confirmation}')
    points.append('📁 Company files are in your client panel')
    brand = brand_settings().get('company_name') or 'Brixen Consultants'
    return notify_client(
        company['user_id'], title='Yearly accounts filed', headline='Your yearly accounts are filed',
        message='Good news — the accounts for this company are now filed.', ntype='accounts_filed',
        link='/companies', subject=f'Yearly accounts filed — {name} — {brand}', points=points,
        details=[('Company', name)], cta_label='View your company', category='COMPLIANCE',
        company=company, triggered_by=triggered_by)
