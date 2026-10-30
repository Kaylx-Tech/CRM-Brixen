"""Smart Document Intake: OCR + classification + customer / Companies House matching.

Ported from the old single-file app so the modular backend no longer imports `app`.
Files are stored on Google Drive (see _drive_store) instead of local disk.
"""
import base64
import calendar
import datetime
import email
import email.policy
import gzip
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid

from db import query_db, execute_db, hash_password, unusable_password_hash

_STORE_LOCAL = threading.local()


def log_activity(user, action, entity_type=None, entity_id=None, details=None):
    uid = user['id'] if user else None
    email_addr = (user or {}).get('email') or 'SYSTEM'
    execute_db(
        "INSERT INTO activity_logs (user_id, user_email, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?);",
        (uid, email_addr, action, entity_type, entity_id, details),
    )


def store_client_document_file(client_id, order_id, ext, file_bytes, filename=None):
    """Upload to Google Drive under the customer's folder. Returns (file_path, error)."""
    from services.storage_service import save_client_file
    row = query_db("SELECT full_name FROM users WHERE id = ?;", (client_id,), one=True) if client_id else None
    customer = (row or {}).get('full_name') or 'Unassigned'
    name = filename or f"{uuid.uuid4().hex}{ext}"
    mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'
    res = save_client_file(client_id, customer, name, file_bytes, order_id=order_id, mime_type=mime)
    if not res.get('success'):
        return None, res.get('error') or 'Google Drive upload failed'
    _STORE_LOCAL.last = res
    return res.get('file_path') or f"Customers/{customer}/{name}", None


def _apply_drive_link(doc_id):
    res = getattr(_STORE_LOCAL, 'last', None)
    if res and doc_id and res.get('drive_file_id'):
        execute_db(
            "UPDATE documents SET drive_file_id = ?, drive_web_link = ? WHERE id = ?;",
            (res.get('drive_file_id'), res.get('drive_web_link'), doc_id),
        )
    _STORE_LOCAL.last = None


_UK_COMPANY_NUMBER_RE = re.compile(r'^(\d{6,8}|[A-Z]{2}\d{5,6})$', re.I)

def looks_like_uk_company_number(company_number):
    num = str(company_number or '').strip().upper().replace(' ', '')
    return bool(num) and bool(_UK_COMPANY_NUMBER_RE.fullmatch(num))

def is_pending_company_number(company_number):
    num = str(company_number or '').strip().upper()
    return not num or num.startswith('REG-')

def companies_house_email_from_data(data):
    if not isinstance(data, dict):
        return ''
    for key in ('registered_email_address', 'registered_email', 'email', 'contact_email'):
        value = str(data.get(key) or '').strip().lower()
        if is_usable_form_email(value):
            return value
    return ''

DOCUMENT_TYPE_LABELS = {
    '.pdf': 'PDF Document',
    '.png': 'PNG Image',
    '.jpg': 'JPEG Image',
    '.jpeg': 'JPEG Image',
    '.doc': 'Word Document',
    '.docx': 'Word Document',
    '.zip': 'ZIP Archive',
}

def optional_record_id(value):
    if value in (None, '', False):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None

def decode_document_base64(b64_content, default_bytes=None):
    if not b64_content:
        return default_bytes, None
    import base64
    try:
        content_str = str(b64_content).strip()
        if ',' in content_str:
            content_str = content_str.split(',', 1)[1].strip()
        content_str = re.sub(r'\s+', '', content_str)
        missing_padding = len(content_str) % 4
        if missing_padding:
            content_str += '=' * (4 - missing_padding)
        return base64.b64decode(content_str), None
    except Exception as ex:
        return None, f"Invalid base64 payload: {ex}"

DOC_AI_MODEL_VERSION = 'v2.0'

