"""Gov Forms: Companies House forms filled in from what is already known, checked, and kept with the company.

  prepare(code, company_id)   the form (services/gov_forms_templates.py), the company's details, its directors and
                              PSCs to pick from, and every field it can fill already (Companies House first, then
                              the CRM)
  check(code, values, ctx)    the problems that stop it being Ready ({field: message}, '_form' for the whole form)
  save(...)                   Draft / Ready / Filed. Ready makes the Filing Sheet PDF, saves it in the company's
                              Documents (internal) and adds a task (UK Gov Checks) to file it; Filed closes the task
Everything is kept per workspace in gov_form_filings. Nothing is sent to Companies House from here: the team files
it (WebFiling or paper) with the sheet beside them.
"""
import base64
import datetime
import json
import re
import urllib.error
import urllib.request

from db import execute_db, query_db
from services.gov_forms_templates import FORMS, JURISDICTION_COUNTRIES, UK_COUNTRIES
from services.gov_form_official import has_official, official_pdf
try:  # Finstap charges each form to the workspace; Brixen's CRM has no such file
    from services import gov_form_billing as billing
except ImportError:
    billing = None

STATUSES = ('draft', 'ready', 'filed')
SCHEMA = """
CREATE TABLE IF NOT EXISTS gov_form_filings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    form_code TEXT NOT NULL,
    values_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    document_id INTEGER,
    task_id INTEGER,
    created_by INTEGER,
    created_by_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ready_at TIMESTAMP,
    filed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gov_form_filings_company ON gov_form_filings(company_id, id);
"""
_ready = set()


class FormError(ValueError):
    """Shown as it is."""


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
    cols = {r[1] for r in conn.execute("PRAGMA table_info(gov_form_filings);").fetchall()}
    if 'order_id' not in cols:  # the order the form was made for (services/gov_form_orders.py)
        conn.execute("ALTER TABLE gov_form_filings ADD COLUMN order_id INTEGER;")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_gov_form_filings_order ON gov_form_filings(order_id);")
    conn.commit()
    _ready.add(path)


def forms_list():
    return [{'code': code, 'title': f['title'], 'purpose': f['purpose']} for code, f in FORMS.items()]


def _form(code):
    form = FORMS.get(str(code or '').upper())
    if not form:
        raise FormError("Unknown form")
    return form


# ── what is known about the company ────────────────────────────────────────

