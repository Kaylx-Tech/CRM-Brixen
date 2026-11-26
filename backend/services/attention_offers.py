"""Companies › Attention › "Offer to Fix": turn a Companies House problem of a client company into work.

The team picks the service that fixes the problem (accounts, confirmation statement, registered office …) and
sends the client an offer by email (from the firm's own mailbox and brand) or by WhatsApp (a wa.me link
with the message ready; no WhatsApp API needed). The offer has a private link to a page where the client
presses "Yes, Please Go Ahead": that creates a Pending order for the service on the company, exactly like a
manual CRM order, and the team is told. Opening the page and saying yes are recorded on the offer, so the card
shows Sent / Opened / Accepted.

Lives in the CRM database (attention_offers). Links work for OFFER_DAYS days.

Follow-ups: an email offer nobody has accepted gets a reminder by itself after FOLLOW_UP_DAYS[0] days and a last
one after FOLLOW_UP_DAYS[1] (same link), while the company still needs attention and no newer offer was sent
(run_followups, every hour by start_followup_worker). WhatsApp offers are sent by the team, so they get none.
"""
import re
import secrets

from db import execute_db, query_db

OFFER_DAYS = 30
NO_MAILBOX = "Emails are switched off: turn them on in Settings › Email first."
FOLLOW_UP_DAYS = (3, 7)
CHANNELS = ('email', 'whatsapp')

