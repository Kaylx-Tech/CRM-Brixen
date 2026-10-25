"""Revenue & Balance Sheet: what the company holds in each currency, month by month.

GBP and PKR are kept apart (no conversion between balances). Money in is every invoice that has been
paid (fully or in part), in the account it was paid into: invoices paid by "PKR(Bank Transfer)" go to
PKR, everything else to GBP. Invoice totals are stored in pounds, so a PKR invoice is turned into
rupees once, at the live GBP -> PKR rate, and that rupee amount is saved; the owner can correct it to
what actually reached the bank. Money out is the company expenses the owner records (salary, rent …).

Each currency starts from a balance the owner enters once, for a starting month; after that every
month opens with the previous month's closing balance. Money dated before the starting month is left
out (it is already inside the starting balance). With no starting balance, the ledger starts at 0
from the first movement.
"""
from __future__ import annotations

import datetime

from db import query_db, execute_db
from services.invoice_service import invoice_money_state

CURRENCIES = ('GBP', 'PKR')
EXPENSE_CATEGORIES = ('Salary', 'Rent', 'Utilities', 'Software', 'Marketing', 'Tax', 'Other')


def invoice_currency(invoice):
    return 'PKR' if str((invoice or {}).get('payment_method') or '').startswith('PKR') else 'GBP'


def month_key(value):
    """'2026-10-14 09:12:00' -> '2026-10' (None when it is not a date)."""
    text = str(value or '')[:7]
    try:
        datetime.datetime.strptime(text, '%Y-%m')
        return text
    except ValueError:
        return None


def _next_month(key):
    year, month = int(key[:4]), int(key[5:7])
    return f"{year + (month == 12)}-{1 if month == 12 else month + 1:02d}"


def _gbp_to_pkr_rate():
    try:
        from services.invoice_document import gbp_to_pkr_rate
        return gbp_to_pkr_rate()
    except Exception:
        return None


def received_invoices():
    """Every invoice with money received: currency, amount in that currency and the date it counts on.
    PKR invoices get their rupee amount saved the first time they are seen (or again when the pounds
    received change, unless the owner corrected it by hand)."""
    rows = query_db("""
        SELECT i.id, i.invoice_number, i.total, i.status, i.amount_paid, i.deposit_amount, i.payment_timing,
               i.payment_method, i.paid_at, i.created_at, u.full_name AS client_name,
               o.order_number, o.service_name, o.owner_name,
               r.gbp_amount AS r_gbp, r.amount AS r_amount, r.rate AS r_rate, r.edited AS r_edited
        FROM invoices i
        LEFT JOIN users u ON u.id = i.user_id
        LEFT JOIN orders o ON o.id = i.order_id
        LEFT JOIN finance_invoice_receipts r ON r.invoice_id = i.id
        WHERE i.status != 'Cancelled';
    """) or []
    rate = None
    out = []
    for row in rows:
        row = dict(row)
        gbp = invoice_money_state(row)['amount_paid']
        if gbp <= 0.004:
            continue
        currency = invoice_currency(row)
        item = {
            'invoice_id': row['id'],
            'invoice_number': row['invoice_number'],
            'client_name': row.get('owner_name') or row.get('client_name') or '',
            'order_number': row.get('order_number'),
            'service_name': row.get('service_name'),
            'status': row['status'],
            # Partly paid invoices have no paid date; their money counts from when the invoice was made
            'date': str(row.get('paid_at') or row.get('created_at') or '')[:10],
            'currency': currency,
            'gbp_amount': gbp,
            'amount': gbp,
            'rate': None,
            'edited': False,
        }
        if currency == 'PKR':
            # Worked out again when new, when the pounds changed, or when the rate could not be fetched last time
            stale = row.get('r_gbp') is None or (not row.get('r_edited') and (
                abs(float(row['r_gbp']) - gbp) > 0.004 or row.get('r_amount') is None))
            if stale:
                saved_rate = row.get('r_rate')
                if not saved_rate:
                    rate = rate or _gbp_to_pkr_rate()
                    saved_rate = rate
                rupees = round(gbp * float(saved_rate), 2) if saved_rate else None
                execute_db("""
                    INSERT INTO finance_invoice_receipts (invoice_id, currency, gbp_amount, amount, rate, edited, updated_at)
                    VALUES (?, 'PKR', ?, ?, ?, 0, datetime('now'))
                    ON CONFLICT(invoice_id) DO UPDATE SET gbp_amount = excluded.gbp_amount, amount = excluded.amount,
                        rate = excluded.rate, updated_at = excluded.updated_at;
                """, (row['id'], gbp, rupees, saved_rate))
                row.update(r_amount=rupees, r_rate=saved_rate, r_edited=0)
            item.update(amount=row.get('r_amount'), rate=row.get('r_rate'), edited=bool(row.get('r_edited')))
        out.append(item)
    return out


