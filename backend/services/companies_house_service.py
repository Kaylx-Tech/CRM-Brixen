"""Companies House UK API Integration Service
Extracted from core Brixen CRM architecture.
"""
import os
import json
import base64
import urllib.request
import urllib.error

CH_API_BASE = "https://api.company-information.service.gov.uk"

def get_ch_api_key():
    return os.environ.get('COMPANIES_HOUSE_API_KEY', '').strip()

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
