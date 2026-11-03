"""Revenue & Balance Sheet: what the company holds in each currency, month by month.

GBP and PKR are kept apart (no conversion between balances). Money in is every payment on an invoice
(part payments each on their own day, from invoice_payments), in the account it was paid into: payments
by "PKR(Bank Transfer)" go to PKR, everything else to GBP. Invoice totals are stored in pounds, so the
PKR money on an invoice is turned into rupees once, at the live GBP -> PKR rate, and that rupee amount is
saved; the owner can correct it to what actually reached the bank. Money out is the company expenses the
owner records (salary, rent …). The sale itself counts when the order is made; a later payment only
moves money that the customer still owed into the bank.

Each currency starts from a balance the owner enters once, for a starting month; after that every
month opens with the previous month's closing balance. Money dated before the starting month is left
out (it is already inside the starting balance). With no starting balance, the ledger starts at 0
from the first movement.
"""
from __future__ import annotations

import datetime

from db import query_db, execute_db
from services.invoice_service import sync_invoice_payments

CURRENCIES = ('GBP', 'PKR', 'USD')
# Money paid into these accounts is turned from the invoice's pounds into that currency
FOREIGN = ('PKR', 'USD')
EXPENSE_CATEGORIES = ('Salary', 'Rent', 'Utilities', 'Software', 'Marketing', 'Tax', 'Other')


def invoice_currency(invoice):
    """The account a payment went into: "PKR(Bank Transfer)" → PKR, "USD(Bank Transfer)" → USD, else GBP."""
    method = str((invoice or {}).get('payment_method') or '')
    return next((cur for cur in FOREIGN if method.startswith(cur)), 'GBP')


def _ensure_fx_table():
    """Amounts in dollars (and later other currencies) for an invoice's payments into that account; PKR keeps
    its own table (finance_invoice_receipts) as before."""
    execute_db("""
        CREATE TABLE IF NOT EXISTS finance_invoice_fx (
            invoice_id INTEGER NOT NULL,
            currency TEXT NOT NULL,
            gbp_amount REAL NOT NULL,
            amount REAL,
            rate REAL,
            edited INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (invoice_id, currency)
        );
    """)


def _saved_fx(currency):
    """{invoice_id: saved row} for one foreign currency."""
    if currency == 'PKR':
        rows = query_db("SELECT invoice_id, gbp_amount, amount, rate, edited FROM finance_invoice_receipts;") or []
    else:
        _ensure_fx_table()
        rows = query_db("SELECT invoice_id, gbp_amount, amount, rate, edited FROM finance_invoice_fx "
                        "WHERE currency = ?;", (currency,)) or []
    return {r['invoice_id']: dict(r) for r in rows}


def _save_fx(currency, invoice_id, gbp, amount, rate):
    if currency == 'PKR':
        execute_db("""
            INSERT INTO finance_invoice_receipts (invoice_id, currency, gbp_amount, amount, rate, edited, updated_at)
            VALUES (?, 'PKR', ?, ?, ?, 0, datetime('now'))
            ON CONFLICT(invoice_id) DO UPDATE SET gbp_amount = excluded.gbp_amount, amount = excluded.amount,
                rate = excluded.rate, updated_at = excluded.updated_at;
        """, (invoice_id, gbp, amount, rate))
        return
    _ensure_fx_table()
    execute_db("""
        INSERT INTO finance_invoice_fx (invoice_id, currency, gbp_amount, amount, rate, edited, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
        ON CONFLICT(invoice_id, currency) DO UPDATE SET gbp_amount = excluded.gbp_amount, amount = excluded.amount,
            rate = excluded.rate, updated_at = excluded.updated_at;
    """, (invoice_id, currency, gbp, amount, rate))


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


def _gbp_rate(currency):
    try:
        from services.invoice_document import gbp_rate
        return gbp_rate(currency)
    except Exception:
        return None


