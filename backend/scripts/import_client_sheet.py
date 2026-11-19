#!/usr/bin/env python3
"""Add the clients from the cleaned client sheet ("Brixen Clients Sheet - Cleaned.csv") to the CRM.

For every row of Type "Client" (rows without an email and sales calls are left out):
  - Customer: found by email; a new one is added as a normal client (name, phone). Nothing is emailed and no
    password is given: the client can set one with "Forgot password" when needed. An existing customer is not
    changed, except that an empty phone is filled in.
  - Company: looked up at Companies House by its exact name (the CRM's Companies House key). One live company
    with that name: added with its number, incorporation date and registered office. Not found: added as a
    Pending company with the name from the sheet, for the team to check (listed at the end). A company already
    in the CRM is not added again. When it is already on another customer and the email is new, no customer
    is added: the sheet's details go on the customer who has the company (listed at the end, to check).
    A company on a team login (Admin / staff) counts as having no customer: the sheet's customer is added,
    and with --move-from-staff the company moves to that customer (else it stays where it is).
  - The sheet's Tide details (status, date, client name, promo code, flag, review, notes) are saved in the
    Activity Log on the customer.
The file itself is not kept in the CRM. Run it as often as needed: rows already added are skipped.

Run (inside the backend container terminal):
  python /app/scripts/import_client_sheet.py clients.csv           # report only, changes nothing
  python /app/scripts/import_client_sheet.py clients.csv --apply   # add them
  python /app/scripts/import_client_sheet.py - --apply < clients.csv   (or paste the file after "-", then Ctrl+D)
Options: --no-companies-house (do not look companies up; every new company is added as Pending).
"""
import argparse
import csv
import io
import os
import re
import secrets
import sys

APP_DIR = '/app' if os.path.isdir('/app/services') else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP_DIR)

from db import DB_PATH, execute_db, hash_password, query_db  # noqa: E402

ENDINGS = r'(public limited company|limited liability partnership|limited|ltd|plc|llp|company|co)'
GONE = ('dissolved', 'converted-closed', 'removed')


def same_name(text):
    """Companies House "same as" comparison: case, punctuation, &/and, a leading The and Ltd/Limited ignored."""
    t = str(text or '').lower().replace('&', ' and ')
    t = re.sub(r'[^a-z0-9 ]+', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'^the ', '', t)
    t = re.sub(rf'(\s+{ENDINGS})+$', '', t)
    return t.replace(' ', '')


def nice(text):
    """LET'S COLABORATE LIMITED -> Let's Colaborate Limited (str.title would write Let'S)."""
    return ' '.join(w[:1].upper() + w[1:].lower() for w in str(text or '').split())


def lookup(name, use_ch):
    """(Companies House item, note). One live company with this exact name, else None."""
    if not use_ch:
        return None, 'not looked up'
    from services.companies_house_service import search_companies_house
    res = search_companies_house(name)
    if not res.get('success'):
        return None, f"Companies House: {res.get('error')}"
    wanted = same_name(name)
    hits = {}
    for item in res.get('results') or []:
        if same_name(item.get('title')) == wanted and str(item.get('company_status') or '').lower() not in GONE:
            hits[item.get('company_number')] = item
    if len(hits) == 1:
        return next(iter(hits.values())), 'found at Companies House'
    return None, 'several companies with this name' if hits else 'not found at Companies House'


def details(row):
    parts = [f"Tide status: {row['Tide Status']}" if row.get('Tide Status') else '',
             f"Date applied: {row['Date Applied']}" if row.get('Date Applied') else '',
             f"Company: {row['Company Name']}" if row.get('Company Name') else '',
             f"Client name in sheet: {row['Client Name']}" if row.get('Client Name') else '',
             f"Promo code: {row['Promo Code']}" if row.get('Promo Code') else '',
             f"Sheet flag: {row['Sheet Flag']}" if row.get('Sheet Flag') else '',
             f"Address: {row['Address']}" if row.get('Address') else '',
             f"Review: {row['Review']}" if row.get('Review') else '',
             f"Notes: {row['Notes']}" if row.get('Notes') else '']
    return ' · '.join(p for p in parts if p)


