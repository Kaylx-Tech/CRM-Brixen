"""AI assistant (the "Ask AI" box at the bottom of the CRM): Google Gemini with read-only tools.

Gemini never touches the database. It asks for one of the tools below, the tool runs here with the
signed-in member's own permissions (team members only reach their own orders, money is for admins),
and Gemini answers from what the tool returned. Nothing is changed by the assistant.

Settings: gemini_api_key (Settings or env GEMINI_API_KEY), gemini_model (default gemini-2.5-flash).
Each answer is logged in ai_usage (tokens per member) so use can be counted per workspace.
"""
import datetime
import json
import threading
import time
import urllib.error
import urllib.request

from db import query_db, execute_db
from services.permissions import can_view_revenue, check_permission

try:  # Finstap: one database per workspace, so the rate limit is per workspace and member
    from db import current_db_path
except ImportError:
    def current_db_path():
        return ''

GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
DEFAULT_MODEL = 'gemini-2.5-flash'
MAX_TOOL_ROUNDS = 6
MAX_HISTORY = 12
MAX_ROWS = 20
# Per member: at most this many questions in the window (a runaway loop cannot run up the bill)
RATE_LIMIT, RATE_WINDOW_SECONDS = 30, 300

STAFF_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
MANAGER_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER')
NOT_REGISTERED_SQL = ("(c.company_number IS NULL OR TRIM(c.company_number) = '' "
                      "OR UPPER(c.company_number) LIKE 'REG-%' OR UPPER(c.company_number) LIKE 'PENDING%')")


class AiError(Exception):
    """A problem to show the member as the answer (no key, Gemini unavailable, too many questions)."""


# ── tools ─────────────────────────────────────────────────────────────────────

def _limit(args, default=10):
    try:
        return max(1, min(int(args.get('limit') or default), MAX_ROWS))
    except (TypeError, ValueError):
        return default


def tool_search_customers(user, args):
    if not check_permission(user, 'clients.view'):
        return {'error': 'You do not have access to customers.'}
    term = str(args.get('query') or '').strip()
    clauses, params = ["u.role = 'CLIENT'"], []
    if term:
        clauses.append("(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.b2b_id LIKE ?)")
        params += [f"%{term}%"] * 4
    if user.get('role') == 'MANAGER':  # as the Customers page
        clauses.append("u.id IN (SELECT user_id FROM orders WHERE assigned_staff_id = ? OR assigned_staff_id IS NULL "
                       "OR assigned_staff_id IN (SELECT id FROM users WHERE role = 'STAFF'))")
        params.append(user['id'])
    rows = query_db(f"""
        SELECT u.id, u.full_name, u.email, u.phone, u.status, u.created_at,
               CASE WHEN COALESCE(u.is_b2b, 0) = 1 OR u.client_type = 'B2B' THEN 'B2B'
                    ELSE COALESCE(NULLIF(u.client_type, ''), 'Normal') END AS customer_type,
               (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND COALESCE(o.is_draft, 0) = 0) AS orders,
               (SELECT COUNT(*) FROM companies c WHERE c.user_id = u.id) AS companies
        FROM users u WHERE {' AND '.join(clauses)}
        ORDER BY u.created_at DESC LIMIT ?;
    """, params + [_limit(args)]) or []
    return {'customers': [dict(r) for r in rows]}


def tool_search_companies(user, args):
    term = str(args.get('query') or '').strip()
    flt = str(args.get('filter') or 'all')
    clauses, params = [], []
    if term:
        clauses.append("(c.name LIKE ? OR c.company_number LIKE ? OR u.full_name LIKE ?)")
        params += [f"%{term}%"] * 3
    if flt == 'not_registered':
        clauses.append(NOT_REGISTERED_SQL)
    elif flt == 'overdue':
        clauses.append("(COALESCE(c.accounts_overdue, 0) = 1 OR COALESCE(c.confirmation_overdue, 0) = 1 "
                       "OR date(c.accounts_next_due) < date('now') OR date(c.confirmation_next_due) < date('now'))")
    elif flt == 'registered':
        clauses.append(f"NOT {NOT_REGISTERED_SQL}")
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    rows = query_db(f"""
        SELECT c.id, c.name, c.company_number, c.status, c.inc_date, c.director,
               c.accounts_next_due, c.confirmation_next_due, c.accounts_overdue, c.confirmation_overdue,
               CASE WHEN {NOT_REGISTERED_SQL} THEN 0 ELSE 1 END AS registered,
               u.full_name AS customer
        FROM companies c LEFT JOIN users u ON u.id = c.user_id
        {where} ORDER BY c.created_at DESC LIMIT ?;
    """, params + [_limit(args)]) or []
    return {'companies': [dict(r) for r in rows]}


