"""Invoice helpers aligned with app.py (money state, enrich, update, send gate)."""
from __future__ import annotations

import datetime
from db import query_db, execute_db
from services.invoice_mail import send_invoice_email

INVOICE_STATUSES = ('Paid', 'Pending', 'Partial Paid', 'Overdue', 'Cancelled')
INVOICE_PAYMENT_TIMINGS = ('Advance', 'Deposit', 'After work')
ORDER_PAYMENT_MODES = (
    'Website Charge',
    'PKR(Bank Transfer)',
    'GBP(Bank Transfer)',
    'Credit Card (Stripe)',
)


def parse_invoice_money(raw):
    try:
        return round(float(str(raw).replace('£', '').replace('Rs', '').replace(',', '').strip()), 2)
    except (TypeError, ValueError, AttributeError):
        return None


def default_deposit_amount(total):
    try:
        value = float(total or 0)
    except (TypeError, ValueError):
        value = 0.0
    return round(value * 0.5, 2)


def invoice_status_value(raw):
    text = ' '.join(str(raw or '').strip().lower().replace('_', ' ').replace('-', ' ').split())
    if text in ('partial paid', 'part paid', 'partial', 'partpaid'):
        return 'Partial Paid'
    if text == 'paid':
        return 'Paid'
    if text == 'pending':
        return 'Pending'
    if text == 'overdue':
        return 'Overdue'
    if text == 'cancelled':
        return 'Cancelled'
    return ''


def invoice_timing_value(raw):
    text = str(raw or '').strip().lower()
    if text in ('deposit', 'part', 'partial', 'part paid', '50%', 'advance deposit'):
        return 'Deposit'
    if text in ('advance', 'upfront', 'full', 'full advance', 'pay first'):
        return 'Advance'
    if text in ('after work', 'on completion', 'completion', 'after'):
        return 'After work'
    return ''


def invoice_money_state(invoice):
    invoice = invoice or {}
    try:
        total = float(invoice.get('total') or 0)
    except (TypeError, ValueError):
        total = 0.0
    try:
        paid = float(invoice.get('amount_paid') or 0)
    except (TypeError, ValueError):
        paid = 0.0
    try:
        deposit = float(invoice.get('deposit_amount') or 0)
    except (TypeError, ValueError):
        deposit = 0.0
    status = str(invoice.get('status') or 'Pending')
    if status == 'Paid':
        paid = total
    paid = max(0.0, round(paid, 2))
    due = max(0.0, round(total - paid, 2))
    timing = invoice_timing_value(invoice.get('payment_timing')) or 'After work'
    display = status
    if status == 'Partial Paid' or (
        status not in ('Paid', 'Cancelled', 'Overdue') and paid > 0.004 and due > 0.004
    ):
        display = 'Partial Paid'
    return {
        'currency': 'GBP',
        'total': round(total, 2),
        'amount_paid': paid,
        'amount_due': due,
        'deposit_amount': max(0.0, round(deposit, 2)),
        'timing': timing,
        'status': status,
        'display_status': display,
        'fully_paid': due <= 0.004 and total > 0 and status == 'Paid',
    }


def enrich_invoice_row(row):
    if not row:
        return None
    out = dict(row)
    out.update(invoice_money_state(out))
    return out


def load_invoice_for_staff(invoice_id):
    row = query_db(
        """
        SELECT i.*,
               u.full_name as client_name, u.email as client_email,
               o.order_number, o.service_name, o.owner_name, o.owner_form_email,
               o.payment_mode as order_payment_mode
        FROM invoices i
        LEFT JOIN users u ON i.user_id = u.id
        LEFT JOIN orders o ON i.order_id = o.id
        WHERE i.id = ?
        LIMIT 1;
        """,
        (invoice_id,),
        one=True,
    )
    return enrich_invoice_row(row) if row else None


