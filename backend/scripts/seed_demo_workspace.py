"""Create a Finstap demo workspace filled with dummy data (customers, companies, services, orders,
invoices, tasks and support tickets) for trying the CRM.

Run from the backend folder (on the server: the Coolify terminal of the Finstap API):

    python scripts/seed_demo_workspace.py --slug demo --email demo@finstap.com

Options:
    --slug       workspace name (one word), the address becomes <slug>.finstap.com   (default: demo)
    --company    company name                                                         (default: Demo Accountants Ltd)
    --name       owner's name                                                         (default: Demo Owner)
    --email      owner's login email                                                  (required)
    --password   owner's password; leave out to generate one (printed once at the end)

It only ever creates a NEW workspace: if the workspace name is taken it stops and changes nothing.
All dummy people use @example.com addresses, so no real person is ever emailed.
"""
import argparse
import datetime
import os
import random
import secrets
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import tenancy  # noqa: E402
from db import execute_db, query_db, unusable_password_hash  # noqa: E402
from services.order_numbers import next_order_number  # noqa: E402

SERVICES = [
    # name, category, sell price, cost
    ("Company Formation", "Corporate", 99.0, 40.0),
    ("Confirmation Statement", "Compliance", 49.0, 13.0),
    ("Annual Accounts", "Accounting", 350.0, 120.0),
    ("VAT Registration", "Tax", 75.0, 20.0),
    ("Registered Office Address", "Corporate", 59.0, 15.0),
    ("Monthly Payroll", "Payroll", 120.0, 45.0),
    ("Self Assessment Tax Return", "Tax", 180.0, 60.0),
]

CUSTOMERS = [
    # name, client type, company name
    ("Oliver Bennett", "Business", "Bennett Logistics Ltd"),
    ("Amelia Clarke", "Normal", "Clarke Interiors Ltd"),
    ("Harry Patel", "Business", "Patel Pharmacy Group Ltd"),
    ("Isla Thompson", "Normal", None),
    ("George Walker", "B2B", "Walker & Co Accountants Ltd"),
    ("Sophia Hughes", "Business", "Hughes Bakery Ltd"),
    ("Jack Robinson", "Normal", "Robinson Fitness Ltd"),
    ("Grace Wright", "Normal", None),
    ("Noah Khan", "Business", "Khan Tech Solutions Ltd"),
    ("Emily Evans", "B2B", "Evans Bookkeeping Ltd"),
]

STAFF = [("Sarah Mitchell", "MANAGER"), ("Daniel Lee", "STAFF")]

ORDER_STATUSES = ["Completed", "Completed", "Completed", "In Progress", "Processing", "Pending",
                  "Documents Required", "Completed", "Cancelled"]


def email_for(name):
    return name.lower().replace(" ", ".") + "@example.com"


def days_ago(n):
    return datetime.datetime.now() - datetime.timedelta(days=n)