# Which service fixes which problem: words looked for in the service names, best first
ISSUE_SERVICE_WORDS = {
    'accounts_overdue': ('annual accounts', 'accounts', 'dormant'),
    'confirmation_pending': ('confirmation statement', 'confirmation', 'cs01'),
    'default_address': ('registered office', 'registered address', 'office address', 'address'),
    'strike_off': ('confirmation statement', 'annual accounts', 'accounts', 'restoration'),
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS attention_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    issue_codes TEXT,
    service_id INTEGER,
    service_name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    channel TEXT NOT NULL,
    recipient TEXT,
    message TEXT,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'sent',
    sent_by INTEGER,
    sent_by_name TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    opened_at TIMESTAMP,
    accepted_at TIMESTAMP,
    order_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attention_offers_company ON attention_offers(company_id, id);
"""


class OfferError(ValueError):
    """Shown as it is."""


_ready = set()


def _ensure():
    from db import get_db
    path = 'crm'
    if path in _ready:
        return
    conn = get_db()
    conn.executescript(SCHEMA)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(attention_offers);").fetchall()}
    if 'followups' not in cols:  # reminders sent by run_followups
        conn.execute("ALTER TABLE attention_offers ADD COLUMN followups INTEGER NOT NULL DEFAULT 0;")
        conn.execute("ALTER TABLE attention_offers ADD COLUMN last_followup_at TIMESTAMP;")
    conn.commit()
    _ready.add(path)


def _company(company_id):
    row = query_db("SELECT * FROM companies WHERE id = ? LIMIT 1;", (company_id,), one=True)
    if not row:
        raise OfferError("Company not found")
    return dict(row)


def _client(company):
    if not company.get('user_id'):
        return None
    row = query_db("SELECT id, email, notification_email, full_name, phone, role, is_b2b, client_type FROM users "
                   "WHERE id = ? LIMIT 1;", (company['user_id'],), one=True)
    return dict(row) if row else None


def _issues(company):
    from services.ch_attention import company_attention_issues
    return [i for i in company_attention_issues(company) if i and i.get('code')]


def _services():
    rows = query_db("SELECT id, name, category, price, vat_rate FROM services WHERE status = 'Active' "
                    "ORDER BY category, name;") or []
    return [dict(r) for r in rows]


def _suggest_service(issues, services):
    for issue in issues:
        for word in ISSUE_SERVICE_WORDS.get(issue['code'], ()):
            for s in services:
                if word in str(s.get('name') or '').lower():
                    return s
    return None


def _email_for(client, company):
    from services.client_mail import resolve_recipient
    return resolve_recipient(client, company=company) if client else ''


def _phone_digits(value):
    digits = re.sub(r'\D', '', str(value or ''))
    if digits.startswith('00'):
        digits = digits[2:]
    elif digits.startswith('0') and len(digits) == 11:  # a UK number written 07…
        digits = '44' + digits[1:]
    return digits if 8 <= len(digits) <= 15 else ''


def _whatsapp_url(company, service_name=''):
    """wa.me link to the firm, with a ready message, for the Chat on WhatsApp button ('' when no number is set)."""
    from urllib.parse import quote
    try:
        from services.email_engine import WHATSAPP_NUMBER as number  # the firm's own WhatsApp number, where set
    except ImportError:
        number = ''
    if not number:
        try:
            from services.portal_compat import brand_settings
            number = (brand_settings() or {}).get('support_phone') or ''
        except Exception:
            number = ''
    digits = _phone_digits(number)
    if not digits:
        return ''
    text = f"Hello, I have a question about {company.get('name') or 'my company'}"
    text += f" ({service_name})." if service_name else "."
    return f"https://wa.me/{digits}?text={quote(text)}"


def _money(value):
    return f"£{float(value or 0):,.2f}"


def _price_text(service):
    """'£60.00 + VAT', or '' when the service has no price set (then no price is mentioned)."""
    if float(service.get('price') or 0) <= 0:
        return ''
    vat = float(service.get('vat_rate') or 0)
    return _money(service.get('price')) + (' + VAT' if vat > 0 else '')


def _issue_sentence(company, issues):
    name = company.get('name') or 'your company'
    parts = []
    for i in issues:
        detail = f" ({'d' + i['detail'][1:]})" if str(i.get('detail') or '').startswith('Due ') else ''
        title = str(i.get('title') or i['code'])
        parts.append(f"**{title[:1].lower() + title[1:]}**{detail}")
    if not parts:
        return f"Companies House shows something that needs doing for **{name}**."
    return f"Companies House shows that **{name}** has: {'; '.join(parts)}."


def default_message(company, issues, service):
    lines = [_issue_sentence(company, issues), '']
    if service:
        price = _price_text(service)
        lines.append(f"We can take care of it for you: **{service['name']}**{f' for **{price}**' if price else ''}. "
                     "Press the button below (or open the link) and we will start straight away.")
    else:
        lines.append("We can take care of it for you. Press the button below (or open the link) and we will start "
                     "straight away.")
    return '\n'.join(lines)


def _last_offer(company_id):
    row = query_db("SELECT * FROM attention_offers WHERE company_id = ? ORDER BY id DESC LIMIT 1;",
                   (company_id,), one=True)
    return dict(row) if row else None


def prepare(company_id):
    """What the Offer to Fix dialog needs: the company, client, problems, services and a ready message."""
    _ensure()
    company = _company(company_id)
    client = _client(company)
    issues = _issues(company)
    services = _services()
    suggested = _suggest_service(issues, services)
    return {
        'company': {'id': company['id'], 'name': company.get('name'), 'number': company.get('company_number')},
        'client': {
            'name': (client or {}).get('full_name') or company.get('director') or '',
            'email': _email_for(client, company),
            'phone': (client or {}).get('phone') or '',
            'whatsapp_ready': bool(_phone_digits((client or {}).get('phone'))),
        },
        'issues': issues,
        'services': services,
        'suggested_service_id': (suggested or {}).get('id'),
        'message': default_message(company, issues, suggested),
        'last_offer': _last_offer(company['id']),
        'mailbox_ready': _mailbox_ready(),
    }


def _mailbox_ready():
    from services.email_service import emails_enabled
    return emails_enabled()


def marketing_mailbox_ready():
    return _mailbox_ready()


def _link(token):
    from services.portal_compat import portal_base_url
    return f"{portal_base_url()}/offer/{token}"


def send(company_id, body, actor):
    """Make one offer and send it. Returns {offer, link, whatsapp_url?}."""
    _ensure()
    body = body if isinstance(body, dict) else {}
    company = _company(company_id)
    client = _client(company)
    channel = body.get('channel') if body.get('channel') in CHANNELS else 'email'
    service = next((s for s in _services() if str(s['id']) == str(body.get('service_id'))), None)
    if not service:
        raise OfferError("Pick the service that fixes this")
    message = str(body.get('message') or '').strip()[:3000] or default_message(company, _issues(company), service)
    if channel == 'email':
        if not marketing_mailbox_ready():
            raise OfferError(NO_MAILBOX)
        recipient = str(body.get('email') or '').strip() or _email_for(client, company)
        from utils.validation import email_problem
        if not recipient or email_problem(recipient):
            raise OfferError("This client has no usable email. Add one, or send by WhatsApp.")
    else:
        recipient = _phone_digits(body.get('phone') or (client or {}).get('phone'))
        if not recipient:
            raise OfferError("This client has no usable mobile number. Add one with the country code, or send by email.")

    token = secrets.token_urlsafe(18)
    issues = _issues(company)
    offer_id = execute_db("""
        INSERT INTO attention_offers (company_id, issue_codes, service_id, service_name, price, channel, recipient,
                                      message, token, sent_by, sent_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (company['id'], ','.join(i['code'] for i in issues), service['id'], service['name'],
          float(service.get('price') or 0), channel, recipient, message, token, (actor or {}).get('id'),
          (actor or {}).get('full_name') or (actor or {}).get('email')))
    link = _link(token)
    out = {'link': link}

    if channel == 'email':
        from services.client_mail import compose_client_email
        from services.email_service import send_email
        greeting = ((client or {}).get('full_name') or company.get('director') or 'there').split()[0]
        subject, text, html = compose_client_email(
            subject=f"{company.get('name')}: we can sort this out for you",
            headline='We Can Sort This Out For You',
            greeting=greeting,
            message=message,
            details=[('Company', company.get('name')), ('Service', service['name']),
                     ('Price', _price_text(service))],  # an empty price row is left out
            cta_label='Yes, Please Go Ahead',
            cta_url=link,
            cta2_label='Chat on WhatsApp' if _whatsapp_url(company) else None,
            cta2_url=_whatsapp_url(company, service['name']) or None,
            category='COMPLIANCE',
            footnote=f"This link works for {OFFER_DAYS} days. Reply to this email or message us on WhatsApp if you have a question.",
        )
        ok = send_email(recipient, subject, html, text, category='COMPLIANCE',
                        user_id=(client or {}).get('id'),
                        company_id=company['id'], triggered_by=(actor or {}).get('id'))
        if not ok:
            execute_db("UPDATE attention_offers SET status = 'failed' WHERE id = ?;", (offer_id,))
            from services.email_service import last_failure_reason
            raise OfferError(f"The email was not sent: {last_failure_reason() or 'please check Settings › Email'}")
    else:
        from urllib.parse import quote
        greeting = ((client or {}).get('full_name') or company.get('director') or '').split()
        hello = f"Hello {greeting[0]},\n\n" if greeting else "Hello,\n\n"
        out['whatsapp_url'] = f"https://wa.me/{recipient}?text={quote(hello + message.replace('**', '*') + chr(10) + chr(10) + link)}"

    out['offer'] = _last_offer(company['id'])
    return out


def latest_by_company():
    """{company_id: the newest offer} for the Attention cards."""
    _ensure()
    rows = query_db(f"""
        SELECT * FROM attention_offers WHERE datetime(sent_at) >= datetime('now', '-{OFFER_DAYS} days')
        ORDER BY id DESC;
    """) or []
    out = {}
    for r in rows:  # newest first; an accepted offer wins, then one that was opened
        key = str(r['company_id'])
        rank = 2 if r['accepted_at'] else 1 if r['opened_at'] else 0
        if key not in out or rank > out[key]['_rank']:
            out[key] = {**{k: r[k] for k in ('id', 'service_name', 'channel', 'status', 'sent_at', 'opened_at',
                                            'accepted_at', 'order_id', 'sent_by_name', 'followups',
                                            'last_followup_at')}, '_rank': rank}
    for item in out.values():
        item.pop('_rank')
    return out


def send_to_all(company_ids, actor):
    """Email an offer to every chosen company with an attention problem, a matching service and an email.
    Returns {sent, skipped: [{company, reason}]}."""
    _ensure()
    if not marketing_mailbox_ready():
        raise OfferError(NO_MAILBOX)
    services = _services()
    sent, skipped = 0, []
    for cid in [int(c) for c in company_ids if str(c).isdigit()][:200]:
        company = None
        try:
            company = _company(cid)
            issues = _issues(company)
            if not issues:
                continue
            service = _suggest_service(issues, services)
            if not service:
                skipped.append({'company': company.get('name'), 'reason': 'No matching service'})
                continue
            last = _last_offer(cid)
            if last and last['status'] in ('sent', 'opened') and str(last.get('sent_at') or '') >= _days_ago(3):
                skipped.append({'company': company.get('name'), 'reason': 'Offer sent in the last 3 days'})
                continue
            send(cid, {'channel': 'email', 'service_id': service['id']}, actor)
            sent += 1
        except OfferError as exc:
            skipped.append({'company': (company or {}).get('name') or str(cid), 'reason': str(exc)})
    return {'sent': sent, 'skipped': skipped}


def _days_ago(days):
    row = query_db(f"SELECT datetime('now', '-{int(days)} days') AS t;", one=True)
    return row['t']


# ── the client's side (public, no sign-in) ──────────────────────────────────

def _by_token(token):
    _ensure()
    token = str(token or '').strip()
    if not re.match(r'^[A-Za-z0-9_-]{16,64}$', token):
        raise OfferError("This link is not valid.")
    row = query_db(f"""
        SELECT * FROM attention_offers WHERE token = ?
          AND datetime(sent_at) >= datetime('now', '-{OFFER_DAYS} days') LIMIT 1;
    """, (token,), one=True)
    if not row:
        raise OfferError("This link has expired or is not valid. Please contact us and we will help.")
    return dict(row)


def public_view(token):
    """What the client's page shows. Marks the offer opened."""
    offer = _by_token(token)
    if not offer.get('opened_at'):
        execute_db("UPDATE attention_offers SET opened_at = datetime('now'), "
                   "status = CASE WHEN status = 'sent' THEN 'opened' ELSE status END WHERE id = ?;", (offer['id'],))
    company = _company(offer['company_id'])
    service = query_db("SELECT * FROM services WHERE id = ? LIMIT 1;", (offer['service_id'],), one=True) or {}
    from services.portal_compat import brand_settings
    brand = brand_settings() or {}
    return {
        'firm': brand.get('company_name') or brand.get('legal_name') or '',
        'company': company.get('name'),
        'company_number': company.get('company_number'),
        'issues': [i.get('title') for i in _issues(company)],
        'message': offer.get('message') or '',
        'service': offer['service_name'],
        'price': _price_text({'price': offer['price'], 'vat_rate': service.get('vat_rate')}),
        'accepted': bool(offer.get('accepted_at')),
        'whatsapp': _whatsapp_url(company, offer['service_name']),
    }


def accept(token):
    """The client said yes: a Pending order for the service (once), and the team is told."""
    offer = _by_token(token)
    if offer.get('accepted_at') and offer.get('order_id'):
        return public_view(token)
    company = _company(offer['company_id'])
    client = _client(company)
    if not client:
        raise OfferError("Please contact us to go ahead: this company has no client account linked.")
    from services.manual_order_service import create_manual_crm_order
    result, error = create_manual_crm_order({
        'client_mode': 'existing',
        'client_id': client['id'],
        'company_id': company['id'],
        'line_items': [{'product_name': offer['service_name'], 'price': offer['price'],
                        'category_name': 'Attention Offer'}],
        'company_email': _email_for(client, company) or client.get('email'),
        'status': 'Pending',
        'payment_mode': 'Offer Accepted',
        'notes': f"The client accepted the {offer['channel']} offer sent from Companies › Attention.",
    }, actor={'role': 'SYSTEM'})
    if error:
        raise OfferError(f"We could not place the order ({error}). Please contact us and we will help.")
    execute_db("UPDATE attention_offers SET status = 'accepted', accepted_at = datetime('now'), order_id = ? "
               "WHERE id = ?;", (result['order_id'], offer['id']))
    return public_view(token)


# ── follow-ups ───────────────────────────────────────────────────────────────

def _send_reminder(offer, last):
    """One reminder email for an offer (same link). True when it went."""
    company = _company(offer['company_id'])
    client = _client(company)
    service = next((x for x in _services() if str(x['id']) == str(offer.get('service_id'))),
                   {'name': offer['service_name'], 'price': offer.get('price') or 0})
    from services.client_mail import compose_client_email
    from services.email_service import send_email
    greeting = ((client or {}).get('full_name') or company.get('director') or 'there').split()[0]
    message = (f"Just a reminder about **{company.get('name')}**: {_issue_sentence(company, _issues(company))} "
               f"We can take care of it for you with our **{service['name']}** service; one click below and we start."
               if not last else
               f"A last reminder about **{company.get('name')}**: {_issue_sentence(company, _issues(company))} "
               f"Leaving it can mean **penalties from Companies House**, so we would be glad to sort it for you with "
               f"our **{service['name']}** service.")
    subject, text, html = compose_client_email(
        subject=f"{'Last reminder' if last else 'Reminder'}: {company.get('name')} needs attention",
        headline='Still Need a Hand With This?' if not last else 'A Last Reminder',
        greeting=greeting,
        message=message,
        details=[('Company', company.get('name')), ('Service', service['name']), ('Price', _price_text(service))],
        cta_label='Yes, Please Go Ahead',
        cta_url=_link(offer['token']),
        cta2_label='Chat on WhatsApp' if _whatsapp_url(company) else None,
        cta2_url=_whatsapp_url(company, service['name']) or None,
        category='COMPLIANCE',
        footnote="Reply to this email if you have a question, or if it is already taken care of.",
    )
    return send_email(offer['recipient'], subject, html, text, category='COMPLIANCE',
                      user_id=(client or {}).get('id'), company_id=company['id'])


def run_followups():
    """Reminders that are due. Returns how many went."""
    _ensure()
    if not marketing_mailbox_ready():
        return 0  # waits until emails are switched on
    first, second = FOLLOW_UP_DAYS
    rows = query_db(f"""
        SELECT o.* FROM attention_offers o
        WHERE o.channel = 'email' AND COALESCE(o.status, 'sent') != 'failed' AND o.accepted_at IS NULL
          AND o.followups < 2 AND datetime(o.sent_at) >= datetime('now', '-{OFFER_DAYS} days')
          AND NOT EXISTS (SELECT 1 FROM attention_offers n WHERE n.company_id = o.company_id AND n.id > o.id)
          AND ((o.followups = 0 AND datetime(o.sent_at) <= datetime('now', '-{first} days'))
            OR (o.followups = 1 AND datetime(o.sent_at) <= datetime('now', '-{second} days')))
        ORDER BY o.id LIMIT 200;
    """) or []
    sent = 0
    for row in rows:
        offer = dict(row)
        try:
            if not _issues(_company(offer['company_id'])):  # sorted already: no more reminders
                execute_db("UPDATE attention_offers SET followups = 2 WHERE id = ?;", (offer['id'],))
                continue
            ok = _send_reminder(offer, last=offer['followups'] >= 1)
        except Exception as exc:
            print(f"[Offers] reminder for offer {offer['id']}: {exc}")
            ok = False
        if ok:
            execute_db("UPDATE attention_offers SET followups = followups + 1, last_followup_at = datetime('now') "
                       "WHERE id = ?;", (offer['id'],))
            sent += 1
    return sent


_followup_worker = False


def start_followup_worker(interval=3600):
    """Every hour: the offer reminders that are due."""
    global _followup_worker
    import os
    import threading
    import time
    if os.environ.get('CRM_TESTING') == '1' or _followup_worker:
        return False
    _followup_worker = True

    def _loop():
        time.sleep(120)  # after start-up work
        while True:
            try:
                run_followups()
            except Exception as exc:
                print(f"[Offers] follow-up worker: {exc}")
            time.sleep(interval)

    threading.Thread(target=_loop, name='offer-followups', daemon=True).start()
    return True
