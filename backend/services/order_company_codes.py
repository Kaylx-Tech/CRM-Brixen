"""Codes typed on an order go to its company's compliance record by themselves: a Confirmation Statement (or any)
order whose form has the Companies House authentication code (6 characters) or the personal code (11 characters)
fills the company's "Authentication code" and "Personal 11 digits code"."""
import re

from db import execute_db, query_db
from services.order_applicant import _answers


def _question(label):
    """Only the question itself: "Company already registered: Yes › Authentication code" → "authentication code"."""
    return re.split(r'\s*[›>]\s*', str(label).lower())[-1].split(':')[-1].strip()


def codes_from_form(form_json):
    """(authentication_code, personal_code) typed on the order form, cleaned, or '' each."""
    auth = personal = ''
    for label, value, _services in _answers(form_json):
        key = _question(label)
        text = re.sub(r'[\s-]', '', str(value or '')).upper()
        if not auth and re.search(r'auth', key) and re.fullmatch(r'[A-Z0-9]{6}', text):
            auth = text
        elif not personal and re.search(r'personal|11\s*digit|verification code|identity code', key) \
                and re.fullmatch(r'[A-Z0-9]{11}', text):
            personal = text
    return auth, personal


def sync_order_codes(order_id):
    """Copy the order's codes onto its company (only the ones typed, only when they changed). Returns what was set."""
    order = query_db("SELECT id, company_id, order_form_values_json FROM orders WHERE id = ?;", (int(order_id),),
                     one=True)
    if not order or not order.get('company_id'):
        return {}
    auth, personal = codes_from_form(order.get('order_form_values_json'))
    company = query_db("SELECT id, authentication_code, activation_code FROM companies WHERE id = ?;",
                       (order['company_id'],), one=True)
    if not company:
        return {}
    changed = {}
    if auth and auth != (company.get('authentication_code') or ''):
        changed['authentication_code'] = auth
    if personal and personal != (company.get('activation_code') or ''):
        changed['activation_code'] = personal
    if changed:
        sets = ', '.join(f"{k} = ?" for k in changed)
        execute_db(f"UPDATE companies SET {sets} WHERE id = ?;", (*changed.values(), company['id']))
        print(f"[order codes] order {order_id}: company {company['id']} got {', '.join(changed)}")
    return changed
