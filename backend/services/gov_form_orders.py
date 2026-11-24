"""Gov Forms from orders: which services need a Companies House form, and the orders waiting for one.

  form_for_name(name)     the form a service's name points to (Confirmation Statement -> CS01, ...), or ''
  services_map()          every service with its form: the one set by hand, else the one its name points to
  set_service_form(...)   set a service's form by hand ('' = no form; None = back to the name)
  queue()                 the orders that need a form, each with its saved form (draft / ready / filed)
  order_info(order_id)    the order shown beside the form, with the client's answers from the order form
  complete_order(...)     filing the form completes the order
"""
import re

from db import execute_db, query_db
from services.gov_forms_templates import FORMS

SCHEMA = """
CREATE TABLE IF NOT EXISTS gov_form_services (
    service_id INTEGER PRIMARY KEY,
    form_code TEXT NOT NULL DEFAULT ''
);
"""
_ready = set()

# A service's name -> its form. Words as companies name these services; the code itself always works too.
NAME_RULES = [
    ('CS01', r'confirmation\s+statement|annual\s+return'),
    ('AD01', r'(change|chang(e|ing)\s+of|moving|move)\s+(the\s+)?registered\s+(office|address)'
             r'|registered\s+(office|address)\s+change'),
    ('AP01', r'appoint(ment)?\s+(of\s+)?(a\s+)?(new\s+)?director|add(ing)?\s+(a\s+)?(new\s+)?director'
             r'|director\s+appointment'),
    ('TM01', r'(resign(ation)?|remov(e|al)|terminat(e|ion))\s+(of\s+)?(a\s+)?director|director\s+'
             r'(resignation|removal|termination)'),
    ('CH01', r'change\s+(of\s+)?director(\'?s)?\s+details|director(\'?s)?\s+details\s+change'),
    ('PSC01', r'(add|notif\w*|new)\s+(of\s+)?(a\s+)?(psc|person\s+with\s+significant\s+control)'),
    ('PSC07', r'(remov\w*|ceas\w*|cessation)\s+(of\s+)?(a\s+)?(psc|person\s+with\s+significant\s+control)'),
    ('AA01', r'accounting\s+reference\s+date|(change|extend|shorten)\w*\s+(of\s+)?(the\s+)?(financial\s+)?year\s*end'),
    ('DS01', r'strik(e|ing)\s*-?\s*off|dissol(ve|ution)|clos(e|ing|ure)\s+(of\s+)?(a\s+|the\s+)?(limited\s+)?company'),
]
SKIP_STATUSES = ('Cancelled', 'Refunded', 'Draft')


def _ensure():
    from db import get_db
    try:
        from db import current_db_path
        path = current_db_path()
    except Exception:
        path = 'default'
    if path in _ready:
        return
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()
    _ready.add(path)


def form_for_name(name):
    text = str(name or '').lower()
    for code in FORMS:
        if re.search(rf'\b{code.lower()}\b', text):
            return code
    for code, pattern in NAME_RULES:
        if code in FORMS and re.search(pattern, text):
            return code
    return ''


def _overrides():
    _ensure()
    return {r['service_id']: r['form_code'] for r in query_db("SELECT * FROM gov_form_services;") or []}


def services_map():
    overrides = _overrides()
    out = []
    for s in query_db("SELECT id, name, category, status FROM services ORDER BY name COLLATE NOCASE;") or []:
        auto = form_for_name(s['name'])
        chosen = overrides.get(s['id'])
        out.append({'id': s['id'], 'name': s['name'], 'category': s.get('category') or '',
                    'active': (s.get('status') or 'Active') == 'Active', 'auto_form': auto,
                    'set_by_hand': chosen is not None, 'form_code': chosen if chosen is not None else auto})
    return out


def set_service_form(service_id, form_code):
    _ensure()
    if not query_db("SELECT id FROM services WHERE id = ?;", (service_id,), one=True):
        raise ValueError("Service not found")
    if form_code is None:
        execute_db("DELETE FROM gov_form_services WHERE service_id = ?;", (service_id,))
        return
    code = str(form_code or '').upper()
    if code and code not in FORMS:
        raise ValueError("Unknown form")
    execute_db("INSERT INTO gov_form_services (service_id, form_code) VALUES (?, ?) "
               "ON CONFLICT(service_id) DO UPDATE SET form_code = excluded.form_code;", (service_id, code))


def _form_lookup():
    """name (lower) -> form and service id -> form, set-by-hand first."""
    by_id, by_name = {}, {}
    for s in services_map():
        by_id[s['id']] = s['form_code']
        by_name.setdefault(str(s['name']).strip().lower(), s['form_code'])
    return by_id, by_name


