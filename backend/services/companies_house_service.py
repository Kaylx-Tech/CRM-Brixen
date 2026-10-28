"""Companies House UK API Integration Service
Extracted from core Brixen CRM architecture.
"""
import os
import json
import base64
import urllib.request
import urllib.error

CH_API_BASE = "https://api.company-information.service.gov.uk"

def platform_ch_api_key():
    """Finstap's own Companies House key (owner portal › Integrations, else Coolify env): used for every
    company workspace."""
    try:
        from services.platform_integrations import get
        return get('COMPANIES_HOUSE_API_KEY')
    except ImportError:
        pass
    key = os.environ.get('COMPANIES_HOUSE_API_KEY', '').strip()
    if len(key) >= 2 and key[0] == key[-1] and key[0] in ('"', "'"):
        key = key[1:-1].strip()
    return key


def get_ch_api_key():
    key = platform_ch_api_key()
    if key:
        return key
    try:
        from services.settings_service import _in_workspace
        if _in_workspace():
            return ''  # Finstap workspaces use the server's key only
    except ImportError:
        pass
    try:
        from db import query_db
        row = query_db("SELECT value FROM settings WHERE key = 'companies_house_api_key' LIMIT 1;", one=True)
        if row and row['value']:
            return str(row['value']).strip()
    except Exception:
        pass
    return ''

def fetch_company_profile(company_number):
    """Fetch live company profile data from UK Companies House."""
    api_key = get_ch_api_key()
    if not api_key:
        return {"error": "COMPANIES_HOUSE_API_KEY is not configured on server"}

    comp_num = str(company_number).strip().zfill(8).upper()
    url = f"{CH_API_BASE}/company/{comp_num}"
    
    auth_header = base64.b64encode(f"{api_key}:".encode('utf-8')).decode('utf-8')
    req = urllib.request.Request(url, headers={
        "Authorization": f"Basic {auth_header}",
        "Accept": "application/json"
    })

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            return {"success": True, "data": data}
    except urllib.error.HTTPError as e:
        return {"success": False, "status_code": e.code, "error": f"Companies House API error: {e.reason}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def fetch_company_officers(company_number):
    """Fetch company directors and secretaries from Companies House."""
    api_key = get_ch_api_key()
    if not api_key:
        return {"error": "COMPANIES_HOUSE_API_KEY is not configured"}

    comp_num = str(company_number).strip().zfill(8).upper()
    url = f"{CH_API_BASE}/company/{comp_num}/officers"
    
    auth_header = base64.b64encode(f"{api_key}:".encode('utf-8')).decode('utf-8')
    req = urllib.request.Request(url, headers={
        "Authorization": f"Basic {auth_header}",
        "Accept": "application/json"
    })

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            return {"success": True, "officers": data.get('items', [])}
    except Exception as e:
        return {"success": False, "error": str(e)}

def search_companies_house(query):
    """Search companies by name or number from UK Companies House."""
    api_key = get_ch_api_key()
    if not api_key:
        return {"success": False, "error": "COMPANIES_HOUSE_API_KEY is not configured"}

    import urllib.parse
    q_str = str(query).strip()
    if not q_str:
        return {"success": True, "results": []}

    q_encoded = urllib.parse.quote(q_str)
    url = f"{CH_API_BASE}/search/companies?q={q_encoded}&items_per_page=10"
    
    auth_header = base64.b64encode(f"{api_key}:".encode('utf-8')).decode('utf-8')
    req = urllib.request.Request(url, headers={
        "Authorization": f"Basic {auth_header}",
        "Accept": "application/json"
    })

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            items = data.get('items', [])
            return {"success": True, "results": items}
    except Exception as e:
        return {"success": False, "error": str(e)}


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

