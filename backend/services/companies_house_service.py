"""Companies House UK API Integration Service
Extracted from core Brixen CRM architecture.
"""
import os
import json
import base64
import urllib.request
import urllib.error

CH_API_BASE = "https://api.company-information.service.gov.uk"

KEY_REFUSED = ("Companies House refused the API key (401). Check the key in Settings > Integrations "
               "and COMPANIES_HOUSE_API_KEY on the server.")

# The key that last worked, tried first next time
_good_key = {'key': ''}


def _clean(value):
    """A key as pasted: no spaces around it, no quotes around it (env values sometimes keep them)."""
    value = str(value or '').strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        value = value[1:-1].strip()
    return value


def ch_api_keys():
    """Every key there is, in order: Settings > Integrations (what the Test button checks), then the server
    env COMPANIES_HOUSE_API_KEY. Before, the env came first, so an old env key gave 401 on the order form
    while Settings > Test said the saved key was fine."""
    keys = []
    try:
        from db import query_db
        row = query_db("SELECT value FROM settings WHERE key = 'companies_house_api_key' LIMIT 1;", one=True)
        if row and row['value']:
            keys.append(_clean(row['value']))
    except Exception:
        pass
    keys.append(_clean(os.environ.get('COMPANIES_HOUSE_API_KEY', '')))
    keys = [k for i, k in enumerate(keys) if k and k not in keys[:i]]
    if _good_key['key'] in keys:
        keys.remove(_good_key['key'])
        keys.insert(0, _good_key['key'])
    return keys


def get_ch_api_key():
    keys = ch_api_keys()
    return keys[0] if keys else ''