def tool_compliance_due(user, args):
    try:
        days = max(1, min(int(args.get('days') or 30), 365))
    except (TypeError, ValueError):
        days = 30
    rows = query_db(f"""
        SELECT c.id, c.name, c.company_number, u.full_name AS customer,
               c.accounts_next_due, c.confirmation_next_due, c.accounts_overdue, c.confirmation_overdue
        FROM companies c LEFT JOIN users u ON u.id = c.user_id
        WHERE NOT {NOT_REGISTERED_SQL} AND LOWER(COALESCE(c.status, '')) NOT IN ('dissolved', 'closed')
          AND (date(c.accounts_next_due) <= date('now', ?) OR date(c.confirmation_next_due) <= date('now', ?)
               OR COALESCE(c.accounts_overdue, 0) = 1 OR COALESCE(c.confirmation_overdue, 0) = 1)
        ORDER BY MIN(COALESCE(c.accounts_next_due, '9999'), COALESCE(c.confirmation_next_due, '9999'))
        LIMIT ?;
    """, (f'+{days} days', f'+{days} days', _limit(args, MAX_ROWS))) or []
    return {'today': datetime.date.today().isoformat(), 'within_days': days, 'companies': [dict(r) for r in rows]}


ORDER_FIELDS = ('id', 'order_number', 'status', 'products_summary', 'client_name', 'company_name',
                'created_at', 'expected_date', 'created_by_name', 'from_website', 'is_b2b')
MONEY_FIELDS = ('total', 'price')


def tool_list_orders(user, args):
    from services.order_service import build_admin_order_list
    query = {'page': ['1'], 'limit': [str(_limit(args))]}
    for key in ('status', 'status_group', 'search', 'date_preset', 'payment_status', 'customer_id'):
        if args.get(key) not in (None, ''):
            query[key] = [str(args[key])]
    data = build_admin_order_list(user, query)  # the Order Manager's own rules (team members: their orders)
    money = can_view_revenue(user)
    keep = ORDER_FIELDS + (MONEY_FIELDS if money else ())
    stats = dict(data.get('stats') or {})
    if not money:
        stats.pop('revenue', None)
    return {'matching_orders': (data.get('pagination') or {}).get('total'),
            'stats_for_these_filters': stats,
            'orders': [{k: o.get(k) for k in keep if k in o} for o in data.get('orders') or []]}


def tool_get_order(user, args):
    from services.order_service import build_admin_order_list
    number = str(args.get('order_number') or '').strip()
    if not number:
        return {'error': 'Give the order number.'}
    found = build_admin_order_list(user, {'search': [number], 'limit': ['5'], 'page': ['1']}).get('orders') or []
    match = next((o for o in found if str(o.get('order_number') or '').lower() == number.lower()), None) or \
        (found[0] if len(found) == 1 else None)
    if not match:
        return {'error': f'No order {number} that you can see.'}
    row = query_db("""
        SELECT o.id, o.order_number, o.status, o.service_name, o.created_at, o.expected_date, o.completed_at,
               o.total, o.cost_price, o.payment_mode, o.owner_name, o.owner_form_email,
               u.full_name AS customer, u.email AS customer_email, c.name AS company, c.company_number,
               cb.full_name AS added_by, asg.full_name AS assigned_to
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id LEFT JOIN companies c ON c.id = o.company_id
        LEFT JOIN users cb ON cb.id = o.created_by_id LEFT JOIN users asg ON asg.id = o.assigned_staff_id
        WHERE o.id = ?;
    """, (match['id'],), one=True)
    order = dict(row or {})
    if not can_view_revenue(user):
        for key in ('total', 'cost_price', 'payment_mode'):
            order.pop(key, None)
    order['products'] = [dict(r) for r in query_db(
        "SELECT product_name, fulfillment_status FROM order_line_items WHERE order_id = ? ORDER BY sort_order, id;",
        (match['id'],)) or []]
    order['documents'] = (query_db("SELECT COUNT(*) AS n FROM documents WHERE order_id = ?;",
                                   (match['id'],), one=True) or {}).get('n', 0)
    if can_view_revenue(user):
        inv = query_db("SELECT invoice_number, status, total, amount_paid, due_date FROM invoices "
                       "WHERE order_id = ? ORDER BY id DESC LIMIT 1;", (match['id'],), one=True)
        order['invoice'] = dict(inv) if inv else None
    return {'order': order}


