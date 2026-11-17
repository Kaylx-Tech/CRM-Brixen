"""Pay an invoice by card (Stripe Checkout).

Each invoice gets its own link (kept in invoice_pay_links, no sign-in needed), printed as "Pay by Card" on the
invoice PDF and in the invoice email:

GET  /api/public/invoice-pay/<token>        Stripe Checkout for what is still due on the invoice
GET  /api/public/invoice-pay/<token>/done   thank-you page after paying (…?cancelled=1 when the customer went back)

When Stripe reports the payment (webhook checkout.session.completed, kind 'invoice_payment', handled from
services/address_billing.handle_event), the money is added to the invoice as a card payment: part paid or paid.
"""
from __future__ import annotations

import secrets

from db import execute_db, query_db
from services import address_billing
from services.address_billing import CARD, CURRENCY, StripeError


def _ensure_table():
    execute_db("""
        CREATE TABLE IF NOT EXISTS invoice_pay_links (
            token TEXT PRIMARY KEY,
            invoice_id INTEGER NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)


def _base_url():
    from config import API_PUBLIC_URL
    return API_PUBLIC_URL or 'https://api.brixenconsultants.com'


def _amount_due(invoice):
    from services.invoice_service import invoice_money_state
    return round(invoice_money_state(invoice)['amount_due'], 2)


def pay_link(invoice_id):
    """The invoice's card payment link, or None (Stripe not set up, nothing due, or cancelled)."""
    if not address_billing.configured():
        return None
    invoice = query_db("SELECT * FROM invoices WHERE id = ?;", (int(invoice_id),), one=True)
    if not invoice or str(invoice.get('status') or '') == 'Cancelled' or _amount_due(invoice) <= 0.004:
        return None
    _ensure_table()
    row = query_db("SELECT token FROM invoice_pay_links WHERE invoice_id = ?;", (int(invoice_id),), one=True)
    token = (row or {}).get('token')
    if not token:
        token = secrets.token_urlsafe(24)
        execute_db("INSERT INTO invoice_pay_links (token, invoice_id) VALUES (?, ?);", (token, int(invoice_id)))
    return f"{_base_url()}/api/public/invoice-pay/{token}"


def invoice_for_link(token):
    _ensure_table()
    return query_db("""
        SELECT i.*, o.order_number, o.service_name, u.email AS client_email
        FROM invoice_pay_links l
        JOIN invoices i ON i.id = l.invoice_id
        LEFT JOIN orders o ON o.id = i.order_id
        LEFT JOIN users u ON u.id = i.user_id
        WHERE l.token = ? LIMIT 1;
    """, (str(token or ''),), one=True)


def checkout_url(invoice, token):
    """Stripe Checkout for what is still due. Raises StripeError (not set up, nothing due, Stripe failed)."""
    due = _amount_due(invoice)
    if str(invoice.get('status') or '') == 'Cancelled' or due <= 0.004:
        raise StripeError('Nothing is due on this invoice.')
    link = f"{_base_url()}/api/public/invoice-pay/{token}"
    number = invoice.get('invoice_number') or f"#{invoice['id']}"
    name = f"Invoice {number}" + (f" · {invoice['service_name']}" if invoice.get('service_name') else '')
    meta = {'kind': 'invoice_payment', 'invoice_id': invoice['id']}
    data = {
        'mode': 'payment',
        'line_items': [{'quantity': 1, 'price_data': {
            'currency': CURRENCY, 'unit_amount': int(round(due * 100)), 'product_data': {'name': name[:250]}}}],
        'success_url': f"{link}/done", 'cancel_url': f"{link}/done?cancelled=1",
        'metadata': meta, 'payment_intent_data': {'metadata': meta},
    }
    if invoice.get('client_email'):
        data['customer_email'] = invoice['client_email']
    return address_billing._api('POST', '/checkout/sessions', data)['url']


def handle_paid_session(obj):
    """A finished Checkout for an invoice: add the card payment (once per Stripe session)."""
    if obj.get('payment_status') != 'paid':
        return 'waiting for the payment'
    meta = obj.get('metadata') or {}
    if not str(meta.get('invoice_id') or '').isdigit():
        return 'unknown invoice'
    invoice_id = int(meta['invoice_id'])
    note = f"Card payment (Stripe {obj.get('id')})"
    if query_db("SELECT 1 FROM invoice_payments WHERE invoice_id = ? AND note = ?;", (invoice_id, note), one=True):
        return 'already saved'
    invoice = query_db("SELECT * FROM invoices WHERE id = ?;", (invoice_id,), one=True)
    if not invoice:
        return 'unknown invoice'
    from services.invoice_service import invoice_money_state, update_admin_invoice
    money = invoice_money_state(invoice)
    amount = round((obj.get('amount_total') or 0) / 100, 2)
    paid = round(min(money['total'], money['amount_paid'] + amount), 2)
    _updated, error, _mail = update_admin_invoice(invoice_id, {
        'amount_paid': paid, 'payment_received_method': CARD, 'payment_note': note})
    if error:
        raise StripeError(f"Invoice {invoice.get('invoice_number')} could not be updated: {error}")
    try:
        from services.notification_service import notify_staff
        notify_staff('Invoice paid by card',
                     f"Invoice {invoice.get('invoice_number')}: £{amount:.2f} paid by card.",
                     'payment_received', '/admin/payments')
    except Exception:
        pass
    return 'invoice payment saved'
