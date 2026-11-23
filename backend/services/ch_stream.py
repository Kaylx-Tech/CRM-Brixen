"""Companies House Streaming API: every change to every UK company, the moment Companies House publishes it.

Companies House sends one line of JSON per change to a company's profile (a confirmation statement or accounts
filed, a new due date, a status change, an address change …). This listener keeps one connection open and, when
the company is one of ours, saves the new profile on it at once (services/ch_refresh.apply_profile).
No REST calls are used, so it costs nothing against the 600-per-5-minutes limit, and the whole system stays
current: Attention, the cards, deadlines and the client portal all read the same fields.

Needs a stream key (different from the REST API key): developer.company-information.service.gov.uk › your
application › "Create new key" › Streaming. Set it on the server as COMPANIES_HOUSE_STREAM_KEY (Coolify env), or
as companies_house_stream_key in Settings.
Without it the listener waits quietly and the polling in services/ch_refresh.py keeps everything fresh.
"""
import base64
import json
import threading
import time
import urllib.error
import urllib.request

STREAM_URL = 'https://stream.companieshouse.gov.uk/companies'
INDEX_SECONDS = 10 * 60          # how often the list of our company numbers is rebuilt
READ_TIMEOUT = 120               # the stream sends a blank line every ~30 s to keep the connection alive
_state = {'connected': False, 'last_event_at': None, 'events': 0, 'updated': 0, 'timepoint': None, 'error': ''}
_index = {'at': 0.0, 'numbers': set()}


def stream_key():
    import os
    key = (os.environ.get('COMPANIES_HOUSE_STREAM_KEY') or '').strip()
    if key:
        return key
    try:
        from db import query_db
        row = query_db("SELECT value FROM settings WHERE key = 'companies_house_stream_key' LIMIT 1;", one=True)
        return str((row or {}).get('value') or '').strip()
    except Exception:
        return ''


def status():
    return {**_state, 'configured': bool(stream_key())}


def _norm(number):
    return ''.join(ch for ch in str(number or '').upper() if ch.isalnum())


def build_index():
    """The set of our live company numbers."""
    from db import query_db
    rows = query_db("SELECT DISTINCT company_number FROM companies WHERE length(trim(company_number)) >= 6 "
                    "AND company_number NOT LIKE 'REG-%';") or []
    numbers = {_norm(row['company_number']) for row in rows}
    _index.update(at=time.time(), numbers=numbers)
    return numbers


def _numbers():
    if time.time() - _index['at'] > INDEX_SECONDS:
        build_index()
    return _index['numbers']


def handle_event(event):
    """One stream line (already parsed). Returns how many companies were updated."""
    if not isinstance(event, dict) or event.get('resource_kind') != 'company-profile':
        return 0
    if ((event.get('event') or {}).get('type') or '') == 'deleted':
        return 0
    data = event.get('data') or {}
    number = _norm(event.get('resource_id') or data.get('company_number'))
    if number not in _numbers():
        return 0
    from db import query_db
    from services.ch_refresh import apply_profile
    updated = 0
    for row in query_db("SELECT id FROM companies WHERE upper(replace(company_number, ' ', '')) = ?;", (number,)) or []:
        try:
            apply_profile(row['id'], data)
            updated += 1
        except Exception as exc:
            print(f"[CH stream] {number}: {exc}")
    return updated


def _listen(key):
    url = STREAM_URL + (f"?timepoint={_state['timepoint']}" if _state['timepoint'] else '')
    auth = base64.b64encode(f"{key}:".encode()).decode()
    req = urllib.request.Request(url, headers={'Authorization': f'Basic {auth}'})
    with urllib.request.urlopen(req, timeout=READ_TIMEOUT) as res:
        _state.update(connected=True, error='')
        print("[CH stream] connected")
        for raw in res:
            line = raw.strip()
            if not line:
                continue  # keep-alive
            try:
                event = json.loads(line)
            except ValueError:
                continue
            _state['events'] += 1
            _state['timepoint'] = (event.get('event') or {}).get('timepoint') or _state['timepoint']
            changed = handle_event(event)
            if changed:
                _state['updated'] += changed
                _state['last_event_at'] = time.strftime('%Y-%m-%d %H:%M:%S')


def start_worker():
    def _loop():
        time.sleep(30)  # let the server start first
        wait = 30
        while True:
            key = stream_key()
            if not key:
                time.sleep(600)  # no stream key yet: the polling keeps companies fresh meanwhile
                continue
            try:
                build_index()
                _listen(key)
                wait = 30
            except urllib.error.HTTPError as exc:
                _state['error'] = f"HTTP {exc.code}"
                if exc.code in (401, 403):
                    print("[CH stream] the stream key was not accepted; check COMPANIES_HOUSE_STREAM_KEY")
                    wait = 1800
                elif exc.code == 416:  # the saved timepoint is too old: start from now
                    _state['timepoint'] = None
                    wait = 5
                elif exc.code == 429:
                    wait = min(wait * 2, 900)
            except Exception as exc:
                _state['error'] = str(exc)[:200]
                wait = min(wait * 2, 300)
            _state['connected'] = False
            time.sleep(wait)
    threading.Thread(target=_loop, name='ch-stream', daemon=True).start()
