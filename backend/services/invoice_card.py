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


def _add_card_payment(invoice, amount, session_id, how='by card'):
    """Add a card payment to the invoice (once per Stripe session). Returns a note for the log."""
    note = f"Card payment (Stripe {session_id})"
    if query_db("SELECT 1 FROM invoice_payments WHERE invoice_id = ? AND note = ?;", (invoice['id'], note), one=True):
        return 'already saved'
    from services.invoice_service import invoice_money_state, update_admin_invoice
    money = invoice_money_state(invoice)
    paid = round(min(money['total'], money['amount_paid'] + amount), 2)
    _updated, error, _mail = update_admin_invoice(invoice['id'], {
        'amount_paid': paid, 'payment_received_method': CARD, 'payment_note': note})
    if error:
        raise StripeError(f"Invoice {invoice.get('invoice_number')} could not be updated: {error}")
    _tell_team('Invoice paid by card', f"Invoice {invoice.get('invoice_number')}: £{amount:.2f} paid {how}.")
    return 'invoice payment saved'


def _tell_team(title, message):
    try:
        from services.notification_service import notify_staff
        notify_staff(title, message, 'payment_received', '/admin/payments')
    except Exception:
        pass


def handle_paid_session(obj):
    """A finished Checkout for an invoice ("Pay by Card"): add the card payment."""
    if obj.get('payment_status') != 'paid':
        return 'waiting for the payment'
    meta = obj.get('metadata') or {}
    if not str(meta.get('invoice_id') or '').isdigit():
        return 'unknown invoice'
    invoice = query_db("SELECT * FROM invoices WHERE id = ?;", (int(meta['invoice_id']),), one=True)
    if not invoice:
        return 'unknown invoice'
    return _add_card_payment(invoice, round((obj.get('amount_total') or 0) / 100, 2), obj.get('id'))


def handle_payment_link_session(obj):
    """A payment through a Stripe Payment Link made in the Stripe dashboard (buy.stripe.com/…). Stripe does not
    say which invoice it is for, so the CRM looks for it: the invoice number put on the link
    (?client_reference_id=INV-…), else the one open invoice of that email with exactly that amount due. When
    none (or several) match, the team is told to match it by hand."""
    if obj.get('payment_status') != 'paid':
        return 'waiting for the payment'
    amount = round((obj.get('amount_total') or 0) / 100, 2)
    details = obj.get('customer_details') or {}
    email = str(details.get('email') or obj.get('customer_email') or '').strip().lower()
    who = details.get('name') or email or 'a customer'
    if str(obj.get('currency') or 'gbp').lower() != CURRENCY:
        _tell_team('Card payment to match', f"{who} paid {amount:.2f} {str(obj.get('currency')).upper()} through a "
                   "Stripe Payment Link. Please find the invoice and mark it paid.")
        return 'payment link: other currency, team told'

    from services.invoice_service import invoice_money_state
    ref = str(obj.get('client_reference_id') or '').strip()
    invoice = None
    if ref:
        invoice = query_db("SELECT * FROM invoices WHERE LOWER(invoice_number) = LOWER(?) LIMIT 1;", (ref,), one=True)
    if not invoice and email:
        rows = query_db("""
            SELECT DISTINCT i.* FROM invoices i
            LEFT JOIN users u ON u.id = i.user_id
            LEFT JOIN orders o ON o.id = i.order_id
            WHERE i.status NOT IN ('Paid', 'Cancelled')
              AND (LOWER(u.email) = ? OR LOWER(COALESCE(o.owner_form_email, '')) = ?);
        """, (email, email)) or []
        due = [r for r in rows if abs(invoice_money_state(r)['amount_due'] - amount) < 0.01]
        if len(due) == 1:
            invoice = due[0]
    if not invoice:
        _tell_team('Card payment to match',
                   f"{who} paid £{amount:.2f} through a Stripe Payment Link, but no single open invoice matches "
                   f"(email {email or 'not given'}). Please find the invoice and mark it paid.")
        return 'payment link: no single match, team told'
    return _add_card_payment(invoice, amount, obj.get('id'), how='by card (Stripe Payment Link)')
