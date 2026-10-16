"""Order numbers in one running series (app.py next_universal_order_number): #GB15353 -> #GB15354.

The prefix comes from Settings (order_prefix, default #GB). Only plain series numbers count (#GB15353, #15312);
numbers with a dash (#GB-489442, ORD-2026-015317) were one-off formats and never move the series.
A saved draft takes its number only when it is placed, so drafts never use up numbers in the series.
"""
import re
import threading

from db import query_db

_LOCK = threading.Lock()
_SERIES = re.compile(r'^#?[A-Za-z]*(\d+)$')


def order_prefix_value():
    row = query_db("SELECT value FROM settings WHERE key = 'order_prefix';", one=True)
    return str((row or {}).get('value') or '#GB').strip() or '#GB'


def _highest():
    highest = 0
    for row in query_db("SELECT order_number FROM orders;") or []:
        match = _SERIES.match(str(row.get('order_number') or '').strip())
        # A timestamp-style number (old fallback #GB1760000000) would make the series jump: ignored
        if match and len(match.group(1)) <= 8:
            highest = max(highest, int(match.group(1)))
    return highest


def next_order_number():
    """The next free number in the series (also skips one already taken, e.g. by a website order)."""
    with _LOCK:
        prefix = order_prefix_value()
        number = _highest() + 1
        while query_db("SELECT 1 FROM orders WHERE order_number = ? LIMIT 1;", (f"{prefix}{number}",), one=True):
            number += 1
        return f"{prefix}{number}"