def update_admin_invoice(invoice_id, data, *, actor=None):
    """Mirror app.py update_admin_invoice. Returns (invoice, error, mail)."""
    invoice = query_db("SELECT * FROM invoices WHERE id = ?;", (invoice_id,), one=True)
    if not invoice:
        return None, 'Invoice not found', None

    data = data if isinstance(data, dict) else {}
    status = invoice.get('status')
    if 'status' in data:
        status = invoice_status_value(data.get('status')) or str(data.get('status') or '').strip()
        if status not in INVOICE_STATUSES:
            return None, 'Choose Paid, Partial Paid, Pending, Overdue, or Cancelled', None

    method = invoice.get('payment_method')
    if 'payment_method' in data:
        method = str(data.get('payment_method') or '').strip() or method
        if method and method not in ORDER_PAYMENT_MODES and method != 'Credit Card (Stripe)':
            return None, 'Invalid payment method', None

    previous_timing = invoice_timing_value(invoice.get('payment_timing')) or 'After work'
    timing = previous_timing
    if 'payment_timing' in data:
        timing = invoice_timing_value(data.get('payment_timing'))
        if timing not in INVOICE_PAYMENT_TIMINGS:
            return None, 'Choose After work, full advance, or a deposit', None

    due_date = invoice.get('due_date')
    if 'due_date' in data:
        raw_due = str(data.get('due_date') or '').strip()
        if raw_due:
            try:
                due_date = datetime.date.fromisoformat(raw_due[:10]).isoformat()
            except ValueError:
                return None, 'Enter a valid due date', None

    amount = float(invoice.get('amount') or 0)
    tax = float(invoice.get('tax') or 0)
    total = float(invoice.get('total') or 0)
    if 'total' in data or 'amount' in data:
        raw_amount = data.get('total') if 'total' in data else data.get('amount')
        parsed_total = parse_invoice_money(raw_amount)
        if parsed_total is None:
            return None, 'Enter a valid amount', None
        if parsed_total < 0 or parsed_total > 100000:
            return None, 'Amount must be between £0 and £100,000', None
        total = parsed_total
        amount = round(total, 2)
        tax = 0.0

    old_paid = invoice_money_state(invoice)['amount_paid']
    deposit_amount = float(invoice.get('deposit_amount') or 0)
    if 'deposit_amount' in data:
        parsed_deposit = parse_invoice_money(data.get('deposit_amount'))
        if parsed_deposit is None:
            return None, 'Enter a valid deposit amount', None
        if parsed_deposit < 0 or parsed_deposit > total:
            return None, 'Deposit must be between 0 and the invoice total', None
        deposit_amount = parsed_deposit

    if timing == 'Deposit':
        if deposit_amount <= 0.004:
            deposit_amount = default_deposit_amount(total)
        if deposit_amount + 0.004 >= total and total > 0:
            timing = 'Advance'
            deposit_amount = 0
    else:
        deposit_amount = 0

    amount_paid = old_paid
    if 'amount_paid' in data:
        parsed_paid = parse_invoice_money(data.get('amount_paid'))
        if parsed_paid is None:
            return None, 'Enter a valid amount received', None
        if parsed_paid < 0 or parsed_paid > total:
            return None, 'Amount received must be between 0 and the invoice total', None
        amount_paid = parsed_paid

    if status == 'Paid':
        amount_paid = total
    elif amount_paid + 0.004 >= total and total > 0:
        status = 'Paid'
        amount_paid = total
    elif status == 'Partial Paid' and amount_paid <= 0.004:
        if deposit_amount > 0.004:
            amount_paid = min(deposit_amount, total)
        elif old_paid > 0.004:
            amount_paid = old_paid
    elif status not in ('Cancelled', 'Overdue') and amount_paid > 0.004:
        status = 'Partial Paid'

    was_paid = str(invoice.get('status') or '') == 'Paid'
    paid_at = invoice.get('paid_at')
    if status == 'Paid' and not was_paid:
        paid_at = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    elif status != 'Paid':
        paid_at = None

    execute_db(
        """
        UPDATE invoices
        SET status = ?, payment_method = ?, payment_timing = ?, due_date = ?, amount = ?, tax = ?, total = ?,
            paid_at = ?, deposit_amount = ?, amount_paid = ?
        WHERE id = ?;
        """,
        (status, method, timing, due_date, amount, tax, total, paid_at, deposit_amount, amount_paid, invoice_id),
    )

    if method in ORDER_PAYMENT_MODES and invoice.get('order_id'):
        execute_db(
            "UPDATE orders SET payment_mode = ?, updated_at = datetime('now') WHERE id = ?;",
            (method, invoice['order_id']),
        )

    mail = None
    # Only email when staff explicitly click Send (send_payment_details).
    if data.get('send_payment_details') and invoice.get('order_id') and status != 'Cancelled':
        mail = send_invoice_email(invoice_id)

    updated = load_invoice_for_staff(invoice_id)
    return updated, None, mail


