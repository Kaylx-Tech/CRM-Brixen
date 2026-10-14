#!/usr/bin/env python3
"""Copy one service's order form (the fields built in Edit Service) to the other services.

The source form is "TapTap Business Bank" by default. Services in NO_DOCUMENT_SERVICES get the form without its
document-upload fields (also removed inside checkbox sub-forms and question branches). Every other service gets
the full form. Services that already have their own form are skipped unless --overwrite is given.

Run (inside the backend container terminal):
  python /app/scripts/copy_service_form.py                  # report only, changes nothing
  python /app/scripts/copy_service_form.py --apply          # write the forms
  python /app/scripts/copy_service_form.py --apply --overwrite   # also replace forms that already exist

Only services.form_config_json is written. Nothing is sent to the website (order forms are CRM-only).
"""
import argparse
import json
import os
import sys

APP_DIR = '/app' if os.path.isdir('/app/services') else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, APP_DIR)

from db import DB_PATH, execute_db, query_db  # noqa: E402
from routes.catalog_routes import clean_form_fields  # noqa: E402

SOURCE_SERVICE = 'TapTap Business Bank'

# These get the form without document uploads
NO_DOCUMENT_SERVICES = [
    'Directors Service Address',
    'Directors Appointment or Resignation',
    'Business Website',
    'Company Dissolution Service',
    'Dormant company accounts service',
    'Company name change service',
    'Confirmation Statement Service',
    'Business Email and Website',
    'VAT Registration',
]


def _key(name):
    return ' '.join(str(name or '').lower().split())


def without_documents(fields):
    """The same fields minus document uploads, at every level (checkbox sub-forms and question branches)."""
    out = []
    for f in fields:
        if f.get('type') == 'file':
            continue
        f = dict(f)
        if isinstance(f.get('fields'), list):
            f['fields'] = without_documents(f['fields'])
        if isinstance(f.get('option_fields'), list):
            f['option_fields'] = [without_documents(b or []) for b in f['option_fields']]
            if not any(f['option_fields']):
                f.pop('option_fields')
        out.append(f)
    return out


def describe(fields):
    return ', '.join(f"{f['label']} ({f['type']})" for f in fields) or '(no fields)'


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--apply', action='store_true', help='write the forms (default: report only)')
    parser.add_argument('--overwrite', action='store_true', help='replace forms that services already have')
    parser.add_argument('--source', default=SOURCE_SERVICE, help=f'service to copy from (default: {SOURCE_SERVICE})')
    args = parser.parse_args()

    print(f"Database: {DB_PATH}")
    services = query_db("SELECT id, name, status, form_config_json FROM services ORDER BY name COLLATE NOCASE;") or []
    source = next((s for s in services if _key(s['name']) == _key(args.source)), None)
    if not source:
        sys.exit(f"Source service '{args.source}' not found.")
    source_fields, err = clean_form_fields(source.get('form_config_json'))
    if err or not source_fields:
        sys.exit(f"'{source['name']}' has no order form to copy{f' ({err})' if err else ''}.")
    print(f"Source: #{source['id']} {source['name']}: {describe(source_fields)}\n")

    no_docs = {_key(n) for n in NO_DOCUMENT_SERVICES}
    found = {_key(s['name']) for s in services}
    for name in NO_DOCUMENT_SERVICES:
        if _key(name) not in found:
            print(f"WARNING  '{name}' is in the no-documents list but no service has that name")

    written = skipped = 0
    for s in services:
        if s['id'] == source['id']:
            continue
        current, _ = clean_form_fields(s.get('form_config_json'))
        strip_docs = _key(s['name']) in no_docs
        fields = without_documents(source_fields) if strip_docs else source_fields
        fields, err = clean_form_fields(fields)  # same validation (and fresh ids) as saving in Edit Service
        tag = 'NO-DOCS ' if strip_docs else 'FULL    '
        if err:
            print(f"ERROR   #{s['id']} {s['name']}: {err}")
            continue
        if current and not args.overwrite:
            print(f"SKIP    #{s['id']} {s['name']}: already has its own form ({len(current)} fields)")
            skipped += 1
            continue
        action = 'REPLACE ' if current else 'ADD     '
        print(f"{action}{tag}#{s['id']} {s['name']}: {describe(fields)}")
        if args.apply:
            execute_db("UPDATE services SET form_config_json = ? WHERE id = ?;",
                       (json.dumps({'fields': fields}) if fields else None, s['id']))
        written += 1

    verb = 'Written' if args.apply else 'Would write'
    print(f"\n{verb}: {written} service(s). Skipped (own form kept): {skipped}.")
    if not args.apply:
        print("Nothing was changed. Run again with --apply to write.")


if __name__ == '__main__':
    main()
