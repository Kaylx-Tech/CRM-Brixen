"""CRM order numbers by date: GB-OCT-2326001 = GB, month, day 23, year 26, the day's 1st order.

* The 3-digit counter starts again at 001 every day (the date is part of the number).
* The letters come from Settings order_prefix (default #GB, the # is dropped): GB-OCT-...
* Old orders keep their numbers (#GB15353, #GB-489442 …); website orders keep their WooCommerce number.
* A saved draft has a DRAFT- placeholder and takes its number only when it is placed.
"""
import datetime
import re
import threading

from db import query_db

_LOCK = threading.Lock()
MONTHS = ('JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC')


def order_prefix_value():
    row = query_db("SELECT value FROM settings WHERE key = 'order_prefix';", one=True)
    letters = re.sub(r'[^A-Za-z0-9]', '', str((row or {}).get('value') or 'GB')).upper()
    return letters or 'GB'


def day_stem(day=None):
    """GB-OCT-2326 for 23 Oct 2026 (the part before the day's counter)."""
    day = day or datetime.date.today()
    return f"{order_prefix_value()}-{MONTHS[day.month - 1]}-{day.day:02d}{day.year % 100:02d}"


def next_order_number(day=None):
    """The next free number for the day: GB-OCT-2326001, GB-OCT-2326002, …"""
    with _LOCK:
        stem = day_stem(day)
        highest = 0
        for row in query_db("SELECT order_number FROM orders WHERE order_number LIKE ?;", (f"{stem}%",)) or []:
            tail = str(row.get('order_number') or '')[len(stem):]
            if tail.isdigit() and len(tail) == 3:
                highest = max(highest, int(tail))
        number = highest + 1
        while query_db("SELECT 1 FROM orders WHERE order_number = ? LIMIT 1;", (f"{stem}{number:03d}",), one=True):
            number += 1
        return f"{stem}{number:03d}"


def is_draft_number(order_number):
    return str(order_number or '').upper().startswith('DRAFT-')
