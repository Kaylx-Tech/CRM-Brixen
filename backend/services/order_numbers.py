"""CRM order numbers: BRX-1001-OCT26 = BRX, the running order count (from 1001), month and year of the order.

* The count never starts again: BRX-1001-OCT26, BRX-1002-OCT26, … BRX-1007-NOV26.
* Old orders keep their numbers (#GB15353, #GB-489442 …); website orders keep their WooCommerce number.
* A saved draft has a DRAFT- placeholder and takes its number only when it is placed.
"""
import datetime
import re
import threading

from db import query_db

_LOCK = threading.Lock()
PREFIX = 'BRX'
FIRST_NUMBER = 1001
MONTHS = ('JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC')
_SERIES = re.compile(rf'^{PREFIX}-(\d+)-[A-Z]{{3}}\d{{2}}$')


def _suffix(day):
    return f"{MONTHS[day.month - 1]}{day.year % 100:02d}"


def next_order_number(day=None):
    """The next number in the series: BRX-1001-OCT26, BRX-1002-OCT26, …"""
    day = day or datetime.date.today()
    with _LOCK:
        highest = FIRST_NUMBER - 1
        for row in query_db("SELECT order_number FROM orders WHERE order_number LIKE ?;", (f"{PREFIX}-%",)) or []:
            match = _SERIES.match(str(row.get('order_number') or '').strip())
            if match:
                highest = max(highest, int(match.group(1)))
        number = highest + 1
        # Never reuse a count, whatever month it was given in
        while query_db("SELECT 1 FROM orders WHERE order_number LIKE ? LIMIT 1;", (f"{PREFIX}-{number}-%",), one=True):
            number += 1
        return f"{PREFIX}-{number}-{_suffix(day)}"


def is_draft_number(order_number):
    return str(order_number or '').upper().startswith('DRAFT-')
