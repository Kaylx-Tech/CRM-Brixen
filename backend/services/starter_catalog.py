"""Starter service catalog for a workspace.

starter_catalog.json holds the ready-made services (name, category, description, delivery time,
order form and document list). It has no prices: every service starts at 0 and the company sets
its own sell and original price.
"""
import hashlib
import json
import os

from db import query_db, execute_db

CATALOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'starter_catalog.json')

# Bump when starter_catalog.json changes, so existing workspaces are brought up to date once
STARTER_CATALOG_VERSION = 2
VERSION_KEY = 'starter_catalog_version'

# Order forms of the first starter catalog (version 1). A service still on one of these was never
# edited by the company, so it gets the current form.
V1_FORM_HASHES = {
    '0c494be0cb72ef3a', '0ecae7b2936c2a04', '1e77602013a846ff', '3f4038bdd441f428', '43ad1b482f5863f2',
    '49dbf2a2b2b2ca86', '7513f1a0c4111ee9', '8650842954368c27', '8f2a494de3034002', 'bc2221b02e31226a',
    'd7e56a1aaa227d68', 'dadf751b736616a7', 'ded1bb0fc8f41b2f', 'e11ec99816d71134', 'ee69ae2b756aac9d',
}
# Version 1 services that are named differently now: their form comes from this service
RENAMED = {'digital package': 'incorporation'}


def load_starter_services():
    with open(CATALOG_FILE, encoding='utf-8') as fh:
        return json.load(fh)


def _form_json(service):
    fields = service.get('form_fields') or []
    return json.dumps({'fields': fields}) if fields else None


def _form_hash(form_json):
    return hashlib.sha1(str(form_json or '').encode()).hexdigest()[:16]


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
              _form_json(s), json.dumps(s.get('document_requirements') or [])))
        existing.add(s['name'].strip().lower())
        added += 1
    return added, skipped


def update_starter_forms():
    """Give services still on a version 1 starter form (never edited) the current form. Returns how many."""
    current = {s['name'].strip().lower(): s for s in load_starter_services()}
    updated = 0
    for row in query_db("SELECT id, name, form_config_json FROM services;") or []:
        if not row.get('form_config_json') or _form_hash(row['form_config_json']) not in V1_FORM_HASHES:
            continue
        name = str(row.get('name') or '').strip().lower()
        s = current.get(RENAMED.get(name, name))
        if not s:
            continue
        execute_db("UPDATE services SET form_config_json = ?, document_requirements_json = ? WHERE id = ?;",
                   (_form_json(s), json.dumps(s.get('document_requirements') or []), row['id']))
        updated += 1
    return updated


def sync_workspace_catalog(tenant):
    """Once per catalog version: add missing starter services and refresh unedited starter forms.
    Brixen's own database is never touched. Returns (added, updated) or None when already done."""
    if not tenant or tenant.get('plan') == 'legacy':
        return None
    row = query_db("SELECT value FROM settings WHERE key = ?;", (VERSION_KEY,), one=True)
    try:
        if int((row or {}).get('value') or 0) >= STARTER_CATALOG_VERSION:
            return None
    except ValueError:
        pass
    updated = update_starter_forms()
    added, _skipped = import_starter_catalog()
    execute_db("INSERT INTO settings (key, value) VALUES (?, ?) "
               "ON CONFLICT(key) DO UPDATE SET value = excluded.value;", (VERSION_KEY, str(STARTER_CATALOG_VERSION)))
    return added, updated