def tool_invoices_summary(user, args):
    if not can_view_revenue(user):
        return {'error': 'Only admins can see invoices and money.'}
    status = str(args.get('status') or '').strip()
    totals = query_db("""
        SELECT status, COUNT(*) AS invoices, ROUND(SUM(total), 2) AS total,
               ROUND(SUM(total - COALESCE(amount_paid, 0)), 2) AS still_to_pay
        FROM invoices GROUP BY status ORDER BY status;
    """) or []
    clauses, params = ["i.status != 'Cancelled'", "i.status != 'Paid'"], []
    if status:
        clauses, params = ["i.status = ?"], [status]
    rows = query_db(f"""
        SELECT i.invoice_number, i.status, i.total, i.amount_paid, i.due_date, u.full_name AS customer,
               o.order_number
        FROM invoices i LEFT JOIN users u ON u.id = i.user_id LEFT JOIN orders o ON o.id = i.order_id
        WHERE {' AND '.join(clauses)} ORDER BY i.due_date ASC LIMIT ?;
    """, params + [_limit(args)]) or []
    return {'currency': 'GBP', 'by_status': [dict(r) for r in totals], 'invoices': [dict(r) for r in rows]}


def tool_team_performance(user, args):
    from routes.task_routes import _staff_month_metrics
    month = str(args.get('month') or '').strip()
    try:
        datetime.datetime.strptime(month, '%Y-%m')
    except ValueError:
        month = datetime.date.today().strftime('%Y-%m')
    if user.get('role') not in MANAGER_ROLES:  # team members see their own numbers only
        return {'month': month, 'you': _staff_month_metrics(user['id'], month)}
    staff = query_db("""
        SELECT id, full_name FROM users
        WHERE role IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF') AND status = 'Active' AND removed_at IS NULL
        ORDER BY full_name COLLATE NOCASE;
    """) or []
    keys = ('assigned_count', 'completed_count', 'on_time_count', 'overdue_count', 'open_count',
            'in_progress_count', 'grade', 'completion_rate', 'sla_rate')
    team = []
    for s in staff:
        m = _staff_month_metrics(s['id'], month)
        team.append({'name': s['full_name'], **{k: m.get(k) for k in keys}})
    return {'month': month, 'note': 'Orders count for the member they are assigned to (or who added them).',
            'team': team}


def _obj(properties, required=()):
    schema = {'type': 'object', 'properties': properties}
    if required:
        schema['required'] = list(required)
    return schema