def _ch(path):
    from services.companies_house_service import CH_API_BASE, get_ch_api_key
    key = get_ch_api_key()
    if not key:
        return None
    auth = base64.b64encode(f"{key}:".encode()).decode()
    req = urllib.request.Request(CH_API_BASE + path, headers={'Authorization': f'Basic {auth}',
                                                               'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.loads(res.read().decode('utf-8'))
    except (urllib.error.URLError, ValueError, TimeoutError) as exc:
        print(f"[Gov forms] {path}: {exc}")
        return None


def _split_name(raw):
    """'SMITH, John Peter' → ('John Peter', 'Smith', 'John Peter Smith')."""
    text = str(raw or '').strip()
    if ',' in text:
        surname, first = [p.strip() for p in text.split(',', 1)]
    else:
        parts = text.split()
        first, surname = ' '.join(parts[:-1]), (parts[-1] if parts else '')
    first = re.sub(r'^(Mr|Mrs|Ms|Miss|Dr)\.?\s+', '', first, flags=re.I)
    nice = lambda s: s.title() if s.isupper() else s  # noqa: E731
    first, surname = nice(first), nice(surname)
    return first, surname, f"{first} {surname}".strip()


def _dob(dob):
    dob = dob or {}
    return f"{int(dob['month']):02d}/{dob['year']}" if dob.get('month') and dob.get('year') else ''


def _address_text(addr):
    keys = ('premises', 'address_line_1', 'address_line_2', 'locality', 'region', 'postal_code', 'country')
    return ', '.join(str(addr.get(k)).strip() for k in keys if str(addr.get(k) or '').strip())


def context(company_id):
    """The company, its directors and PSCs: Companies House when it answers, else what the CRM has."""
    row = query_db("SELECT * FROM companies WHERE id = ? LIMIT 1;", (company_id,), one=True)
    if not row:
        raise FormError("Company not found")
    row = dict(row)
    number = str(row.get('company_number') or '').strip().upper()
    registered = bool(number) and not number.startswith(('REG-', 'PENDING'))
    profile = _ch(f"/company/{number}") if registered else None
    officers = _ch(f"/company/{number}/officers?items_per_page=100") if registered else None
    pscs = _ch(f"/company/{number}/persons-with-significant-control?items_per_page=50") if registered else None

    office = dict((profile or {}).get('registered_office_address') or {})
    accounts = (profile or {}).get('accounts') or {}
    next_accounts = accounts.get('next_accounts') or {}
    company = {
        'id': row['id'],
        'name': (profile or {}).get('company_name') or row.get('name') or '',
        'number': number if registered else '',
        'registered': registered,
        'from_companies_house': bool(profile),
        'jurisdiction': (profile or {}).get('jurisdiction') or '',
        'office': office,
        'office_text': _address_text(office) or str(row.get('reg_office') or ''),
        'period_start': next_accounts.get('period_start_on') or '',
        'period_end': next_accounts.get('period_end_on') or accounts.get('next_made_up_to') or '',
        'cs_made_up_to': ((profile or {}).get('confirmation_statement') or {}).get('next_made_up_to') or '',
        'cs_due': ((profile or {}).get('confirmation_statement') or {}).get('next_due') or '',
        'sic_text': ', '.join((profile or {}).get('sic_codes') or []) or str(row.get('sic_codes') or ''),
        'auth_code': str(row.get('authentication_code') or '').strip().upper(),
        'personal_code': str(row.get('activation_code') or '').strip().upper(),
        'dissolved_on': (profile or {}).get('date_of_cessation') or '',
        'status': (profile or {}).get('company_status') or str(row.get('status') or ''),
    }

    directors = []
    for i, o in enumerate((officers or {}).get('items') or []):
        if o.get('resigned_on') or 'director' not in str(o.get('officer_role') or ''):
            continue
        first, surname, full = _split_name(o.get('name'))
        directors.append({
            'id': f"ch{i}", 'name': full, 'first_names': first, 'surname': surname,
            'date_of_birth': _dob(o.get('date_of_birth')), 'nationality': o.get('nationality') or '',
            'country_of_residence': o.get('country_of_residence') or '', 'occupation': o.get('occupation') or '',
            'appointed_on': o.get('appointed_on') or '', 'role': str(o.get('officer_role') or '').replace('-', ' '),
            'address': o.get('address') or {},
        })
    if not directors:  # Companies House not reachable: the CRM's own list
        for d in query_db("SELECT * FROM company_directors WHERE company_id = ? ORDER BY id;", (row['id'],)) or []:
            first, surname, full = _split_name(d.get('name'))
            directors.append({'id': f"crm{d['id']}", 'name': full, 'first_names': first, 'surname': surname,
                              'date_of_birth': '', 'nationality': d.get('nationality') or '',
                              'country_of_residence': '', 'occupation': '',
                              'appointed_on': str(d.get('appointed_date') or ''), 'role': d.get('role') or 'director',
                              'address': {}})
        if not directors and str(row.get('director') or '').strip().lower() not in ('', 'director'):
            first, surname, full = _split_name(row['director'])
            directors.append({'id': 'crm', 'name': full, 'first_names': first, 'surname': surname,
                              'date_of_birth': '', 'nationality': '', 'country_of_residence': '', 'occupation': '',
                              'appointed_on': '', 'role': 'director', 'address': {}})

    people = []
    for i, p in enumerate((pscs or {}).get('items') or []):
        if p.get('ceased_on'):
            continue
        first, surname, full = _split_name(p.get('name'))
        parts = p.get('name_elements') or {}
        if parts.get('surname'):
            first = ' '.join(x for x in (parts.get('forename'), parts.get('middle_name')) if x)
            surname = parts['surname'].title() if parts['surname'].isupper() else parts['surname']
            full = f"{first} {surname}".strip()
        people.append({'id': f"psc{i}", 'name': full or p.get('name') or '', 'notified_on': p.get('notified_on') or '',
                       'first_names': first, 'surname': surname, 'title': parts.get('title') or '',
                       'date_of_birth': _dob(p.get('date_of_birth')),
                       'kind': str(p.get('kind') or '').replace('-', ' '),
                       'control': [str(c).replace('-', ' ') for c in p.get('natures_of_control') or []]})
    return {'company': company, 'directors': directors, 'pscs': people,
            'today': datetime.date.today().isoformat()}


def _source(ctx, path):
    if path == 'today':
        return ctx['today']
    value = ctx
    for part in str(path).split('.'):
        value = value.get(part) if isinstance(value, dict) else None
        if value is None:
            return ''
    return value


def _fields(form):
    for section in form['sections']:
        for field in section['fields']:
            yield section, field


def prepare(code, company_id, order_id=None):
    form = _form(code)
    ctx = context(company_id)
    values = {}
    for _section, field in _fields(form):
        if field.get('source'):
            values[field['key']] = _source(ctx, field['source']) or ''
        elif field['type'] == 'checkbox':
            values[field['key']] = bool(field.get('default'))
        elif field['type'] == 'checks':
            values[field['key']] = []
    # The new registered office keeps the country of the company's jurisdiction
    allowed = JURISDICTION_COUNTRIES.get(ctx['company']['jurisdiction'])
    if code.upper() == 'AD01' and allowed and len(allowed) == 1:
        values['new_country'] = allowed[0]
    # What the client wrote on the order form fills what is still empty (services/gov_form_fill.py)
    from services.gov_form_orders import order_info
    from services.gov_form_fill import fill
    order = order_info(order_id)
    from_order = fill(form, values, ctx, order) if order else []
    if order:  # the client's answers this form needs come first on the screen
        from services.gov_form_fill import mark_relevant
        mark_relevant(form, order['answers'], values, from_order)
        order['answers'].sort(key=lambda a: not a.get('used'))
    return {'code': code.upper(), 'form': form, 'context': ctx, 'values': values, 'from_order': from_order,
            'official': has_official(code), 'price': billing.price() if billing else 0,
            'countries': UK_COUNTRIES, 'filings': filings(company_id, code), 'order': order}


# ── checks ──────────────────────────────────────────────────────────────────
POSTCODE = re.compile(r'^(GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})$', re.I)


def _visible(section_or_field, values):
    when = section_or_field.get('when') or {}
    return all(bool(values.get(k)) == bool(v) for k, v in when.items())


def _date(value):
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _add_months(day, months):
    import calendar
    month = day.month - 1 + months
    year, month = day.year + month // 12, month % 12 + 1
    return day.replace(year=year, month=month, day=min(day.day, calendar.monthrange(year, month)[1]))


def check(code, values, ctx):
    form = _form(code)
    values = values if isinstance(values, dict) else {}
    errors = {}
    today = datetime.date.today()
    for section, field in _fields(form):
        if not (_visible(section, values) and _visible(field, values)):
            continue
        key, value = field['key'], values.get(field['key'])
        empty = value in (None, '', [], False) if field['type'] in ('checkbox', 'checks') else not str(value or '').strip()
        if field.get('required') and empty:
            errors[key] = 'Tick this to go on' if field['type'] == 'checkbox' else 'Needed'
            continue
        if empty:
            continue
        rule = field.get('check')
        text = str(value).strip()
        if rule == 'postcode' and str(values.get(key.replace('_postcode', '_country')) or '') in UK_COUNTRIES \
                and not POSTCODE.match(text):
            errors[key] = 'Not a UK postcode'
        elif rule == 'company_number' and not re.match(r'^([A-Z]{2}\d{6}|\d{8})$', text.upper()):
            errors[key] = 'Not a company number'
        elif rule == 'auth_code' and not re.match(r'^[A-Za-z0-9]{6}$', text.replace(' ', '')):
            errors[key] = 'An authentication code has 6 letters and numbers'
        elif rule == 'within_6_years' and _date(text) and _add_months(_date(text), 72) < today:
            errors[key] = 'More than 6 years ago: only a court can restore it now'
        elif rule == 'personal_code' and not re.match(r'^[A-Za-z0-9]{11}$', text.replace(' ', '')):
            errors[key] = 'A personal code has 11 letters and numbers'
        elif rule in ('past_date', 'adult_dob'):
            day = _date(text)
            if not day:
                errors[key] = 'Not a date'
            elif day > today:
                errors[key] = 'Cannot be in the future'
            elif rule == 'adult_dob' and _add_months(day, 16 * 12) > today:
                errors[key] = 'A director must be at least 16'
    # Whole-form rules
    code = code.upper()
    if form.get('needs_one_of') and not any(values.get(k) for k in form['needs_one_of']):
        errors['_form'] = 'Fill in at least one change'
    if code == 'AD01':
        allowed = JURISDICTION_COUNTRIES.get(ctx['company'].get('jurisdiction'))
        if allowed and values.get('new_country') and values['new_country'] not in allowed:
            errors['new_country'] = f"Must be in {' or '.join(allowed)}, where the company is registered"
    if code == 'AA01':
        start, current, new = _date(values.get('period_start')), _date(values.get('current_end')), _date(values.get('new_end'))
        if current and new:
            if new == current:
                errors['new_end'] = 'Same as the current date'
            elif new > current:
                if values.get('extended_before'):
                    errors['extended_before'] = 'Already extended in the last 5 years: only a few exceptions allow it'
                if start and new > _add_months(start, 18):
                    errors['new_end'] = 'A period cannot be longer than 18 months'
    if code == 'DS01':
        directors = len(ctx.get('directors') or [])
        signed = len(values.get('signers') or [])
        if directors and signed <= directors / 2:
            errors['signers'] = f"A majority must sign: {directors // 2 + 1} of {directors}"
    return errors


# ── saving, the sheet and the task ─────────────────────────────────────────

def filings(company_id=None, code=None, limit=50):
    _ensure()
    where, args = [], []
    if company_id:
        where.append('f.company_id = ?')
        args.append(company_id)
    if code:
        where.append('f.form_code = ?')
        args.append(str(code).upper())
    rows = query_db(f"""
        SELECT f.*, c.name AS company_name, o.order_number FROM gov_form_filings f
        LEFT JOIN companies c ON c.id = f.company_id LEFT JOIN orders o ON o.id = f.order_id
        {'WHERE ' + ' AND '.join(where) if where else ''} ORDER BY f.id DESC LIMIT ?;
    """, tuple(args) + (limit,)) or []
    out = []
    for r in rows:
        item = dict(r)
        item['title'] = FORMS.get(item['form_code'], {}).get('title', item['form_code'])
        item['values'] = json.loads(item.pop('values_json') or '{}')
        out.append(item)
    return out


def _filing(filing_id):
    _ensure()
    row = query_db("SELECT * FROM gov_form_filings WHERE id = ? LIMIT 1;", (filing_id,), one=True)
    if not row:
        raise FormError("Saved form not found")
    item = dict(row)
    item['values'] = json.loads(item.pop('values_json') or '{}')
    return item


def save(code, company_id, values, status, user, filing_id=None, order_id=None):
    """Save a form. Ready and Filed need it to pass the checks. Returns (filing, errors)."""
    _ensure()
    code = str(code or '').upper()
    form = _form(code)
    status = status if status in STATUSES else 'draft'
    values = values if isinstance(values, dict) else {}
    ctx = None
    if status != 'draft':
        ctx = context(company_id)
        errors = check(code, values, ctx)
        if errors:
            return None, errors
        if billing:  # Finstap: each form costs the workspace (services/gov_form_billing.py)
            billing.can_pay(filing_id)
    who = (user or {}).get('full_name') or (user or {}).get('email') or ''
    if filing_id:
        current = _filing(filing_id)
        if current['status'] == 'filed':
            raise FormError("This form is already filed")
        execute_db("UPDATE gov_form_filings SET values_json = ?, status = ?, updated_at = datetime('now') WHERE id = ?;",
                   (json.dumps(values), status, filing_id))
    else:
        filing_id = execute_db("""
            INSERT INTO gov_form_filings (company_id, form_code, values_json, status, created_by, created_by_name,
                                          order_id)
            VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (company_id, code, json.dumps(values), status, (user or {}).get('id'), who, order_id))
    if status == 'ready':
        _make_ready(filing_id, form, ctx or context(company_id), values, user)
    if status != 'draft' and billing:
        billing.charge(filing_id, f"Gov Form {code}: {(ctx or {}).get('company', {}).get('name') or ''}".strip())
    if status == 'filed':
        execute_db("UPDATE gov_form_filings SET filed_at = datetime('now') WHERE id = ?;", (filing_id,))
        current = _filing(filing_id)
        if not current.get('document_id'):
            _make_ready(filing_id, form, ctx or context(company_id), values, user)
            current = _filing(filing_id)
        if current.get('task_id'):
            execute_db("UPDATE tasks SET status = 'Completed', completed_at = datetime('now'), "
                       "updated_at = datetime('now') WHERE id = ? AND status != 'Completed';", (current['task_id'],))
        if current.get('order_id'):  # the order this form was for is done
            from services.gov_form_orders import complete_order
            complete_order(current['order_id'])
        # The client hears it is filed and gets the form in their portal (services/gov_form_notify.py)
        from services.gov_form_notify import filed
        filed(_filing(filing_id), user)
    return _filing(filing_id), {}


def _make_ready(filing_id, form, ctx, values, user):
    """The Filing Sheet saved in the company's Documents (internal) and a task to file it."""
    filing = _filing(filing_id)
    code = filing['form_code']
    company = ctx['company']
    pdf = form_pdf(code, values, ctx, user, filing.get('order_id'))
    row = query_db("SELECT c.user_id, u.full_name, u.email FROM companies c LEFT JOIN users u ON u.id = c.user_id "
                   "WHERE c.id = ?;", (company['id'],), one=True) or {}
    doc_id = filing.get('document_id')
    if not doc_id:
        try:
            from services.storage_service import save_client_file
            name = f"{code} {company['name']} {datetime.date.today():%Y-%m-%d}.pdf"
            res = save_client_file(row.get('user_id') or 0, row.get('full_name') or row.get('email') or company['name'],
                                   name, pdf, mime_type='application/pdf')
            if res.get('success'):
                doc_id = execute_db("""
                    INSERT INTO documents (name, category, file_path, file_type, file_size, user_id, company_id,
                                           uploaded_by, drive_file_id, drive_web_link, lifecycle_status, is_posted,
                                           client_visible, status, review_notes, created_at)
                    VALUES (?, 'Companies House Forms', ?, 'application/pdf', ?, ?, ?, ?, ?, ?, 'POSTED_DOCUMENTS', 0,
                            0, 'Approved', ?, datetime('now'));
                """, (f"{code} {'Companies House form' if has_official(code) else 'Filing Sheet'}: {form['title']}",
                      res.get('file_path'), str(res.get('file_size')),
                      row.get('user_id') or 0, company['id'], (user or {}).get('full_name') or 'Gov Forms',
                      res.get('drive_file_id'), res.get('drive_web_link'), 'Gov Forms filing sheet (internal)'))
        except Exception as exc:
            print(f"[Gov forms] sheet for filing {filing_id} not stored: {exc}")
    task_id = filing.get('task_id')
    if not task_id:
        task_id = execute_db("""
            INSERT INTO tasks (title, description, priority, status, due_date, department, created_by_id, client_id,
                               company_id, created_at, updated_at)
            VALUES (?, ?, 'High', 'Open', date('now', '+3 days'), 'Compliance', ?, ?, ?, datetime('now'), datetime('now'));
        """, (f"File {code} for {company['name']}",
              f"{form['title']}. The filled-in form is ready in Gov Forms (and the Filing Sheet in Documents). "
              f"File it on WebFiling: {form.get('webfiling') or code}, then mark it Filed.",
              (user or {}).get('id'), row.get('user_id'), company['id']))
    execute_db("UPDATE gov_form_filings SET document_id = ?, task_id = ?, ready_at = COALESCE(ready_at, datetime('now')) "
               "WHERE id = ?;", (doc_id, task_id, filing_id))


def _display(field, value, ctx):
    if field['type'] == 'checkbox':
        return 'Yes' if value else 'No'
    if field['type'] == 'checks':
        labels = dict(field.get('options') or [])
        if field.get('options_from') == 'directors':
            labels = {d['id']: d['name'] for d in ctx.get('directors') or []}
        return '\n'.join(f"- {labels.get(v, v)}" for v in value or []) or '-'
    if field['type'] == 'select':
        return dict(field.get('options') or []).get(value, value or '-')
    if field['type'] == 'pick':
        people = ctx.get(field.get('pick')) or []
        return next((p['name'] for p in people if p['id'] == value), value or '-')
    if field['type'] == 'date' and value:
        day = _date(value)
        return day.strftime('%d/%m/%Y') if day else str(value)
    return str(value or '-')


def sheet_pdf(code, values, ctx, user=None):
    """The Filing Sheet: every answer, section by section, in the order WebFiling asks for them."""
    from fpdf import FPDF
    form = _form(code)

    def latin(text):
        text = str(text).replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
        text = text.replace('–', '-').replace('—', '-').replace('…', '...')
        return text.encode('latin-1', 'replace').decode('latin-1')

    pdf = FPDF(format='A4')
    pdf.set_auto_page_break(True, margin=16)
    pdf.add_page()
    pdf.set_font('Helvetica', 'B', 16)
    pdf.cell(0, 9, latin(f"{code}: {form['title']}"), new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Helvetica', '', 10)
    pdf.set_text_color(90, 90, 90)
    pdf.multi_cell(0, 5, latin(f"{ctx['company']['name']} ({ctx['company']['number'] or 'not yet registered'})"), new_x='LMARGIN', new_y='NEXT')
    pdf.multi_cell(0, 5, latin(f"Filing sheet prepared {datetime.date.today():%d %B %Y}"
                               f"{' by ' + str(user.get('full_name')) if user and user.get('full_name') else ''}. "
                               f"File online at Companies House WebFiling: {form.get('webfiling') or code}."),
                   new_x='LMARGIN', new_y='NEXT')
    pdf.set_text_color(0, 0, 0)
    for section in form['sections']:
        if not _visible(section, values):
            continue
        shown = [f for f in section['fields'] if _visible(f, values)]
        if not shown:
            continue
        pdf.ln(3)
        pdf.set_font('Helvetica', 'B', 11)
        pdf.set_fill_color(240, 240, 247)
        pdf.cell(0, 7, latin(section['title']), fill=True, new_x='LMARGIN', new_y='NEXT')
        for field in shown:
            value = _display(field, values.get(field['key']), ctx)
            pdf.set_font('Helvetica', '', 9)
            pdf.set_text_color(100, 100, 100)
            y = pdf.get_y()
            pdf.multi_cell(62, 6, latin(field['label']), new_x='LMARGIN', new_y='NEXT')
            label_end = pdf.get_y()
            pdf.set_xy(pdf.l_margin + 64, y)
            pdf.set_text_color(0, 0, 0)
            pdf.set_font('Helvetica', 'B', 10)
            pdf.multi_cell(0, 6, latin(value), new_x='LMARGIN', new_y='NEXT')
            pdf.set_y(max(label_end, pdf.get_y()))
    pdf.ln(6)
    pdf.set_font('Helvetica', 'I', 8)
    pdf.set_text_color(120, 120, 120)
    pdf.multi_cell(0, 4, latin("This sheet is not the Companies House form itself. Check every answer before filing; "
                               "Companies House decides whether a filing is accepted."),
                   new_x='LMARGIN', new_y='NEXT')
    return bytes(pdf.output())


def form_pdf(code, values, ctx, user=None, order_id=None):
    """Companies House's own form filled in when we have it (services/gov_form_official.py), else the Filing Sheet."""
    try:
        pdf = official_pdf(code, values, ctx, order_id)
        if pdf:
            return pdf
    except Exception as exc:
        print(f"[Gov forms] official {code} not filled, Filing Sheet instead: {exc}")
    return sheet_pdf(code, values, ctx, user)


def sheet_for_filing(filing_id, user=None):
    filing = _filing(filing_id)
    return filing, form_pdf(filing['form_code'], filing['values'], context(filing['company_id']), user,
                            filing.get('order_id'))
