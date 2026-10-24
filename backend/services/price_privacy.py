"""Staff (Operations) never see money: no order price, total, VAT, cost or profit, no invoices.

Team members with role STAFF are either Marketing (staff_type 'marketing' or empty, as before) or
Operations ('operations'). For Operations staff, main.py:
  * blocks invoice / payment endpoints (their PDFs and records are all money),
  * drops money fields from what they send, so they cannot change a price (and an order they place
    is priced from the catalogue by the order routes), and
  * blanks money fields (None) in every JSON reply, so nothing reaches the browser.
"""
import json
import re

STAFF_TYPES = ('marketing', 'operations')

# Exact keys that hold money, and endings/beginnings that do ("order_total", "unit_price", "cost_x")
_MONEY_KEYS = {
    'price', 'amount', 'total', 'subtotal', 'sub_total', 'vat', 'tax', 'cost', 'profit', 'margin',
    'revenue', 'turnover', 'paid', 'balance', 'outstanding', 'fee', 'fees', 'discount', 'deposit',
    'sellprice', 'originalprice', 'net_profit', 'gross_profit', 'total_spent', 'lifetime_value',
    'pending_payments', 'money',
}
_MONEY_PATTERN = re.compile(
    r'(^|_)(price|prices|amount|amounts|cost|costs|profit|profits|revenue|turnover|vat|fee|fees|'
    r'paid|balance|spent|discount|refund|deposit|sell|income|earnings|charge|charges|payout|gbp|money)(_|$)'
    r'|_total$|^total_(amount|price|paid|due|value|revenue|turnover|spent|cost|profit|vat)$'
)
# Counts and other plain numbers that only look like money keys
_NOT_MONEY = {'paid_status', 'payment_status', 'payment_mode', 'is_paid', 'vat_number', 'balance_sheet_date'}

_BLOCKED_PATH = re.compile(r'invoice|receipt|/payments?(/|$)|/finance', re.IGNORECASE)
# Accountancy is the client companies' own bookkeeping (their turnover, profit, tax), which the team
# needs to prepare accounts; it is not what the customer pays us, so it is left as it is
_OWN_FIGURES_PATH = re.compile(r'^/api/(admin/)?accountancy(/|$)')


def hides_prices(user):
    """True for Operations staff: they work on orders without seeing any money."""
    if not user or str(user.get('role') or '').upper() != 'STAFF':
        return False
    return str(user.get('staff_type') or '').strip().lower() == 'operations'


def normalize_staff_type(value, role):
    """'operations' or 'marketing' for STAFF (anything else counts as marketing); None for other roles."""
    if str(role or '').upper() != 'STAFF':
        return None
    return 'operations' if str(value or '').strip().lower() == 'operations' else 'marketing'


def is_money_key(key):
    k = str(key).strip().lower()
    if k in _NOT_MONEY or k.endswith('_count') or k.startswith('count_'):
        return False
    return k in _MONEY_KEYS or bool(_MONEY_PATTERN.search(k))


def blocked_path(path):
    return bool(_BLOCKED_PATH.search(path or ''))


def applies_to_path(path):
    """Money is hidden on every endpoint except the client companies' own accounts."""
    return not _OWN_FIGURES_PATH.search(path or '')


def _is_count(key, value):
    """List replies carry "total": <number of rows>. Money comes out of the database as a REAL (49.0);
    a count is a whole int, so an int "total" is left alone."""
    return str(key).lower() == 'total' and isinstance(value, int) and not isinstance(value, bool)


def scrub(value):
    """A copy with every money field blanked (None), however deeply it is nested."""
    if isinstance(value, dict):
        return {k: (None if is_money_key(k) and not _is_count(k, v) else scrub(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub(v) for v in value]
    return value


def strip_incoming(value):
    """A copy of a request body without money fields (form answers keep every question)."""
    if isinstance(value, dict):
        return {k: (v if k in ('form_values', 'order_form_values_json', 'checkout_form') else strip_incoming(v))
                for k, v in value.items() if not is_money_key(k)}
    if isinstance(value, list):
        return [strip_incoming(v) for v in value]
    return value


def scrub_json_payload(chunks):
    """Blank the money in a JSON reply given as WSGI byte chunks; non-JSON comes back unchanged."""
    raw = b''.join(chunks)
    try:
        data = json.loads(raw.decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        return raw
    from utils.response import APIJSONEncoder
    return json.dumps(scrub(data), cls=APIJSONEncoder).encode('utf-8')
