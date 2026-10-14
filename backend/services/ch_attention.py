"""Companies House "attention" issues for a company (ported from app.py).

A registered company needs attention when its accounts are overdue, the confirmation statement is due,
the registered office is the Companies House default address in Cardiff, or a strike-off is proposed.
Issues are stored on companies.ch_attention_json by the background sync and recomputed from the stored
due dates, so a date passing is picked up without waiting for the next sync.
"""
import datetime
import json
import re


def _is_pending_number(company_number):
    num = str(company_number or '').strip().upper()
    return not num or num.startswith('REG-') or num.startswith('PENDING')


def ch_iso_date(value):
    text = str(value or '').strip()[:10]
    if re.match(r'^\d{4}-\d{2}-\d{2}$', text):
        return text
    return None


def format_uk_long_date(value):
    iso = ch_iso_date(value)
    if not iso:
        return ''
    try:
        d = datetime.date.fromisoformat(iso)
    except ValueError:
        return iso
    return f"{d.day} {d.strftime('%B %Y')}"


def is_companies_house_default_address(office, postcode=None):
    blob = ' '.join(str(part or '') for part in (office, postcode)).lower()
    compact = re.sub(r'[^a-z0-9]', '', blob)
    if 'companieshousedefaultaddress' in compact:
        return True
    return 'pobox4385' in compact and 'cf148lh' in compact


def _date_is_due(due_date, today=None, *, overdue_only=False):
    due = ch_iso_date(due_date)
    if not due:
        return False
    day = (today or datetime.date.today()).isoformat()
    return due < day if overdue_only else due <= day


def _flag_due(flag, due_date, today=None, *, overdue_only=False):
    try:
        if int(flag or 0):
            return True
    except (TypeError, ValueError):
        if flag:
            return True
    return _date_is_due(due_date, today=today, overdue_only=overdue_only)


def strike_off_proposed(status=None, status_detail=None):
    blob = f"{status or ''} {status_detail or ''}".lower().replace('_', '-')
    return 'strike-off' in blob or 'strike off' in blob


def companies_house_attention_issues(source, today=None):
    src = source if isinstance(source, dict) else {}
    today = today or datetime.date.today()
    office = str(src.get('reg_office') or src.get('registered_office') or '').strip()
    accounts_due = ch_iso_date(src.get('accounts_next_due'))
    confirmation_due = ch_iso_date(src.get('confirmation_next_due'))
    issues = []
    if _flag_due(src.get('accounts_overdue'), accounts_due, today=today, overdue_only=True):
        issues.append({
            'code': 'accounts_overdue',
            'title': 'Accounts overdue',
            'detail': f"Due {format_uk_long_date(accounts_due)}" if accounts_due else 'File the overdue accounts at Companies House.',
            'due': accounts_due,
        })
    if _flag_due(src.get('confirmation_overdue'), confirmation_due, today=today, overdue_only=False):
        overdue = _flag_due(src.get('confirmation_overdue'), confirmation_due, today=today, overdue_only=True)
        issues.append({
            'code': 'confirmation_pending',
            'title': 'Confirmation statement overdue' if overdue else 'Confirmation statement pending',
            'detail': f"Due {format_uk_long_date(confirmation_due)}" if confirmation_due else 'File the confirmation statement at Companies House.',
            'due': confirmation_due,
        })
    if is_companies_house_default_address(office, src.get('postcode')):
        issues.append({
            'code': 'default_address',
            'title': 'Default Companies House address',
            'detail': 'Change the registered office away from the Companies House default address in Cardiff.',
        })
    if strike_off_proposed(src.get('status'), src.get('status_detail')):
        issues.append({
            'code': 'strike_off',
            'title': 'Strike-off proposed',
            'detail': 'Companies House has proposed to strike this company off the register.',
        })
    return issues


def parse_attention_json(raw):
    if isinstance(raw, list):
        data = raw
    else:
        text = str(raw or '').strip()
        if not text:
            return None
        try:
            data = json.loads(text)
        except (TypeError, ValueError):
            return None
    if not isinstance(data, list):
        return None
    issues = []
    for item in data:
        if not isinstance(item, dict) or not item.get('code'):
            continue
        issues.append({
            'code': str(item.get('code') or '').strip(),
            'title': str(item.get('title') or '').strip(),
            'detail': str(item.get('detail') or '').strip(),
            'due': ch_iso_date(item.get('due')),
        })
    return issues


CLOSED_STATUSES = ('dissolved', 'liquidation', 'closed', 'removed', 'converted closed', 'insolvency proceedings')


def is_closed_company(status):
    text = str(status or '').strip().lower().replace('-', ' ')
    return any(s in text for s in CLOSED_STATUSES)


def company_attention_issues(company):
    """Stored issues from the last Companies House sync, plus anything the stored dates now show.
    Closed companies (dissolved, in liquidation...) have nothing the client can file, so they never need attention."""
    src = company if isinstance(company, dict) else {}
    if _is_pending_number(src.get('company_number')) or is_closed_company(src.get('status')):
        return []
    issues = list(parse_attention_json(src.get('ch_attention_json')) or [])
    seen = {item.get('code') for item in issues}
    for item in companies_house_attention_issues(src):
        if item.get('code') not in seen:
            issues.append(item)
            seen.add(item.get('code'))
    return issues


def issues_from_profile(profile):
    """Attention issues straight from a Companies House company profile response."""
    p = profile if isinstance(profile, dict) else {}
    accounts = p.get('accounts') or {}
    confirmation = p.get('confirmation_statement') or {}
    office = p.get('registered_office_address') or {}
    office_text = ', '.join(str(office.get(k) or '').strip() for k in (
        'care_of', 'po_box', 'address_line_1', 'address_line_2', 'locality', 'region', 'postal_code', 'country'
    ) if str(office.get(k) or '').strip())
    return companies_house_attention_issues({
        'accounts_next_due': accounts.get('next_due') or (accounts.get('next_accounts') or {}).get('due_on'),
        'accounts_overdue': 1 if accounts.get('overdue') else 0,
        'confirmation_next_due': confirmation.get('next_due'),
        'confirmation_overdue': 1 if confirmation.get('overdue') else 0,
        'reg_office': office_text,
        'postcode': office.get('postal_code'),
        'status': p.get('company_status'),
        'status_detail': p.get('company_status_detail'),
    })