TOOLS = {
    'search_customers': (tool_search_customers, 'Find customers by name, email, phone or B2B id. Empty query '
                         'lists the newest customers.', _obj({
                             'query': {'type': 'string', 'description': 'Name, email, phone or B2B id'},
                             'limit': {'type': 'integer', 'description': 'Max rows (1-20)'}})),
    'search_companies': (tool_search_companies, 'Find UK companies in the CRM by name, company number or '
                         'customer name, optionally only not-registered or overdue ones.', _obj({
                             'query': {'type': 'string'},
                             'filter': {'type': 'string', 'enum': ['all', 'registered', 'not_registered', 'overdue']},
                             'limit': {'type': 'integer'}})),
    'compliance_due': (tool_compliance_due, 'Registered companies whose annual accounts or confirmation '
                       'statement are overdue or due within the next N days.', _obj({
                           'days': {'type': 'integer', 'description': 'Look ahead this many days (default 30)'},
                           'limit': {'type': 'integer'}})),
    'list_orders': (tool_list_orders, 'List orders with filters, plus counts per status for those filters.', _obj({
        'status': {'type': 'string', 'description': 'Exact status, e.g. Pending, Processing, In Progress, '
                   'Completed, Documents Required, Information Required, Pending Verification, Cancelled'},
        'status_group': {'type': 'string', 'enum': ['pending', 'in_progress', 'completed']},
        'search': {'type': 'string', 'description': 'Order number, product, customer or company'},
        'date_preset': {'type': 'string', 'enum': ['today', 'yesterday', 'this_week', 'this_month',
                                                    'last_month', 'this_year']},
        'payment_status': {'type': 'string', 'enum': ['Paid', 'Pending', 'Overdue', 'Unpaid']},
        'limit': {'type': 'integer'}})),
    'get_order': (tool_get_order, 'Full details of one order by its order number.', _obj({
        'order_number': {'type': 'string'}}, ['order_number'])),
    'invoices_summary': (tool_invoices_summary, 'Invoice totals per status and the unpaid / overdue invoices '
                         '(admins only).', _obj({
                             'status': {'type': 'string', 'enum': ['Pending', 'Partial Paid', 'Overdue', 'Paid']},
                             'limit': {'type': 'integer'}})),
    'team_performance': (tool_team_performance, 'Monthly performance from orders: orders, completed, on time, '
                         'overdue and grade per team member (members only get their own).', _obj({
                             'month': {'type': 'string', 'description': 'YYYY-MM, default this month'}})),
}


def run_tool(user, name, args):
    entry = TOOLS.get(name)
    if not entry:
        return {'error': f'Unknown tool {name}'}
    try:
        return entry[0](user, args if isinstance(args, dict) else {})
    except Exception as exc:  # a tool failure becomes something Gemini can explain, never a crash
        print(f"[AI] tool {name} failed: {exc}")
        return {'error': 'That lookup failed.'}


# ── Gemini ────────────────────────────────────────────────────────────────────

def _system_prompt(user):
    from services.settings_service import get_setting
    company = get_setting('company_name') or 'the company'
    role = user.get('role')
    return (
        f"You are the assistant inside {company}'s CRM, used by its team (UK company formation and "
        f"accountancy work: customers, UK companies, orders, invoices, compliance deadlines). "
        f"Today is {datetime.date.today().isoformat()}. You are talking to {user.get('full_name') or 'a team member'} "
        f"(role {role}).\n"
        "Rules:\n"
        "- Use the tools for every fact about customers, companies, orders, invoices or the team. Never make "
        "up names, numbers, dates or amounts; if the tools return nothing, say so.\n"
        "- You can only read. You cannot change, send, create or delete anything. If asked to, explain where in "
        "the CRM the person can do it (Order Manager, Customers, Company Registered, Payment/Invoices, Tasks).\n"
        "- If a tool says the person has no access, tell them plainly.\n"
        "- Reply in the language the person writes in (English, Urdu or Roman Urdu).\n"
        "- Keep answers short and practical. Plain text only: no markdown, no tables, no ** or #. Use short lines "
        "and '- ' for lists. Money is in GBP (£). Dates as 21 Oct 2026.\n"
    )


def _gemini(payload, api_key, model):
    req = urllib.request.Request(
        GEMINI_URL.format(model=model), data=json.dumps(payload).encode('utf-8'), method='POST',
        headers={'Content-Type': 'application/json', 'x-goog-api-key': api_key})
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', 'replace')[:300]
        print(f"[AI] Gemini HTTP {exc.code}: {detail}")
        if exc.code in (401, 403):
            raise AiError('The Gemini API key was not accepted. Check it in the server settings.')
        if exc.code == 429:
            raise AiError('Gemini is busy or the usage limit is reached. Please try again in a minute.')
        if exc.code == 404:
            raise AiError(f'The Gemini model "{model}" was not found. Check gemini_model in the settings.')
        raise AiError('Gemini could not answer right now. Please try again.')
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"[AI] Gemini unreachable: {exc}")
        raise AiError('Could not reach Gemini. Please try again.')


