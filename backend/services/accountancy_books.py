"""Accountancy books workspace helpers — aligned with app.py company_books_workspace."""
from __future__ import annotations

import re
from datetime import datetime
from db import query_db

IDENTITY_STATUSES = ('Not started', 'In progress', 'Verified', 'Failed')
PSC_STATUSES = ('Not started', 'In progress', 'Verified', 'Update required')
BOOK_CATEGORIES = (
    'Turnover',
    'Other income',
    'Cost of sales',
    'Staff costs',
    'Other operating charges',
    'Tax',
    'Dividends / drawings',
    'Bank charges',
    'Director loan',
    'VAT',
    'Other',
)
BOOK_OUTFLOW_CATEGORIES = frozenset({
    'Cost of sales',
    'Staff costs',
    'Other operating charges',
    'Tax',
    'Dividends / drawings',
    'Bank charges',
    'VAT',
})
UK_POSTCODE_RE = re.compile(r'\b[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}\b', re.I)


def company_accounts_address(company):
    address = str((company or {}).get('reg_office') or '').strip()
    return address


def is_bank_statement_document(doc):
    category = str((doc or {}).get('category') or '').lower()
    name = str((doc or {}).get('name') or '').strip().lower()
    return 'bank statement' in category or 'bank statement' in name


def book_entry_totals(entries):
    by_category = {name: 0.0 for name in BOOK_CATEGORIES}
    inflows = 0.0
    outflows = 0.0
    for item in entries or []:
        amount = float((item or {}).get('amount') or 0)
        category = str((item or {}).get('category') or 'Other').strip() or 'Other'
        if category not in by_category:
            by_category[category] = 0.0
        by_category[category] = round(by_category[category] + amount, 2)
        if amount >= 0:
            inflows += amount
        else:
            outflows += amount
    return {
        'by_category': [
            {'category': name, 'amount': round(by_category.get(name, 0.0), 2)}
            for name in BOOK_CATEGORIES if by_category.get(name)
        ],
        'inflows': round(inflows, 2),
        'outflows': round(outflows, 2),
        'net': round(inflows + outflows, 2),
        'count': len(entries or []),
    }


def accountancy_readiness(company, current=None, book_count=0, statement_count=0, for_client=False):
    issues = []
    address = company_accounts_address(company)
    address_ok = bool(address)
    has_postcode = bool(UK_POSTCODE_RE.search(address or ''))
    if not address_ok:
        issues.append({
            'code': 'address',
            'severity': 'block',
            'title': 'Registered office missing',
            'detail': 'Companies Act 2006 s.86 requires a UK registered office that can receive documents.',
        })
    elif not has_postcode:
        issues.append({
            'code': 'address_postcode',
            'severity': 'warn',
            'title': 'Registered office incomplete',
            'detail': 'Add the full UK address with postcode before filing at Companies House.',
        })

    identity = str((company or {}).get('identity_verified') or 'Not started').strip() or 'Not started'
    if identity not in IDENTITY_STATUSES:
        identity = 'Not started'
    if identity != 'Verified':
        issues.append({
            'code': 'identity',
            'severity': 'block',
            'title': 'Identity verification outstanding',
            'detail': 'Directors must complete Companies House identity verification (ECCTA 2023) before the company can file.',
        })

    psc = str((company or {}).get('psc_verified') or 'Not started').strip() or 'Not started'
    if psc not in PSC_STATUSES:
        psc = 'Not started'
    if psc != 'Verified':
        issues.append({
            'code': 'psc',
            'severity': 'block',
            'title': 'PSC register not verified',
            'detail': 'People with Significant Control must be confirmed on the PSC register (Companies Act 2006 Part 21A).',
        })

    has_auth = bool(str((company or {}).get('authentication_code') or '').strip())
    has_personal = bool(str((company or {}).get('activation_code') or '').strip())
    has_utr = bool(str((company or {}).get('utr_number') or '').strip())

    if not for_client:
        if not has_auth:
            issues.append({
                'code': 'auth_code',
                'severity': 'block',
                'title': 'Companies House authentication code missing',
                'detail': 'The company authentication code is required to file accounts online at Companies House.',
            })
        if not has_personal:
            issues.append({
                'code': 'personal_code',
                'severity': 'warn',
                'title': 'Personal 11 digits code missing',
                'detail': 'Store the WebFiling personal code used to access this company online.',
            })

    if not has_utr:
        issues.append({
            'code': 'utr',
            'severity': 'warn',
            'title': 'UTR missing',
            'detail': 'HMRC still needs the Unique Taxpayer Reference for the Corporation Tax return after Companies House accounts are filed.',
        })

    if not str((company or {}).get('director') or '').strip():
        issues.append({
            'code': 'director',
            'severity': 'warn',
            'title': 'Director not named',
            'detail': 'Yearly accounts must be approved by a director before they are filed.',
        })

    status = str((current or {}).get('status') or (company or {}).get('account_status') or '').strip()
    if status == 'Overdue':
        issues.append({
            'code': 'overdue',
            'severity': 'block',
            'title': 'Accounts overdue',
            'detail': 'Private company accounts are due 9 months after the year end (Companies Act 2006 s.442). Late filing penalties apply.',
        })

    if int(statement_count or 0) < 1:
        issues.append({
            'code': 'statements',
            'severity': 'warn',
            'title': 'No bank statements',
            'detail': 'Upload the period bank statements, then post each line into the cash book before preparing micro-entity accounts.',
        })
    if int(book_count or 0) < 1:
        issues.append({
            'code': 'books',
            'severity': 'warn',
            'title': 'No bookkeeping entries',
            'detail': 'Post bank statement lines (turnover, costs, drawings) and review FRS 105 totals before filing.',
        })

    if for_client:
        issues = [item for item in issues if item.get('code') in (
            'address', 'address_postcode', 'identity', 'psc', 'overdue', 'utr'
        )]

    blocking = [item for item in issues if item.get('severity') == 'block']
    payload = {
        'address': {'ok': address_ok and has_postcode, 'value': address},
        'identity': {'status': identity, 'ok': identity == 'Verified'},
        'psc': {'status': psc, 'ok': psc == 'Verified'},
        'utr': {'ok': has_utr},
        'issues': issues,
        'blocking_count': len(blocking),
        'issue_count': len(issues),
        'can_file': len(blocking) == 0,
    }
    if not for_client:
        payload['authentication_code'] = {'ok': has_auth}
        payload['personal_code'] = {'ok': has_personal}
    return payload