def add_company(user_id, name, number, status, inc_date, director, office):
    execute_db("""
        INSERT INTO companies (user_id, name, company_number, status, inc_date, director, reg_office, package,
                               created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Imported from client sheet', datetime('now'));
    """, (user_id, name, number, status, inc_date, director or 'Director', office or 'United Kingdom'))


def log_details(user_id, info):
    done = query_db("""SELECT 1 FROM activity_logs WHERE action = 'Imported from client sheet'
                       AND entity_type = 'user' AND entity_id = ? AND details = ?;""", (str(user_id), info), one=True)
    if not done:
        execute_db("""INSERT INTO activity_logs (user_id, user_email, action, entity_type, entity_id, details)
                      VALUES (NULL, 'client sheet', 'Imported from client sheet', 'user', ?, ?);""",
                   (str(user_id), info))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('csv', help='the cleaned sheet (CSV), or - to read it from the input')
    parser.add_argument('--apply', action='store_true', help='add the clients (default: report only)')
    parser.add_argument('--no-companies-house', action='store_true', help='do not look companies up')
    parser.add_argument('--move-from-staff', action='store_true',
                        help='a company on a team login (Admin / staff) moves to the sheet\'s customer')
    args = parser.parse_args()

    text = sys.stdin.read() if args.csv == '-' else open(args.csv, encoding='utf-8-sig').read()
    rows = list(csv.DictReader(io.StringIO(text.lstrip('﻿'))))
    need = {'Type', 'Email', 'Company Name', 'Director Name', 'Phone'}
    if not rows or not need <= set(rows[0]):
        sys.exit(f"This is not the cleaned client sheet (columns needed: {', '.join(sorted(need))}).")
    clients = [r for r in rows if r.get('Type') == 'Client' and (r.get('Email') or '').strip()]
    print(f"Database: {DB_PATH}")
    print(f"{len(rows)} rows in the file, {len(clients)} clients with an email "
          f"({len(rows) - len(clients)} left out: no email or sales calls).")
    print('REPORT ONLY: nothing is saved. Add --apply to save.\n' if not args.apply else 'SAVING.\n')

    counts = {'new customers': 0, 'existing customers': 0, 'added to the customer who has the company': 0,
              'companies found at CH': 0, 'pending companies': 0, 'companies already in CRM': 0,
              'companies on a team login': 0, 'companies moved from a team login': 0}
    to_check = []
    new_emails = set()  # report only: a new customer with two companies is counted once
    for row in clients:
        email = row['Email'].strip().lower()
        company = (row.get('Company Name') or '').strip()
        director = (row.get('Director Name') or '').strip()
        phone = (row.get('Phone') or '').strip()
        user = query_db("SELECT id, full_name, phone FROM users WHERE LOWER(email) = ? LIMIT 1;", (email,), one=True)
        line = [email]

        # The company first: on this customer already, on another customer, found at Companies House, or not
        item, why, owner = None, '', None
        if company:
            mine = query_db("SELECT name FROM companies WHERE user_id = ?;", (user['id'],)) if user else []
            if any(same_name(c['name']) == same_name(company) for c in mine or []):
                why = 'mine'
            else:
                item, why = lookup(company, not args.no_companies_house)
                if item and item.get('company_number'):
                    owner = query_db("""SELECT c.id AS company_id, u.id, u.full_name, u.email, u.role FROM companies c
                                        JOIN users u ON u.id = c.user_id WHERE c.company_number = ? LIMIT 1;""",
                                     (item['company_number'],), one=True)

        # A company on a team login (Admin / staff) has no real customer yet: the sheet's email becomes it
        staff_owner = owner if owner and owner.get('role') != 'CLIENT' else None
        if staff_owner:
            owner = None

        info = details(row)
        if not user and owner:
            # The company is already on another customer: no second customer for it; the sheet's details go on
            # the customer who has the company
            counts['added to the customer who has the company'] += 1
            line.append(f"{company} ({item['company_number']}) is on customer {owner['full_name']} "
                        f"({owner['email']}): details added there, no new customer")
            to_check.append(f"{email}: {company} is on {owner['full_name']} ({owner['email']}); "
                            "check that this is the same client")
            if args.apply and info:
                log_details(owner['id'], f"Sheet email: {email} · {info}")
            print(' | '.join(line))
            continue

        if user:
            counts['existing customers'] += 1
            user_id = user['id']
            line.append('customer already in CRM')
            if phone and not user.get('phone') and args.apply:
                execute_db("UPDATE users SET phone = ? WHERE id = ?;", (phone, user_id))
        elif email in new_emails:
            user_id = None
            line.append('same new customer as above')
        else:
            counts['new customers'] += 1
            new_emails.add(email)
            name = director or nice(company) or email.split('@')[0]
            line.append(f'new customer "{name}"')
            user_id = None
            if args.apply:
                when = row.get('Date Applied') or None
                user_id = execute_db("""
                    INSERT INTO users (email, password_hash, full_name, phone, role, status, created_at)
                    VALUES (?, ?, ?, ?, 'CLIENT', 'Active', COALESCE(?, datetime('now')));
                """, (email, hash_password(secrets.token_urlsafe(32)), name, phone or None,
                      f"{when} 12:00:00" if when else None))

        if user_id is None and args.apply:
            found = query_db("SELECT id FROM users WHERE LOWER(email) = ?;", (email,), one=True)
            user_id = (found or {}).get('id')

        if not company:
            pass
        elif staff_owner and args.move_from_staff:
            counts['companies moved from a team login'] += 1
            line.append(f"{company} ({item['company_number']}): moved from team login {staff_owner['full_name']} "
                        "to this customer")
            if args.apply and user_id:
                execute_db("UPDATE companies SET user_id = ? WHERE id = ?;", (user_id, staff_owner['company_id']))
                log_details(user_id, f"Company {company} ({item['company_number']}) moved here from the team login "
                                     f"{staff_owner['email']} by the client sheet import")
        elif staff_owner:
            counts['companies on a team login'] += 1
            line.append(f"{company} ({item['company_number']}): on team login {staff_owner['full_name']} "
                        f"({staff_owner['email']}), left there (add --move-from-staff to move it to this customer)")
            to_check.append(f"{email}: {company} is on the team login {staff_owner['email']}")
        elif why == 'mine':
            counts['companies already in CRM'] += 1
            line.append(f'{company}: already on this customer')
        elif owner:
            counts['companies already in CRM'] += 1
            line.append(f"{company} ({item['company_number']}): on customer {owner['full_name']} "
                        f"({owner['email']}), left there")
            to_check.append(f"{email}: {company} is on {owner['full_name']} ({owner['email']})")
        elif item:
            counts['companies found at CH'] += 1
            line.append(f"{item.get('title')} ({item['company_number']}) {why}")
            if args.apply:
                add_company(user_id, item.get('title') or company, item['company_number'],
                            str(item.get('company_status') or 'active').replace('-', ' ').title(),
                            item.get('date_of_creation') or row.get('Date Applied') or '2025-01-01',
                            director, item.get('address_snippet'))
        else:
            counts['pending companies'] += 1
            line.append(f'{company}: {why}, added as Pending')
            to_check.append(f'{email}: {company} ({why})')
            if args.apply:
                add_company(user_id, company, f"REG-{secrets.token_hex(4).upper()}", 'Pending',
                            row.get('Date Applied') or '2025-01-01', director, 'United Kingdom')

        if info and args.apply and user_id:
            log_details(user_id, info)
        print(' | '.join(line))

    print('\n' + ', '.join(f'{v} {k}' for k, v in counts.items()) + '.')
    if to_check:
        print('\nPlease check these (add the right company number in the CRM where one is missing):')
        print('\n'.join(f'  - {t}' for t in to_check))
    if not args.apply:
        print('\nNothing was saved. Run again with --apply to add them.')


if __name__ == '__main__':
    main()