def _ch_get(url, timeout=10):
    """GET a Companies House URL as JSON. A key that gets 401 is skipped for the next one; if every key is
    refused, the 401 is raised."""
    refused = None
    for api_key in ch_api_keys():
        auth_header = base64.b64encode(f"{api_key}:".encode('utf-8')).decode('utf-8')
        req = urllib.request.Request(url, headers={
            "Authorization": f"Basic {auth_header}",
            "Accept": "application/json"
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                data = json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 401:
                refused = e
                continue
            raise
        _good_key['key'] = api_key
        return data
    raise refused


def _error_text(e):
    if isinstance(e, urllib.error.HTTPError) and e.code == 401:
        return KEY_REFUSED
    return str(e)


def fetch_company_profile(company_number):
    """Fetch live company profile data from UK Companies House."""
    if not get_ch_api_key():
        return {"error": "COMPANIES_HOUSE_API_KEY is not configured on server"}

    comp_num = str(company_number).strip().zfill(8).upper()
    url = f"{CH_API_BASE}/company/{comp_num}"

    try:
        return {"success": True, "data": _ch_get(url)}
    except urllib.error.HTTPError as e:
        error = KEY_REFUSED if e.code == 401 else f"Companies House API error: {e.reason}"
        return {"success": False, "status_code": e.code, "error": error}
    except Exception as e:
        return {"success": False, "error": str(e)}

def fetch_company_officers(company_number):
    """Fetch company directors and secretaries from Companies House."""
    if not get_ch_api_key():
        return {"error": "COMPANIES_HOUSE_API_KEY is not configured"}

    comp_num = str(company_number).strip().zfill(8).upper()
    url = f"{CH_API_BASE}/company/{comp_num}/officers"

    try:
        return {"success": True, "officers": _ch_get(url).get('items', [])}
    except Exception as e:
        return {"success": False, "error": _error_text(e)}

def search_companies_house(query):
    """Search companies by name or number from UK Companies House."""
    if not get_ch_api_key():
        return {"success": False, "error": "COMPANIES_HOUSE_API_KEY is not configured"}

    import urllib.parse
    q_str = str(query).strip()
    if not q_str:
        return {"success": True, "results": []}

    q_encoded = urllib.parse.quote(q_str)
    url = f"{CH_API_BASE}/search/companies?q={q_encoded}&items_per_page=10"

    try:
        return {"success": True, "results": _ch_get(url).get('items', [])}
    except Exception as e:
        return {"success": False, "error": _error_text(e)}


def normalize_company_number(company_number):
    import re
    return re.sub(r'[^A-Z0-9]', '', str(company_number or '').strip().upper())


def live_companies_house_filing(company, *, force=True):
    """Lightweight CH accounts window for accounts_file (modular stand-in for app.py)."""
    number = normalize_company_number((company or {}).get('company_number'))
    if not number:
        return None
    profile = fetch_company_profile(number)
    if not profile.get('success') or not isinstance(profile.get('data'), dict):
        # Fall back to stored company fields
        return {
            'source': 'stored',
            'name': (company or {}).get('name'),
            'company_number': number,
            'inc': str((company or {}).get('inc_date') or '')[:10] or None,
            'accounts_next_due': str((company or {}).get('accounts_next_due') or '')[:10] or None,
            'accounts_overdue': int((company or {}).get('accounts_overdue') or 0),
            'accounts_made_up_to': str((company or {}).get('accounts_made_up_to') or '')[:10] or None,
            'accounts_period_start': str((company or {}).get('accounts_period_start') or '')[:10] or None,
            'accounts_last_made_up_to': str((company or {}).get('accounts_last_made_up_to') or '')[:10] or None,
            'share_capital': (company or {}).get('share_capital_gbp'),
            'is_first_accounts': None,
        }

    data = profile['data']
    accounts = data.get('accounts') or {}
    next_accounts = accounts.get('next_accounts') or {}
    last_accounts = accounts.get('last_accounts') or {}
    period_start = (next_accounts.get('period_start_on') or '')[:10] or None
    period_end = (next_accounts.get('period_end_on') or accounts.get('next_made_up_to') or '')[:10] or None
    last_made = (last_accounts.get('made_up_to') or last_accounts.get('period_end_on') or '')[:10] or None
    return {
        'source': 'companies_house_api',
        'name': data.get('company_name') or (company or {}).get('name'),
        'company_number': data.get('company_number') or number,
        'inc': (data.get('date_of_creation') or '')[:10] or None,
        'inc_date': (data.get('date_of_creation') or '')[:10] or None,
        'accounts_next_due': (next_accounts.get('due_on') or accounts.get('next_due') or '')[:10] or None,
        'accounts_overdue': 1 if accounts.get('overdue') else 0,
        'accounts_made_up_to': period_end,
        'accounts_period_start': period_start,
        'accounts_last_made_up_to': last_made,
        'share_capital': fetch_companies_house_share_capital(number),
        'is_first_accounts': 1 if not last_made else 0,
    }


def fetch_companies_house_share_capital(company_number):
    """Best-effort share capital from company profile capital statement."""
    number = normalize_company_number(company_number)
    if not number:
        return None
    profile = fetch_company_profile(number)
    if not profile.get('success') or not isinstance(profile.get('data'), dict):
        return None
    data = profile['data']
    # Some CH payloads expose capital on the profile; walk common shapes
    for key in ('capital', 'statement_of_capital', 'accounts'):
        block = data.get(key)
        figure = _extract_capital_figure(block)
        if figure is not None:
            return figure
    return None


def _extract_capital_figure(node, depth=0):
    if depth > 6 or node is None:
        return None
    if isinstance(node, (int, float)):
        return float(node) if node > 0 else None
    if isinstance(node, str):
        cleaned = node.replace(',', '').replace('£', '').strip()
        try:
            val = float(cleaned)
            return val if val > 0 else None
        except ValueError:
            return None
    if isinstance(node, dict):
        for key in ('figure', 'amount', 'total', 'issued_share_capital', 'share_capital'):
            if key in node:
                found = _extract_capital_figure(node.get(key), depth + 1)
                if found is not None:
                    return found
        for value in node.values():
            found = _extract_capital_figure(value, depth + 1)
            if found is not None:
                return found
    if isinstance(node, list):
        for item in node:
            found = _extract_capital_figure(item, depth + 1)
            if found is not None:
                return found
    return None

