"""Didit identity verification (didit.me), used by Smart Operations > ID Verification.

A verification session is started for one person on a KYC order; the person opens the session link,
scans their ID and takes a selfie, and Didit posts the result to /api/webhooks/didit.

Settings > Integrations (or env vars) hold the keys, never the code:
  didit_api_key         API key (x-api-key header)
  didit_webhook_secret  Webhook secret key, signs every webhook (X-Signature-V2)
  didit_workflow_id     The verification workflow to run (ID document + liveness + face match)
  didit_callback_url    Optional: where the person lands after finishing
  didit_api_base        Optional: API address (default https://verification.didit.me)
"""
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request

from services.settings_service import get_setting

DEFAULT_API_BASE = 'https://verification.didit.me'
# Didit session statuses (case-sensitive, as Didit sends them)
FINAL_STATUSES = ('Approved', 'Declined', 'Abandoned', 'Expired', 'Kyc Expired')


def config():
    return {
        'api_key': (get_setting('didit_api_key', '') or '').strip(),
        'webhook_secret': (get_setting('didit_webhook_secret', '') or '').strip(),
        'workflow_id': (get_setting('didit_workflow_id', '') or '').strip(),
        'callback_url': (get_setting('didit_callback_url', '') or '').strip(),
        'api_base': ((get_setting('didit_api_base', '') or '').strip() or DEFAULT_API_BASE).rstrip('/'),
    }


def is_configured():
    cfg = config()
    return bool(cfg['api_key'] and cfg['workflow_id'])