def queue(limit=3000):
    """The orders that need a form (newest first), each with its form and its saved filing."""
    from services import gov_forms
    gov_forms._ensure()
    by_id, by_name = _form_lookup()

    def form_of(name, service_id=None):
        if service_id in by_id:
            return by_id[service_id]
        key = str(name or '').strip().lower()
        return by_name[key] if key in by_name else form_for_name(name)

    marks = ','.join('?' * len(SKIP_STATUSES))
    orders = query_db(f"""
        SELECT o.id, o.order_number, o.service_id, o.service_name, o.status, o.company_id, o.created_at,
               o.end_client_name, u.full_name AS client_name, c.name AS company_name, c.company_number
        FROM orders o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN companies c ON c.id = o.company_id
        WHERE COALESCE(o.is_draft, 0) = 0 AND o.status NOT IN ({marks})
        ORDER BY o.id DESC LIMIT ?;
    """, SKIP_STATUSES + (limit,)) or []
    if not orders:
        return []
    ids = [o['id'] for o in orders]
    lines = {}
    for li in query_db(f"SELECT order_id, product_name FROM order_line_items WHERE order_id IN "
                       f"({','.join('?' * len(ids))});", tuple(ids)) or []:
        lines.setdefault(li['order_id'], []).append(li['product_name'])
    saved = {}
    for f in query_db(f"SELECT id, order_id, form_code, status, updated_at FROM gov_form_filings WHERE order_id IN "
                      f"({','.join('?' * len(ids))}) ORDER BY id;", tuple(ids)) or []:
        saved[(f['order_id'], f['form_code'])] = f  # the newest one wins

    items = []
    for o in orders:
        wanted = []
        main = form_of(o['service_name'], o['service_id'])
        if main:
            wanted.append((main, o['service_name']))
        for name in lines.get(o['id'], []):
            code = form_of(name)
            if code and code not in [w[0] for w in wanted]:
                wanted.append((code, name))
        for code, service in wanted:
            filing = saved.get((o['id'], code))
            stage = filing['status'] if filing else 'new'
            if stage in ('new', 'draft') and o['status'] == 'Completed':
                continue  # done before Gov Forms (or by hand): nothing left to do
            items.append({
                'order_id': o['id'], 'order_number': o['order_number'], 'order_status': o['status'],
                'ordered_at': o['created_at'], 'service': service, 'form_code': code,
                'form_title': FORMS[code]['title'], 'company_id': o['company_id'],
                'company_name': o.get('company_name') or '', 'company_number': o.get('company_number') or '',
                'client_name': o.get('end_client_name') or o.get('client_name') or '',
                'stage': stage, 'filing_id': filing['id'] if filing else None,
                'updated_at': filing['updated_at'] if filing else o['created_at'],
            })
    return items


def order_info(order_id):
    """The order beside the form: its number, service, client and what the client wrote on the order form."""
    if not order_id:
        return None
    o = query_db("""
        SELECT o.id, o.order_number, o.service_name, o.status, o.company_id, o.end_client_name,
               o.order_form_values_json, o.checkout_form_json, u.full_name AS client_name
        FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?;
    """, (order_id,), one=True)
    if not o:
        return None
    from services.order_applicant import _answers
    answers, seen = [], set()
    for raw in (o.get('order_form_values_json'), o.get('checkout_form_json')):
        for label, value, _services in _answers(raw):
            key = (str(label).strip().lower(), str(value).strip())
            if not key[1] or key in seen or str(label).startswith('_'):
                continue
            seen.add(key)
            answers.append({'label': str(label).replace('_', ' ').strip(), 'value': str(value)})
    return {'id': o['id'], 'number': o['order_number'], 'service': o['service_name'], 'status': o['status'],
            'company_id': o['company_id'], 'client': o.get('end_client_name') or o.get('client_name') or '',
            'answers': answers[:60]}


def complete_order(order_id):
    """The form is filed: the order is done."""
    row = query_db("SELECT status FROM orders WHERE id = ?;", (order_id,), one=True)
    if not row or row['status'] in ('Completed', 'Cancelled', 'Refunded'):
        return False
    execute_db("UPDATE orders SET status = 'Completed', progress_percent = 100 WHERE id = ?;", (order_id,))
    try:
        from services.invoice_service import sync_invoice_with_order
        sync_invoice_with_order(order_id)
    except Exception as exc:
        print(f"[Gov forms] invoice for order {order_id} not synced: {exc}")
    return True