def list_expenses():
    rows = query_db("""
        SELECT e.*, u.full_name AS created_by_name FROM finance_expenses e
        LEFT JOIN users u ON u.id = e.created_by
        ORDER BY e.spent_on DESC, e.id DESC;
    """) or []
    return [dict(r) for r in rows]


def opening_balances():
    rows = query_db("SELECT currency, amount, start_month, updated_at FROM finance_opening_balances;") or []
    return {r['currency']: dict(r) for r in rows}


def balance_sheet(month=None):
    """Everything the Revenue & Balance Sheet page shows for one month (default: this month)."""
    today = datetime.date.today().strftime('%Y-%m')
    month = month_key(month) or today
    starts = opening_balances()
    income = received_invoices()
    expenses = list_expenses()

    # Every movement as (month, currency, +in / -out); PKR invoices still waiting for a rupee amount don't count yet
    moves = [(month_key(i['date']), i['currency'], float(i['amount'])) for i in income if i['amount'] is not None]
    moves += [(month_key(e['spent_on']), e['currency'], -float(e['amount'] or 0)) for e in expenses]
    moves = [m for m in moves if m[0]]

    first = min([m[0] for m in moves] + [s['start_month'] for s in starts.values()] + [month, today])
    last = max(month, today)
    keys = []
    key = first
    while key <= last and len(keys) < 600:
        keys.append(key)
        key = _next_month(key)

    months = []
    running = {}
    for cur in CURRENCIES:
        start = starts.get(cur)
        running[cur] = None if start else 0.0
    for key in keys:
        row = {'month': key}
        for cur in CURRENCIES:
            start = starts.get(cur)
            if start and key < start['start_month']:
                row[cur] = None
                continue
            if start and key == start['start_month']:
                running[cur] = float(start['amount'] or 0)
            opening = running[cur]
            money_in = sum(a for (k, c, a) in moves if k == key and c == cur and a > 0)
            money_out = -sum(a for (k, c, a) in moves if k == key and c == cur and a < 0)
            closing = round(opening + money_in - money_out, 2)
            row[cur] = {'opening': round(opening, 2), 'money_in': round(money_in, 2),
                        'money_out': round(money_out, 2), 'closing': closing}
            running[cur] = closing
        months.append(row)

    current = next((m for m in months if m['month'] == month), {'month': month})
    return {
        'month': month,
        'currencies': list(CURRENCIES),
        'totals': {cur: current.get(cur) for cur in CURRENCIES},
        'starts': {cur: starts.get(cur) for cur in CURRENCIES},
        'income': sorted([i for i in income if month_key(i['date']) == month],
                         key=lambda i: (i['date'], i['invoice_id']), reverse=True),
        'expenses': [e for e in expenses if month_key(e['spent_on']) == month],
        'months': [m for m in months if m['month'] <= max(month, today)][::-1][:24],
        'rupees_missing': sum(1 for i in income if i['amount'] is None),
        'categories': list(EXPENSE_CATEGORIES),
    }
