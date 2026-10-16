#!/usr/bin/env python3
"""Give old company formation orders their Pending company card (new orders get one automatically).

A placed formation order (Incorporation, Digital Package, …) with no company linked gets a Pending
"not registered" company from its proposed name, exactly as new orders do (services.order_companies).
Drafts and orders on the shared guest account are skipped.

Run (inside the backend container terminal):
  python /app/scripts/backfill_formation_companies.py           # report only, changes nothing
  python /app/scripts/backfill_formation_companies.py --apply   # create and link the Pending companies
"""
import argparse
import json
import os
import sys

APP_DIR = '/app' if os.path.isdir('/app/services') else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP_DIR)

from db import DB_PATH, query_db  # noqa: E402
from services.order_companies import ensure_formation_company, is_formation_order, proposed_company_name  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--apply', action='store_true', help='create the companies (default: report only)')
    args = parser.parse_args()

    print(f"Database: {DB_PATH}")
    rows = query_db("""
        SELECT o.id, o.order_number, o.service_name, o.order_form_values_json, u.email
        FROM orders o LEFT JOIN users u ON u.id = o.user_id
        WHERE o.company_id IS NULL AND COALESCE(o.is_draft, 0) = 0
          AND o.status NOT IN ('Cancelled', 'Refunded')
        ORDER BY o.id;
    """) or []
    todo = []
    for row in rows:
        items = query_db("SELECT product_name FROM order_line_items WHERE order_id = ?;", (row['id'],)) or []
        if not is_formation_order(row.get('service_name'), *[i.get('product_name') for i in items]):
            continue
        if str(row.get('email') or '').lower() == 'guest.unlinked@brixenconsultants.com':
            print(f"  skip {row['order_number']}: on the guest account (verify the customer first)")
            continue
        try:
            values = json.loads(row.get('order_form_values_json') or '{}')
        except (TypeError, ValueError):
            values = {}
        name = proposed_company_name(values) or f"New company (order {row['order_number']})"
        todo.append((row, name))
        print(f"  {row['order_number']}: {row['service_name']} -> Pending company \"{name}\"")

    if not todo:
        print("Nothing to do: every formation order already has a company.")
        return
    if not args.apply:
        print(f"\n{len(todo)} order(s) would get a Pending company. Run again with --apply to create them.")
        return
    from services.order_companies import backfill_formation_companies
    made = backfill_formation_companies()
    print(f"\nDone: {len(made)} order(s) linked to a Pending company.")


if __name__ == '__main__':
    main()
