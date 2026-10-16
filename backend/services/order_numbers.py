"""CRM order numbers: BRX-1001-OCT26 = BRX, the running order count (from 1001), month and year of the order.

* The letters come from Settings > Order prefix (order_number_prefix, default BRX).
* The count never starts again, also when the letters change: BRX-1001-OCT26, … BRX-1007-NOV26, ABC-1008-NOV26.
* Old orders keep their numbers (#GB15353, #GB-489442 …); website orders keep their WooCommerce number.
* A saved draft has a DRAFT- placeholder and takes its number only when it is placed.
"""
import datetime
import re
import threading

from db import query_db

_LOCK = threading.Lock()
DEFAULT_PREFIX = 'BRX'
FIRST_NUMBER = 1001
MONTHS = ('JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC')
# Any letters: the count carries on when the prefix is changed in Settings
_SERIES = re.compile(r'^[A-Z0-9]{1,8}-(\d{4,})-(?:' + '|'.join(MONTHS) + r')\d{2}$')


def order_number_prefix():
    """Letters from Settings (A-Z and 0-9 only, up to 8), default BRX."""
    row = query_db("SELECT value FROM settings WHERE key = 'order_number_prefix';", one=True)
    letters = re.sub(r'[^A-Z0-9]', '', str((row or {}).get('value') or '').upper())[:8]
    return letters or DEFAULT_PREFIX


def _suffix(day):
    return f"{MONTHS[day.month - 1]}{day.year % 100:02d}"


def next_order_number(day=None):
    """The next number in the series: BRX-1001-OCT26, BRX-1002-OCT26, …"""
    day = day or datetime.date.today()
    with _LOCK:
        highest = FIRST_NUMBER - 1
        for row in query_db("SELECT order_number FROM orders WHERE order_number LIKE '%-%-%';") or []:
            match = _SERIES.match(str(row.get('order_number') or '').strip())
            if match:
                highest = max(highest, int(match.group(1)))
        number = highest + 1
        prefix = order_number_prefix()
        # Never reuse a count, whatever month it was given in
        while query_db("SELECT 1 FROM orders WHERE order_number LIKE ? LIMIT 1;", (f"{prefix}-{number}-%",), one=True):
            number += 1
        return f"{prefix}-{number}-{_suffix(day)}"


def is_draft_number(order_number):
    return str(order_number or '').upper().startswith('DRAFT-')
