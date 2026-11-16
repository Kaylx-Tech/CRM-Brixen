"""Companies House facts behind each registered office address service, kept up to date by itself.

For every company with a company number the CRM keeps (company_address_start):
  * ch_address / at_brixen: the registered office Companies House shows now, and whether it is one of our
    addresses. This, not the CRM's own copy (which can be old), decides whether the company uses our address.
  * ch_status: active, dissolved, liquidation...
  * start_date / source: when the address service started. 'ad01': the latest change of registered office
    (AD01, LLAD01 for an LLP) to one of our addresses, on its change date (a company that moved to us after it was
    formed). 'incorporation': formed at our address, from Companies House's incorporation date. 'moved away': its
    registered office is no longer one of ours. 'not found': Companies House has no such company.
  * director: the first current director (resigned ones are left out).

Checks run by themselves, in the background (never while a page waits): the hourly address worker and the
Registered Address tab. Never checked → first; renewal within NEAR_DAYS or needing action → again after a day;
the rest → every RECHECK_DAYS. A reminder (by hand or automatic) checks the company again first if its facts are
older than a day, so it is never sent on old facts. Nothing here deletes data.
"""
import datetime
import threading
import urllib.error

from db import query_db, execute_db

RECHECK_DAYS = 30
NEAR_DAYS = 45
FRESH_HOURS = 24
ADDRESS_FILINGS = ('AD01', 'LLAD01')
_running = threading.Lock()


