"""Accountancy & Tax Filing Routes (/api/accountancy, /api/admin/accountancy)
"""
import re
from datetime import datetime, timedelta
from db import query_db, execute_db
from utils.response import json_response, success_response, error_response

def handle_accountancy_routes(environ, start_response, path, method, user, body, query):
    """Route handler for Accountancy and UK filing APIs."""
    valid_prefixes = ('/api/accountancy', '/api/admin/accountancy', '/api/client/accountancy')
    if not any(path.startswith(prefix) for prefix in valid_prefixes):
        return None

    if not user:
        return error_response(start_response, "Authentication required", status_code=401)

    user_role = user.get('role', 'CLIENT')
    user_id = user.get('id')
    is_staff = user_role in ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')

    def _can_access_company(company_row):
        if not company_row:
            return False
        if is_staff:
            return True
        return company_row.get('user_id') == user_id

    # ── 1. GET /api/admin/accountancy OR /api/accountancy/filings ─────────
    if path in (
        '/api/accountancy',
        '/api/admin/accountancy',
        '/api/accountancy/filings',
        '/api/admin/accountancy/filings',
        '/api/client/accountancy'
    ) and method == 'GET':
        conditions = []
        params = []

        if not is_staff:
            conditions.append("c.user_id = ?")
            params.append(user_id)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        rows = query_db(f"""
            SELECT c.id, c.name as company_name, c.company_number, c.status as company_status,
                   c.accounts_next_due, c.confirmation_next_due, c.director,
                   c.reg_office, c.user_id, u.full_name as owner_name, u.email as owner_email,
                   c.identity_verified, c.psc_verified, c.account_status,
                   ca.id as filing_id, ca.status as filing_status, ca.accounts_type,
                   ca.period_start, ca.period_end, ca.due_date as filing_due_date,
                   ca.confirmation_number, ca.filed_at, ca.notes as filing_notes
            FROM companies c
            LEFT JOIN users u ON c.user_id = u.id
            LEFT JOIN company_accounts ca ON ca.company_id = c.id
            {where_clause}
            ORDER BY 
                CASE 
                    WHEN c.accounts_next_due IS NOT NULL AND c.accounts_next_due != '' THEN c.accounts_next_due 
                    ELSE '9999-12-31' 
                END ASC,
                c.name ASC;
        """, params)

        filings_data = []
        overdue_count = 0
        due_60_count = 0
        in_progress_count = 0
        issues_count_total = 0
        filed_count = 0

        today = datetime.now().date()
        in_60_days = today + timedelta(days=60)
        seen_company_ids = set()

        for r in rows:
            cid = r['id']
            if cid in seen_company_ids:
                continue
            seen_company_ids.add(cid)

            due_str = r.get('accounts_next_due') or r.get('filing_due_date')
            filing_status = r.get('filing_status') or r.get('account_status')
            status = 'Not started'
            is_overdue = False

            if filing_status in ('Filed', 'Submitted'):
                status = 'Filed'
                filed_count += 1
            elif filing_status in ('In Progress', 'Draft', 'Ready to File', 'Ready to file', 'Review'):
                status = filing_status
                in_progress_count += 1
            elif due_str:
                try:
                    due_date = datetime.strptime(str(due_str)[:10], '%Y-%m-%d').date()
                    if due_date < today:
                        status = 'Overdue'
                        overdue_count += 1
                        is_overdue = True
                    elif due_date <= in_60_days:
                        status = 'Due Soon'
                        due_60_count += 1
                    else:
                        status = 'Active'
                except Exception:
                    status = 'Active'
            else:
                status = 'Active'

            # Calculate compliance issues count
            issues = 0
            if not r.get('reg_office') or r.get('reg_office') == 'United Kingdom':
                issues += 1
            if str(r.get('identity_verified') or '').lower() not in ('verified', '1', 'true'):
                issues += 1
            if str(r.get('psc_verified') or '').lower() not in ('verified', '1', 'true'):
                issues += 1
            if is_overdue:
                issues += 1

            issues_count_total += issues

            # Calculate Year End date
            year_end_str = ""
            if r.get('period_end'):
                try:
                    year_end_str = datetime.strptime(str(r.get('period_end'))[:10], '%Y-%m-%d').strftime('%d/%m/%Y')
                except Exception:
                    year_end_str = str(r.get('period_end'))
            elif due_str:
                try:
                    due_d = datetime.strptime(str(due_str)[:10], '%Y-%m-%d').date()
                    y_end = due_d - timedelta(days=270)
                    year_end_str = y_end.strftime('%d/%m/%Y')
                except Exception:
                    year_end_str = "31/05/2025"
            else:
                year_end_str = "31/12/2024"

            # Formatted Due Date
            formatted_due = "N/A"
            if due_str:
                try:
                    formatted_due = datetime.strptime(str(due_str)[:10], '%Y-%m-%d').strftime('%d/%m/%Y')
                except Exception:
                    formatted_due = str(due_str)

            filings_data.append({
                "id": cid,
                "company_id": cid,
                "company_name": r['company_name'],
                "company_number": r['company_number'] or "",
                "owner_name": r['owner_name'] or "",
                "owner_email": r['owner_email'] or "",
                "has_address": bool(r.get('reg_office')),
                "idv_status": "Verified" if str(r.get('identity_verified') or '').lower() in ('verified', '1', 'true') else 'Not started',
                "psc_status": "Verified" if str(r.get('psc_verified') or '').lower() in ('verified', '1', 'true') else 'Not started',
                "issues_count": issues,
                "year_end": year_end_str,
                "due_date": formatted_due,
                "raw_due_date": str(due_str) if due_str else "",
                "type": r.get('accounts_type') or "Micro-entity",
                "status": status,
                "filing_id": r.get('filing_id'),
                "confirmation_number": r.get('confirmation_number') or "",
                "notes": r.get('filing_notes') or ""
            })

        return success_response(start_response, data={
            "metrics": {
                "overdue": overdue_count,
                "due_in_60_days": due_60_count,
                "in_progress": in_progress_count,
                "issues": issues_count_total,
                "filed": filed_count,
                "total": len(filings_data)
            },
            "filings": filings_data,
            "companies": filings_data
        })

    # ── 2. GET /api/admin/accountancy/company-accounts ──────────────────────
    if path in ('/api/accountancy/company-accounts', '/api/admin/accountancy/company-accounts') and method == 'GET':
        if not is_staff:
            return error_response(start_response, "Access denied. Staff only.", status_code=403)
        rows = query_db("""
            SELECT c.id as company_id, c.name as company_name, c.company_number,
                   ca.id as filing_id, ca.period_start, ca.period_end, ca.accounts_type, ca.status,
                   ca.filed_at, ca.created_at
            FROM companies c
            LEFT JOIN company_accounts ca ON ca.company_id = c.id
            ORDER BY c.name ASC;
        """)

        accounts = []
        for r in rows:
            period_str = "2024-2025"
            if r.get('period_start') and r.get('period_end'):
                period_str = f"{str(r['period_start'])[:4]}-{str(r['period_end'])[:4]}"

            # Check if there are real book entries
            entries = query_db("SELECT amount FROM company_book_entries WHERE company_id = ?;", (r['company_id'],))
            if entries:
                income = sum(float(e['amount']) for e in entries if float(e['amount']) > 0)
                expense = sum(abs(float(e['amount'])) for e in entries if float(e['amount']) < 0)
                profit = income - expense
                turnover_str = f"£{income:,.2f}"
                net_profit_str = f"£{profit:,.2f}"
            else:
                turnover_str = "£0.00"
                net_profit_str = "£0.00"

            accounts.append({
                "id": r['filing_id'] or r['company_id'],
                "company_id": r['company_id'],
                "company_name": r['company_name'],
                "company_number": r['company_number'] or "",
                "period": period_str,
                "type": r.get('accounts_type') or "Micro-entity Balance Sheet",
                "status": r.get('status') or "Draft",
                "turnover": turnover_str,
                "net_profit": net_profit_str,
                "filed_at": r.get('filed_at')
            })

        return success_response(start_response, data={"accounts": accounts})

    # ── 3. GET /api/admin/accountancy/hmrc ──────────────────────────────────
    if path in ('/api/accountancy/hmrc', '/api/admin/accountancy/hmrc') and method == 'GET':
        if not is_staff:
            return error_response(start_response, "Access denied. Staff only.", status_code=403)
        rows = query_db("""
            SELECT c.id, c.name as company_name, c.utr_number, c.status, c.accounts_next_due,
                   ca.status as filing_status
            FROM companies c
            LEFT JOIN company_accounts ca ON ca.company_id = c.id
            ORDER BY c.name ASC;
        """)

        ct600_data = []
        for r in rows:
            utr = r.get('utr_number') or ""
            if r.get('filing_status') == 'Filed':
                status = "Nil Return Filed"
            elif r.get('status') == 'Active':
                status = "Pending Calculation"
            else:
                status = r.get('status') or "Pending"
            tax = "£0.00"
            ct600_data.append({
                "id": r['id'],
                "company_id": r['id'],
                "company_name": r['company_name'],
                "utr": utr,
                "period": "01/06/2024 - 31/05/2025",
                "tax_due": tax,
                "status": status
            })

        return success_response(start_response, data={"ct600": ct600_data})

    # ── 4. POST /api/admin/accountancy or /api/admin/accountancy/<id>/file ─
    match_file = re.match(r'^/api/(?:admin/)?accountancy/(?:(\d+)/file|file)$', path)
    if (path in ('/api/accountancy', '/api/admin/accountancy', '/api/client/accountancy') or match_file) and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Use the staff Accountancy menu to file accounts", status_code=403)
        comp_id_from_path = match_file.group(1) if match_file else None
        company_id = comp_id_from_path or body.get('company_id')
        if not company_id:
            return error_response(start_response, "Please select a company to file accounts", status_code=400)

        try:
            company_id = int(company_id)
        except (ValueError, TypeError):
            return error_response(start_response, "Invalid company ID", status_code=400)

        company = query_db("SELECT id, user_id, name FROM companies WHERE id = ? LIMIT 1;", (company_id,), one=True)
        if not company:
            return error_response(start_response, "Company not found", status_code=404)

        accounts_type = body.get('accounts_type') or body.get('type') or 'Micro-entity'
        status = body.get('status') or 'Filed'
        period_start = body.get('period_start') or '2024-01-01'
        period_end = body.get('period_end') or '2024-12-31'
        due_date = body.get('due_date') or '2025-09-30'
        notes = body.get('notes') or body.get('submission_notes') or ''

        import secrets
        conf_num = body.get('confirmation_number') or f"AC-{secrets.randbelow(900000) + 100000}"

        # Insert or update in company_accounts
        existing = query_db("SELECT id FROM company_accounts WHERE company_id = ? LIMIT 1;", (company_id,), one=True)
        if existing:
            execute_db("""
                UPDATE company_accounts
                SET accounts_type = ?, status = ?, period_start = ?, period_end = ?,
                    due_date = ?, confirmation_number = ?, notes = ?, filed_at = datetime('now'), updated_at = datetime('now')
                WHERE id = ?;
            """, (accounts_type, status, period_start, period_end, due_date, conf_num, notes, existing['id']))
            filing_id = existing['id']
        else:
            filing_id = execute_db("""
                INSERT INTO company_accounts (
                    company_id, user_id, period_start, period_end, due_date,
                    accounts_type, status, confirmation_number, notes, filed_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'));
            """, (company_id, company['user_id'] or user_id, period_start, period_end, due_date, accounts_type, status, conf_num, notes))

        # Update company's account_status
        execute_db("UPDATE companies SET account_status = ? WHERE id = ?;", (status, company_id))

        return success_response(start_response, data={
            "id": filing_id,
            "company_id": company_id,
            "confirmation_number": conf_num,
            "status": status,
            "accounts_type": accounts_type
        }, message="Company accounts filed successfully!", status_code=201)

    # ── 5. DELETE /api/admin/accountancy/<company_id> (Remove / Reset Filing) ─
    match_del_filing = re.match(r'^/api/(?:admin/)?accountancy/(\d+)$', path)
    if match_del_filing and method == 'DELETE':
        if not is_staff:
            return error_response(start_response, "Access denied. Staff only.", status_code=403)
        comp_id = int(match_del_filing.group(1))
        execute_db("DELETE FROM company_accounts WHERE company_id = ?;", (comp_id,))
        execute_db("UPDATE companies SET account_status = 'Not started' WHERE id = ?;", (comp_id,))
        return success_response(start_response, message="Filing record removed successfully.")

    # ── 6. POST /api/admin/accountancy/bulk-delete ─────────────────────────
    if path in ('/api/accountancy/bulk-delete', '/api/admin/accountancy/bulk-delete') and method == 'POST':
        if not is_staff:
            return error_response(start_response, "Access denied. Staff only.", status_code=403)
        ids = body.get('ids', [])
        if not ids or not isinstance(ids, list):
            return error_response(start_response, "No record IDs provided for deletion", status_code=400)

        placeholders = ','.join('?' for _ in ids)
        execute_db(f"DELETE FROM company_accounts WHERE company_id IN ({placeholders});", tuple(ids))
        execute_db(f"UPDATE companies SET account_status = 'Not started' WHERE id IN ({placeholders});", tuple(ids))
        return success_response(start_response, message=f"Successfully reset {len(ids)} filing records.")

    # ── 7. GET / POST / DELETE /api/admin/accountancy/<id>/books ───────────
    match_books = re.match(r'^/api/(?:admin/)?accountancy/(\d+)/books(?:/(\d+))?$', path)
    if match_books:
        comp_id = int(match_books.group(1))
        entry_id = int(match_books.group(2)) if match_books.group(2) else None

        company = query_db("SELECT id, name, company_number, director, accounts_next_due, user_id FROM companies WHERE id = ? LIMIT 1;", (comp_id,), one=True)
        if not company:
            return error_response(start_response, "Company not found", status_code=404)
        if not _can_access_company(company):
            return error_response(start_response, "Access denied", status_code=403)

        if method == 'GET':
            entries = query_db("""
                SELECT id, company_id, period_end, entry_date, description, amount, category, source, created_at
                FROM company_book_entries
                WHERE company_id = ?
                ORDER BY entry_date DESC, id DESC;
            """, (comp_id,))

            total_income = sum(float(e['amount']) for e in entries if float(e['amount']) > 0)
            total_expense = sum(abs(float(e['amount'])) for e in entries if float(e['amount']) < 0)
            net = total_income - total_expense

            return success_response(start_response, data={
                "company": dict(company),
                "entries": [
                    {
                        "id": e['id'],
                        "date": datetime.strptime(str(e['entry_date'])[:10], '%Y-%m-%d').strftime('%d/%m/%Y') if e['entry_date'] else "N/A",
                        "desc": e['description'],
                        "category": e['category'],
                        "direction": "in" if float(e['amount']) >= 0 else "out",
                        "amount": f"£{abs(float(e['amount'])):,.2f}",
                        "raw_amount": float(e['amount'])
                    }
                    for e in entries
                ],
                "summary": {
                    "turnover": f"£{total_income:,.2f}",
                    "net_profit": f"£{net:,.2f}",
                    "cash_at_bank": f"£{max(0, net):,.2f}",
                    "total_income": total_income,
                    "total_expense": total_expense,
                    "net": net,
                    "count": len(entries)
                }
            })

        if method == 'POST':
            if not is_staff:
                return error_response(start_response, "Access denied. Staff only.", status_code=403)
            desc = (body.get('description') or body.get('desc') or '').strip()
            amount_val = body.get('amount')
            category = body.get('category') or 'Other'
            direction = body.get('direction', 'in')
            entry_date = body.get('entry_date') or body.get('date') or str(datetime.now().date())
            period_end = body.get('period_end') or str(datetime.now().date())

            if not desc:
                return error_response(start_response, "Description is required", status_code=400)

            try:
                # Clean amount string if formatted with currency symbols
                if isinstance(amount_val, str):
                    amount_val = re.sub(r'[^\d.-]', '', amount_val)
                amount = float(amount_val)
                if direction == 'out' and amount > 0:
                    amount = -amount
            except (ValueError, TypeError):
                return error_response(start_response, "Valid amount is required", status_code=400)

            # Standardize date to YYYY-MM-DD
            try:
                if '/' in str(entry_date):
                    parts = str(entry_date).split('/')
                    if len(parts) == 3:
                        entry_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
            except Exception:
                entry_date = str(datetime.now().date())

            eid = execute_db("""
                INSERT INTO company_book_entries (company_id, period_end, entry_date, description, amount, category, source, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'manual', datetime('now'));
            """, (comp_id, period_end, entry_date, desc, amount, category))

            return success_response(start_response, data={"id": eid}, message="Book entry recorded successfully.", status_code=201)

        if method == 'DELETE' and entry_id:
            if not is_staff:
                return error_response(start_response, "Access denied. Staff only.", status_code=403)
            execute_db("DELETE FROM company_book_entries WHERE id = ? AND company_id = ?;", (entry_id, comp_id))
            return success_response(start_response, message="Book entry deleted successfully.")

    return None

