"""Accountancy & Tax Filing Routes (/api/accountancy)
"""
from datetime import datetime, timedelta
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response

def handle_accountancy_routes(environ, start_response, path, method, user, body, query):
    """Route handler for /api/accountancy endpoints."""
    if not path.startswith('/api/accountancy'):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    # ── GET /api/accountancy/filings ───────────────────────────────────────
    if path == '/api/accountancy/filings' and method == 'GET':
        conditions = []
        params = []

        if not is_staff:
            conditions.append("c.user_id = ?")
            params.append(user_id)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        rows = query_db(f"""
            SELECT c.id, c.name as company_name, c.company_number, c.status,
                   c.accounts_next_due, c.confirmation_next_due, c.director,
                   c.reg_office, c.user_id, u.full_name as owner_name, u.email as owner_email,
                   c.identity_verified, c.psc_verified, c.accounts_overdue
            FROM companies c
            LEFT JOIN users u ON c.user_id = u.id
            {where_clause}
            ORDER BY c.accounts_next_due ASC;
        """, params)

        filings_data = []
        overdue_count = 0
        due_60_count = 0
        in_progress_count = 0
        issues_count_total = 0
        filed_count = 0

        today = datetime.now().date()
        in_60_days = today + timedelta(days=60)

        for r in rows:
            due_str = r.get('accounts_next_due')
            status = 'Not Started'
            is_overdue = False

            if due_str:
                try:
                    due_date = datetime.strptime(str(due_str)[:10], '%Y-%m-%d').date()
                    if due_date < today:
                        status = 'Overdue'
                        overdue_count += 1
                        is_overdue = True
                    elif due_date <= in_60_days:
                        status = 'Due Soon'
                        due_60_count += 1
                except Exception:
                    pass

            issues = 0
            if not r.get('reg_office'):
                issues += 1
            if r.get('identity_verified') != 'Verified':
                issues += 1
            if r.get('psc_verified') != 'Verified':
                issues += 1
            if is_overdue:
                issues += 1

            issues_count_total += issues

            # Mock Year End date calculation (usually 9 months before accounts due)
            year_end_str = ""
            if due_str:
                try:
                    due_d = datetime.strptime(str(due_str)[:10], '%Y-%m-%d').date()
                    y_end = due_d - timedelta(days=270)
                    year_end_str = y_end.strftime('%d/%m/%Y')
                except Exception:
                    year_end_str = "31/05/2025"

            filings_data.append({
                "id": r['id'],
                "company_name": r['company_name'],
                "company_number": r['company_number'] or "OC385142",
                "owner_name": r['owner_name'] or "Brixen Admin",
                "has_address": bool(r.get('reg_office')),
                "idv_status": r.get('identity_verified') or 'Not started',
                "psc_status": r.get('psc_verified') or 'Not started',
                "issues_count": issues,
                "year_end": year_end_str,
                "due_date": str(due_str) if due_str else "28/02/2026",
                "type": "Micro-entity",
                "status": status
            })

        return success_response(start_response, data={
            "metrics": {
                "overdue": overdue_count,
                "due_in_60_days": due_60_count,
                "in_progress": in_progress_count,
                "issues": issues_count_total,
                "filed": filed_count
            },
            "filings": filings_data
        })

    # ── GET /api/accountancy/company-accounts ───────────────────────────────
    if path == '/api/accountancy/company-accounts' and method == 'GET':
        return success_response(start_response, data={
            "accounts": [
                {"id": 1, "company_name": "52 ALDERLEY ROAD LLP", "period": "2024-2025", "type": "Micro-entity Balance Sheet", "status": "Draft", "turnover": "£45,000", "net_profit": "£18,200"},
                {"id": 2, "company_name": "A.J.B. FLOORING LIMITED", "period": "2024-2025", "type": "Micro-entity Balance Sheet", "status": "Ready to File", "turnover": "£112,400", "net_profit": "£34,150"},
                {"id": 3, "company_name": "ABBAS & SONS ENTERPRISES LTD", "period": "2024-2025", "type": "Dormant Accounts", "status": "Filed", "turnover": "£0", "net_profit": "£0"}
            ]
        })

    # ── GET /api/accountancy/hmrc ───────────────────────────────────────────
    if path == '/api/accountancy/hmrc' and method == 'GET':
        return success_response(start_response, data={
            "ct600": [
                {"id": 1, "company_name": "52 ALDERLEY ROAD LLP", "utr": "9876543210", "period": "01/06/2024 - 31/05/2025", "tax_due": "£3,458.00", "status": "Pending Calculation"},
                {"id": 2, "company_name": "A.J.B. FLOORING LIMITED", "utr": "8765432109", "period": "01/08/2024 - 31/07/2025", "tax_due": "£6,488.50", "status": "Payment Due"},
                {"id": 3, "company_name": "ABBAS & SONS ENTERPRISES LTD", "utr": "7654321098", "period": "01/09/2024 - 31/08/2025", "tax_due": "£0.00", "status": "Nil Return Filed"}
            ]
        })

    return None