def seed(tenant, owner_id, rng):
    today = datetime.date.today()

    service_ids = {}
    for name, category, price, cost in SERVICES:
        service_ids[name] = execute_db("""
            INSERT INTO services (name, description, category, price, cost_price, status)
            VALUES (?, ?, ?, ?, ?, 'Active');
        """, (name, f"{name} handled end to end by our team.", category, price, cost))

    staff_ids = []
    for name, role in STAFF:
        staff_ids.append(execute_db("""
            INSERT INTO users (email, password_hash, full_name, role, status) VALUES (?, ?, ?, ?, 'Active');
        """, (email_for(name), unusable_password_hash(), name, role)))

    client_ids, company_ids = [], []
    for i, (name, client_type, company) in enumerate(CUSTOMERS):
        created = days_ago(rng.randint(5, 150)).strftime("%Y-%m-%d %H:%M:%S")
        uid = execute_db("""
            INSERT INTO users (email, password_hash, full_name, phone, role, status, client_type, created_at)
            VALUES (?, ?, ?, ?, 'CLIENT', 'Active', ?, ?);
        """, (email_for(name), unusable_password_hash(), name, f"+44 7700 9{i:05d}", client_type, created))
        client_ids.append(uid)
        if company:
            inc = today - datetime.timedelta(days=rng.randint(200, 2200))
            accounts_due = today + datetime.timedelta(days=rng.randint(-20, 240))
            confirmation_due = today + datetime.timedelta(days=rng.randint(-10, 300))
            company_ids.append((uid, execute_db("""
                INSERT INTO companies (user_id, name, company_number, status, inc_date, director, reg_office,
                                       accounts_next_due, accounts_overdue, confirmation_next_due, confirmation_overdue,
                                       client_type, created_at)
                VALUES (?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (uid, company, f"DEMO{i + 1:04d}", inc.isoformat(), name,
                  f"{rng.randint(1, 220)} High Street, London, EC{rng.randint(1, 4)}A {rng.randint(1, 9)}AB",
                  accounts_due.isoformat(), int(accounts_due < today),
                  confirmation_due.isoformat(), int(confirmation_due < today),
                  'B2B' if client_type == 'B2B' else client_type, created))))

    # Orders over the last three months (a few this month), each with its invoice
    orders = []
    for n in range(18):
        uid = rng.choice(client_ids)
        company_id = next((cid for owner, cid in company_ids if owner == uid), None)
        service = rng.choice(SERVICES)
        status = rng.choice(ORDER_STATUSES)
        created_dt = days_ago(rng.randint(0, 25) if n < 6 else rng.randint(26, 95))
        order_number = next_order_number(created_dt.date())
        price = service[2]
        progress = 100 if status == "Completed" else 0 if status in ("Pending", "Cancelled") else rng.choice([30, 50, 70])
        order_id = execute_db("""
            INSERT INTO orders (order_number, user_id, company_id, service_id, service_name, price, vat, total,
                                status, progress_percent, assigned_staff_id, cost_price, created_by_id,
                                created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (order_number, uid, company_id, service_ids[service[0]], service[0], price, price, status, progress,
              rng.choice(staff_ids), service[3], owner_id, created_dt.strftime("%Y-%m-%d %H:%M:%S"),
              created_dt.strftime("%Y-%m-%d %H:%M:%S")))
        execute_db("""
            INSERT INTO order_line_items (order_id, product_name, category_name, quantity, unit_price, line_total,
                                          sort_order, fulfillment_status)
            VALUES (?, ?, ?, 1, ?, ?, 0, ?);
        """, (order_id, service[0], service[1], price, price,
              "Completed" if status == "Completed" else "Cancelled" if status == "Cancelled" else "Pending"))
        orders.append((order_id, uid, company_id, status, price, created_dt))

    for k, (order_id, uid, _company_id, status, price, created_dt) in enumerate(orders, start=1):
        due = (created_dt + datetime.timedelta(days=14)).date()
        if status == "Cancelled":
            inv_status, paid = "Cancelled", 0.0
        elif status == "Completed":
            inv_status, paid = "Paid", price
        elif due < today:
            inv_status, paid = ("Partial Paid", round(price / 2, 2)) if k % 3 == 0 else ("Overdue", 0.0)
        else:
            inv_status, paid = "Pending", 0.0
        execute_db("""
            INSERT INTO invoices (invoice_number, order_id, user_id, amount, tax, total, status, due_date,
                                  paid_at, amount_paid, payment_method, created_at)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'Bank transfer', ?);
        """, (f"INV-{1000 + k}", order_id, uid, price, price, inv_status, due.isoformat(),
              (created_dt + datetime.timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S") if inv_status == "Paid" else None,
              paid, created_dt.strftime("%Y-%m-%d %H:%M:%S")))

    tasks = [
        ("Chase missing ID documents", "High", "Open", 2),
        ("File confirmation statement", "Medium", "In Progress", 5),
        ("Prepare annual accounts draft", "High", "Open", 10),
        ("Call client about VAT quarter", "Low", "Completed", -3),
        ("Set up payroll for new starter", "Medium", "Open", 7),
        ("Review overdue invoices", "Urgent", "In Progress", 1),
    ]
    for title, priority, status, due_in in tasks:
        uid = rng.choice(client_ids)
        execute_db("""
            INSERT INTO tasks (title, description, priority, status, due_date, assigned_staff_id, created_by_id,
                               client_id, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (title, "Demo task.", priority, status, (today + datetime.timedelta(days=due_in)).isoformat(),
              rng.choice(staff_ids), owner_id, uid,
              days_ago(1).strftime("%Y-%m-%d %H:%M:%S") if status == "Completed" else None))

    tickets = [
        ("Question about my invoice", "Billing", "Medium", "Open"),
        ("Need to change registered office", "Company Change", "High", "In Progress"),
        ("When will my accounts be filed?", "General", "Low", "Waiting for Customer"),
        ("Thank you for the quick formation", "General", "Low", "Resolved"),
    ]
    for t, (subject, category, priority, status) in enumerate(tickets, start=1):
        execute_db("""
            INSERT INTO support_tickets (ticket_number, user_id, subject, category, priority, status)
            VALUES (?, ?, ?, ?, ?, ?);
        """, (f"TKT-{2000 + t}", rng.choice(client_ids), subject, category, priority, status))

    return {"services": len(SERVICES), "staff": len(STAFF), "customers": len(client_ids),
            "companies": len(company_ids), "orders": len(orders), "invoices": len(orders),
            "tasks": len(tasks), "tickets": len(tickets)}


def main():
    parser = argparse.ArgumentParser(description="Create a Finstap demo workspace with dummy data.")
    parser.add_argument("--slug", default="demo")
    parser.add_argument("--company", default="Demo Accountants Ltd")
    parser.add_argument("--name", default="Demo Owner")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", default=None)
    args = parser.parse_args()

    tenancy.ensure_platform()
    slug = tenancy.normalize_slug(args.slug)
    problem = tenancy.check_slug(slug)
    if problem:
        print(f"Stopped, nothing changed: {problem} ('{slug}').")
        sys.exit(1)

    password = args.password or secrets.token_urlsafe(10)
    tenant, owner_id = tenancy.create_tenant(args.company, slug, args.name, args.email, password)
    with tenancy.use_tenant(tenant):
        counts = seed(tenant, owner_id, random.Random(slug))

    print(f"Demo workspace '{tenant['name']}' created ({slug}).")
    print("Added: " + ", ".join(f"{v} {k}" for k, v in counts.items()))
    print(f"Address:  {tenancy.workspace_url(slug) or '(subdomains off) workspace ' + slug}")
    print(f"Login:    {args.email}")
    if not args.password:
        print(f"Password: {password}   (shown once, keep it safe)")


if __name__ == "__main__":
    main()
