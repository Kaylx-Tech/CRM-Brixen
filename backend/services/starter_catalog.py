"""Starter service catalog for a new workspace.

starter_catalog.json holds the ready-made services (name, category, description, delivery time,
order form and document list). It has no prices: every service starts at 0 and the company sets
its own sell and original price.
"""
import json
import os

from db import query_db, execute_db

CATALOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'starter_catalog.json')


def load_starter_services():
    with open(CATALOG_FILE, encoding='utf-8') as fh:
        return json.load(fh)


def import_starter_catalog():
    """Add every starter service the workspace does not already have (matched by name).
    Returns (added, skipped)."""
    existing = {str(r.get('name') or '').strip().lower()
                for r in (query_db("SELECT name FROM services;") or [])}
    added = skipped = 0
    for s in load_starter_services():
        if s['name'].strip().lower() in existing:
            skipped += 1
            continue
        execute_db("""
            INSERT INTO services (name, description, category, price, cost_price, vat_rate, duration,
                                  renewal_period, estimated_delivery_time, status, form_config_json,
                                  document_requirements_json)
            VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, 'Active', ?, ?);
        """, (s['name'], s.get('description') or '', s.get('category') or 'Corporate',
              s.get('duration') or '12 Months', s.get('renewal_period') or 'Annual',
              s.get('estimated_delivery_time') or '24-48 Hours',
              json.dumps({'fields': s.get('form_fields') or []}) if s.get('form_fields') else None,
              json.dumps(s.get('document_requirements') or [])))
        existing.add(s['name'].strip().lower())
        added += 1
    return added, skipped