def _ensure():
    execute_db("""
        CREATE TABLE IF NOT EXISTS company_address_start (
            company_id INTEGER PRIMARY KEY,
            start_date TEXT,
            source TEXT,
            director TEXT,
            checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    have = {c['name'] for c in (query_db("PRAGMA table_info(company_address_start);") or [])}
    for column, kind in (('ch_address', 'TEXT'), ('ch_status', 'TEXT'), ('at_brixen', 'INTEGER'),
                         ('ch_created', 'TEXT')):
        if column not in have:
            execute_db(f"ALTER TABLE company_address_start ADD COLUMN {column} {kind};")


def _person_name(ch_name):
    """Companies House "SURNAME, First Middle" → "First Middle Surname"."""
    surname, _, given = str(ch_name or '').partition(',')
    parts = [given.strip(), surname.strip().title() if surname.isupper() else surname.strip()]
    return ' '.join(p for p in parts if p).strip()


def _address_text(addr):
    keys = ('premises', 'address_line_1', 'address_line_2', 'locality', 'region', 'postal_code', 'country')
    return ', '.join(str(addr.get(k)).strip() for k in keys if str((addr or {}).get(k) or '').strip())


def _check(company):
    """The facts for one company from Companies House (raises on a Companies House error)."""
    from routes.client_portal_routes import _is_brixen_address
    from services.companies_house_service import CH_API_BASE, _ch_get, get_ch_api_key
    number = str(company.get('company_number') or '').strip().upper()
    if not number or not get_ch_api_key():
        return None
    number = number.zfill(8)
    profile = _ch_get(f"{CH_API_BASE}/company/{number}")
    ch_address = _address_text(profile.get('registered_office_address') or {})
    at_brixen = _is_brixen_address(ch_address)
    facts = {'ch_address': ch_address or None, 'at_brixen': 1 if at_brixen else 0,
             'ch_status': str(profile.get('company_status') or '').strip() or None,
             'ch_created': str(profile.get('date_of_creation') or '')[:10] or None,
             'start_date': None, 'director': None}
    # Every change of registered office (an LLP files LLAD01), a few pages back
    moves = []
    for start_index in (0, 100, 200):
        page = _ch_get(f"{CH_API_BASE}/company/{number}/filing-history?category=address&items_per_page=100"
                       f"&start_index={start_index}")
        for item in page.get('items') or []:
            values = item.get('description_values') or {}
            if item.get('type') in ADDRESS_FILINGS and _is_brixen_address(values.get('new_address')):
                when = str(values.get('change_date') or item.get('date') or '')[:10]
                if when:
                    moves.append(when)
        if len(page.get('items') or []) < 100:
            break
    if not at_brixen:
        facts['source'] = 'moved away'
    elif moves:
        facts['source'], facts['start_date'] = 'ad01', max(moves)
    else:
        facts['source'], facts['start_date'] = 'incorporation', facts['ch_created']
    try:
        officers = _ch_get(f"{CH_API_BASE}/company/{number}/officers?items_per_page=50").get('items') or []
        active = [o for o in officers if not o.get('resigned_on') and 'director' in str(o.get('officer_role') or '')]
        if active:
            facts['director'] = _person_name(active[0].get('name'))
    except Exception as exc:
        print(f"[Address start] officers of {number}: {exc}")
    return facts


def check_company(company):
    """Check one company with Companies House now and keep the facts. Returns them, or None (try again later)."""
    _ensure()
    try:
        facts = _check(company)
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            print(f"[Address start] {company.get('name')}: Companies House {exc.code}")
            return None
        facts = {'source': 'not found', 'start_date': None, 'director': None, 'ch_address': None,
                 'at_brixen': None, 'ch_status': None, 'ch_created': None}
    except Exception as exc:
        print(f"[Address start] {company.get('name')}: {exc}")
        return None
    if facts is None:
        return None
    execute_db("""
        INSERT INTO company_address_start (company_id, start_date, source, director, ch_address, ch_status, at_brixen,
                                           ch_created, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(company_id) DO UPDATE SET start_date = excluded.start_date, source = excluded.source,
            director = COALESCE(excluded.director, company_address_start.director), ch_address = excluded.ch_address,
            ch_status = excluded.ch_status, at_brixen = excluded.at_brixen, ch_created = excluded.ch_created,
            checked_at = excluded.checked_at;
    """, (company['id'], facts['start_date'], facts['source'], facts['director'], facts['ch_address'],
          facts['ch_status'], facts['at_brixen'], facts['ch_created']))
    return facts


def facts_of(company_id):
    """The kept facts of one company (dict), or {} when it was not checked yet."""
    try:
        _ensure()
        row = query_db("SELECT * FROM company_address_start WHERE company_id = ?;", (company_id,), one=True)
        return dict(row) if row else {}
    except Exception:
        return {}


def known(company_ids=None):
    """{company_id: facts} of the companies already checked."""
    _ensure()
    rows = query_db("SELECT * FROM company_address_start;") or []
    wanted = set(company_ids) if company_ids is not None else None
    return {r['company_id']: dict(r) for r in rows if wanted is None or r['company_id'] in wanted}


def start_of(company_id):
    """When the address service started (AD01 change date, or Companies House's incorporation date), or None."""
    f = facts_of(company_id)
    return f.get('start_date') if f.get('source') in ('ad01', 'incorporation') else None


def ensure_fresh(company, hours=FRESH_HOURS):
    """Check again now when the facts are missing or older than `hours` (before a reminder). Returns the facts."""
    f = facts_of(company['id'])
    try:
        when = datetime.datetime.strptime(str(f.get('checked_at') or '')[:19], '%Y-%m-%d %H:%M:%S')
        fresh = datetime.datetime.utcnow() - when < datetime.timedelta(hours=hours)
    except ValueError:
        fresh = False
    if fresh:
        return f
    return check_company(company) or f


def refresh(limit=60):
    """Check the companies that are due (see the module note). Returns how many were checked."""
    from routes.client_portal_routes import _is_brixen_address
    if not _running.acquire(blocking=False):
        return 0
    try:
        _ensure()
        now = datetime.datetime.utcnow()
        month_ago = (now - datetime.timedelta(days=RECHECK_DAYS)).strftime('%Y-%m-%d %H:%M:%S')
        day_ago = (now - datetime.timedelta(hours=FRESH_HOURS)).strftime('%Y-%m-%d %H:%M:%S')
        rows = query_db("""
            SELECT c.id, c.name, c.company_number, c.reg_office, c.inc_date, c.created_at, c.user_id,
                   s.checked_at, s.at_brixen, s.ch_status
            FROM companies c LEFT JOIN company_address_start s ON s.company_id = c.id
            WHERE TRIM(COALESCE(c.company_number, '')) <> ''
            ORDER BY s.checked_at IS NOT NULL, s.checked_at, c.id DESC;
        """) or []
        due = []
        for c in rows:
            ours = _is_brixen_address(c.get('reg_office')) or c.get('at_brixen') == 1
            if not c.get('checked_at') or c['checked_at'] < month_ago:
                due.append(c)  # never checked, or a month old (also catches a company that moved to us later)
            elif ours and c['checked_at'] < day_ago and _near_renewal(c):
                due.append(c)  # renewal soon or waiting: every day
        done = 0
        for company in due[:limit]:
            if check_company(dict(company)) is not None:
                done += 1
        return done
    finally:
        _running.release()


def _near_renewal(company):
    from routes.client_portal_routes import _company_address_service, _parse_company_date
    try:
        expiry = _parse_company_date(_company_address_service(company).get('expiry_date'))
    except Exception:
        return True
    return expiry is None or (expiry - datetime.date.today()).days <= NEAR_DAYS


def refresh_in_background(limit=60):
    """Start a check of the companies that are due without making anyone wait."""
    threading.Thread(target=refresh, kwargs={'limit': limit}, name='address-start', daemon=True).start()


def uses_our_address(company, facts=None):
    """Companies House's current registered office decides; not checked yet → the CRM's own copy."""
    from routes.client_portal_routes import _is_brixen_address
    f = facts if facts is not None else facts_of(company['id'])
    if f.get('at_brixen') in (0, 1):
        return f['at_brixen'] == 1
    return _is_brixen_address(company.get('reg_office'))


def director_of(company_id):
    """The company's director: from Companies House (kept), else the first director saved in the CRM."""
    try:
        f = facts_of(company_id)
        if str(f.get('director') or '').strip():
            return f['director'].strip()
        row = query_db("SELECT name FROM company_directors WHERE company_id = ? ORDER BY id LIMIT 1;",
                       (company_id,), one=True)
        return str((row or {}).get('name') or '').strip() or None
    except Exception:
        return None