def build_company_books_workspace(company_id, period_end=None, status_hint=None):
    company = query_db("""
        SELECT c.id, c.name, c.company_number, c.inc_date, c.user_id, c.status, c.director,
               c.reg_office, c.utr_number, c.authentication_code, c.activation_code,
               c.identity_verified, c.psc_verified, c.account_status, c.accounts_next_due,
               u.full_name as client_name, u.email as client_email
        FROM companies c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.id = ?
        LIMIT 1;
    """, (company_id,), one=True)
    if not company:
        return None, 'Company not found'

    company = dict(company)
    period_value = (period_end or '').strip()[:10] or None

    entry_params = [company_id]
    entry_sql = """
        SELECT id, company_id, period_end, entry_date, description, amount, category, source, created_at
        FROM company_book_entries
        WHERE company_id = ?
    """
    if period_value:
        entry_sql += " AND (period_end = ? OR period_end IS NULL OR period_end = '')"
        entry_params.append(period_value)
    entry_sql += " ORDER BY entry_date DESC, id DESC;"
    entry_rows = query_db(entry_sql, entry_params) or []
    entries = [dict(e) for e in entry_rows]

    docs = query_db("""
        SELECT id, name, category, file_size, created_at, company_id
        FROM documents
        WHERE company_id = ?
        ORDER BY created_at DESC;
    """, (company_id,)) or []
    statements = [
        {
            'id': d['id'],
            'name': d.get('name') or 'Bank statement',
            'file_size': d.get('file_size') or '',
            'created_at': d.get('created_at') or '',
            'category': d.get('category') or '',
        }
        for d in docs if is_bank_statement_document(d)
    ]

    current = {
        'period_end': period_value or company.get('accounts_next_due') or '',
        'status': status_hint or company.get('account_status') or '',
    }
    readiness = accountancy_readiness(
        company,
        current=current,
        book_count=len(entries),
        statement_count=len(statements),
        for_client=False,
    )
    totals = book_entry_totals(entries)

    return {
        'company': {
            'id': company['id'],
            'name': company.get('name'),
            'company_number': company.get('company_number'),
            'director': company.get('director'),
            'director_email': company.get('client_email'),
            'client_name': company.get('client_name'),
            'client_email': company.get('client_email'),
            'client_id': company.get('user_id'),
            'reg_office': company.get('reg_office'),
        },
        'current': current,
        'period_end': current.get('period_end') or '',
        'readiness': readiness,
        'entries': entries,
        'totals': totals,
        'statements': statements,
        'book_categories': list(BOOK_CATEGORIES),
        'identity_statuses': list(IDENTITY_STATUSES),
        'psc_statuses': list(PSC_STATUSES),
        # Keep legacy React ViewAccount summary shape
        'summary': {
            'turnover': f"£{totals['inflows']:,.2f}",
            'net_profit': f"£{totals['net']:,.2f}",
            'cash_at_bank': f"£{max(0, totals['net']):,.2f}",
            'total_income': totals['inflows'],
            'total_expense': abs(totals['outflows']),
            'net': totals['net'],
            'count': totals['count'],
        },
    }, None