def estimate_order_catalog_cost(order_row):
    """Best-effort catalog cost from services by service_name (first product)."""
    if not order_row:
        return 0.0
    order_id = order_row.get('id')
    if order_id:
        items = query_db("SELECT product_name, quantity FROM order_line_items WHERE order_id = ?;", (order_id,)) or []
        if len(items) > 1:
            total_cost = 0.0
            for it in items:
                svc = query_db(
                    "SELECT cost_price FROM services WHERE LOWER(name) = LOWER(?) LIMIT 1;",
                    (str(it.get('product_name') or '').strip(),), one=True)
                total_cost += float((svc or {}).get('cost_price') or 0) * int(it.get('quantity') or 1)
            return round(total_cost, 2)
    service_id = order_row.get('service_id')
    if service_id:
        svc = query_db("SELECT cost_price FROM services WHERE id = ?;", (service_id,), one=True)
        if svc is not None:
            return round(float(svc.get('cost_price') or 0), 2)
    service_name = str(order_row.get('service_name') or '').strip()
    if service_name:
        first_name = service_name.split(',')[0].strip()
        svc = query_db(
            "SELECT cost_price FROM services WHERE LOWER(name) = LOWER(?) LIMIT 1;",
            (first_name,),
            one=True,
        )
        if svc is not None:
            return round(float(svc.get('cost_price') or 0), 2)
    return 0.0


def resolve_order_cost(order_row):
    catalog_cost = estimate_order_catalog_cost(order_row)
    if not order_row:
        return {'cost': 0.0, 'catalog_cost': 0.0, 'manual_cost': None, 'cost_source': 'none'}
    raw = order_row.get('cost_price')
    manual = None
    if raw is not None and str(raw).strip() != '':
        try:
            manual = round(float(raw), 2)
        except (TypeError, ValueError):
            manual = None
    if manual is not None:
        return {
            'cost': manual,
            'catalog_cost': catalog_cost,
            'manual_cost': manual,
            'cost_source': 'manual',
        }
    return {
        'cost': catalog_cost,
        'catalog_cost': catalog_cost,
        'manual_cost': None,
        'cost_source': 'catalog' if catalog_cost else 'none',
    }


def attach_order_profit_fields(order_row):
    out = dict(order_row or {})
    cost_info = resolve_order_cost(out)
    try:
        total = float(out.get('amount') if out.get('amount') is not None else out.get('total') or 0)
    except (TypeError, ValueError):
        total = 0.0
    profit = round(total - float(cost_info['cost'] or 0), 2)
    out['catalog_cost'] = cost_info['catalog_cost']
    out['manual_cost'] = cost_info['manual_cost']
    out['resolved_cost'] = cost_info['cost']
    out['cost_source'] = cost_info['cost_source']
    out['profit'] = profit
    out['total'] = total
    return out
