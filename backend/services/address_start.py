"""When a company's registered office address service started, and who its director is (Companies House).

A company formed at one of Brixen's addresses has the service from incorporation. A company that moved to one of
our addresses later (bought the address service) has it from that change: the latest AD01 "change of registered
office address" filing whose new address is one of ours, on its change date. The yearly renewal counts from there
(client_portal_routes._company_address_service).

Each company is checked once and kept (company_address_start), and checked again after RECHECK_DAYS. Checks run in
the background (the hourly address worker, and when the Registered Address tab loads), never while a page waits.
Nothing here deletes data.
"""
import datetime
import threading
import urllib.error

from db import query_db, execute_db

RECHECK_DAYS = 30
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


def _person_name(ch_name):
    """Companies House "SURNAME, First Middle" → "First Middle Surname"."""
    surname, _, given = str(ch_name or '').partition(',')
    parts = [given.strip(), surname.strip().title() if surname.isupper() else surname.strip()]
    return ' '.join(p for p in parts if p).strip()


def _check(company):
    """(start_date or None, source, director) from Companies House for one company."""
    from routes.client_portal_routes import _is_brixen_address
    from services.companies_house_service import CH_API_BASE, _ch_get, get_ch_api_key
    number = str(company.get('company_number') or '').strip().upper()
    if not number or not get_ch_api_key():
        return None, 'none', None
    number = number.zfill(8)
    start, source = None, 'incorporation'
    history = _ch_get(f"{CH_API_BASE}/company/{number}/filing-history?category=address&items_per_page=100")
    moves = []
    for item in history.get('items') or []:
        values = item.get('description_values') or {}
        if item.get('type') == 'AD01' and _is_brixen_address(values.get('new_address')):
            moves.append(str(values.get('change_date') or item.get('date') or '')[:10])
    moves = sorted(m for m in moves if m)
    if moves:
        start, source = moves[-1], 'ad01'
    director = None
    try:
        officers = _ch_get(f"{CH_API_BASE}/company/{number}/officers?items_per_page=50").get('items') or []
        active = [o for o in officers if not o.get('resigned_on') and 'director' in str(o.get('officer_role') or '')]
        if active:
            director = _person_name(active[0].get('name'))
    except Exception as exc:
        print(f"[Address start] officers of {number}: {exc}")
    return start, source, director


def check_company(company):
    """Check one company now and keep the result. Returns {'start_date', 'source', 'director'}."""
    _ensure()
    try:
        start, source, director = _check(company)
    except urllib.error.HTTPError as exc:
        start, source, director = None, 'not found' if exc.code == 404 else 'error', None
    except Exception as exc:
        print(f"[Address start] {company.get('name')}: {exc}")
        return None
    if source == 'error':
        return None  # tried again next time
    execute_db("""INSERT INTO company_address_start (company_id, start_date, source, director, checked_at)
                  VALUES (?, ?, ?, ?, datetime('now'))
                  ON CONFLICT(company_id) DO UPDATE SET start_date = excluded.start_date, source = excluded.source,
                  director = COALESCE(excluded.director, company_address_start.director),
                  checked_at = excluded.checked_at;""", (company['id'], start, source, director))
    return {'start_date': start, 'source': source, 'director': director}


def known(company_ids=None):
    """{company_id: {'start_date', 'source', 'director'}} of the companies already checked."""
    _ensure()
    rows = query_db("SELECT company_id, start_date, source, director FROM company_address_start;") or []
    wanted = set(company_ids) if company_ids is not None else None
    return {r['company_id']: dict(r) for r in rows if wanted is None or r['company_id'] in wanted}


def start_of(company_id):
    """The AD01 date the company moved to our address, or None (then the service runs from incorporation)."""
    try:
        _ensure()
        row = query_db("SELECT start_date, source FROM company_address_start WHERE company_id = ?;",
                       (company_id,), one=True)
    except Exception:
        return None
    return row['start_date'] if row and row.get('source') == 'ad01' else None


def refresh(limit=60):
    """Check the companies at our addresses not checked yet (or not for RECHECK_DAYS). Returns how many."""
    from routes.client_portal_routes import _is_brixen_address
    if not _running.acquire(blocking=False):
        return 0
    try:
        _ensure()
        since = (datetime.datetime.utcnow() - datetime.timedelta(days=RECHECK_DAYS)).strftime('%Y-%m-%d %H:%M:%S')
        rows = query_db("""
            SELECT c.id, c.name, c.company_number, c.reg_office FROM companies c
            LEFT JOIN company_address_start s ON s.company_id = c.id
            WHERE TRIM(COALESCE(c.company_number, '')) <> '' AND TRIM(COALESCE(c.reg_office, '')) <> ''
              AND (s.company_id IS NULL OR s.checked_at < ?)
            ORDER BY s.checked_at IS NOT NULL, c.id DESC;
        """, (since,)) or []
        done = 0
        for company in rows:
            if done >= limit:
                break
            if not _is_brixen_address(company.get('reg_office')):
                continue
            if check_company(dict(company)) is not None:
                done += 1
        return done
    finally:
        _running.release()


def refresh_in_background(limit=60):
    """Start a check of the missing companies without making anyone wait."""
    threading.Thread(target=refresh, kwargs={'limit': limit}, name='address-start', daemon=True).start()


def director_of(company_id):
    """The company's director: from Companies House (kept), else the first director saved in the CRM."""
    try:
        _ensure()
        row = query_db("SELECT director FROM company_address_start WHERE company_id = ?;", (company_id,), one=True)
        if row and str(row.get('director') or '').strip():
            return row['director'].strip()
        row = query_db("SELECT name FROM company_directors WHERE company_id = ? ORDER BY id LIMIT 1;",
                       (company_id,), one=True)
        return str((row or {}).get('name') or '').strip() or None
    except Exception:
        return None