_rate = {}
_rate_lock = threading.Lock()


def _check_rate(user):
    key = (current_db_path(), user.get('id'))
    now = time.time()
    with _rate_lock:
        recent = [t for t in _rate.get(key, []) if now - t < RATE_WINDOW_SECONDS]
        if len(recent) >= RATE_LIMIT:
            raise AiError('Too many questions in a short time. Please wait a few minutes.')
        recent.append(now)
        _rate[key] = recent


def _history_contents(history):
    contents = []
    for msg in (history or [])[-MAX_HISTORY:]:
        if not isinstance(msg, dict):
            continue
        text = str(msg.get('content') or '').strip()[:4000]
        if text:
            contents.append({'role': 'model' if msg.get('role') == 'assistant' else 'user', 'parts': [{'text': text}]})
    return contents


def ask(user, prompt, history=None):
    """Answer one question. Returns {'reply', 'tools'}; raises AiError with a message for the member."""
    from services.settings_service import get_setting
    if not user or user.get('role') not in STAFF_ROLES:
        raise AiError('The assistant is for the team only.')
    prompt = str(prompt or '').strip()[:4000]
    if not prompt:
        raise AiError('Type a question.')
    api_key = (get_setting('gemini_api_key') or '').strip()
    if not api_key:
        raise AiError('The AI assistant is not set up yet: add a Gemini API key (GEMINI_API_KEY) on the server.')
    model = (get_setting('gemini_model') or DEFAULT_MODEL).strip()
    _check_rate(user)

    contents = _history_contents(history) + [{'role': 'user', 'parts': [{'text': prompt}]}]
    declarations = [{'name': n, 'description': d, 'parameters': p} for n, (_f, d, p) in TOOLS.items()]
    used, usage = [], {'prompt': 0, 'output': 0}
    reply = ''
    for _round in range(MAX_TOOL_ROUNDS + 1):
        data = _gemini({
            'systemInstruction': {'parts': [{'text': _system_prompt(user)}]},
            'contents': contents,
            'tools': [{'functionDeclarations': declarations}],
            'generationConfig': {'temperature': 0.2, 'maxOutputTokens': 2048},
        }, api_key, model)
        meta = data.get('usageMetadata') or {}
        usage['prompt'] += int(meta.get('promptTokenCount') or 0)
        usage['output'] += int(meta.get('candidatesTokenCount') or 0)
        candidate = (data.get('candidates') or [{}])[0]
        content = candidate.get('content') or {}
        parts = content.get('parts') or []
        calls = [p['functionCall'] for p in parts if isinstance(p, dict) and p.get('functionCall')]
        if not calls or _round == MAX_TOOL_ROUNDS:
            reply = ''.join(p.get('text', '') for p in parts if isinstance(p, dict) and not p.get('thought')).strip()
            if not reply and candidate.get('finishReason') == 'SAFETY':
                reply = 'I cannot answer that one.'
            break
        # The model's turn goes back exactly as sent (it may carry thought signatures), then the tool results
        contents.append({'role': 'model', 'parts': parts})
        responses = []
        for call in calls:
            name = call.get('name') or ''
            used.append(name)
            result = run_tool(user, name, call.get('args') or {})
            response = {'name': name, 'response': {'result': result}}
            if call.get('id'):
                response['id'] = call['id']
            responses.append({'functionResponse': response})
        contents.append({'role': 'user', 'parts': responses})

    try:
        execute_db("""
            INSERT INTO ai_usage (user_id, model, prompt_tokens, output_tokens, tools)
            VALUES (?, ?, ?, ?, ?);
        """, (user.get('id'), model, usage['prompt'], usage['output'], ','.join(used) or None))
    except Exception as exc:
        print(f"[AI] usage not logged: {exc}")
    return {'reply': reply or 'Sorry, I could not find an answer. Try asking in a different way.', 'tools': used}