def received_invoices():
    """Every payment received on an invoice: currency, amount in that currency and the day it came in.
    The PKR money on an invoice gets its rupee amount saved the first time it is seen (or again when the
    pounds received in PKR change, unless the owner corrected it by hand); each PKR payment takes its share."""
    sync_invoice_payments()
    rows = query_db("""
        SELECT p.id AS payment_id, p.amount AS paid, p.paid_on, p.method, p.note,
               i.id, i.invoice_number, i.status, i.payment_method, u.full_name AS client_name,
               o.order_number, o.service_name, o.owner_name,
               r.gbp_amount AS r_gbp, r.amount AS r_amount, r.rate AS r_rate, r.edited AS r_edited
        FROM invoice_payments p
        JOIN invoices i ON i.id = p.invoice_id
        LEFT JOIN users u ON u.id = i.user_id
        LEFT JOIN orders o ON o.id = i.order_id
        LEFT JOIN finance_invoice_receipts r ON r.invoice_id = i.id
        WHERE i.status != 'Cancelled'
        ORDER BY p.paid_on, p.id;
    """) or []
    rows = [dict(r) for r in rows]
    for row in rows:
        row['currency'] = invoice_currency({'payment_method': row.get('method') or row.get('payment_method')})

    # Pounds paid into each foreign account on each invoice, and the amount saved for them in that currency
    foreign_gbp = {}  # (invoice_id, currency) -> pounds
    for row in rows:
        if row['currency'] in FOREIGN:
            key = (row['id'], row['currency'])
            foreign_gbp[key] = round(foreign_gbp.get(key, 0) + float(row['paid'] or 0), 2)
    converted = {}  # (invoice_id, currency) -> (amount, rate, edited)
    saved = {cur: _saved_fx(cur) for cur in FOREIGN if any(k[1] == cur for k in foreign_gbp)}
    rates = {}
    for (invoice_id, cur), gbp in foreign_gbp.items():
        old = saved[cur].get(invoice_id) or {}
        # Worked out again when new, when the pounds changed, or when the rate could not be fetched last time
        stale = old.get('gbp_amount') is None or (not old.get('edited') and (
            abs(float(old['gbp_amount']) - gbp) > 0.004 or old.get('amount') is None))
        if stale:
            saved_rate = old.get('rate')
            if not saved_rate:
                if cur not in rates:
                    rates[cur] = _gbp_rate(cur)
                saved_rate = rates[cur]
            amount = round(gbp * float(saved_rate), 2) if saved_rate else None
            _save_fx(cur, invoice_id, gbp, amount, saved_rate)
            converted[(invoice_id, cur)] = (amount, saved_rate, False)
        else:
            converted[(invoice_id, cur)] = (old.get('amount'), old.get('rate'), bool(old.get('edited')))

    out = []
    for row in rows:
        gbp = round(float(row['paid'] or 0), 2)
        if abs(gbp) <= 0.004:
            continue
        item = {
            'invoice_id': row['id'],
            'payment_id': row['payment_id'],
            'invoice_number': row['invoice_number'],
            'client_name': row.get('owner_name') or row.get('client_name') or '',
            'order_number': row.get('order_number'),
            'service_name': row.get('service_name'),
            'status': row['status'],
            'date': str(row.get('paid_on') or '')[:10],
            'method': row.get('method'),
            'note': row.get('note'),
            'currency': row['currency'],
            'gbp_amount': gbp,
            'amount': gbp,
            'rate': None,
            'edited': False,
        }
        if row['currency'] in FOREIGN:
            key = (row['id'], row['currency'])
            whole, saved_rate, edited = converted[key]
            total_gbp = foreign_gbp[key]
            share = (whole * gbp / total_gbp) if (whole is not None and abs(total_gbp) > 0.004) else None
            # The owner corrects the amount for the whole invoice (all its payments into that account together)
            item.update(amount=round(share, 2) if share is not None else None, rate=saved_rate, edited=edited,
                        invoice_amount=whole, invoice_gbp=total_gbp,
                        # older names the page still reads for PKR
                        invoice_rupees=whole, invoice_pkr_gbp=total_gbp)
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
                         key=lambda i: (i['date'], i['payment_id']), reverse=True),
        'expenses': [e for e in expenses if month_key(e['spent_on']) == month],
        'months': [m for m in months if m['month'] <= max(month, today)][::-1][:24],
        'rupees_missing': sum(1 for i in income if i['amount'] is None and i['currency'] == 'PKR'),
        # Payments into a foreign account whose amount there could not be worked out yet (no live rate)
        'fx_missing': {cur: sum(1 for i in income if i['amount'] is None and i['currency'] == cur) for cur in FOREIGN},
        'categories': list(EXPENSE_CATEGORIES),
    }