def log_document_audit(
    document_id,
    actor_type,
    actor_id,
    actor_name,
    action,
    previous_state=None,
    new_state=None,
    reason_evidence=None,
    ai_model_version=DOC_AI_MODEL_VERSION,
):
    evidence = reason_evidence
    if evidence is not None and not isinstance(evidence, str):
        evidence = json.dumps(evidence)
    try:
        execute_db(
            """
            INSERT INTO document_audit_log (
                document_id, actor_type, actor_id, actor_name, action,
                previous_state, new_state, ai_model_version, reason_evidence_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                document_id,
                actor_type or 'AI',
                actor_id,
                actor_name or 'System',
                action,
                previous_state,
                new_state,
                ai_model_version,
                evidence,
            ),
        )
    except Exception as exc:
        print(f"[log_document_audit Error] {exc}")

def find_document_by_file_hash(file_hash, exclude_id=None):
    if not file_hash:
        return None
    if exclude_id:
        return query_db(
            "SELECT id, name, user_id, lifecycle_status, is_posted FROM documents WHERE file_hash = ? AND id != ? ORDER BY id DESC LIMIT 1;",
            (file_hash, exclude_id),
            one=True,
        )
    return query_db(
        "SELECT id, name, user_id, lifecycle_status, is_posted FROM documents WHERE file_hash = ? ORDER BY id DESC LIMIT 1;",
        (file_hash,),
        one=True,
    )

def format_document_size(num_bytes):
    if num_bytes >= 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes} B"

def absorb_company_into(source_id, target_id):
    import data_protection as _data_protection
    source_id = optional_record_id(source_id)
    target_id = optional_record_id(target_id)
    if not source_id or not target_id or source_id == target_id:
        return False
    source = query_db("SELECT * FROM companies WHERE id = ?;", (source_id,), one=True)
    target = query_db("SELECT id, user_id FROM companies WHERE id = ?;", (target_id,), one=True)
    if not source or not target or source.get('user_id') != target.get('user_id'):
        return False
    # Never auto-delete a genuine registered company — only pending placeholders may be absorbed.
    blocked = _data_protection.refuse_auto_delete_company(source)
    if blocked:
        return False
    execute_db("UPDATE orders SET company_id = ?, portfolio_hidden = 0 WHERE company_id = ?;", (target_id, source_id))
    execute_db("UPDATE documents SET company_id = ? WHERE company_id = ?;", (target_id, source_id))
    execute_db("UPDATE company_owners SET company_id = ? WHERE company_id = ?;", (target_id, source_id))
    execute_db("UPDATE support_tickets SET company_id = ? WHERE company_id = ?;", (target_id, source_id))
    execute_db("UPDATE tasks SET company_id = ? WHERE company_id = ?;", (target_id, source_id))
    execute_db("UPDATE company_directors SET company_id = ? WHERE company_id = ?;", (target_id, source_id))
    execute_db("UPDATE addresses SET company_id = ? WHERE company_id = ?;", (target_id, source_id))
    execute_db("UPDATE proxies SET company_id = ? WHERE company_id = ?;", (target_id, source_id))
    execute_db("UPDATE registered_agents SET company_id = ? WHERE company_id = ?;", (target_id, source_id))
    execute_db(
        """
        UPDATE company_accounts
        SET company_id = ?
        WHERE company_id = ?
          AND period_end NOT IN (SELECT period_end FROM company_accounts WHERE company_id = ?);
        """,
        (target_id, source_id, target_id),
    )
    execute_db("DELETE FROM company_accounts WHERE company_id = ?;", (source_id,))
    execute_db("UPDATE company_book_entries SET company_id = ? WHERE company_id = ?;", (target_id, source_id))
    execute_db("DELETE FROM companies WHERE id = ?;", (source_id,))
    return True

def ensure_smart_intake_client(extracted_name=None, extracted_email=None, extracted_phone=None):
    """Always return a CLIENT user row so documents.user_id is never NULL."""
    name = (extracted_name or '').strip()
    email = (extracted_email or '').strip() or None
    phone = (extracted_phone or '').strip() or None

    client_user = None
    if name:
        client_user = query_db(
            "SELECT * FROM users WHERE role = 'CLIENT' AND lower(full_name) = lower(?);",
            (name,),
            one=True,
        )
        if not client_user:
            like_name = '%' + '%'.join(name.lower().split()) + '%'
            client_user = query_db(
                "SELECT * FROM users WHERE role = 'CLIENT' AND lower(full_name) LIKE ? ORDER BY id DESC LIMIT 1;",
                (like_name,),
                one=True,
            )
        if not client_user:
            clean_username = re.sub(r'[^a-z0-9]', '.', name.lower().strip()).strip('.') or 'intake.client'
            provisional_email = email or f"{clean_username}@brixen-pending.local"
            user_id = execute_db("""
                INSERT INTO users (full_name, email, password_hash, role, status, phone, created_at)
                VALUES (?, ?, ?, 'CLIENT', 'Active', ?, CURRENT_TIMESTAMP);
            """, (name, provisional_email, unusable_password_hash(), phone))
            client_user = query_db("SELECT * FROM users WHERE id = ?;", (user_id,), one=True)
        elif client_user:
            updates = []
            params = []
            if email and 'brixen-pending.local' in (client_user.get('email') or ''):
                updates.append('email = ?')
                params.append(email)
            if phone and not client_user.get('phone'):
                updates.append('phone = ?')
                params.append(phone)
            if updates:
                params.append(client_user['id'])
                execute_db(f"UPDATE users SET {', '.join(updates)} WHERE id = ?;", tuple(params))
                client_user = query_db("SELECT * FROM users WHERE id = ?;", (client_user['id'],), one=True)
        return client_user

    client_user = query_db(
        "SELECT * FROM users WHERE email = 'intake.unassigned@brixen-pending.local';",
        one=True,
    )
    if client_user:
        return client_user
    user_id = execute_db("""
        INSERT INTO users (full_name, email, password_hash, role, status, created_at)
        VALUES (?, ?, ?, 'CLIENT', 'Active', CURRENT_TIMESTAMP);
    """, (
        'Unassigned Document Intake',
        'intake.unassigned@brixen-pending.local',
        unusable_password_hash(),
    ))
    return query_db("SELECT * FROM users WHERE id = ?;", (user_id,), one=True)

def companies_house_api_key():
    # One key for every Finstap company: the server's own key comes first (same as get_ch_api_key)
    from services.companies_house_service import get_ch_api_key
    return get_ch_api_key()

def companies_house_request(path_qs):
    key = companies_house_api_key()
    if not key:
        return None, 'Companies House API key is not configured'
    url = 'https://api.company-information.service.gov.uk' + path_qs
    token = base64.b64encode(f'{key}:'.encode('ascii')).decode('ascii')
    req = urllib.request.Request(url, headers={
        'Authorization': f'Basic {token}',
        'Accept': 'application/json',
        'User-Agent': 'BrixenCRM/1.0',
    })
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode('utf-8')), None
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return None, 'Companies House rejected the API key'
        if exc.code == 404:
            return None, 'Company not found at Companies House'
        if exc.code == 429:
            return None, 'Companies House rate limit reached. Try again shortly.'
        return None, 'Companies House lookup failed'
    except Exception:
        return None, 'Could not reach Companies House'

_CH_API_CACHE = {}

_CH_API_CACHE_TTL = 600  # 10 minutes cache TTL for batch processing

def cached_companies_house_request(path_qs):
    now = time.time()
    if path_qs in _CH_API_CACHE:
        cached_time, res, err = _CH_API_CACHE[path_qs]
        if now - cached_time < _CH_API_CACHE_TTL:
            return res, err
    res, err = companies_house_request(path_qs)
    if res is not None or err:
        _CH_API_CACHE[path_qs] = (now, res, err)
    return res, err

def public_companies_house_match(item):
    if not isinstance(item, dict):
        return None
    address = item.get('address') if isinstance(item.get('address'), dict) else {}
    office_parts = [
        address.get('address_line_1'),
        address.get('locality') or address.get('region'),
        address.get('postal_code'),
        address.get('country'),
    ]
    name = (item.get('title') or item.get('company_name') or '').strip()
    number = str(item.get('company_number') or '').strip()
    if not name or not number:
        return None
    return {
        'name': name,
        'company_number': number,
        'status': str(item.get('company_status') or '').strip(),
        'company_type': str(item.get('company_type') or '').strip(),
        'inc_date': str(item.get('date_of_creation') or '').strip(),
        'reg_office': (item.get('address_snippet') or ', '.join(part for part in office_parts if part)).strip(),
    }

def fetch_company_house_primary_officer(company_number, *, live=False):
    num = str(company_number or '').strip().zfill(8)
    if not num or num == '00000000':
        return None, []
    req = companies_house_request if live else cached_companies_house_request
    payload, error = req(f'/company/{urllib.parse.quote(num)}/officers')
    if error or not payload:
        return None, []
    officers_list = []
    primary_name = None
    for item in payload.get('items') or []:
        raw_name = str(item.get('name') or '').strip()
        role = str(item.get('officer_role') or '').lower()
        resigned = item.get('resigned_on')
        if not raw_name or resigned:
            continue
        clean_name = raw_name
        if ',' in raw_name:
            parts = raw_name.split(',', 1)
            clean_name = f"{parts[1].strip()} {parts[0].strip()}".strip()
        officers_list.append({
            'name': clean_name,
            'raw_name': raw_name,
            'role': item.get('officer_role') or 'Director',
            'appointed_on': item.get('appointed_on'),
            'nationality': item.get('nationality'),
            'occupation': item.get('occupation'),
            'dob': item.get('date_of_birth'),
        })
        if not primary_name and ('director' in role or 'member' in role or 'owner' in role):
            primary_name = clean_name
    if not primary_name and officers_list:
        primary_name = officers_list[0]['name']
    return primary_name, officers_list

def search_companies_house(query):
    q = (query or '').strip()
    if len(q) < 2 or len(q) > 80:
        return [], 'Enter at least 2 characters'
    path_qs = '/search/companies?' + urllib.parse.urlencode({'q': q, 'items_per_page': 8})
    payload, error = companies_house_request(path_qs)
    if error:
        return [], error
    matches = []
    for item in (payload or {}).get('items') or []:
        match = public_companies_house_match(item)
        if match:
            cnum = match.get('company_number')
            director_name, officers = fetch_company_house_primary_officer(cnum)
            match['director'] = director_name or ''
            match['director_name'] = director_name or ''
            match['officers'] = officers or []
            matches.append(match)
    return matches, None

def search_companies_house_officers(person_name, extracted_dob=None):
    """Return company candidates for a person (CRM + CH officers with company numbers)."""
    q = (person_name or '').strip()
    if len(q) < 3:
        return [], 'Enter at least 3 characters'

    matches = []
    seen_nums = set()

    def add_match(name, company_number, address='', company_id=None, appointment_count=1,
                  officer_name='', officer_dob=None, source='companies_house', company_status=''):
        num = normalize_company_number(company_number)
        if not num and not company_id:
            return
        key = num or f'crm:{company_id}'
        if key in seen_nums:
            return
        seen_nums.add(key)
        matches.append({
            'company_id': company_id,
            'name': (name or f'Company {num or company_id}').strip(),
            'company_number': num or '',
            'address': (address or '').strip() or 'United Kingdom',
            'appointment_count': appointment_count or 1,
            'source': source,
            'officer_name': (officer_name or '').strip(),
            'officer_dob': officer_dob if isinstance(officer_dob, dict) else None,
            'company_status': (company_status or '').strip().lower(),
        })

    local_matches = query_db("""
        SELECT id, name, company_number, director, reg_office, status, user_id
        FROM companies
        WHERE lower(director) LIKE lower(?) OR lower(name) LIKE lower(?)
        ORDER BY id DESC LIMIT 12;
    """, (f"%{q}%", f"%{q}%")) or []
    for comp in local_matches:
        add_match(
            comp.get('name'),
            comp.get('company_number'),
            comp.get('reg_office') or 'Existing CRM company',
            company_id=comp.get('id'),
            officer_name=comp.get('director') or '',
            source='crm',
            company_status=comp.get('status') or '',
        )

    # Pull enough officer hits — common names bury the DOB-correct person past page size 8.
    path_qs = '/search/officers?' + urllib.parse.urlencode({'q': q, 'items_per_page': 20})
    payload, error = cached_companies_house_request(path_qs)
    if payload and isinstance(payload, dict):
        items = list(payload.get('items') or [])

        def officer_dob_priority(item):
            """Prefer officers whose CH birth month/year matches passport DOB."""
            dob = item.get('date_of_birth') if isinstance(item.get('date_of_birth'), dict) else None
            pts, _reason = score_intake_dob_match(extracted_dob, dob)
            # Compatible DOB first (25/35/10), then unknown (0), incompatible last (-50).
            return pts

        if extracted_dob:
            items.sort(key=officer_dob_priority, reverse=True)

        for item in items:
            links = item.get('links') or {}
            self_link = (links.get('self') or '').strip()
            if self_link.startswith('http'):
                parsed = urllib.parse.urlparse(self_link)
                self_link = parsed.path or ''
            if not self_link.startswith('/'):
                continue
            address = (item.get('address_snippet') or '').strip()
            officer_name = (item.get('title') or '').strip()
            officer_dob = item.get('date_of_birth') if isinstance(item.get('date_of_birth'), dict) else None
            app_payload, _app_err = cached_companies_house_request(self_link)
            if not app_payload or not isinstance(app_payload, dict):
                continue
            for appt in app_payload.get('items') or []:
                appointed_to = appt.get('appointed_to') or {}
                c_name = (appointed_to.get('company_name') or appt.get('company_name') or '').strip()
                c_num = (appointed_to.get('company_number') or appt.get('company_number') or '').strip()
                if not c_num:
                    continue
                add_match(
                    c_name,
                    c_num,
                    address,
                    officer_name=officer_name,
                    officer_dob=officer_dob,
                    source='companies_house',
                )

    return matches, None

def normalize_match_person_name(name):
    text = unicodedata.normalize('NFKC', str(name or ''))
    text = text.replace(',', ' ')
    text = re.sub(r'[^\w\s\-]', ' ', text, flags=re.UNICODE)
    text = re.sub(r'\s+', ' ', text).strip().lower()
    return text

def match_name_tokens(name):
    return [t for t in normalize_match_person_name(name).split() if len(t) > 1]

def score_intake_name_match(extracted_name, candidate_person_name):
    a = normalize_match_person_name(extracted_name)
    b = normalize_match_person_name(candidate_person_name)
    if not a or not b:
        return 0, None
    if a == b:
        return 50, 'Exact normalized full name'
    ta, tb = match_name_tokens(a), match_name_tokens(b)
    if not ta or not tb:
        return 0, None
    if set(ta) == set(tb):
        return 50, 'Exact name tokens (order-independent)'
    overlap = set(ta) & set(tb)
    if len(overlap) >= 2 and (set(ta).issubset(set(tb)) or set(tb).issubset(set(ta))):
        return 35, 'Very strong fuzzy name match'
    if len(overlap) >= 2:
        return 35, 'Very strong fuzzy name match'
    if len(overlap) == 1:
        return 15, 'Partial/weak name match'
    return 0, None

def parse_extracted_dob_parts(dob_value):
    """Parse passport/OCR DOB into day/month/year ints. Returns dict or None."""
    raw = str(dob_value or '').strip()
    if not raw:
        return None
    named = re.match(
        r'^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})$',
        raw,
        re.IGNORECASE,
    )
    months = {
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    }
    if named:
        return {
            'day': int(named.group(1)),
            'month': months[named.group(2)[:3].lower()],
            'year': int(named.group(3)),
        }
    slash = re.match(r'^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$', raw)
    if slash:
        return {'day': int(slash.group(1)), 'month': int(slash.group(2)), 'year': int(slash.group(3))}
    return None

def score_intake_dob_match(extracted_dob, ch_officer_dob):
    """Score using only CH-provided DOB granularity (never invent CH DOB)."""
    extracted = parse_extracted_dob_parts(extracted_dob)
    if not extracted or not isinstance(ch_officer_dob, dict):
        return 0, None
    try:
        ch_year = int(ch_officer_dob['year']) if ch_officer_dob.get('year') is not None else None
        ch_month = int(ch_officer_dob['month']) if ch_officer_dob.get('month') is not None else None
        ch_day = int(ch_officer_dob['day']) if ch_officer_dob.get('day') is not None else None
    except (TypeError, ValueError):
        return 0, None
    if ch_year is None:
        return 0, None
    if extracted['year'] != ch_year:
        return -50, 'Incompatible DOB year'
    if ch_month is not None and extracted['month'] != ch_month:
        return -50, 'Incompatible DOB month'
    if ch_day is not None and extracted.get('day') is not None and extracted['day'] != ch_day:
        return -50, 'Incompatible DOB day'
    if ch_day is not None and ch_month is not None:
        return 35, 'Exact available DOB match'
    if ch_month is not None:
        return 25, 'Compatible month/year DOB'
    return 10, 'Compatible DOB year only'

def _company_status_score(status_text):
    status = (status_text or '').strip().lower()
    if not status:
        return 0, None
    if status in ('active', 'live', 'open'):
        return 10, 'Active company'
    if any(x in status for x in ('dissolved', 'liquidation', 'closed', 'removed', 'inactive')):
        return -20, 'Dissolved/inactive company'
    return 0, None

def score_intake_company_candidate(candidate, client_id, person_name, extracted_dob, extracted_nationality=None):
    score = 0
    reasons = []

    # 1. Person Name Matching (Transposition & Token Overlap)
    person_fields = [
        candidate.get('officer_name'),
        candidate.get('director'),
    ]
    best_name_score = 0
    best_name_reason = None
    for field in person_fields:
        pts, reason = score_intake_name_match(person_name, field)
        if pts > best_name_score:
            best_name_score = pts
            best_name_reason = reason
    if best_name_score == 0:
        cname_pts, _ = score_intake_name_match(person_name, candidate.get('name'))
        if cname_pts >= 15:
            best_name_score = 5
            best_name_reason = 'Person name weakly related to company name'
    if best_name_score:
        score += best_name_score
        if best_name_reason:
            reasons.append(best_name_reason)

    # 2. DOB Compatibility Matching (Month & Year)
    dob_pts, dob_reason = score_intake_dob_match(extracted_dob, candidate.get('officer_dob'))
    if dob_pts:
        score += dob_pts
        if dob_reason:
            reasons.append(dob_reason)

    # 3. Nationality / Country Compatibility (identity triad)
    cand_nat = (candidate.get('officer_nationality') or candidate.get('nationality') or '').strip().lower()
    ext_nat = (extracted_nationality or '').strip().lower()
    if ext_nat and cand_nat:
        if (
            ext_nat in cand_nat
            or cand_nat in ext_nat
            or (ext_nat.startswith('pak') and 'pak' in cand_nat)
            or (ext_nat.startswith('brit') and 'brit' in cand_nat)
            or (ext_nat.startswith('ind') and 'ind' in cand_nat)
        ):
            score += 20
            reasons.append('Nationality matched')
        else:
            score -= 8
            reasons.append('Nationality differs from officer record')
    elif ext_nat and not cand_nat:
        reasons.append(f'Nationality from document: {extracted_nationality}')

    # 4. Existing CRM Relationship
    cid = candidate.get('company_id')
    if client_id and cid:
        owned = query_db(
            "SELECT id FROM companies WHERE id = ? AND user_id = ?;",
            (cid, client_id),
            one=True,
        )
        if owned:
            score += 40
            reasons.append('Existing CRM client already associated with company')
        order_link = query_db(
            "SELECT id FROM orders WHERE user_id = ? AND company_id = ? LIMIT 1;",
            (client_id, cid),
            one=True,
        )
        if order_link:
            score += 30
            reasons.append('Existing order associated with company')

    # 5. Companies House Officer Source
    if candidate.get('source') == 'companies_house' and candidate.get('company_number'):
        score += 15
        reasons.append('Verified Companies House officer appointment')
    elif candidate.get('source') == 'crm' and best_name_score >= 35:
        score += 25
        reasons.append('Strong CRM director/name relationship')

    # 6. Active Company Status
    status_pts, status_reason = _company_status_score(candidate.get('company_status'))
    if status_pts:
        score += status_pts
        if status_reason:
            reasons.append(status_reason)

    final_score = max(0, min(100, score))

    if final_score >= 75:
        label = 'HIGH'
    elif final_score >= 60:
        label = 'MEDIUM'
    else:
        label = 'LOW'

    return {
        'score': final_score,
        'confidence_label': label,
        'reasons': reasons,
        'candidate': candidate,
    }

def enrich_candidate_company_status(candidate, status_cache):
    num = normalize_company_number(candidate.get('company_number'))
    if not num:
        return candidate
    if num in status_cache:
        candidate['company_status'] = status_cache[num]
        return candidate
    if candidate.get('company_status'):
        status_cache[num] = candidate['company_status']
        return candidate
    payload, _err = cached_companies_house_request('/company/' + urllib.parse.quote(num))
    status = ''
    if payload and isinstance(payload, dict):
        status = str(payload.get('company_status') or '').strip().lower()
    status_cache[num] = status
    candidate['company_status'] = status
    return candidate

def enrich_candidate_company_officers(candidate, person_name, officer_cache):
    num = normalize_company_number(candidate.get('company_number'))
    if not num or candidate.get('officer_name'):
        return candidate
    if num in officer_cache:
        matched_officer = officer_cache[num]
        if matched_officer:
            candidate['officer_name'] = matched_officer.get('name') or ''
            candidate['officer_dob'] = matched_officer.get('dob')
        return candidate

    payload, _err = cached_companies_house_request(f'/company/{urllib.parse.quote(num)}/officers')
    matched = None
    if payload and isinstance(payload, dict):
        for item in payload.get('items') or []:
            off_name = (item.get('name') or '').strip()
            pts, _ = score_intake_name_match(person_name, off_name)
            if pts >= 35:
                matched = {
                    'name': off_name,
                    'dob': item.get('date_of_birth') if isinstance(item.get('date_of_birth'), dict) else None,
                }
                break
    officer_cache[num] = matched
    if matched:
        candidate['officer_name'] = matched.get('name') or ''
        candidate['officer_dob'] = matched.get('dob')
    return candidate

def resolve_intake_company_match(client_id, person_name, extracted_dob=None, extracted_nationality=None, actor=None):
    """
    Two-Stage Identity Resolution Engine:
    Stage 1: Resolve Person / Officer Identity against Companies House & CRM.
    Stage 2: Evaluate & rank officer company appointments with confidence score and gap analysis.
    Returns (company_row_or_None, status, message, ranked_candidates, match_meta)
    """
    name = (person_name or '').strip()
    empty_meta = {
        'confidence': 0,
        'confidence_label': 'LOW',
        'score': 0,
        'reasons': [],
        'score_gap': 0,
        'top_candidates': [],
    }
    if not name:
        return None, 'not_applicable', 'No person name to match against companies.', [], empty_meta

    # Check existing CRM client company relationships
    owned = []
    if client_id:
        owned = query_db(
            "SELECT * FROM companies WHERE user_id = ? ORDER BY id DESC LIMIT 5;",
            (client_id,),
        ) or []
    if len(owned) == 1:
        row = owned[0]
        meta = {
            'confidence': 95,
            'confidence_label': 'HIGH',
            'score': 95,
            'reasons': [
                'Existing CRM client already associated with company',
                'Single company relationship on client file',
            ],
            'score_gap': 95,
            'top_candidates': [{
                'name': row.get('name'),
                'company_number': row.get('company_number'),
                'score': 95,
                'confidence_label': 'HIGH',
                'reasons': ['Existing CRM client already associated with company'],
            }],
        }
        if actor:
            log_activity(
                actor,
                'DOCUMENT_AUTO_MATCHED',
                'companies',
                str(row['id']),
                f"Auto-matched client #{client_id} to existing CRM company #{row.get('company_number') or row['id']} (score=95)",
            )
        return row, 'matched', f"Automatically matched {row.get('name')} (existing CRM relationship)", [], meta

    raw_candidates, _err = search_companies_house_officers(name, extracted_dob=extracted_dob)
    if not raw_candidates:
        if actor:
            log_activity(
                actor,
                'DOCUMENT_MATCH_REVIEW_REQUIRED',
                'users',
                str(client_id or ''),
                f"No reliable company candidates for client #{client_id}",
            )
        return None, 'not_applicable', (
            f'No reliable company candidates for {name}. Document filed under client profile.'
        ), [], empty_meta

    status_cache = {}
    officer_cache = {}
    scored = []
    for cand in raw_candidates:
        enrich_candidate_company_status(cand, status_cache)
        enrich_candidate_company_officers(cand, name, officer_cache)
        if cand.get('company_id') and not cand.get('officer_name'):
            row = query_db("SELECT director FROM companies WHERE id = ?;", (cand['company_id'],), one=True)
            if row:
                cand['officer_name'] = row.get('director') or ''
        scored.append(score_intake_company_candidate(
            cand, client_id, name, extracted_dob, extracted_nationality=extracted_nationality
        ))

    scored.sort(key=lambda x: x['score'], reverse=True)
    top = scored[0]
    second = scored[1] if len(scored) > 1 else None
    top_score = top['score']
    second_score = second['score'] if second else 0
    score_gap = top_score - second_score

    ranked_preview = []
    for item in scored[:5]:
        c = item['candidate']
        ranked_preview.append({
            'name': c.get('name'),
            'company_number': c.get('company_number'),
            'company_id': c.get('company_id'),
            'address': c.get('address'),
            'score': item['score'],
            'confidence_label': item['confidence_label'],
            'reasons': item['reasons'],
            'source': c.get('source'),
            'officer_dob': c.get('officer_dob'),
        })

    meta = {
        'confidence': top_score,
        'confidence_label': top['confidence_label'],
        'score': top_score,
        'reasons': top['reasons'],
        'score_gap': score_gap,
        'top_candidates': ranked_preview,
    }

    # Auto-assign ONLY when top score >= 75 AND confidence gap >= 20 (or no second candidate)
    auto_ok = False
    if top_score >= 75 and (score_gap >= 20 or second is None) and not any(
        'Incompatible DOB' in (r or '') for r in top['reasons']
    ):
        auto_ok = True

    if auto_ok:
        chosen = top['candidate']
        company_obj = None
        if chosen.get('company_id'):
            company_obj = query_db("SELECT * FROM companies WHERE id = ?;", (chosen['company_id'],), one=True)
            if company_obj and client_id and not company_obj.get('user_id'):
                execute_db("UPDATE companies SET user_id = ? WHERE id = ?;", (client_id, company_obj['id']))
                company_obj = query_db("SELECT * FROM companies WHERE id = ?;", (company_obj['id'],), one=True)
        if not company_obj and chosen.get('company_number'):
            company_obj = auto_import_companies_house_from_intake(
                chosen.get('name'),
                chosen.get('company_number'),
                client_user_id=client_id,
            )
        if company_obj:
            msg = (
                f"Automatically matched {company_obj.get('name')} "
                f"(Confidence: {meta['confidence']}% — {meta['confidence_label']})"
            )
            if actor:
                log_activity(
                    actor,
                    'DOCUMENT_AUTO_MATCHED',
                    'companies',
                    str(company_obj['id']),
                    f"Auto-matched client #{client_id} to CH/CRM #{company_obj.get('company_number') or company_obj['id']} (score={top_score}, gap={score_gap})",
                )
            return company_obj, 'matched', msg, ranked_preview, meta

        status = 'review_required'
        msg = (
            f"Review required: top candidates have similar confidence "
            f"({ranked_preview[0]['name']} {top_score}% vs {ranked_preview[1]['name']} {second_score}%)."
        )
    elif top_score < 65:
        status = 'not_applicable'
        dob_blocked = any('Incompatible DOB' in (r or '') for r in (top.get('reasons') or []))
        if dob_blocked:
            msg = (
                f'No safe company match for {name}: Companies House officers with this name have different '
                f'birth details than the passport DOB ({extracted_dob or "unknown"}). '
                f'Best score {top_score}%. Document filed under the client; company left unassigned.'
            )
        else:
            msg = (
                f'No high-confidence company match for {name} (best {top_score}%). '
                'Document filed under the client; company left unassigned.'
            )
    else:
        status = 'review_required'
        msg = f'Review required for {name}: insufficient score gap for safe auto-assignment.'

    if actor:
        log_activity(
            actor,
            'DOCUMENT_MATCH_REVIEW_REQUIRED',
            'users',
            str(client_id or ''),
            f"Match review client #{client_id}: top={top_score} second={second_score} gap={score_gap}",
        )
    return None, status, msg, ranked_preview, meta

def normalize_company_number(raw):
    text = re.sub(r'[^A-Za-z0-9]', '', str(raw or '').strip().upper())
    if text.startswith('NO'):
        text = text[2:]
    return text

INTAKE_NAME_NOISE = frozenset({
    'name', 'of', 'the', 'and', 'for', 'passport', 'republic', 'islamic', 'pakistan',
    'united', 'kingdom', 'great', 'britain', 'nationality', 'gender', 'date', 'birth',
    'place', 'issue', 'expiry', 'type', 'code', 'authority', 'holder', 'customer',
    'account', 'statement', 'period', 'page', 'bank', 'ltd', 'limited', 'company',
    'director', 'subscriber', 'each', 'mr', 'mrs', 'ms', 'miss', 'dr', 'dob',
    'cnic', 'nic', 'nid', 'identity', 'card', 'document', 'utility', 'bill',
    'given', 'names', 'surname', 'father', 'husband', 'wife', 'son', 'daughter',
    'number', 'no', 'inc', 'corp', 'holdings', 'services', 'solutions', 'certificate',
    'incorporation', 'articles', 'association', 'confirmation', 'hmrc', 'vat',
})

INTAKE_FILENAME_IGNORE = frozenset({
    'bank', 'statement', 'passport', 'cnic', 'id', 'proof', 'address', 'doc', 'docx',
    'pdf', 'png', 'jpg', 'jpeg', 'certificate', 'incorporation', 'utility', 'bill',
    'ltd', 'limited', 'company', 'scan', 'copy', 'front', 'back', 'photo',
})

def _printable_text_ratio(text):
    if not text:
        return 0.0
    good = sum(1 for ch in text if ch.isprintable() or ch.isspace())
    return good / max(len(text), 1)

def _bytes_as_loose_text(file_bytes):
    if not file_bytes:
        return ''
    sample = file_bytes[:12000]
    if b'\x00' in sample[:400] and not sample.startswith(b'%PDF'):
        return ''
    try:
        text = file_bytes.decode('utf-8', errors='ignore')
    except Exception:
        text = ''
    if _printable_text_ratio(text) >= 0.82:
        return text
    if sample.startswith(b'%PDF'):
        return text
    return ''

def _mrz_quality_score(text):
    compact = re.sub(r'[^A-Z0-9<]', '', (text or '').upper())
    if not compact:
        return 0
    score = compact.count('<')
    if '<<' in compact:
        score += 25
    if re.search(r'(?:P<|[A-Z]{3})[A-Z]+<<[A-Z<]{2,}', compact):
        score += 40
    if re.search(r'[A-Z]{3}\d{6}\d[MF<]', compact):
        score += 30
    if any(code in compact for code in ('PAK', 'GBR', 'IND', 'USA', 'IRL', 'CAN', 'AUS')):
        score += 12
    return score

def _prepare_ocr_gray(image, sharpen=1.6, median=False, threshold=None, min_edge=2200):
    from PIL import Image, ImageOps, ImageEnhance, ImageFilter
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)
    if sharpen:
        gray = ImageEnhance.Sharpness(gray).enhance(sharpen)
    contrast = ImageEnhance.Contrast(gray)
    gray = contrast.enhance(1.15)
    if median:
        gray = gray.filter(ImageFilter.MedianFilter(size=3))
    if threshold is not None:
        gray = gray.point(lambda px: 255 if px > threshold else 0)
    width, height = gray.size
    edge = max(width, height)
    if edge < min_edge:
        scale = min_edge / edge
        resample = getattr(Image, 'Resampling', Image).LANCZOS if hasattr(Image, 'LANCZOS') else Image.BICUBIC
        gray = gray.resize(
            (max(1, int(width * scale)), max(1, int(height * scale))),
            resample=resample,
        )
    return gray

def _tesseract_string(image, psm='6'):
    try:
        import pytesseract
        return pytesseract.image_to_string(
            image,
            lang='eng',
            config=f'--oem 3 --psm {psm}',
        ) or ''
    except Exception:
        return ''

def _ocr_image_to_text(image, high_quality=True):
    """High-quality OCR for phone photos / scans that are not PDF text."""
    try:
        from PIL import ImageOps
    except Exception:
        return ''
    try:
        width, height = image.size
        candidates = []
        min_edge = 2600 if high_quality else 1800

        # Full page — avoid median blur (it destroys thin MRZ strokes).
        full = _prepare_ocr_gray(image, sharpen=1.55, median=False, min_edge=min_edge)
        for psm in ('6', '4', '3'):
            chunk = _tesseract_string(full, psm)
            if chunk.strip():
                candidates.append(chunk)

        # Sparse / mixed layout pass (invoices, statements, ID cards).
        if high_quality:
            sparse = _prepare_ocr_gray(image, sharpen=1.35, median=False, min_edge=min_edge)
            for psm in ('11', '12'):
                chunk = _tesseract_string(sparse, psm)
                if chunk.strip():
                    candidates.append(chunk)

        # Mild denoise pass for noisy phone photos.
        soft = _prepare_ocr_gray(image, sharpen=1.2, median=True, min_edge=min_edge)
        chunk = _tesseract_string(soft, '6')
        if chunk.strip():
            candidates.append(chunk)

        # High-contrast binarized pass for faded scans.
        if high_quality:
            for thresh in (145, 160):
                bin_img = _prepare_ocr_gray(
                    image, sharpen=1.3, median=False, threshold=thresh, min_edge=min_edge,
                )
                chunk = _tesseract_string(bin_img, '6')
                if chunk.strip():
                    candidates.append(chunk)

        # Biodata page is usually the lower half of an open passport photo.
        if height >= 900:
            biodata = image.crop((0, int(height * 0.42), width, height))
            bio_gray = _prepare_ocr_gray(biodata, sharpen=1.7, median=False, min_edge=max(min_edge, 2200))
            for psm in ('6', '4'):
                chunk = _tesseract_string(bio_gray, psm)
                if chunk.strip():
                    candidates.append(chunk)
            bio_bin = _prepare_ocr_gray(
                biodata, sharpen=1.2, median=False, threshold=150, min_edge=max(min_edge, 2200),
            )
            chunk = _tesseract_string(bio_bin, '6')
            if chunk.strip():
                candidates.append(chunk)

        # Thin MRZ strip at the bottom — high contrast, large scale.
        if height >= 700:
            mrz_band = image.crop((0, int(height * 0.82), width, height))
            mrz_gray = _prepare_ocr_gray(mrz_band, sharpen=2.0, median=False, min_edge=max(min_edge, 2600))
            for psm in ('6', '7'):
                chunk = _tesseract_string(mrz_gray, psm)
                if chunk.strip():
                    candidates.append(chunk)
            mrz_bin = _prepare_ocr_gray(
                mrz_band, sharpen=1.0, median=False, threshold=140, min_edge=max(min_edge, 2800),
            )
            chunk = _tesseract_string(mrz_bin, '6')
            if chunk.strip():
                candidates.append(chunk)

        if not candidates:
            return ''

        # Prefer the pass that preserves MRZ structure; fall back to longest text.
        return max(
            candidates,
            key=lambda t: (_mrz_quality_score(t), len(re.sub(r'\s+', '', t))),
        )
    except Exception:
        return ''

def _ocr_image_bytes(file_bytes, high_quality=True):
    try:
        import io
        from PIL import Image, ImageOps
        image = Image.open(io.BytesIO(file_bytes))
        image.load()
        image = ImageOps.exif_transpose(image)
        if image.mode not in ('L', 'RGB'):
            image = image.convert('RGB')
        return _ocr_image_to_text(image, high_quality=high_quality)
    except Exception:
        return ''

def _extract_pdf_text(file_bytes, high_quality=True):
    text = ''
    try:
        import io
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        text = '\n'.join((page.extract_text() or '') for page in reader.pages[:8])
    except Exception:
        text = ''
    if len(re.sub(r'\s+', '', text)) >= 40:
        return text, 'pdf-text'
    ocr_chunks = []
    try:
        import pypdfium2
        pdf = pypdfium2.PdfDocument(file_bytes)
        page_count = min(len(pdf), 4 if high_quality else 3)
        render_scale = 3.2 if high_quality else 2.5
        for index in range(page_count):
            page = pdf[index]
            bitmap = page.render(scale=render_scale)
            pil_image = bitmap.to_pil()
            ocr_chunks.append(_ocr_image_to_text(pil_image, high_quality=high_quality))
            try:
                page.close()
            except Exception:
                pass
        try:
            pdf.close()
        except Exception:
            pass
    except Exception:
        ocr_chunks = []
    ocr_text = '\n'.join(chunk for chunk in ocr_chunks if chunk).strip()
    if ocr_text:
        return ((text + '\n' + ocr_text).strip() if text.strip() else ocr_text), 'ocr'
    if text.strip():
        return text, 'pdf-text'
    loose = _bytes_as_loose_text(file_bytes)
    return loose, ('embedded-text' if loose.strip() else 'none')

def _extract_docx_text(file_bytes):
    try:
        import io
        import zipfile
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            xml = archive.read('word/document.xml')
        text = re.sub(r'</w:p>', '\n', xml.decode('utf-8', errors='ignore'))
        text = re.sub(r'<[^>]+>', ' ', text)
        return re.sub(r'[ \t]+', ' ', text)
    except Exception:
        return ''

def _title_person_name(raw):
    words = [w for w in re.split(r'\s+', str(raw or '').strip()) if w]
    return ' '.join(w[:1].upper() + w[1:].lower() if w.isalpha() else w for w in words)

def _looks_like_ocr_gibberish(word):
    w = re.sub(r"[^a-z]", '', str(word or '').lower())
    if len(w) < 2:
        return True
    if re.search(r'(.)\1{2,}', w):
        return True
    vowels = sum(1 for ch in w if ch in 'aeiou')
    if len(w) >= 4 and vowels == 0:
        return True
    if len(w) >= 6 and vowels / len(w) < 0.18:
        return True
    if len(set(w)) <= 2 and len(w) >= 4:
        return True
    return False

def _valid_person_name(raw):
    text = re.sub(r'\s+', ' ', str(raw or '').strip())
    text = re.sub(r'[^A-Za-z\s\'\-]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    words = [w for w in text.split() if w]
    if len(words) < 2 or len(words) > 4:
        return None
    if len(text) < 5 or len(text) > 48:
        return None
    if sum(1 for w in words if len(w) >= 3) < 1:
        return None
    lowered = [w.lower().strip("'-") for w in words]
    if any(w in INTAKE_NAME_NOISE for w in lowered):
        return None
    if any(_looks_like_ocr_gibberish(w) for w in lowered):
        return None
    if not all(re.fullmatch(r"[A-Za-z][A-Za-z'\-]{0,24}", w) for w in words):
        return None
    return _title_person_name(' '.join(words))

_NEXT_FIELD_LABEL_RE = re.compile(
    r'\b(?:date|d\.?o\.?b|born|birth|nationality|citizenship|sex|gender|address|e-?mail|phone|tel|mobile|'
    r'passport|document|occupation|residence|country|director|secretary|shareholder|signature|'
    r'appointed|company|number|no)\b',
    re.IGNORECASE,
)


def _field_value(raw):
    """Value of a labelled field: its own line only, cut where the next label ("Date of birth", "Email") starts."""
    line = re.split(r'[\r\n]', str(raw or ''), maxsplit=1)[0]
    line = _NEXT_FIELD_LABEL_RE.split(line, maxsplit=1)[0]
    return re.sub(r'\s+', ' ', line).strip(' ,.;:-')


_ORGANISATION_WORD_RE = re.compile(r'\b(?:ltd|limited|llp|plc|bank|company|inc|corp)\b', re.IGNORECASE)
_NAME_TITLE_RE = re.compile(r'^(?:mr|mrs|ms|miss|mx|dr|sir|madam)\.?\s+', re.IGNORECASE)


def _name_from_field(raw):
    """Person name from a labelled field, trying 4, 3 then 2 words so a trailing stray word does not spoil it.
    "Mr" / "Mrs" in front is dropped; a company or bank name ("BLUE SKY TRADING LIMITED") is not a person."""
    value = _field_value(raw)
    if _ORGANISATION_WORD_RE.search(value):
        return None
    words = _NAME_TITLE_RE.sub('', value).split()
    for size in range(min(4, len(words)), 1, -1):
        candidate = _valid_person_name(' '.join(words[:size]))
        if candidate:
            return candidate
    return None


def _compact_mrz_text(text):
    """Normalize noisy OCR into MRZ-friendly A-Z0-9< lines."""
    def repair_line(compact):
        if not compact:
            return compact
        # Common OCR: P misread as >, ), }, F, etc. before nationality code.
        if re.match(r'^[>\}\)F]<(?:PAK|GBR|IND|USA|IRL|CAN|AUS|DEU|FRA)', compact):
            compact = 'P' + compact[1:]
        elif re.match(r'^[>\}\)F](?:PAK|GBR|IND|USA|IRL|CAN|AUS|DEU|FRA)', compact) and ('<<' in compact or re.search(r'[KFXH]<', compact)):
            compact = 'P<' + compact[1:]
        elif compact.startswith('PC') and compact[2:5] in ('PAK', 'GBR', 'IND', 'USA', 'IRL', 'CAN', 'AUS'):
            compact = 'P<' + compact[2:]
        # << between surname and given is often OCR'd as K< / F< / X< / H<.
        compact = re.sub(
            r'(P<[A-Z]{3}[A-Z]{2,})[KFXH]<([A-Z]{2,})',
            r'\1<<\2',
            compact,
        )
        compact = re.sub(
            r'((?:PAK|GBR|IND|USA|IRL|CAN|AUS|DEU|FRA)[A-Z]{2,})[KFXH]<([A-Z]{2,})',
            r'\1<<\2',
            compact,
        )
        # Fillers after the name are often OCR'd as S/5/E/K between '<' marks.
        if '<<' in compact:
            head, _, tail = compact.partition('<<')
            tail = re.sub(r'(?<=<)[S5EKFX]+', lambda m: '<' * len(m.group(0)), tail)
            compact = head + '<<' + tail
        return compact

    cleaned_lines = []
    for raw_line in str(text or '').upper().replace('£', '<').replace('¢', '<').splitlines():
        compact = re.sub(r'[^A-Z0-9<]', '', raw_line)
        if not compact:
            continue
        cleaned_lines.append(repair_line(compact))
    blob = '\n'.join(cleaned_lines)
    # Also keep a fully compacted blob for cross-line MRZ recovery.
    full = repair_line(re.sub(r'[^A-Z0-9<]', '', str(text or '').upper().replace('£', '<').replace('¢', '<')))
    return blob + ('\n' + full if full and full not in blob else '')

def _parse_mrz_name(text):
    compact = _compact_mrz_text(text)
    match = re.search(r'P<[A-Z]{3}([A-Z]+)<<([A-Z<]{2,})', compact)
    if not match:
        # Recover when leading P< was lost but nationality+surname<<given remains.
        match = re.search(r'(?:^|[^A-Z])(?:PAK|GBR|IND|USA|IRL|CAN|AUS|DEU|FRA)([A-Z]{2,})<<([A-Z<]{2,})', compact)
        if not match:
            return None
        surname = match.group(1).replace('<', ' ').strip()
        given_raw = match.group(2)
    else:
        surname = match.group(1).replace('<', ' ').strip()
        given_raw = match.group(2)
    # Keep only real given-name tokens; ignore trailing OCR junk after fillers (e.g. ...<<<C<).
    given_match = re.match(r'^([A-Z]+(?:<[A-Z]+)*)', given_raw or '')
    given = given_match.group(1).replace('<', ' ').strip() if given_match else ''
    surname_words = [w for w in surname.split() if len(w) >= 2]
    given_words = [w for w in given.split() if len(w) >= 2]
    return _valid_person_name((' '.join(given_words + surname_words)).strip())

def _parse_mrz_dob(text):
    compact = _compact_mrz_text(text)
    match = re.search(r'[A-Z]{3}(\d{6})\d[MF<]', compact)
    if not match:
        return None
    yymmdd = match.group(1)
    year = int(yymmdd[0:2])
    month = int(yymmdd[2:4])
    day = int(yymmdd[4:6])
    if month < 1 or month > 12 or day < 1 or day > 31:
        return None
    full_year = 1900 + year if year >= 30 else 2000 + year
    return f'{day:02d}/{month:02d}/{full_year}'

def _parse_mrz_passport_num(text):
    compact = re.sub(r'[^A-Z0-9<\n]', '', text.upper())
    match = re.search(r'\b([A-Z0-9]{8,10})[A-Z]{3}\d{6}', compact)
    if match:
        return match.group(1).replace('<', '').strip()
    match_labeled = re.search(
        r'(?:passport\s*no\.?|passport\s*number|doc(?:ument)?\s*no\.?)\s*[:\-]?\s*([A-Z0-9]{7,12})',
        text,
        re.IGNORECASE,
    )
    if match_labeled:
        return match_labeled.group(1).strip()
    # Pakistani-style passport numbers often appear near PAK on the biodata page.
    near_pak = re.search(r'\b([A-Z]{1,2}\d{7,8})\b', compact)
    if near_pak and re.search(r'PAK|PASSPORT', compact):
        return near_pak.group(1)
    return None

def _parse_mrz_nationality(text):
    compact = _compact_mrz_text(text)
    match = re.search(r'P<([A-Z]{3})', compact)
    if not match:
        match = re.search(r'(?:^|[^A-Z])(PAK|GBR|IND|USA|IRL|CAN|AUS|DEU|FRA|NLD|ESP|ITA|POL|BGD|NGA|ZAF)[A-Z]+<<', compact)
    if match:
        code = match.group(1)
        country_map = {
            'PAK': 'Pakistani', 'GBR': 'British', 'USA': 'American',
            'IND': 'Indian', 'CAN': 'Canadian', 'AUS': 'Australian',
            'DEU': 'German', 'FRA': 'French', 'IRL': 'Irish',
            'NLD': 'Dutch', 'ESP': 'Spanish', 'ITA': 'Italian',
            'POL': 'Polish', 'BGD': 'Bangladeshi', 'NGA': 'Nigerian',
            'ZAF': 'South African',
        }
        return country_map.get(code, code)
    return None

def _extract_nationality(text):
    """Pull nationality from MRZ, labelled fields, or common passport/ID wording."""
    mrz = _parse_mrz_nationality(text)
    if mrz:
        return mrz
    blob = str(text or '')
    labeled = re.search(
        r'(?:nationality|citizenship|citizen of|nationalité)\s*[:\-]?\s*([A-Za-z][A-Za-z\s\-]{2,30})',
        blob,
        re.IGNORECASE,
    )
    if labeled:
        # Its own line only, stopping at the next field label ("British  Email: ..." -> "British")
        raw = _field_value(labeled.group(1))
        if raw and len(raw) >= 3 and raw.lower() not in INTAKE_NAME_NOISE:
            return raw.title()
    word_map = {
        r'\bpakistani\b': 'Pakistani',
        r'\bbritish\b|\bbritish citizen\b': 'British',
        r'\bindian\b': 'Indian',
        r'\bamerican\b|\bunited states\b': 'American',
        r'\birish\b': 'Irish',
        r'\bcanadian\b': 'Canadian',
        r'\baustralian\b': 'Australian',
        r'\bbangladeshi\b': 'Bangladeshi',
        r'\bnigerian\b': 'Nigerian',
        r'\bpolish\b': 'Polish',
    }
    for pattern, label in word_map.items():
        if re.search(pattern, blob, re.IGNORECASE):
            return label
    code_only = re.search(r'\b(PAK|GBR|IND|USA|IRL|CAN|AUS|BGD|NGA)\b', blob.upper())
    if code_only:
        return {
            'PAK': 'Pakistani', 'GBR': 'British', 'IND': 'Indian', 'USA': 'American',
            'IRL': 'Irish', 'CAN': 'Canadian', 'AUS': 'Australian',
            'BGD': 'Bangladeshi', 'NGA': 'Nigerian',
        }.get(code_only.group(1), code_only.group(1))
    return None

def _extract_person_name(text, filename_clean):
    mrz_name = _parse_mrz_name(text)
    if mrz_name:
        return mrz_name

    # Pakistani passport OCR layout often stacks:
    #   NASEEM ;
    #   Given Names
    #   PASSPORT ASIA
    stacked = re.search(
        r'(?ims)(?:^|\n)\s*([A-Za-z]{2,25})\s*;?\s*\n\s*Given Names?\s*\n\s*'
        r'(?:PASSPORT\s+|TYPE\s+P?\s*)?([A-Za-z]{2,25}(?:\s+[A-Za-z]{2,25}){0,2})\b',
        text,
    )
    if stacked:
        surname = stacked.group(1).strip()
        given = stacked.group(2).strip()
        if given.upper().startswith('PASSPORT '):
            given = given[9:].strip()
        if surname.lower() not in INTAKE_NAME_NOISE and given.lower() not in INTAKE_NAME_NOISE:
            candidate = _valid_person_name(f'{given} {surname}')
            if candidate:
                return candidate

    labeled = [
        r'(?:surname|family name)\s*[:\-]?\s*([A-Za-z][A-Za-z\'\-\s]{1,40})',
        r'(?:given names?|forenames?|first names?)\s*[:\-]?\s*([A-Za-z][A-Za-z\'\-\s]{1,40})',
        r'(?:account holder|customer name|client name|cardholder name|name of account holder)\s*[:\-]?\s*([A-Za-z][A-Za-z\'\-\s]{2,50})',
        r'(?:full name|holder name|passenger name)\s*[:\-]?\s*([A-Za-z][A-Za-z\'\-\s]{2,50})',
        r'(?:^|\n)\s*name\s*[:\-]\s*([A-Za-z][A-Za-z\'\-\s]{2,50})',
        r'\bname\s*[:\-]\s*([A-Za-z][A-Za-z\'\-\s]{2,50})',
    ]
    surname = None
    given = None
    for pattern in labeled[:2]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            # Each label's own line only ("Surname: KHAN" / "Given names: AHMED RAZA")
            if 'surname' in pattern or 'family' in pattern:
                surname = _field_value(match.group(1))
            else:
                given = _field_value(match.group(1))
    if surname and given:
        if given.upper().startswith('PASSPORT '):
            given = given[9:].strip()
        combined = _valid_person_name(f'{given} {surname}')
        if combined:
            return combined
    for pattern in labeled:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if not match:
            continue
        raw = match.group(1).strip()
        if raw.upper().startswith('PASSPORT '):
            raw = raw[9:].strip()
        candidate = _name_from_field(raw)
        if candidate:
            return candidate
    for fallback in re.finditer(
        r'(?:director|client|customer|holder|shareholder|applicant)\.?[ \t]*[:\-][ \t]*([^\r\n]{3,80})',
        text,
        re.IGNORECASE,
    ):
        candidate = _name_from_field(fallback.group(1))
        if candidate:
            return candidate
    cleaned_fn = re.sub(r'[\._\-\(\)\[\]]', ' ', filename_clean)
    words = [w for w in cleaned_fn.split() if w.lower() not in INTAKE_FILENAME_IGNORE and w.isalpha() and len(w) >= 2]
    if len(words) >= 2:
        return _valid_person_name(' '.join(words[:3]))
    return None

def _normalize_display_dob(raw):
    text = re.sub(r'\s+', ' ', str(raw or '').strip())
    if not text:
        return None
    months = {
        'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
        'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7,
        'aug': 8, 'august': 8, 'sep': 9, 'sept': 9, 'september': 9,
        'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12,
    }
    named = re.match(
        r'^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$',
        text,
        re.IGNORECASE,
    )
    if named:
        day = int(named.group(1))
        month = months.get(named.group(2).lower())
        year = int(named.group(3))
        if month and 1 <= day <= 31 and 1900 <= year <= 2100:
            return f'{day:02d}/{month:02d}/{year}'
    slash = re.match(r'^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$', text)
    if slash:
        day, month, year = int(slash.group(1)), int(slash.group(2)), int(slash.group(3))
        if year < 100:
            year += 2000 if year < 30 else 1900
        if 1 <= month <= 12 and 1 <= day <= 31 and 1900 <= year <= 2100:
            return f'{day:02d}/{month:02d}/{year}'
    return text

def _extract_dob(text):
    mrz_dob = _parse_mrz_dob(text)
    if mrz_dob:
        return mrz_dob
    labeled = re.search(
        r'(?:date of birth|birth date|d\.?o\.?b\.?|born on|born)\s*[:\-]?\s*'
        r'(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|'
        r'\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4})',
        text,
        re.IGNORECASE,
    )
    if labeled:
        return _normalize_display_dob(labeled.group(1))
    named = re.search(
        r'\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(?:19\d{2}|20[0-3]\d))\b',
        text,
        re.IGNORECASE,
    )
    if named:
        return _normalize_display_dob(named.group(1))
    loose = re.search(r'\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](?:19\d{2}|20[01]\d))\b', text)
    if loose:
        return _normalize_display_dob(loose.group(1))
    return None

def extract_company_number_from_filename(filename):
    """Pull a UK company number from CH-style filenames (newinc/profile/proof)."""
    base = urllib.parse.unquote(os.path.basename(str(filename or '')).strip())
    if not base:
        return None
    patterns = (
        r'^((?:SC|NI|OC|SO)\d{6}|\d{8})(?=_)',
        r'(?i)(?:company[_\s\-]?profile|address[_\s\-]?proof)[_\s\-]?((?:SC|NI|OC|SO)\d{6}|\d{8})\b',
        r'(?:^|[^A-Za-z0-9])((?:SC|NI|OC|SO)\d{6})(?=[^0-9A-Za-z]|$)',
        r'(?:^|[^0-9])(\d{8})(?=[_\-\s.]|$)',
    )
    for pat in patterns:
        match = re.search(pat, base)
        if not match:
            continue
        num = normalize_company_number(match.group(1))
        if looks_like_uk_company_number(num):
            return num
    return None

def _extract_company_number(text, filename=None):
    match = re.search(
        r'(?:company(?:\s+(?:registration|registered))?\s+(?:number|no\.?)|co\.?\s*no\.?|registration no\.?|reg(?:istered)? no\.?)\s*[:\-]?\s*([0-9]{8}|[A-Za-z]{2}[0-9]{6})',
        text or '',
        re.IGNORECASE,
    )
    if match:
        return normalize_company_number(match.group(1))
    # Filename often carries the definitive CH number when OCR text is weak/empty.
    return extract_company_number_from_filename(filename or text)

_COMPANY_NAME_NOISE_RE = re.compile(
    r'^(?:bank statement|name of|certificate of|the registrar|registrar of|incorporation of)'
    r'|\b(?:a|an|the)\s+(?:private|public)\s+limited\b|^(?:private|public)\s+limited\b'
    r'|\bcompanies act\b|\bcompany limited by\b',
    re.IGNORECASE,
)


def _extract_company_name(text):
    """First company name ("ACME TESTING LTD") on the document, skipping phrases like "a private limited company"."""
    patterns = (
        (r'\b([A-Z][A-Za-z0-9\&\'\.\-]+(?:[ \t]+[A-Z][A-Za-z0-9\&\'\.\-]+){0,6}[ \t]+(?:LTD|LIMITED|LLP|PLC))\b', 0),
        (r'([A-Za-z0-9\&\'\.\-]{2,40}(?:[ \t]+[A-Za-z0-9\&\'\.\-]{2,40}){0,5}[ \t]+(?:LTD|LIMITED|LLP|PLC))\b', re.IGNORECASE),
    )
    for pattern, flags in patterns:
        for match in re.finditer(pattern, text or '', flags):
            name = re.sub(r'\s+', ' ', match.group(1)).strip(' ,.-')
            if _COMPANY_NAME_NOISE_RE.search(name):
                continue
            return name
    return None


_COMPANY_SUFFIX_RE = re.compile(r'\b(?:ltd|limited|llp|plc|co|company|uk)\b\.?', re.IGNORECASE)


def _company_name_tokens(name):
    text = _COMPANY_SUFFIX_RE.sub(' ', str(name or '').lower().replace('&', ' and '))
    return [t for t in re.findall(r'[a-z0-9]+', text) if t not in ('the', 'and')]


def company_names_agree(left, right):
    """True when two company names are the same company ("Acme Testing Ltd" / "ACME TESTING LIMITED")."""
    a, b = _company_name_tokens(left), _company_name_tokens(right)
    if not a or not b:
        return False
    if a == b:
        return True
    sa, sb = set(a), set(b)
    overlap = len(sa & sb) / max(len(sa), len(sb))
    return overlap >= 0.75 or ''.join(a) == ''.join(b)

def _extract_email_phone(text):
    email_match = re.search(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b', text)
    phone_match = re.search(r'(?:\+44\s?7\d{3}|\(?0\d{4}\)?)\s?\d{3}\s?\d{3}\b|\+92[0-9\s\-]{10,14}|\b03\d{2}[-\s]?\d{7}\b', text)
    email = email_match.group(0) if email_match else None
    if email and email.lower().endswith('@brixen-pending.local'):
        email = None
    return email, (phone_match.group(0).strip() if phone_match else None)

def _looks_like_passport_text(filename_clean, text):
    lower_text = f'{filename_clean}\n{text}'.lower()
    compact = _compact_mrz_text(text)
    if '<<' in compact and re.search(r'(?:P<|[A-Z]{3})[A-Z]+<<[A-Z<]{2,}', compact):
        return True
    if re.search(r'\b\d{5}-\d{7}-\d\b', text):  # Pakistani CNIC / citizenship no.
        return True
    if any(k in lower_text for k in (
        'passport', 'cnic', 'id card', 'driving licence', 'driving license',
        'national identity', 'nicop', 'islamic republic', 'pakistani',
        'machine readable', 'given names', 'surname',
    )):
        return True
    if _mrz_quality_score(text) >= 40:
        return True
    return False

def _classify_intake_document(filename_clean, text):
    lower_text = f'{filename_clean}\n{text}'.lower()
    if _looks_like_passport_text(filename_clean, text):
        return 'ID Document'
    if any(k in lower_text for k in ('invoice', 'tax invoice', 'amount due', 'vat number')) and not any(
        k in lower_text for k in ('passport', 'bank statement', 'certificate of incorporation')
    ):
        return 'Invoice'
    if any(k in lower_text for k in ('statement', 'sort code', 'iban', 'account number', 'hsbc', 'barclays', 'lloyds', 'natwest', 'tide', 'revolut', 'monzo', 'santander')):
        return 'Bank statement'
    if any(k in lower_text for k in ('utility', 'council tax', 'tenancy', 'proof of address', 'water bill', 'electric', 'gas bill')):
        return 'Proof of Address'
    if any(k in lower_text for k in ('certificate of incorporation', 'companies house', 'articles of association', 'confirmation statement', 'utr')):
        return 'Certificate of Incorporation'
    return 'Company Documents'

def _intake_extraction_quality(person_name, dob, passport_num, nationality, cat, scan_method, raw_text):
    """Score identity extraction only: name, date of birth, nationality."""
    hits = 0
    total = 3
    if person_name:
        hits += 1
    if dob:
        hits += 1
    if nationality:
        hits += 1
    pct = int(round((hits / total) * 100))
    label = 'High' if pct >= 67 else ('Medium' if pct >= 34 else ('Low' if hits else 'None'))
    return {
        'score': pct,
        'label': label,
        'fields_found': hits,
        'fields_checked': total,
        'identity_fields': {
            'name': bool(person_name),
            'dob': bool(dob),
            'nationality': bool(nationality),
        },
        'ocr_used': scan_method == 'ocr',
        'mrz_score': _mrz_quality_score(raw_text or ''),
        'passport_number_seen': bool(passport_num),
        'document_category': cat,
    }

def _extract_bank_account_holder_name(text):
    """Pull account-holder / customer name from UK bank statement OCR text."""
    blob = str(text or '')
    patterns = [
        r'(?im)^\s*account\s*holder\s*[:\-]?\s*([A-Z][A-Za-z\'\-\s]{2,60})\s*$',
        r'(?im)^\s*account\s*name\s*[:\-]?\s*([A-Z][A-Za-z\'\-\s]{2,60})\s*$',
        r'(?im)^\s*customer\s*name\s*[:\-]?\s*([A-Z][A-Za-z\'\-\s]{2,60})\s*$',
        r'(?im)^\s*name\s*[:\-]\s*([A-Z][A-Za-z\'\-\s]{2,60})\s*$',
        r'(?i)account\s*holder\s*[:\-]?\s*([A-Za-z][A-Za-z\'\-\s]{2,60})',
        r'(?i)account\s*name\s*[:\-]?\s*([A-Za-z][A-Za-z\'\-\s]{2,60})',
        r'(?i)customer\s*(?:name)?\s*[:\-]?\s*([A-Za-z][A-Za-z\'\-\s]{2,60})',
        r'(?i)(?:mr|mrs|ms|miss)\s+([A-Za-z][A-Za-z\'\-]+(?:\s+[A-Za-z][A-Za-z\'\-]+){1,3})\b',
    ]
    for pattern in patterns:
        match = re.search(pattern, blob)
        if not match:
            continue
        raw = re.sub(r'\s+', ' ', match.group(1)).strip(' ,.-')
        # Skip company-style account names here; those are handled as company names.
        if re.search(r'\b(?:ltd|limited|llp|plc|cic)\b', raw, re.IGNORECASE):
            continue
        if any(tok in raw.lower() for tok in ('statement', 'period', 'sort code', 'account number', 'iban')):
            continue
        candidate = _name_from_field(match.group(1)) or _valid_person_name(raw)
        if candidate:
            return candidate
    return None

def intake_person_names_match(left, right):
    """True when passport/statement names are the same person (exact or strong fuzzy)."""
    pts, reason = score_intake_name_match(left, right)
    return pts >= 35, pts, reason

def find_batch_identity_for_name(person_name, batch_identities):
    best = None
    best_pts = 0
    best_reason = None
    for identity in batch_identities or []:
        if not isinstance(identity, dict):
            continue
        ok, pts, reason = intake_person_names_match(person_name, identity.get('full_name'))
        if ok and pts > best_pts:
            best = identity
            best_pts = pts
            best_reason = reason
    return best, best_pts, best_reason

def find_identity_mentioned_in_text(text, batch_identities):
    """If structured name OCR missed, detect a known batch identity name inside document text."""
    blob = normalize_match_person_name(text)
    if not blob:
        return None, 0, None
    best = None
    best_pts = 0
    best_reason = None
    for identity in batch_identities or []:
        if not isinstance(identity, dict):
            continue
        name = identity.get('full_name')
        tokens = match_name_tokens(name)
        if len(tokens) < 2:
            continue
        if all(tok in blob for tok in tokens):
            pts = 50 if set(tokens) == set(match_name_tokens(name)) else 35
            if pts > best_pts:
                best = identity
                best_pts = pts
                best_reason = 'Name found inside document text'
    return best, best_pts, best_reason

def find_recent_passport_identity_for_name(person_name, limit=40):
    """Link any document name to a recently ingested passport/ID / intake identity in CRM."""
    if not (person_name or '').strip():
        return None, 0, None
    rows = query_db(
        """
        SELECT d.id, d.user_id, d.company_id, d.category, d.match_meta_json, d.ch_status,
               u.full_name as client_name, c.name as company_name, c.company_number
        FROM documents d
        LEFT JOIN users u ON d.user_id = u.id
        LEFT JOIN companies c ON d.company_id = c.id
        WHERE COALESCE(d.is_posted, 0) = 0
          AND COALESCE(d.lifecycle_status, '') != 'QUARANTINE'
          AND (
                LOWER(COALESCE(d.category, '')) IN ('id document', 'passport')
                OR LOWER(COALESCE(d.review_notes, '')) LIKE '%smart document intake%'
              )
        ORDER BY d.id DESC
        LIMIT ?;
        """,
        (limit,),
    ) or []
    best = None
    best_pts = 0
    best_reason = None
    for row in rows:
        meta = {}
        if row.get('match_meta_json'):
            try:
                meta = json.loads(row['match_meta_json']) or {}
            except Exception:
                meta = {}
        candidates = [
            row.get('client_name'),
            meta.get('extracted_name'),
            meta.get('person_name'),
        ]
        for top in (meta.get('top_candidates') or []):
            if isinstance(top, dict) and top.get('officer_name'):
                candidates.append(top.get('officer_name'))
        for cand_name in candidates:
            ok, pts, reason = intake_person_names_match(person_name, cand_name)
            if ok and pts > best_pts:
                best_pts = pts
                best_reason = reason
                best = {
                    'full_name': cand_name,
                    'dob': meta.get('extracted_dob') or meta.get('dob'),
                    'nationality': meta.get('extracted_nationality') or meta.get('nationality'),
                    'client_id': row.get('user_id'),
                    'company_id': row.get('company_id'),
                    'company_name': row.get('company_name'),
                    'company_number': row.get('company_number'),
                    'source_document_id': row.get('id'),
                    'source': 'recent_id_or_intake',
                    'confidence': meta.get('confidence') or pts,
                }
    return best, best_pts, best_reason

def extract_document_text_and_metadata(filename, b64_content, high_quality=True):
    file_bytes, decode_err = decode_document_base64(b64_content)
    if decode_err or not file_bytes:
        return {'error': decode_err or 'Empty file'}

    file_hash = hashlib.sha256(file_bytes).hexdigest()
    # Bump when extraction changes, so files read before the change are read again
    ocr_version = 'v2.3-identity' if high_quality else 'v2.1'

    # SHA-256 Deduplication Cache Check (<5ms hit)
    cached_entry = query_db(
        "SELECT extracted_text, metadata_json FROM ocr_cache WHERE file_hash = ? AND processing_version = ?;",
        (file_hash, ocr_version),
        one=True,
    )
    if cached_entry:
        try:
            cached_meta = json.loads(cached_entry['metadata_json'])
            cached_meta['file_bytes'] = file_bytes
            cached_meta['file_hash'] = file_hash
            cached_meta['cached'] = True
            return cached_meta
        except Exception:
            pass

    filename_clean = (filename or 'document.pdf').strip()
    ext = os.path.splitext(filename_clean)[1].lower()
    scan_method = 'none'
    raw_text = ''

    if ext == '.pdf':
        raw_text, scan_method = _extract_pdf_text(file_bytes, high_quality=high_quality)
    elif ext in ('.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'):
        raw_text = _ocr_image_bytes(file_bytes, high_quality=high_quality)
        scan_method = 'ocr' if raw_text.strip() else 'none'
    elif ext in ('.doc', '.docx'):
        raw_text = _extract_docx_text(file_bytes)
        scan_method = 'docx-text' if raw_text.strip() else 'none'
    elif ext in ('.txt',):
        raw_text = _bytes_as_loose_text(file_bytes)
        scan_method = 'embedded-text'

    if not raw_text.strip():
        raw_text = _bytes_as_loose_text(file_bytes)
        if raw_text.strip() and scan_method == 'none':
            scan_method = 'embedded-text'

    combined_text = f"{filename_clean}\n{raw_text}"
    # Core identity triad — name, date of birth, nationality — drives matching.
    person_name = _extract_person_name(combined_text, filename_clean)
    dob = _extract_dob(combined_text)
    nationality = _extract_nationality(combined_text)
    company_number = _extract_company_number(combined_text, filename_clean)
    company_name = _extract_company_name(combined_text)
    email, phone = _extract_email_phone(combined_text)

    cat = _classify_intake_document(filename_clean, raw_text)
    is_passport = cat in ('ID Document', 'Passport') or 'passport' in filename_clean.lower() or _looks_like_passport_text(filename_clean, raw_text)
    if is_passport and cat == 'Company Documents':
        cat = 'ID Document'
    if cat == 'Bank statement':
        holder = _extract_bank_account_holder_name(combined_text)
        if holder:
            person_name = holder
        # The "Ltd/PLC" name on a statement is usually the bank itself; only a business account holder is the
        # customer's company
        business_holder = re.search(
            r'(?im)(?:account\s*(?:holder|name)|customer\s*name)\s*[:\-]?[ \t]*([^\r\n]*?\b(?:ltd|limited|llp|plc))\b',
            combined_text,
        )
        company_name = re.sub(r'\s+', ' ', business_holder.group(1)).strip(' ,.-') if business_holder else None
    passport_num = _parse_mrz_passport_num(combined_text) if is_passport else None
    # Identity documents: ignore noisy company numbers — match via name/DOB/nationality.
    identity_primary = is_passport or cat in ('ID Document', 'Passport')
    if identity_primary:
        company_number = None
        company_name = None
    doc_type = 'Passport' if is_passport else cat
    quality = _intake_extraction_quality(person_name, dob, passport_num, nationality, cat, scan_method, raw_text)

    result_dict = {
        'file_bytes': file_bytes,
        'file_hash': file_hash,
        'filename': filename_clean,
        'ext': ext,
        'category': cat,
        'doc_type': doc_type,
        'extracted_name': person_name,
        'extracted_dob': dob,
        'extracted_passport_num': passport_num,
        'extracted_nationality': nationality,
        'extracted_company_number': company_number,
        'extracted_company_name': company_name,
        'extracted_email': email,
        'extracted_phone': phone,
        'identity_primary': identity_primary,
        'scan_method': scan_method,
        'extraction_quality': quality,
        'text_preview': re.sub(r'\s+', ' ', raw_text).strip()[:1200],
        'cached': False,
        'high_quality_ocr': bool(high_quality),
    }

    # Save to ocr_cache table
    try:
        cache_copy = dict(result_dict)
        cache_copy.pop('file_bytes', None)
        execute_db("""
            INSERT OR REPLACE INTO ocr_cache (file_hash, extracted_text, metadata_json, processing_version)
            VALUES (?, ?, ?, ?);
        """, (file_hash, raw_text, json.dumps(cache_copy), ocr_version))
    except Exception:
        pass

    return result_dict

INTAKE_ALLOWED_EXTENSIONS = frozenset({
    '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.docx',
})

INTAKE_JUNK_BASENAMES = frozenset({
    '.ds_store', 'thumbs.db', 'desktop.ini', '.localized', 'ehthumbs.db',
})

_INTAKE_PASSPORT_RE = re.compile(r'passport', re.I)

_INTAKE_ID_CARD_RE = re.compile(
    r'(?:\bid\b[\s_-]?card|identity\s*card|national\s*id|cnic|nicop|\bnid\b|\bnic\b|id[\s_-]?verif)',
    re.I,
)

_INTAKE_LICENCE_RE = re.compile(r'driving\s*licen[cs]e|\bdvla\b|\blicen[cs]e\b', re.I)

_INTAKE_STATEMENT_RE = re.compile(
    r'bank\s*statement|\bstatement\b|account\s*statement|balance\s*statement',
    re.I,
)

_INTAKE_COMPANY_RE = re.compile(
    r'certificate\s*of\s*incorporat|incorporat|newinc|company[\s_-]?profile|'
    r'confirmation\s*statement|psc0[0-9]|ap0[0-9]|tm0[0-9]|\baa_|'
    r'memorandum|articles\s*of\s*association|companies\s*house|company\s*doc|'
    r'share\s*cert|officer|director\s*list|subscriber',
    re.I,
)

_INTAKE_COMPANY_NUM_RE = re.compile(
    r'(?:^|[^0-9A-Za-z])((?:SC|NI|OC|SO)\d{6}|\d{8})(?=[_\-\s.]|$)',
    re.I,
)

_INTAKE_BLOCKED_RE = re.compile(r'\breceipt\b', re.I)

_INTAKE_INVOICE_RE = re.compile(r'invoice|tax\s*invoice', re.I)

_INTAKE_CONTENT_INVOICE_RE = re.compile(
    r'\binvoice\b|\btax invoice\b|\breceipt\b|\bamount due\b|\bvat number\b',
    re.I,
)

INTAKE_ID_KINDS = frozenset({'Passport', 'Identity Card', 'Driving Licence'})

INTAKE_ALLOWED_KINDS = frozenset({
    'Passport', 'Identity Card', 'Driving Licence',
    'Bank Statement', 'Company Document', 'Invoice',
})

def normalize_intake_document_kind(raw):
    text = re.sub(r'\s+', ' ', str(raw or '').strip()).lower()
    if not text or text in ('auto', 'auto-detect', 'document'):
        return None
    if text in ('passport',):
        return 'Passport'
    if text in ('identity card', 'id card', 'id', 'id document'):
        return 'Identity Card'
    if text in ('driving licence', 'driving license', 'licence', 'license'):
        return 'Driving Licence'
    if text in ('bank statement', 'statement'):
        return 'Bank Statement'
    if text in ('company document', 'company documents', 'company'):
        return 'Company Document'
    if text in ('invoice', 'invoices'):
        return 'Invoice'
    # Already-normalized labels
    for kind in INTAKE_ALLOWED_KINDS:
        if text == kind.lower():
            return kind
    return None

def intake_kind_to_category(kind):
    if kind in ('Passport', 'Identity Card', 'Driving Licence'):
        return 'ID Document'
    if kind == 'Bank Statement':
        return 'Bank statement'
    if kind == 'Invoice':
        return 'Invoice'
    if kind == 'Company Document':
        return 'Company Documents'
    return 'Company Documents'

def classify_intake_document_kind(path_label):
    text = str(path_label or '')
    if _INTAKE_PASSPORT_RE.search(text):
        return 'Passport'
    if _INTAKE_ID_CARD_RE.search(text):
        return 'Identity Card'
    if _INTAKE_LICENCE_RE.search(text):
        return 'Driving Licence'
    if _INTAKE_STATEMENT_RE.search(text):
        return 'Bank Statement'
    if _INTAKE_COMPANY_RE.search(text) or _INTAKE_COMPANY_NUM_RE.search(text):
        return 'Company Document'
    if _INTAKE_INVOICE_RE.search(text):
        return 'Invoice'
    return None

def classify_intake_document_kind_from_content(filename, text):
    """Detect allowed doc type from OCR/text when the filename is generic (e.g. Screenshot)."""
    blob = f"{filename or ''}\n{text or ''}"
    lower = blob.lower()
    if _looks_like_passport_text(filename, text) or _INTAKE_PASSPORT_RE.search(blob):
        return 'Passport'
    if (
        'islamic republic of pakistan' in lower
        or 'ministry of interior' in lower
        or re.search(r'p<[a-z]{3}[a-z<]+<<', lower)
        or 'given names' in lower and 'surname' in lower and 'nationality' in lower
    ):
        return 'Passport'
    if (
        _INTAKE_ID_CARD_RE.search(blob)
        or 'national identity' in lower
        or 'citizenship number' in lower
        or re.search(r'\b\d{5}-\d{7}-\d\b', blob)  # Pakistani CNIC
    ):
        return 'Identity Card'
    if _INTAKE_LICENCE_RE.search(blob) or 'driving licence' in lower or 'driving license' in lower:
        return 'Driving Licence'
    if (
        _INTAKE_STATEMENT_RE.search(blob)
        or 'sort code' in lower
        or 'iban' in lower
        or 'account number' in lower
        or 'account holder' in lower
    ):
        return 'Bank Statement'
    if (
        _INTAKE_COMPANY_RE.search(blob)
        or _INTAKE_COMPANY_NUM_RE.search(blob)
        or 'companies house' in lower
        or 'certificate of incorporation' in lower
    ):
        return 'Company Document'
    if _INTAKE_CONTENT_INVOICE_RE.search(blob):
        return 'Invoice'
    return classify_intake_document_kind(filename)

def assess_intake_file_relevance(
    filename, *, source_mode='CUSTOMER_UPLOADS', folder_path=None, size_bytes=None, forced_kind=None,
):
    """Return (ok: bool, reason: str). Screenshots allowed; invoices allowed when selected/detected."""
    path = str(folder_path or filename or '').strip() or 'document.pdf'
    base = os.path.basename(urllib.parse.unquote(str(filename or path)))
    lower_base = base.lower()
    lower_path = path.lower().replace('\\', '/')
    ext = os.path.splitext(base)[1].lower()
    mode = (source_mode or 'CUSTOMER_UPLOADS').strip().upper() or 'CUSTOMER_UPLOADS'
    forced = normalize_intake_document_kind(forced_kind)

    if ext not in INTAKE_ALLOWED_EXTENSIONS:
        return False, f'Unsupported type ({ext or "unknown"}) — use PDF, JPEG, PNG or Word (.docx)'
    if lower_base in INTAKE_JUNK_BASENAMES:
        return False, 'System/junk file'
    if any(part in lower_path for part in ('__macosx', '/.git/', '/.svn/', '/node_modules/', '/.trash/')):
        return False, 'Ignored folder path'
    if size_bytes is not None:
        try:
            size_n = int(size_bytes)
        except (TypeError, ValueError):
            size_n = None
        if size_n is not None and size_n < 800:
            return False, 'File too small / empty'
        if size_n is not None and size_n > 45 * 1024 * 1024:
            return False, 'File too large (max 45MB)'

    if forced:
        if mode == 'ID_ONLY_DISCOVERY' and forced not in INTAKE_ID_KINDS:
            return False, 'ID-Only mode: passport / ID card / driving licence only'
        return True, forced

    # Soft-skip bare receipts unless filename also looks like an invoice.
    if _INTAKE_BLOCKED_RE.search(f'{lower_path} {lower_base}') and not _INTAKE_INVOICE_RE.search(
        f'{lower_path} {lower_base}'
    ):
        return False, 'Receipts skipped — select Invoice type to include them'

    kind = classify_intake_document_kind(f'{lower_path} {lower_base}')
    if kind:
        if mode == 'ID_ONLY_DISCOVERY' and kind not in INTAKE_ID_KINDS:
            return False, 'ID-Only mode: passport / ID card / driving licence only'
        return True, kind

    # Generic Screenshot_*.png / camera images: queue and verify with OCR on process.
    if ext in INTAKE_ALLOWED_EXTENSIONS:
        return True, 'Scan queued — high-quality OCR will confirm document type'
    return False, 'Only passports, licences, ID cards, bank statements, company docs, or invoices'

DRIVE_IMPORT_MAX_FILES = 40
DRIVE_IMPORT_MAX_BYTES = 40 * 1024 * 1024
_DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'


def drive_import_available():
    """Google Drive links can be imported when the CRM's own Drive account is connected."""
    from services.google_drive_service import is_drive_configured
    return is_drive_configured()


def drive_id_from_link(url):
    """File or folder id from a Drive share link (…/folders/<id>, …/file/d/<id>/view, …?id=<id>) or a bare id."""
    text = str(url or '').strip()
    for pattern in (r'/folders/([\w-]{10,})', r'/file/d/([\w-]{10,})', r'/d/([\w-]{10,})', r'[?&]id=([\w-]{10,})'):
        match = re.search(pattern, text)
        if match:
            return match.group(1)
    return text if re.fullmatch(r'[\w-]{20,}', text) else None


def fetch_drive_link_files(url):
    """Download the files behind a Drive link for the intake queue: one file, or a folder with its sub-folders.

    Only files the CRM's Drive account can open are reached, so the link must be shared with that account.
    Returns (files, error): files = [{file_name, folder_path, mime_type, size, content_base64}].
    """
    from services.google_drive_service import get_drive_service
    if not drive_import_available():
        return None, 'Google Drive is not connected on the server, so links cannot be imported.'
    file_id = drive_id_from_link(url)
    if not file_id:
        return None, 'That does not look like a Google Drive file or folder link.'
    service = get_drive_service()
    try:
        from googleapiclient.http import MediaIoBaseDownload  # type: ignore
        import io
        root = service.files().get(
            fileId=file_id, fields='id,name,mimeType,size', supportsAllDrives=True,
        ).execute()
    except Exception as exc:
        status = getattr(getattr(exc, 'resp', None), 'status', None)
        if str(status) in ('403', '404'):
            return None, ('Google Drive could not open this link. Share the file or folder with the '
                          'Google account connected to the CRM, then try again.')
        return None, 'Google Drive could not be reached. Try again shortly.'

    found = []
    skipped = 0
    if root.get('mimeType') == _DRIVE_FOLDER_MIME:
        pending = [(root['id'], root.get('name') or 'Drive folder', 0)]
        while pending and len(found) < DRIVE_IMPORT_MAX_FILES:
            folder_id, folder_path, depth = pending.pop(0)
            page_token = None
            while True:
                listing = service.files().list(
                    q=f"'{folder_id}' in parents and trashed = false",
                    fields='nextPageToken, files(id,name,mimeType,size)',
                    pageSize=100, pageToken=page_token,
                    supportsAllDrives=True, includeItemsFromAllDrives=True,
                ).execute()
                for item in listing.get('files') or []:
                    if item.get('mimeType') == _DRIVE_FOLDER_MIME:
                        if depth < 3:
                            pending.append((item['id'], f"{folder_path}/{item.get('name')}", depth + 1))
                    else:
                        found.append((item, folder_path))
                page_token = listing.get('nextPageToken')
                if not page_token:
                    break
    else:
        found.append((root, ''))

    files = []
    total = 0
    for item, folder_path in found:
        name = item.get('name') or 'document'
        size = int(item.get('size') or 0)
        ext = os.path.splitext(name)[1].lower()
        # Google Docs/Sheets have no file to download; unsupported types and oversize files are left out
        if ext not in INTAKE_ALLOWED_EXTENSIONS or not size or size > 45 * 1024 * 1024:
            skipped += 1
            continue
        if len(files) >= DRIVE_IMPORT_MAX_FILES or total + size > DRIVE_IMPORT_MAX_BYTES:
            skipped += 1
            continue
        try:
            buffer = io.BytesIO()
            downloader = MediaIoBaseDownload(buffer, service.files().get_media(fileId=item['id'], supportsAllDrives=True))
            done = False
            while not done:
                _status, done = downloader.next_chunk()
        except Exception:
            skipped += 1
            continue
        data = buffer.getvalue()
        total += len(data)
        files.append({
            'file_name': name,
            'folder_path': f"{folder_path}/{name}" if folder_path else name,
            'mime_type': mimetypes.guess_type(name)[0] or 'application/octet-stream',
            'size': len(data),
            'content_base64': base64.b64encode(data).decode('ascii'),
        })
    if not files:
        return None, ('No PDF, image or Word files were found in this Drive link'
                      + (f' ({skipped} other file(s) left out).' if skipped else '.'))
    return {'files': files, 'skipped': skipped}, None


def process_smart_intake_files(files_data, user, batch_identities=None, source_mode='CUSTOMER_UPLOADS'):
    """
    Process one or more Smart Intake files.
    Each file is OCR'd and matched independently so mixed batches stay accurate
    and callers can process one file per HTTP request (avoids nginx 120s 504s).

    batch_identities: prior ID/passport identities from the same browser batch so
    any other document containing the same person name inherits that client + company
    (same form / same person filing).
    Returns (payload_dict, http_status_or_None).
    """
    if not files_data or not isinstance(files_data, list):
        return {'status': 'error', 'message': 'No files provided for intake'}, "400 Bad Request"

    identities = []
    for item in (batch_identities or []):
        if isinstance(item, dict) and (item.get('full_name') or item.get('client_id')):
            identities.append(dict(item))

    file_results = []
    filed_documents = []
    filing_errors = []
    skipped_irrelevant = []
    last_client = None
    last_company = None
    last_match_meta = {}
    last_ch_status = 'no_ch_match'
    last_ch_msg = ''
    last_dob = None
    last_nationality = None
    any_ocr = False
    methods = []

    for file_item in files_data:
        fname = (file_item.get('file_name') or 'document.pdf').strip()
        folder_path = (file_item.get('folder_path') or fname).strip()
        forced_kind = normalize_intake_document_kind(
            file_item.get('document_type')
            or file_item.get('forced_document_type')
        )
        allowed_types = []
        raw_allowed = file_item.get('allowed_types')
        if isinstance(raw_allowed, str) and raw_allowed.strip():
            try:
                raw_allowed = json.loads(raw_allowed)
            except Exception:
                raw_allowed = [p.strip() for p in raw_allowed.split(',') if p.strip()]
        if isinstance(raw_allowed, (list, tuple)):
            for item in raw_allowed:
                kind = normalize_intake_document_kind(item)
                if kind and kind not in allowed_types:
                    allowed_types.append(kind)
        hq_ocr = str(file_item.get('hq_ocr') if file_item.get('hq_ocr') is not None else '1').strip().lower() not in (
            '0', 'false', 'no', '',
        )
        b64 = file_item.get('file_content_base64', '')
        size_bytes = None
        if b64:
            try:
                size_bytes = int(len(b64) * 0.75)
            except Exception:
                size_bytes = None
        ok_relevant, reason = assess_intake_file_relevance(
            fname,
            source_mode=source_mode,
            folder_path=folder_path,
            size_bytes=size_bytes,
            forced_kind=forced_kind,
        )
        if not ok_relevant:
            skipped_irrelevant.append({'file_name': fname, 'reason': reason})
            filing_errors.append(f"{fname}: skipped — {reason}")
            file_results.append({
                'file_name': fname,
                'filing_status': {'status': 'skipped', 'message': reason},
                'document_processing': {'status': 'skipped', 'reason': reason},
                'companies_house_matching': {'status': 'not_applicable', 'message': reason},
            })
            continue
        res = extract_document_text_and_metadata(fname, b64, high_quality=hq_ocr)
        if 'error' in res:
            filing_errors.append(f"{fname}: {res.get('error')}")
            file_results.append({
                'file_name': fname,
                'filing_status': {'status': 'failed', 'message': res.get('error')},
                'document_processing': {'status': 'failed'},
                'companies_house_matching': {'status': 'failed', 'message': res.get('error')},
            })
            continue

        # Confirm allowed type from OCR when filename was generic (Screenshot / photo).
        content_kind = None
        if res.get('doc_type') in ('Passport', 'ID Document') or res.get('category') == 'ID Document':
            content_kind = 'Passport'
        elif res.get('category') == 'Bank statement':
            content_kind = 'Bank Statement'
        elif res.get('category') == 'Invoice':
            content_kind = 'Invoice'
        elif res.get('extracted_company_number') or res.get('extracted_company_name'):
            content_kind = 'Company Document'
        elif res.get('extracted_passport_num') or (
            res.get('extracted_name') and res.get('extracted_dob') and res.get('extracted_nationality')
        ):
            content_kind = 'Passport'
        if not content_kind:
            content_kind = classify_intake_document_kind_from_content(
                fname, res.get('text_preview') or '',
            )
        name_kind = classify_intake_document_kind(f'{folder_path} {fname}')
        # Admin-selected type wins; otherwise filename then OCR content.
        final_kind = forced_kind or name_kind or content_kind

        def _kind_matches_allowed(k, allowed):
            if not k:
                return False
            if k in allowed:
                return True
            if k in INTAKE_ID_KINDS and any(a in INTAKE_ID_KINDS for a in allowed):
                return True
            return False

        if allowed_types:
            if forced_kind and _kind_matches_allowed(forced_kind, allowed_types):
                final_kind = forced_kind
            elif final_kind and not _kind_matches_allowed(final_kind, allowed_types):
                skip_msg = (
                    f'Skipped ({final_kind}) — not in selected options: '
                    + ', '.join(allowed_types)
                )
                skipped_irrelevant.append({'file_name': fname, 'reason': skip_msg})
                filing_errors.append(f"{fname}: skipped — {skip_msg}")
                file_results.append({
                    'file_name': fname,
                    'filing_status': {'status': 'skipped', 'message': skip_msg},
                    'document_processing': {'status': 'skipped', 'reason': skip_msg},
                    'companies_house_matching': {'status': 'not_applicable', 'message': skip_msg},
                })
                continue
            elif not final_kind:
                skip_msg = (
                    'Not recognised within selected options: '
                    + ', '.join(allowed_types)
                )
                skipped_irrelevant.append({'file_name': fname, 'reason': skip_msg})
                filing_errors.append(f"{fname}: skipped — {skip_msg}")
                file_results.append({
                    'file_name': fname,
                    'filing_status': {'status': 'skipped', 'message': skip_msg},
                    'document_processing': {'status': 'skipped', 'reason': skip_msg},
                    'companies_house_matching': {'status': 'not_applicable', 'message': skip_msg},
                })
                continue
        if not final_kind:
            skip_msg = (
                'Not recognised as passport, ID card, driving licence, bank statement, '
                'company document, or invoice — pick a type and retry'
            )
            skipped_irrelevant.append({'file_name': fname, 'reason': skip_msg})
            filing_errors.append(f"{fname}: skipped — {skip_msg}")
            file_results.append({
                'file_name': fname,
                'filing_status': {'status': 'skipped', 'message': skip_msg},
                'document_processing': {'status': 'skipped', 'reason': skip_msg},
                'companies_house_matching': {'status': 'not_applicable', 'message': skip_msg},
            })
            continue
        if (source_mode or '').upper() == 'ID_ONLY_DISCOVERY' and final_kind not in INTAKE_ID_KINDS:
            skip_msg = 'ID-Only mode: passport / ID card / driving licence only'
            skipped_irrelevant.append({'file_name': fname, 'reason': skip_msg})
            filing_errors.append(f"{fname}: skipped — {skip_msg}")
            file_results.append({
                'file_name': fname,
                'filing_status': {'status': 'skipped', 'message': skip_msg},
                'document_processing': {'status': 'skipped', 'reason': skip_msg},
                'companies_house_matching': {'status': 'not_applicable', 'message': skip_msg},
            })
            continue

        extracted_client_name = res.get('extracted_name')
        extracted_dob = res.get('extracted_dob')
        extracted_company_name = res.get('extracted_company_name')
        extracted_company_num = res.get('extracted_company_number')
        extracted_email = res.get('extracted_email')
        extracted_phone = res.get('extracted_phone')
        extracted_nat = res.get('extracted_nationality')
        cat = intake_kind_to_category(final_kind) if final_kind else (res.get('category') or 'Company Documents')
        is_bank_statement = cat == 'Bank statement' or final_kind == 'Bank Statement'
        is_passport_doc = (
            (res.get('doc_type') in ('Passport', 'ID Document'))
            or (cat in ('ID Document', 'Passport'))
            or final_kind in INTAKE_ID_KINDS
            or bool(res.get('identity_primary'))
        )
        # ID / passport / licence: match only from name + DOB + nationality.
        if is_passport_doc:
            extracted_company_name = None
            extracted_company_num = None
        any_ocr = any_ocr or (res.get('scan_method') == 'ocr')
        methods.append(res.get('scan_method'))

        linked_identity = None
        linked_pts = 0
        linked_reason = None
        if extracted_client_name:
            linked_identity, linked_pts, linked_reason = find_batch_identity_for_name(
                extracted_client_name, identities
            )
            # Any non-ID supporting doc can also match a recent ID/passport in CRM
            if not linked_identity and not is_passport_doc:
                linked_identity, linked_pts, linked_reason = find_recent_passport_identity_for_name(
                    extracted_client_name
                )
        if not linked_identity and identities:
            text_blob = ' '.join([
                fname,
                res.get('text_preview') or '',
                extracted_company_name or '',
            ])
            linked_identity, linked_pts, linked_reason = find_identity_mentioned_in_text(
                text_blob, identities
            )
            if linked_identity and not extracted_client_name:
                extracted_client_name = linked_identity.get('full_name')

        # Prefer the ID/passport identity's stronger DOB/nationality when names match.
        if linked_identity:
            if not extracted_dob and linked_identity.get('dob'):
                extracted_dob = linked_identity.get('dob')
            if not extracted_nat and linked_identity.get('nationality'):
                extracted_nat = linked_identity.get('nationality')

        preferred_client_id = None
        if linked_identity and linked_identity.get('client_id'):
            preferred_client_id = linked_identity.get('client_id')

        if preferred_client_id:
            client_user = query_db("SELECT * FROM users WHERE id = ?;", (preferred_client_id,), one=True)
            if not client_user:
                client_user = ensure_smart_intake_client(
                    extracted_name=extracted_client_name or linked_identity.get('full_name'),
                    extracted_email=extracted_email,
                    extracted_phone=extracted_phone,
                )
        else:
            client_user = ensure_smart_intake_client(
                extracted_name=extracted_client_name,
                extracted_email=extracted_email,
                extracted_phone=extracted_phone,
            )
        if not client_user or not client_user.get('id'):
            filing_errors.append(f"{fname}: could not create client profile")
            file_results.append({
                'file_name': fname,
                'filing_status': {'status': 'failed', 'message': 'Could not create client profile'},
                'document_processing': {
                    'status': 'success',
                    'doc_detected': res.get('doc_type') or res.get('category'),
                    'extracted_name': extracted_client_name,
                    'extracted_dob': extracted_dob,
                    'passport_number': res.get('extracted_passport_num'),
                    'nationality': extracted_nat,
                    'extraction_quality': res.get('extraction_quality') or {},
                    'text_preview': res.get('text_preview') or '',
                },
                'companies_house_matching': {'status': 'failed', 'message': 'Client profile missing'},
            })
            continue

        client_id = client_user['id']
        name_detected = bool(extracted_client_name)
        last_client = client_user
        last_dob = extracted_dob or last_dob
        last_nationality = extracted_nat or last_nationality

        company_obj = None
        ch_status = 'no_ch_match'
        ch_msg = 'No Companies House match from name / date of birth / nationality yet.'
        ch_candidates = []
        match_meta = {
            'confidence': 0,
            'confidence_label': 'LOW',
            'score': 0,
            'reasons': [],
            'score_gap': 0,
            'top_candidates': [],
            'extracted_name': extracted_client_name,
            'extracted_dob': extracted_dob,
            'extracted_nationality': extracted_nat,
            'match_basis': 'name_dob_nationality',
        }

        id_only_intake = is_passport_doc and not (extracted_company_num or extracted_company_name)

        # Same person / same form: reuse company already matched to the ID/passport name.
        if linked_identity and linked_identity.get('company_id') and not (
            extracted_company_num or extracted_company_name
        ):
            company_obj = query_db(
                "SELECT * FROM companies WHERE id = ?;",
                (linked_identity['company_id'],),
                one=True,
            )
            if company_obj:
                ch_status = 'matched'
                ch_msg = (
                    f"Matched from identity (name"
                    f"{' + DOB' if extracted_dob or linked_identity.get('dob') else ''}"
                    f"{' + nationality' if extracted_nat or linked_identity.get('nationality') else ''}"
                    f") → {company_obj.get('name')}"
                )
                match_meta = {
                    'confidence': max(80, int(linked_identity.get('confidence') or linked_pts or 80)),
                    'confidence_label': 'HIGH',
                    'score': max(80, int(linked_identity.get('confidence') or linked_pts or 80)),
                    'reasons': [
                        f"Name matched prior ID/passport ({linked_reason or 'name match'})",
                        'Company linked from name / DOB / nationality identity',
                    ],
                    'score_gap': 80,
                    'top_candidates': [{
                        'name': company_obj.get('name'),
                        'company_number': company_obj.get('company_number'),
                        'score': max(80, int(linked_identity.get('confidence') or 80)),
                        'confidence_label': 'HIGH',
                        'reasons': ['Matched via name + DOB + nationality'],
                    }],
                    'extracted_name': extracted_client_name,
                    'extracted_dob': extracted_dob,
                    'extracted_nationality': extracted_nat,
                    'match_basis': 'name_dob_nationality',
                    'linked_from': linked_identity.get('source') or 'batch_id',
                    'linked_document_id': linked_identity.get('source_document_id'),
                    'same_person_form': True,
                }

        if not company_obj and (extracted_company_num or extracted_company_name) and not is_passport_doc:
            company_obj, doc_confidence, reasons, no_match_msg = match_company_from_document(
                extracted_company_name,
                extracted_company_num,
                client_user_id=client_id,
            )
            if company_obj:
                ch_status = 'matched'
                ch_msg = f"Automatically matched {company_obj['name']} (#{company_obj.get('company_number', '')})"
                if linked_identity:
                    reasons.insert(0, f"Same person as ID/passport ({linked_identity.get('full_name')})")
                confidence_label = 'HIGH' if doc_confidence >= 80 else 'MEDIUM' if doc_confidence >= 60 else 'LOW'
                match_meta = {
                    'confidence': doc_confidence,
                    'confidence_label': confidence_label,
                    'score': doc_confidence,
                    'reasons': reasons,
                    'score_gap': doc_confidence,
                    'top_candidates': [{
                        'name': company_obj.get('name'),
                        'company_number': company_obj.get('company_number'),
                        'score': doc_confidence,
                        'confidence_label': confidence_label,
                        'reasons': reasons,
                    }],
                    'extracted_name': extracted_client_name,
                    'extracted_dob': extracted_dob,
                    'extracted_nationality': extracted_nat,
                    'match_basis': 'company_number_or_name',
                    'same_person_form': bool(linked_identity),
                }
            else:
                ch_status = 'no_ch_match'
                ch_msg = no_match_msg or 'No Companies House match found for company name/number.'
        elif not company_obj and extracted_client_name:
            resolve_dob = extracted_dob or (linked_identity or {}).get('dob')
            resolve_nat = extracted_nat or (linked_identity or {}).get('nationality')
            company_obj, ch_status, ch_msg, ch_candidates, match_meta = resolve_intake_company_match(
                client_id,
                extracted_client_name,
                extracted_dob=resolve_dob,
                extracted_nationality=resolve_nat,
                actor=user,
            )
            match_meta = match_meta or {}
            match_meta['extracted_name'] = extracted_client_name
            match_meta['extracted_dob'] = resolve_dob
            match_meta['extracted_nationality'] = resolve_nat
            match_meta['match_basis'] = 'name_dob_nationality'
            if company_obj and ch_status == 'matched':
                ch_msg = (
                    f"Matched from name"
                    f"{' + DOB' if resolve_dob else ''}"
                    f"{' + nationality' if resolve_nat else ''}"
                    f" → {company_obj.get('name')}"
                )
            if linked_identity:
                reasons = list(match_meta.get('reasons') or [])
                reasons.insert(0, f"Same person as ID/passport ({linked_reason or 'name match'})")
                match_meta['reasons'] = reasons
                match_meta['same_person_form'] = True
        elif not company_obj and id_only_intake:
            ch_status = 'not_applicable'
            ch_msg = 'Passport/ID processed. Need name (and ideally DOB / nationality) to find Companies House details.'

        company_id = company_obj['id'] if company_obj else None
        last_company = company_obj
        last_match_meta = match_meta or {}
        last_ch_status = ch_status
        last_ch_msg = ch_msg

        ext = res['ext']
        file_bytes = res['file_bytes']
        doc_type = final_kind or res.get('doc_type', cat)
        doc_id = None
        store_err = None

        target_path, store_err = store_client_document_file(client_id, None, ext, file_bytes, fname)
        if store_err or not target_path:
            filing_errors.append(f"{fname}: {store_err or 'could not save file'}")
        else:
            file_size_str = format_document_size(len(file_bytes))
            f_hash = res.get('file_hash') or hashlib.sha256(file_bytes).hexdigest()
            stage_ts = json.dumps({'upload': time.time(), 'ocr': time.time(), 'ch': time.time()})
            meta_json = json.dumps(match_meta)
            # Successful intake always lands in Customer Uploads for staff triage.
            # OCR / CH match evidence is kept on the row; only duplicates go to Quarantine.
            overall_st = 'COMPLETED' if ch_status == 'matched' else (
                'REVIEW_REQUIRED' if ch_status == 'review_required' else 'COMPLETED'
            )
            lifecycle = 'CUSTOMER_UPLOADS'
            company_conf = float((match_meta or {}).get('confidence') or 0)
            identity_conf = 40.0
            if extracted_client_name:
                identity_conf += 30.0
            if extracted_dob:
                identity_conf += 15.0
            if extracted_nat:
                identity_conf += 15.0
            if linked_identity:
                identity_conf = max(identity_conf, 85.0)
            identity_conf = min(100.0, identity_conf)
            ocr_conf = float(((res.get('extraction_quality') or {}).get('score') or 70))
            prior = find_document_by_file_hash(f_hash)
            dup_conf = 0.0
            if prior:
                lifecycle = 'QUARANTINE'
                dup_conf = 100.0
                overall_st = 'QUARANTINE'
            customer_conf = 95.0 if linked_identity else (80.0 if name_detected else 40.0)
            doc_id = execute_db("""
                INSERT INTO documents (
                    user_id, company_id, name, category, file_path, file_type, file_size, status, uploaded_by, review_notes, client_visible, shared_at,
                    file_hash, ocr_status, identity_status, crm_status, ch_status, overall_status, stage_timestamps_json, match_meta_json,
                    lifecycle_status, is_posted, ocr_confidence, classification_confidence, identity_confidence,
                    customer_match_confidence, company_match_confidence, duplicate_confidence,
                    uploaded_at, processed_at, matched_at, uploaded_by_id, processed_by_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending Review', ?, 'Smart Document Intake', 0, NULL,
                        ?, 'COMPLETED', 'COMPLETED', ?, ?, ?, ?, ?,
                        ?, 0, ?, ?, ?, ?, ?, ?,
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?);
            """, (
                client_id, company_id, fname, cat, target_path,
                DOCUMENT_TYPE_LABELS.get(ext, 'Document'), file_size_str, user['full_name'],
                f_hash, 'MATCHED' if name_detected or linked_identity else 'UNASSIGNED', ch_status, overall_st, stage_ts, meta_json,
                lifecycle,
                ocr_conf, 85.0, identity_conf,
                customer_conf, company_conf, dup_conf,
                user['id'], user['id'],
            ))
            _apply_drive_link(doc_id)
            log_document_audit(
                doc_id, 'AI', user['id'], user.get('full_name'), 'INTAKE_STORED',
                None, lifecycle, {
                    'ch_status': ch_status,
                    'company_match_confidence': company_conf,
                    'duplicate_confidence': dup_conf,
                    'linked_passport': bool(linked_identity),
                    'linked_reason': linked_reason,
                    'stored_in': 'CUSTOMER_UPLOADS' if lifecycle == 'CUSTOMER_UPLOADS' else lifecycle,
                },
            )
            filed_documents.append({
                'id': doc_id,
                'name': fname,
                'category': cat,
                'file_size': file_size_str,
                'scan_method': res.get('scan_method') or 'none',
                'lifecycle_status': lifecycle,
                'client_id': client_id,
                'company_id': company_id,
                'linked_passport': bool(linked_identity),
            })

            # Grow batch identity registry (passports first, also statements that resolve a company)
            if extracted_client_name or (linked_identity and linked_identity.get('full_name')):
                identity_record = {
                    'full_name': extracted_client_name or linked_identity.get('full_name'),
                    'dob': extracted_dob or (linked_identity or {}).get('dob'),
                    'nationality': extracted_nat or (linked_identity or {}).get('nationality'),
                    'client_id': client_id,
                    'company_id': company_id,
                    'company_name': company_obj.get('name') if company_obj else (linked_identity or {}).get('company_name'),
                    'company_number': (
                        (company_obj.get('company_number') or company_obj.get('companies_house_number'))
                        if company_obj else (linked_identity or {}).get('company_number')
                    ),
                    'source_document_id': doc_id,
                    'source': 'passport' if is_passport_doc else ('bank_statement' if is_bank_statement else 'document'),
                    'confidence': match_meta.get('confidence') or linked_pts or 0,
                }
                # Replace weaker same-name identity; keep passport entries preferred.
                replaced = False
                for idx, existing in enumerate(identities):
                    ok, pts, _ = intake_person_names_match(existing.get('full_name'), identity_record['full_name'])
                    if ok:
                        if is_passport_doc or not existing.get('company_id'):
                            identities[idx] = {**existing, **{k: v for k, v in identity_record.items() if v}}
                        elif identity_record.get('company_id') and not existing.get('company_id'):
                            identities[idx] = {**existing, **{k: v for k, v in identity_record.items() if v}}
                        replaced = True
                        break
                if not replaced:
                    identities.append(identity_record)

        file_results.append({
            'file_name': fname,
            'file_size': format_document_size(len(file_bytes)),
            'doc_type': doc_type,
            'scan_method': res.get('scan_method') or 'none',
            'extraction_quality': res.get('extraction_quality') or {},
            'text_preview': res.get('text_preview') or '',
            'document_processing': {
                'status': 'success',
                'doc_detected': doc_type,
                'extracted_name': extracted_client_name,
                'extracted_dob': extracted_dob,
                'passport_number': res.get('extracted_passport_num'),
                'nationality': extracted_nat,
                'extraction_quality': res.get('extraction_quality') or {},
                'text_preview': res.get('text_preview') or '',
                'linked_passport_name': (linked_identity or {}).get('full_name') if linked_identity else None,
            },
            'client_matching': {
                'status': 'matched' if name_detected or linked_identity else 'unassigned',
                'client_id': client_id,
                'client_name': client_user.get('full_name') or 'Unassigned Document Intake',
                'email': client_user.get('email'),
                'linked_from_passport': bool(linked_identity),
            },
            'companies_house_matching': {
                'status': ch_status,
                'company_name': company_obj['name'] if company_obj else None,
                'company_number': (
                    company_obj.get('company_number') or company_obj.get('companies_house_number')
                    if company_obj else None
                ),
                'message': ch_msg,
                'candidates': ch_candidates,
                'confidence': match_meta.get('confidence'),
                'confidence_label': match_meta.get('confidence_label'),
                'score': match_meta.get('score'),
                'score_gap': match_meta.get('score_gap'),
                'reasons': match_meta.get('reasons') or [],
                'top_candidates': match_meta.get('top_candidates') or ch_candidates or [],
                'linked_from_passport': bool(linked_identity),
            },
            'filing_status': {
                'status': 'auto_filed' if doc_id else 'failed',
                'doc_id': doc_id,
                'message': (
                    f"Auto-filed to Client #{client_id}" if doc_id
                    else (store_err or 'Filing failed')
                ),
            },
        })

    if not filed_documents and not file_results:
        return {'status': 'error', 'message': 'Could not parse uploaded files'}, "400 Bad Request"

    if not filed_documents:
        if skipped_irrelevant and len(skipped_irrelevant) == len(file_results):
            return {
                'status': 'error',
                'message': 'No relevant documents to process. Only bank statements, driving licences, company docs, passports, or ID cards (PDF/image) are accepted.',
                'skipped_irrelevant': skipped_irrelevant,
                'file_results': file_results,
                'filed_documents': [],
                'batch_identities': identities,
            }, "400 Bad Request"
        detail = '; '.join(filing_errors[:3]) if filing_errors else 'Unknown storage error'
        return {
            'status': 'error',
            'message': f'Scanned the file(s) but could not save them to storage: {detail}',
            'file_results': file_results,
            'filed_documents': [],
            'batch_identities': identities,
            'skipped_irrelevant': skipped_irrelevant,
        }, "500 Internal Server Error"

    if filed_documents:
        log_activity(
            user,
            'SMART_INTAKE',
            'documents',
            str(filed_documents[0]['id']),
            f"Processed Smart Intake ({len(filed_documents)} files)",
        )

    client_user = last_client or {}
    company_obj = last_company
    match_meta = last_match_meta or {}
    missing_fields = []
    if 'brixen-pending.local' in (client_user.get('email') or ''):
        missing_fields.append('Email Address')
    if client_user and not client_user.get('phone'):
        missing_fields.append('Phone Number')

    msg = f"Smart Intake stored {len(filed_documents)} document(s) in Customer Uploads."
    if filing_errors:
        msg += f" {len(filing_errors)} file(s) failed."
    if skipped_irrelevant:
        msg += f" {len(skipped_irrelevant)} irrelevant file(s) skipped (not stored)."
    linked_count = sum(1 for fr in file_results if (fr.get('companies_house_matching') or {}).get('linked_from_passport'))
    if linked_count:
        msg += f" {linked_count} filed on the same person form via ID/passport name match."

    return {
        'status': 'success',
        'message': msg,
        'scan': {'ocr_used': any_ocr, 'methods': methods},
        'client': {
            'id': client_user.get('id'),
            'full_name': client_user.get('full_name') or 'Unassigned Document Intake',
            'dob': last_dob or 'Not detected',
            'nationality': last_nationality or 'Not detected',
            'email': client_user.get('email'),
        },
        'company': {
            'id': company_obj['id'] if company_obj else None,
            'name': company_obj['name'] if company_obj else None,
            'company_number': (
                company_obj.get('companies_house_number') or company_obj.get('company_number')
                if company_obj else None
            ),
            'ch_status': last_ch_status,
            'ch_message': last_ch_msg,
            'confidence': match_meta.get('confidence'),
            'confidence_label': match_meta.get('confidence_label'),
            'match_score': match_meta.get('score'),
            'match_reasons': match_meta.get('reasons') or [],
            'top_candidates': match_meta.get('top_candidates') or [],
        },
        'missing_fields': missing_fields,
        'file_results': file_results,
        'filed_documents': filed_documents,
        'batch_identities': identities,
        'skipped_irrelevant': skipped_irrelevant,
    }, None

def auto_import_companies_house_from_intake(company_name, company_number, client_user_id=None, search_by_name=True):
    """Find or create the company. Without a number, `search_by_name` takes the first Companies House result for
    the name (staff picked it by hand); Smart Intake passes False and checks the name itself (match_company_from_document)."""
    ch_num = normalize_company_number(company_number) if company_number else None
    if not ch_num and company_name and search_by_name:
        matches, _err = search_companies_house(company_name)
        if matches and len(matches) > 0:
            ch_num = matches[0].get('company_number')
            
    uid = client_user_id or 1
    if not ch_num:
        if company_name:
            existing_by_name = query_db("SELECT * FROM companies WHERE lower(name) = lower(?);", (company_name.strip(),), one=True)
            if existing_by_name:
                if client_user_id and not existing_by_name.get('user_id'):
                    execute_db("UPDATE companies SET user_id = ? WHERE id = ?;", (client_user_id, existing_by_name['id']))
                return query_db("SELECT * FROM companies WHERE id = ?;", (existing_by_name['id'],), one=True)
            comp_id = execute_db("""
                INSERT INTO companies (user_id, name, company_number, status, inc_date, director, reg_office, created_at)
                VALUES (?, ?, ?, 'Active', DATE('now'), 'Director', 'United Kingdom', CURRENT_TIMESTAMP);
            """, (uid, company_name.strip(), f"REG-{secrets.token_hex(4).upper()}"))
            return query_db("SELECT * FROM companies WHERE id = ?;", (comp_id,), one=True)
        return None
        
    existing = query_db("SELECT * FROM companies WHERE company_number = ?;", (ch_num,), one=True)
    if existing:
        if client_user_id and not existing.get('user_id'):
            execute_db("UPDATE companies SET user_id = ? WHERE id = ?;", (client_user_id, existing['id']))
        return query_db("SELECT * FROM companies WHERE id = ?;", (existing['id'],), one=True)
        
    profile, err = fetch_companies_house_profile(ch_num)
    if profile:
        comp_id = execute_db("""
            INSERT INTO companies (user_id, name, company_number, status, inc_date, director, reg_office, created_at)
            VALUES (?, ?, ?, ?, ?, 'Director', ?, CURRENT_TIMESTAMP);
        """, (
            uid,
            profile.get('name') or company_name or 'Companies House Entity',
            ch_num,
            profile.get('status') or 'Active',
            profile.get('incorporation_date') or '2026-01-01',
            profile.get('registered_address') or 'United Kingdom'
        ))
        apply_companies_house_profile_to_company(comp_id, profile)
        return query_db("SELECT * FROM companies WHERE id = ?;", (comp_id,), one=True)
        
    comp_id = execute_db("""
        INSERT INTO companies (user_id, name, company_number, status, inc_date, director, reg_office, created_at)
        VALUES (?, ?, ?, 'Active', DATE('now'), 'Director', 'United Kingdom', CURRENT_TIMESTAMP);
    """, (uid, company_name or f"Company #{ch_num}", ch_num))
    return query_db("SELECT * FROM companies WHERE id = ?;", (comp_id,), one=True)


def _official_company_name(company_number):
    """(name, checked) for a company number: the CRM's record, else Companies House. checked=False when Companies
    House could not be asked (no key, down), so the number could not be confirmed either way."""
    existing = query_db("SELECT name FROM companies WHERE company_number = ?;", (company_number,), one=True)
    if existing and existing.get('name'):
        return existing['name'], True
    if not companies_house_api_key():
        return None, False
    profile, err = fetch_companies_house_profile(company_number)
    if profile:
        return profile.get('name'), True
    return None, err == 'Company not found at Companies House'


def _company_by_name_at_companies_house(company_name):
    """Companies House result whose name is the same company as `company_name` (not just the first hit)."""
    if not company_name or not companies_house_api_key():
        return None
    matches, _err = search_companies_house(company_name)
    for match in matches or []:
        if match.get('company_number') and company_names_agree(company_name, match.get('name')):
            return match
    return None


def match_company_from_document(company_name, company_number, client_user_id=None):
    """Link a company read from a document, checking the number against the name.

    OCR can misread one digit of a company number, which points at someone else's company, so the number is
    trusted only when its Companies House name matches the name on the document (or no name was read).
    Returns (company_row or None, confidence 0-100, reasons, message).
    """
    number = normalize_company_number(company_number) if company_number else None
    name = (company_name or '').strip() or None

    if number:
        official, checked = _official_company_name(number)
        if official and name and company_names_agree(name, official):
            company = auto_import_companies_house_from_intake(name, number, client_user_id=client_user_id)
            return company, 100, ['Company number and name on the document match Companies House'], None
        if official and not name:
            company = auto_import_companies_house_from_intake(None, number, client_user_id=client_user_id)
            return company, 85, ['Company number on the document (no company name read to double-check)'], None
        if official and name:
            by_name = _company_by_name_at_companies_house(name)
            if by_name:
                company = auto_import_companies_house_from_intake(
                    by_name.get('name'), by_name['company_number'], client_user_id=client_user_id,
                )
                return company, 80, [
                    f"Number {number} on the document belongs to {official}, so the company was matched by its name",
                ], None
            return None, 0, [], (
                f"Company number {number} belongs to {official}, but the document names {name}. "
                "Check the document and link the company by hand."
            )
        if not checked:
            # Companies House could not be asked: keep the number, flagged for review
            company = auto_import_companies_house_from_intake(name, number, client_user_id=client_user_id)
            return company, 60, ['Company number on the document, not checked at Companies House'], None
        # The number is not at Companies House (misread, or a company still being formed): fall back to the name

    if name:
        by_name = _company_by_name_at_companies_house(name)
        if by_name:
            company = auto_import_companies_house_from_intake(
                by_name.get('name'), by_name['company_number'], client_user_id=client_user_id,
            )
            return company, 90, ['Company name on the document matches Companies House'], None
        # Not registered (yet): the CRM's own record with this name, or a pending company to check later
        company = auto_import_companies_house_from_intake(
            name, None, client_user_id=client_user_id, search_by_name=False,
        )
        if company:
            return company, 50, ['Company name on the document; not found at Companies House (pending)'], None
    return None, 0, [], 'No Companies House match found for the company name or number.'

def companies_house_registered_office(address):
    if not isinstance(address, dict):
        return 'United Kingdom'
    parts = [
        address.get('premises'),
        address.get('address_line_1'),
        address.get('address_line_2'),
        address.get('locality') or address.get('region'),
        address.get('postal_code'),
        address.get('country'),
    ]
    text = ', '.join(str(part).strip() for part in parts if part and str(part).strip())
    return text or 'United Kingdom'

def companies_house_iso_date(value):
    text = str(value or '').strip()[:10]
    if len(text) == 10 and text[4] == '-' and text[7] == '-':
        try:
            datetime.date.fromisoformat(text)
            return text
        except ValueError:
            return ''
    return ''

def is_companies_house_default_address(office, postcode=None):
    blob = ' '.join(str(part or '') for part in (office, postcode)).lower()
    compact = re.sub(r'[^a-z0-9]', '', blob)
    if 'companieshousedefaultaddress' in compact:
        return True
    if 'pobox4385' in compact and 'cf148lh' in compact:
        return True
    return False

def companies_house_date_is_due(due_date, today=None, *, overdue_only=False):
    due = companies_house_iso_date(due_date)
    if not due:
        return False
    day = (today or datetime.date.today()).isoformat()
    return due < day if overdue_only else due <= day

def companies_house_flag_due(flag, due_date, today=None, *, overdue_only=False):
    if flag:
        return True
    return companies_house_date_is_due(due_date, today=today, overdue_only=overdue_only)

def companies_house_strike_off_proposed(status=None, status_detail=None):
    blob = f"{status or ''} {status_detail or ''}".lower().replace('_', '-')
    return 'strike-off' in blob or 'strike off' in blob

def public_companies_house_profile(data):
    if not isinstance(data, dict):
        return None
    name = (data.get('company_name') or '').strip()
    number = str(data.get('company_number') or '').strip()
    if not name or not number:
        return None
    accounts = data.get('accounts') if isinstance(data.get('accounts'), dict) else {}
    confirmation = data.get('confirmation_statement') if isinstance(data.get('confirmation_statement'), dict) else {}
    office = companies_house_registered_office(data.get('registered_office_address'))
    postcode = str((data.get('registered_office_address') or {}).get('postal_code') or '').strip()
    accounts_due = companies_house_iso_date(accounts.get('next_due') or (accounts.get('next_accounts') or {}).get('due_on'))
    next_accounts = accounts.get('next_accounts') if isinstance(accounts.get('next_accounts'), dict) else {}
    last_accounts = accounts.get('last_accounts') if isinstance(accounts.get('last_accounts'), dict) else {}
    accounts_made_up_to = companies_house_iso_date(
        next_accounts.get('period_end_on') or accounts.get('next_made_up_to')
    )
    accounts_period_start = companies_house_iso_date(next_accounts.get('period_start_on'))
    accounts_last_made_up_to = companies_house_iso_date(
        last_accounts.get('made_up_to') or last_accounts.get('period_end_on')
    )
    confirmation_due = companies_house_iso_date(confirmation.get('next_due'))
    return {
        'name': name,
        'company_number': number,
        'status': str(data.get('company_status') or '').strip(),
        'status_detail': str(data.get('company_status_detail') or '').strip(),
        'inc_date': str(data.get('date_of_creation') or '')[:10],
        'reg_office': office,
        'sic_codes': ', '.join(
            str(code).strip() for code in (data.get('sic_codes') or []) if str(code).strip()
        ),
        'postcode': postcode,
        'company_type': str(data.get('type') or '').strip(),
        'registered_email': companies_house_email_from_data(data),
        'accounts_next_due': accounts_due,
        'accounts_overdue': companies_house_flag_due(
            accounts.get('overdue') if accounts.get('overdue') is not None else next_accounts.get('overdue'),
            accounts_due,
            overdue_only=True,
        ),
        'accounts_made_up_to': accounts_made_up_to,
        'accounts_period_start': accounts_period_start,
        'accounts_last_made_up_to': accounts_last_made_up_to,
        'confirmation_next_due': confirmation_due,
        'confirmation_overdue': companies_house_flag_due(confirmation.get('overdue'), confirmation_due, overdue_only=True),
        'confirmation_pending': companies_house_flag_due(confirmation.get('overdue'), confirmation_due, overdue_only=False),
        'default_address': is_companies_house_default_address(office, postcode),
    }

def fetch_companies_house_profile(company_number):
    number = normalize_company_number(company_number)
    if not number:
        return None, 'Enter a company number'
    payload, error = companies_house_request('/company/' + urllib.parse.quote(number))
    if error:
        return None, error
    profile = public_companies_house_profile(payload)
    if not profile:
        return None, 'Company not found at Companies House'
    return profile, None

def format_companies_house_officer_name(name):
    text = str(name or '').strip()
    if not text:
        return ''
    if ',' in text:
        last, first = text.split(',', 1)
        formatted = f"{first.strip()} {last.strip()}".strip()
        return formatted or text
    return text

def fetch_companies_house_active_directors(company_number):
    number = normalize_company_number(company_number)
    if not number:
        return []
    queries = (
        urllib.parse.urlencode({'items_per_page': 100, 'register_type': 'directors'}),
        urllib.parse.urlencode({'items_per_page': 100}),
    )
    for qs in queries:
        payload, error = companies_house_request(
            '/company/' + urllib.parse.quote(number) + '/officers?' + qs
        )
        if error or not isinstance(payload, dict):
            err = str(error or '')
            if 'rejected' in err or 'rate limit' in err:
                global _CH_REGISTERED_SYNC_BLOCKED, _CH_PENDING_SYNC_BLOCKED
                _CH_REGISTERED_SYNC_BLOCKED = True
                _CH_PENDING_SYNC_BLOCKED = True
            continue
        names = []
        seen = set()
        for item in payload.get('items') or []:
            if not isinstance(item, dict) or item.get('resigned_on'):
                continue
            role = str(item.get('officer_role') or '').lower()
            if role and 'director' not in role:
                continue
            pretty = pretty_director_name(format_companies_house_officer_name(item.get('name')))
            if not pretty or pretty.lower() == 'director':
                continue
            key = pretty.lower()
            if key in seen:
                continue
            seen.add(key)
            names.append(pretty)
        if names:
            return names
    return []

def fetch_companies_house_primary_director(company_number):
    names = fetch_companies_house_active_directors(company_number)
    return names[0] if names else None

def pretty_director_name(name):
    text = str(name or '').strip()
    if not text:
        return 'Director'
    parts = [part for part in re.split(r'\s+', text) if part]
    if any(part.isalpha() and part == part.upper() and len(part) > 1 for part in parts):
        return text.title()
    return text

def companies_house_status_value(raw_status, status_detail=None):
    raw = str(raw_status or 'active').lower()
    if companies_house_strike_off_proposed(raw, status_detail):
        if raw == 'dissolved':
            return 'Dissolved'
        return 'Strike off proposed'
    status_map = {
        'active': 'Active',
        'dissolved': 'Dissolved',
        'liquidation': 'Liquidation',
        'receivership': 'Receivership',
        'administration': 'Administration',
        'converted-closed': 'Closed',
        'closed': 'Closed',
        'pending': 'Active',
    }
    return status_map.get(raw, 'Active')

_CH_PENDING_SYNC_BLOCKED = False

_CH_REGISTERED_SYNC_BLOCKED = False

def apply_companies_house_profile_to_company(company_id, profile, director=None):
    number = normalize_company_number((profile or {}).get('company_number'))
    name = str((profile or {}).get('name') or '').strip()
    if not company_id or not number or not name:
        return False
    clash = query_db(
        "SELECT id, user_id, company_number FROM companies WHERE company_number = ? AND id != ?;",
        (number, company_id),
        one=True,
    )
    if clash:
        pending = query_db("SELECT id, user_id FROM companies WHERE id = ?;", (company_id,), one=True)
        if (
            pending
            and clash.get('user_id') == pending.get('user_id')
            and not is_pending_company_number(clash.get('company_number'))
            and absorb_company_into(company_id, clash['id'])
        ):
            return True
        execute_db("UPDATE companies SET ch_checked_at = CURRENT_TIMESTAMP WHERE id = ?;", (company_id,))
        return False
    current = query_db("SELECT director, sic_codes, registered_email FROM companies WHERE id = ?;", (company_id,), one=True) or {}
    director_name = director or fetch_companies_house_primary_director(number) or current.get('director') or 'Director'
    inc_date = str((profile or {}).get('inc_date') or '')[:10]
    if len(inc_date) < 10:
        inc_date = datetime.date.today().isoformat()
    sic_codes = str((profile or {}).get('sic_codes') or current.get('sic_codes') or '').strip()
    registered_email = str((profile or {}).get('registered_email') or current.get('registered_email') or '').strip()
    execute_db(
        """
        UPDATE companies
        SET name = ?, company_number = ?, status = ?, inc_date = ?, director = ?,
            reg_office = ?, sic_codes = ?, registered_email = ?, ch_checked_at = CURRENT_TIMESTAMP
        WHERE id = ?;
        """,
        (
            name,
            number,
            companies_house_status_value((profile or {}).get('status'), (profile or {}).get('status_detail')),
            inc_date,
            director_name,
            (profile or {}).get('reg_office') or 'United Kingdom',
            sic_codes or None,
            registered_email or None,
            company_id,
        ),
    )
    return True

def is_usable_form_email(value):
    email = str(value or '').strip()
    return bool(email and '@' in email and '.' in email.split('@')[-1])
