"""Revenue & Balance Sheet (/api/admin/finance): each currency's balance month by month, the paid
invoices that came in, and the company expenses that went out. Admins only (prices and cash flow).

GET    /api/admin/finance?month=YYYY-MM           the balance sheet for that month (default: this month)
POST   /api/admin/finance/expenses                {spent_on, category, description, amount, currency}
PUT    /api/admin/finance/expenses/<id>           any of the same fields
DELETE /api/admin/finance/expenses/<id>
PUT    /api/admin/finance/opening/<GBP|PKR>       {amount, start_month}  the starting balance
PUT    /api/admin/finance/receipts/<invoice_id>   {amount} rupees actually received, or {reset: true}
"""
import datetime
import re

from db import query_db, execute_db
from utils.validation import validation_error
from utils.response import success_response, error_response
from services.audit_service import log_activity
from services.finance_ledger import CURRENCIES, balance_sheet, month_key

ADMIN_ROLES = ('SUPER_ADMIN', 'ADMIN')


def _money(value):
    try:
        n = round(float(str(value).replace('£', '').replace('Rs', '').replace(',', '').strip()), 2)
    except (TypeError, ValueError, AttributeError):
        return None
    return n if n == n else None


def _clean_expense(body, partial=False):
    """Validated expense fields. Returns (fields, {field: message} or None)."""
    body = body if isinstance(body, dict) else {}
    out = {}
    if 'spent_on' in body or not partial:
        text = str(body.get('spent_on') or '').strip()[:10]
        try:
            datetime.datetime.strptime(text, '%Y-%m-%d')
        except ValueError:
            return None, {'spent_on': "Choose the date of the expense."}
        out['spent_on'] = text
    if 'category' in body or not partial:
        out['category'] = str(body.get('category') or '').strip()[:60]
        if not out['category']:
            return None, {'category': "Choose a category (Salary, Rent, Other …)."}
    if 'description' in body or not partial:
        out['description'] = str(body.get('description') or '').strip()[:500]
    if 'amount' in body or not partial:
        amount = _money(body.get('amount'))
        if amount is None or amount <= 0:
            return None, {'amount': "Enter the amount spent, more than 0."}
        out['amount'] = amount
    if 'currency' in body or not partial:
        out['currency'] = str(body.get('currency') or 'GBP').strip().upper()
        if out['currency'] not in CURRENCIES:
            return None, {'currency': "Currency must be GBP or PKR."}
    return out, None


def handle_finance_routes(environ, start_response, path, method, user, body, query):
    if not path.startswith('/api/admin/finance'):
        return None
    if not user:
        return error_response(start_response, "Authentication required", status_code=401)
    if user.get('role') not in ADMIN_ROLES:
        return error_response(start_response, "The balance sheet is for admins only.", status_code=403)
    uid = user.get('id')

    if path == '/api/admin/finance' and method == 'GET':
        month = (query.get('month') or [''])[0]
        return success_response(start_response, data=balance_sheet(month))

    if path == '/api/admin/finance/expenses' and method == 'POST':
        fields, err = _clean_expense(body)
        if err:
            return validation_error(start_response, err)
        expense_id = execute_db("""
            INSERT INTO finance_expenses (spent_on, category, description, amount, currency, created_by,
                                          created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'));
        """, (fields['spent_on'], fields['category'], fields['description'], fields['amount'],
              fields['currency'], uid))
        log_activity(uid, 'Finance expense added', 'finance_expense', expense_id,
                     f"{fields['category']} {fields['currency']} {fields['amount']} on {fields['spent_on']}")
        return success_response(start_response, data={'id': expense_id}, message="Expense added")

    m = re.match(r'^/api/admin/finance/expenses/(\d+)$', path)
    if m:
        expense_id = int(m.group(1))
        row = query_db("SELECT * FROM finance_expenses WHERE id = ?;", (expense_id,), one=True)
        if not row:
            return error_response(start_response, "Expense not found", status_code=404)
        if method == 'PUT':
            fields, err = _clean_expense(body, partial=True)
            if err:
                return validation_error(start_response, err)
            if fields:
                sets = ', '.join(f"{k} = ?" for k in fields)
                execute_db(f"UPDATE finance_expenses SET {sets}, updated_at = datetime('now') WHERE id = ?;",
                           (*fields.values(), expense_id))
                log_activity(uid, 'Finance expense edited', 'finance_expense', expense_id, None)
            return success_response(start_response, message="Expense saved")
        if method == 'DELETE':
            execute_db("DELETE FROM finance_expenses WHERE id = ?;", (expense_id,))
            log_activity(uid, 'Finance expense removed', 'finance_expense', expense_id,
                         f"{row['category']} {row['currency']} {row['amount']} on {row['spent_on']}")
            return success_response(start_response, message="Expense removed")

    m = re.match(r'^/api/admin/finance/opening/([A-Za-z]{3})$', path)
    if m and method == 'PUT':
        currency = m.group(1).upper()
        if currency not in CURRENCIES:
            return error_response(start_response, "Currency must be GBP or PKR", status_code=400)
        data = body if isinstance(body, dict) else {}
        amount = _money(data.get('amount'))
        start_month = month_key(data.get('start_month'))
        errors = {}
        if amount is None:
            errors['amount'] = "Enter the starting balance, like 1200 or 1200.50."
        if not start_month:
            errors['start_month'] = "Choose the month this balance starts from."
        if errors:
            return validation_error(start_response, errors)
        execute_db("""
            INSERT INTO finance_opening_balances (currency, amount, start_month, updated_by, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(currency) DO UPDATE SET amount = excluded.amount, start_month = excluded.start_month,
                updated_by = excluded.updated_by, updated_at = excluded.updated_at;
        """, (currency, amount, start_month, uid))
        log_activity(uid, 'Finance starting balance set', 'finance_opening', currency,
                     f"{currency} {amount} from {start_month}")
        return success_response(start_response, message="Starting balance saved")

    m = re.match(r'^/api/admin/finance/receipts/(\d+)$', path)
    if m and method == 'PUT':
        invoice_id = int(m.group(1))
        row = query_db("SELECT * FROM finance_invoice_receipts WHERE invoice_id = ?;", (invoice_id,), one=True)
        if not row:
            return error_response(start_response, "Only invoices paid into the PKR account have a rupee amount",
                                  status_code=404)
        data = body if isinstance(body, dict) else {}
        if data.get('reset'):
            # Back to the automatic amount: it is worked out again (live rate) on the next load
            execute_db("UPDATE finance_invoice_receipts SET edited = 0, rate = NULL, gbp_amount = -1, "
                       "updated_at = datetime('now') WHERE invoice_id = ?;", (invoice_id,))
            return success_response(start_response, message="Rupee amount reset")
        amount = _money(data.get('amount'))
        if amount is None or amount < 0:
            return validation_error(start_response, {'amount': "Enter the rupees received, 0 or more."})
        execute_db("UPDATE finance_invoice_receipts SET amount = ?, edited = 1, updated_at = datetime('now') "
                   "WHERE invoice_id = ?;", (amount, invoice_id))
        log_activity(uid, 'Finance rupees received corrected', 'invoice', invoice_id, f"PKR {amount}")
        return success_response(start_response, message="Rupee amount saved")

    return error_response(start_response, "Not found", status_code=404)