def _request(method, path, payload=None, api_key=None):
    """(status_code, json body or {}) of a Didit API call; status 0 when Didit cannot be reached."""
    cfg = config()
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    req = urllib.request.Request(f"{cfg['api_base']}{path}", data=data, method=method, headers={
        'x-api-key': api_key or cfg['api_key'],
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            raw = res.read().decode('utf-8') or '{}'
            return res.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode('utf-8') or '{}')
        except ValueError:
            body = {}
        return e.code, body
    except Exception as e:
        return 0, {'detail': str(e)}


def _field_errors(body, prefix=''):
    """Didit's 400 replies list problems per field, e.g. {"callback": ["Enter a valid URL."]}."""
    parts = []
    for key, value in (body.items() if isinstance(body, dict) else []):
        name = f"{prefix}{key}"
        if isinstance(value, dict):
            parts.extend(_field_errors(value, f"{name}."))
        elif isinstance(value, list):
            parts.append(f"{name}: {' '.join(str(v) for v in value)}")
        elif value:
            parts.append(f"{name}: {value}")
    return parts


def _error_text(status, body):
    detail = body.get('detail') or body.get('message') or body.get('error') if isinstance(body, dict) else None
    if not detail and isinstance(body, dict):
        detail = '; '.join(_field_errors(body))[:300] or None
    if status in (401, 403):
        return 'Didit refused the API key. Check it in Settings > Integrations.'
    if status == 0:
        return f"Didit could not be reached: {detail or 'no connection'}"
    return f"Didit error {status}: {detail or 'unknown error'}"


def create_session(*, vendor_data, full_name='', email='', order_number=''):
    """Start a Didit session. Returns (session dict with session_id / url / status, error)."""
    cfg = config()
    if not cfg['api_key'] or not cfg['workflow_id']:
        return None, 'Add the Didit API key and workflow ID in Settings > Integrations first.'
    payload = {
        'workflow_id': cfg['workflow_id'],
        # Didit hands back an unfinished session with the same vendor_data instead of starting a new one
        'vendor_data': vendor_data,
        'metadata': {'order_number': order_number, 'full_name': full_name},
    }
    if cfg['callback_url']:
        payload['callback'] = cfg['callback_url']
    if email:
        payload['contact_details'] = {'email': email}
    status, body = _request('POST', '/v3/session/', payload)
    if status not in (200, 201) or not body.get('session_id') or not body.get('url'):
        return None, _error_text(status, body)
    return body, None


def get_decision(session_id):
    """The session's current status and result. Returns (body, error)."""
    status, body = _request('GET', f"/v3/session/{session_id}/decision/")
    if status != 200:
        return None, _error_text(status, body)
    return body, None


def test_connection(api_key=None):
    """Checks the key without starting a session: an unknown session gives 404 with a good key, 403 without."""
    key = (api_key or config()['api_key'] or '').strip()
    if not key:
        return {'success': False, 'error': 'Paste the Didit API key first.'}
    status, body = _request('GET', '/v3/session/00000000-0000-0000-0000-000000000000/decision/', api_key=key)
    if status in (200, 404):
        return {'success': True, 'message': 'Didit accepted the API key.'}
    return {'success': False, 'error': _error_text(status, body)}


# ── Webhook signature ────────────────────────────────────────────────────────

def _canonical(value):
    """Didit's canonical JSON: keys sorted at every level, whole floats as ints."""
    if isinstance(value, dict):
        return {k: _canonical(value[k]) for k in sorted(value)}
    if isinstance(value, list):
        return [_canonical(v) for v in value]
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def verify_webhook(body, raw_body, headers, now=None):
    """True when the webhook was signed with our webhook secret within the last 5 minutes."""
    secret = config()['webhook_secret']
    if not secret:
        return False
    try:
        ts = int(str(headers.get('timestamp') or '0').strip())
    except ValueError:
        return False
    if abs((now or time.time()) - ts) > 300:
        return False
    key = secret.encode('utf-8')
    sig_v2 = str(headers.get('signature_v2') or '').strip()
    if sig_v2 and isinstance(body, dict):
        canonical = json.dumps(_canonical(body), sort_keys=True, separators=(',', ':'), ensure_ascii=False)
        expected = hmac.new(key, canonical.encode('utf-8'), hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig_v2, expected):
            return True
    sig_raw = str(headers.get('signature') or '').strip()
    if sig_raw and raw_body:
        expected = hmac.new(key, raw_body, hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig_raw, expected):
            return True
    return False


# ── Result summary ───────────────────────────────────────────────────────────

def _first(decision, plural, singular):
    items = decision.get(plural)
    if isinstance(items, list) and items:
        return items[0] or {}
    return decision.get(singular) or {}


def _mask(number):
    n = str(number or '').strip()
    return f"{'•' * max(len(n) - 4, 0)}{n[-4:]}" if n else ''


def summarise_decision(decision):
    """What the CRM keeps from a Didit decision: the checks and the details Companies House asks for
    (no images, document number masked). The full result stays in Didit."""
    if not isinstance(decision, dict):
        return {}
    idv = _first(decision, 'id_verifications', 'id_verification')
    liveness = _first(decision, 'liveness_checks', 'liveness')
    face = _first(decision, 'face_matches', 'face_match')
    first, last = idv.get('first_name') or '', idv.get('last_name') or ''
    address = idv.get('formatted_address') or idv.get('address') or ''
    if isinstance(address, dict):
        address = address.get('formatted_address') or ', '.join(str(v) for v in address.values() if v)
    summary = {k: v for k, v in {
        'status': decision.get('status'),
        'id_status': idv.get('status'),
        'liveness_status': liveness.get('status'),
        'face_match_status': face.get('status'),
        'full_name': idv.get('full_name') or f"{first} {last}".strip(),
        'first_name': first,
        'last_name': last,
        'date_of_birth': idv.get('date_of_birth'),
        'address': address,
        'nationality': idv.get('nationality'),
        'document_type': idv.get('document_type'),
        'document_number': _mask(idv.get('document_number')),
        'issuing_country': idv.get('issuing_state_name') or idv.get('issuing_state'),
        'document_expiry': idv.get('expiration_date'),
        'verified_at': decision.get('created_at') or decision.get('updated_at'),
        'session_number': decision.get('session_number'),
    }.items() if v}
    aml = summarise_aml(_first(decision, 'aml_screenings', 'aml'))
    if aml:
        summary['aml'] = aml
    poa = summarise_poa(_first(decision, 'poa_verifications', 'poa'))
    if poa:
        summary['poa'] = poa
    return summary


def _readable(code):
    """ELECTRICITY_BILL → Electricity bill ('' for UNKNOWN)."""
    code = str(code or '').strip()
    return '' if not code or code == 'UNKNOWN' else code.replace('_', ' ').capitalize()


def summarise_poa(poa):
    """Proof of address (utility bill, bank statement …): which document, from whom, when, and the address on it.
    The document image stays in Didit."""
    if not isinstance(poa, dict) or not poa:
        return {}
    parsed = poa.get('poa_parsed_address') if isinstance(poa.get('poa_parsed_address'), dict) else {}
    address = poa.get('poa_formatted_address') or parsed.get('formatted_address') or poa.get('poa_address') or ''
    warnings = [str(w.get('short_description') or w.get('log_type') or '').strip()
                for w in (poa.get('warnings') or []) if isinstance(w, dict)]
    return {k: v for k, v in {
        'status': poa.get('status'),
        'document': _readable(poa.get('document_subtype')) or _readable(poa.get('document_type')),
        'issuer': poa.get('issuer'),
        'issue_date': poa.get('issue_date'),
        'address': address,
        'name_on_document': poa.get('name_on_document'),
        'warnings': [w for w in warnings if w][:3],
    }.items() if v not in (None, '', [])}


def summarise_aml(aml):
    """AML screening (PEP, sanctions, adverse media): the outcome and the strongest hits, for the ACSP's
    AML record. Hits marked False Positive in Didit are left out."""
    if not isinstance(aml, dict) or not aml:
        return {}
    hits = [h for h in (aml.get('hits') or []) if isinstance(h, dict) and h.get('review_status') != 'False Positive']
    hits.sort(key=lambda h: (float(h.get('risk_score') or 0), float(h.get('match_score') or 0)), reverse=True)
    return {
        'status': aml.get('status'),
        'total_hits': int(aml.get('total_hits') or 0),
        'open_hits': len(hits),
        'score': aml.get('score'),
        'hits': [{k: v for k, v in {
            'name': h.get('caption'),
            'lists': [str(d) for d in (h.get('datasets') or [])][:6],
            'match_score': h.get('match_score'),
            'risk_score': h.get('risk_score'),
            'review_status': h.get('review_status'),
        }.items() if v not in (None, '', [])} for h in hits[:5]],
    }
