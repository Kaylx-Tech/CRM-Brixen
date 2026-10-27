"""Finstap multi-tenancy: every company (workspace) gets its own SQLite database.

platform.db keeps the registry of workspaces. Each workspace's CRM data lives in
its own file under TENANTS_DIR, so existing queries need no company filter and one
company can never read another's rows.

Which workspace a request belongs to comes from (first match wins):
  1. the X-Tenant header or ?tenant= / ?workspace= query value
  2. the page's own subdomain (Origin: https://acme.finstap.com)
  3. the session token prefix  "<slug>.<uuid>"
  4. DEFAULT_TENANT (Brixen's existing database), when that workspace is registered
"""
import hashlib
import os
import re
import secrets
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path

from urllib.parse import urlsplit

import db as db_mod
from db import set_db_path, NO_TENANT_DB, hash_password
from config import TENANT_BASE_DOMAIN, WORKSPACE_URL_TEMPLATE

DATA_DIR = os.environ.get('FINSTAP_DATA_DIR') or os.path.dirname(db_mod.DB_PATH)
PLATFORM_DB_PATH = os.environ.get('PLATFORM_DB_PATH') or os.path.join(DATA_DIR, 'platform.db')
TENANTS_DIR = os.environ.get('TENANTS_DIR') or os.path.join(DATA_DIR, 'tenants')
DEFAULT_TENANT = (os.environ.get('DEFAULT_TENANT') or 'brixen').strip().lower()
TRIAL_DAYS = int(os.environ.get('TRIAL_DAYS') or 14)

SLUG_RE = re.compile(r'^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$')
# New workspaces: one word (acme.finstap.com), letters and numbers only. Older dashed names still resolve via SLUG_RE.
NEW_SLUG_RE = re.compile(r'^[a-z0-9]{3,30}$')
RESERVED_SLUGS = frozenset({
    'www', 'api', 'app', 'admin', 'portal', 'platform', 'finstap', 'mail', 'static',
    'assets', 'login', 'signup', 'support', 'help', 'billing', 'status', 'docs', 'blog', 'owner',
})

PLATFORM_SCHEMA = """
CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    db_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Provisioning', 'Active', 'Suspended', 'Failed')),
    plan TEXT NOT NULL DEFAULT 'trial',
    trial_ends_at TIMESTAMP,
    owner_name TEXT,
    owner_email TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- One-time codes that carry a fresh login from finstap.com (signup) to the company's own subdomain
-- (browsers keep logins per address, so the session cannot simply be shared)
CREATE TABLE IF NOT EXISTS login_handoffs (
    code_hash TEXT PRIMARY KEY,
    tenant_slug TEXT NOT NULL,
    session_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP
);
-- Signup step 1: the owner's email is confirmed with an emailed 6-digit code before a workspace is made
-- (services/signup_email.py); a confirmed email gets a token that the signup itself must bring
CREATE TABLE IF NOT EXISTS signup_emails (
    challenge TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    tries INTEGER NOT NULL DEFAULT 0,
    sends INTEGER NOT NULL DEFAULT 1,
    ip TEXT,
    sent_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
    expires_at TIMESTAMP NOT NULL,
    verified_at TIMESTAMP,
    token_hash TEXT,
    token_expires_at TIMESTAMP,
    used_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_signup_emails_email ON signup_emails(email, sent_at);
CREATE INDEX IF NOT EXISTS idx_signup_emails_token ON signup_emails(token_hash);
-- Finstap owner portal (admin.finstap.com): the platform's own admins, their sign-in codes and sessions,
-- and a record of everything they change (services/owner_auth.py, routes/owner_routes.py)
CREATE TABLE IF NOT EXISTS platform_admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_login_codes (
    challenge TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL,
    tries INTEGER NOT NULL DEFAULT 0,
    sends INTEGER NOT NULL DEFAULT 1,
    sent_at TIMESTAMP NOT NULL DEFAULT (datetime('now')),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    ip TEXT,
    user_agent TEXT,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    admin_email TEXT,
    action TEXT NOT NULL,
    tenant_slug TEXT,
    detail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit(created_at);
-- Services Finstap sells to workspaces (services/platform_services.py): prices and Finstap's own
-- registered office addresses, monthly KYC billing per workspace, and registered office requests
CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS kyc_billing (
    tenant_slug TEXT NOT NULL,
    period TEXT NOT NULL,
    checks INTEGER NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_slug, period)
);
CREATE TABLE IF NOT EXISTS ro_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_slug TEXT NOT NULL,
    company_id INTEGER,
    company_name TEXT NOT NULL,
    company_number TEXT,
    client_user_id INTEGER,
    client_name TEXT,
    client_email TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    address_json TEXT,
    start_date DATE,
    expiry_date DATE,
    price REAL,
    paid INTEGER NOT NULL DEFAULT 0,
    workspace_address_id INTEGER,
    requested_by TEXT,
    decided_by TEXT,
    decided_at TIMESTAMP,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ro_requests_tenant ON ro_requests(tenant_slug, status);
-- Emailed one-time links that let an owner set (or reset) their own password
CREATE TABLE IF NOT EXISTS platform_password_links (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    ip TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

# Subscription details on each workspace, added to databases made before the owner portal
TENANT_COLUMNS = (
    ('billing_cycle', "TEXT"),                 # monthly / yearly
    ('subscription_status', "TEXT"),           # trialing / active / past_due / cancelled
    ('current_period_end', "TIMESTAMP"),       # paid until
    ('price_override', "REAL"),                # a special monthly price agreed with this company
    ('custom_limits', "TEXT"),                 # JSON {limit: number|null}, wins over the plan's limits
    ('owner_notes', "TEXT"),                   # notes for the Finstap team only
    ('suspended_reason', "TEXT"),
)

HANDOFF_SECONDS = 120

_platform_lock = threading.Lock()
_platform_ready = False
_current = threading.local()


class TenantError(ValueError):
    """A workspace could not be created or used; the message is safe to show."""


# ── platform database ────────────────────────────────────────────────────────

def _platform_conn():
    os.makedirs(os.path.dirname(PLATFORM_DB_PATH) or '.', exist_ok=True)
    conn = sqlite3.connect(PLATFORM_DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 15000;")
    return conn


def _platform_query(sql, args=(), one=False):
    ensure_platform()
    conn = _platform_conn()
    try:
        rows = [dict(r) for r in conn.execute(sql, args).fetchall()]
    finally:
        conn.close()
    return (rows[0] if rows else None) if one else rows


def _platform_execute(sql, args=()):
    ensure_platform()
    conn = _platform_conn()
    try:
        cur = conn.execute(sql, args)
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def _has_crm_data(path):
    if not path or not os.path.exists(path):
        return False
    try:
        conn = sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True, timeout=10)
        try:
            if not conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users';").fetchone():
                return False
            # An empty schema (e.g. made by an old entrypoint) is not a CRM to adopt
            return bool(conn.execute("SELECT 1 FROM users LIMIT 1;").fetchone())
        finally:
            conn.close()
    except sqlite3.Error:
        return False


def ensure_platform():
    """Create platform.db and register Brixen's existing database as the default workspace."""
    global _platform_ready
    if _platform_ready:
        return
    with _platform_lock:
        if _platform_ready:
            return
        conn = _platform_conn()
        try:
            conn.executescript(PLATFORM_SCHEMA)
            have = {row['name'] for row in conn.execute("PRAGMA table_info(tenants);").fetchall()}
            for column, kind in TENANT_COLUMNS:
                if column not in have:
                    conn.execute(f"ALTER TABLE tenants ADD COLUMN {column} {kind};")
            known =conn.execute("SELECT 1 FROM tenants WHERE slug = ?;", (DEFAULT_TENANT,)).fetchone()
            # Only an existing CRM database is adopted (never created or moved), so a fresh Finstap server starts empty
            if not known and _has_crm_data(db_mod.DB_PATH):
                conn.execute("""
                    INSERT INTO tenants (slug, name, db_path, status, plan)
                    VALUES (?, ?, ?, 'Active', 'legacy');
                """, (DEFAULT_TENANT, DEFAULT_TENANT.title(), db_mod.DB_PATH))
                print(f"[Tenancy] Registered existing database as workspace '{DEFAULT_TENANT}'")
            conn.commit()
        finally:
            conn.close()
        _platform_ready = True


def get_tenant(slug):
    slug = (slug or '').strip().lower()
    if not slug:
        return None
    return _platform_query("SELECT * FROM tenants WHERE slug = ? LIMIT 1;", (slug,), one=True)


def list_tenants(status='Active'):
    return _platform_query("SELECT * FROM tenants WHERE status = ? ORDER BY id;", (status,))


# ── current workspace for this thread ───────────────────────────────────────

def current_tenant():
    return getattr(_current, 'tenant', None)


def activate(tenant):
    """Point this thread at a workspace (None = no workspace: DB access raises)."""
    _current.tenant = tenant
    set_db_path(tenant['db_path'] if tenant else NO_TENANT_DB)


def deactivate():
    _current.tenant = None
    set_db_path(None)


@contextmanager
def use_tenant(tenant):
    """Run a block against one workspace, then restore whatever was active before."""
    previous = current_tenant()
    previous_path = getattr(db_mod._db_route, 'path', None)
    activate(tenant)
    try:
        yield tenant
    finally:
        db_mod.close_db()
        _current.tenant = previous
        set_db_path(previous_path)


def run_in_thread(target, *args, **kwargs):
    """Start a daemon thread that keeps the caller's workspace."""
    tenant = current_tenant()

    def _runner():
        if tenant:
            with use_tenant(tenant):
                return target(*args, **kwargs)
        return target(*args, **kwargs)

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    return thread


def for_each_tenant(fn):
    """Call fn(tenant) once per active workspace, each inside its own database."""
    results = {}
    for tenant in list_tenants():
        try:
            with use_tenant(tenant):
                results[tenant['slug']] = fn(tenant)
        except Exception as exc:
            print(f"[Tenancy] {tenant['slug']}: {exc}")
    return results


# ── request resolution ──────────────────────────────────────────────────────

def slug_from_token(token):
    """Session tokens are '<slug>.<uuid>'; older tokens have no prefix."""
    if token and '.' in token:
        prefix = token.split('.', 1)[0].strip().lower()
        if SLUG_RE.match(prefix):
            return prefix
    return None


def requested_slug(environ, query=None, token=None):
    """The workspace a request names. What the page says (X-Tenant, ?workspace=, its subdomain) comes
    first: a leftover session cookie from another company (one api.finstap.com for everyone) must not
    pull the request into that company. The token's own prefix is used when nothing else is given;
    a token from another workspace then simply fails to authenticate here."""
    header = (environ.get('HTTP_X_TENANT') or '').strip().lower()
    if header:
        return header
    if query:
        value = query.get('tenant') or query.get('workspace')
        if value:
            return str(value[0] if isinstance(value, list) else value).strip().lower()
    # The page's own address: a request from acme.finstap.com belongs to "acme"
    slug = slug_from_origin(environ.get('HTTP_ORIGIN'))
    if slug:
        return slug
    return slug_from_token(token)


def slug_from_origin(origin):
    """'https://acme.finstap.com' → 'acme' (None for the root, app/www/api and other sites)."""
    if not origin or not TENANT_BASE_DOMAIN:
        return None
    host = (urlsplit(origin).hostname or '').lower()
    suffix = '.' + TENANT_BASE_DOMAIN
    if not host.endswith(suffix):
        return None
    sub = host[:-len(suffix)]
    if '.' in sub or sub in RESERVED_SLUGS or not SLUG_RE.match(sub):
        return None
    return sub


def workspace_url(slug, path=''):
    """Public address of a workspace (https://acme.finstap.com/path), or '' when subdomains are off."""
    if not WORKSPACE_URL_TEMPLATE or not slug:
        return ''
    # The adopted single-company database (Brixen) keeps its own addresses
    tenant = get_tenant(slug)
    if tenant and tenant.get('plan') == 'legacy':
        return ''
    return WORKSPACE_URL_TEMPLATE.replace('{slug}', slug) + path


def resolve_request_tenant(environ, query=None, token=None):
    """Return (tenant, error_message). A missing slug falls back to DEFAULT_TENANT if registered."""
    slug = requested_slug(environ, query, token)
    tenant = get_tenant(slug or DEFAULT_TENANT)
    if not tenant:
        return None, ("Workspace not found" if slug else None)
    if tenant['status'] == 'Suspended':
        return None, "This workspace is suspended. Please contact Finstap support."
    if tenant['status'] != 'Active':
        return None, "This workspace is not ready yet"
    return tenant, None


def new_session_token():
    """Session token carrying the workspace, so later requests find the right database."""
    tenant = current_tenant()
    raw = str(uuid.uuid4())
    return f"{tenant['slug']}.{raw}" if tenant else raw


def _hash_code(code):
    return hashlib.sha256(code.encode('utf-8')).hexdigest()


def create_login_handoff(slug, session_token):
    """A short-lived one-time code for a session (only its hash is stored)."""
    code = secrets.token_urlsafe(32)
    _platform_execute("""
        INSERT INTO login_handoffs (code_hash, tenant_slug, session_token, expires_at)
        VALUES (?, ?, ?, datetime('now', ?));
    """, (_hash_code(code), slug, session_token, f'+{HANDOFF_SECONDS} seconds'))
    return code


def redeem_login_handoff(code):
    """Swap a one-time code for (slug, session_token); None when unknown, used or expired."""
    if not code:
        return None
    ensure_platform()
    conn = _platform_conn()
    try:
        # One write transaction: read the token, then mark the code used and wipe it, so it works exactly once
        conn.execute("BEGIN IMMEDIATE;")
        key = _hash_code(str(code))
        row = conn.execute("""
            SELECT tenant_slug, session_token FROM login_handoffs
            WHERE code_hash = ? AND used_at IS NULL AND datetime(expires_at) > datetime('now');
        """, (key,)).fetchone()
        if row:
            conn.execute("UPDATE login_handoffs SET used_at = datetime('now'), session_token = '' WHERE code_hash = ?;",
                         (key,))
        conn.commit()
    finally:
        conn.close()
    return (row['tenant_slug'], row['session_token']) if row else None


# ── signup: create a workspace ──────────────────────────────────────────────

def normalize_slug(value):
    """A new workspace name: one lowercase word ("Acme Ltd" → "acmeltd")."""
    return re.sub(r'[^a-z0-9]+', '', (value or '').strip().lower())[:30]


def check_slug(slug):
    """Return an error message, or None when the slug can be used."""
    if not NEW_SLUG_RE.match(slug or ''):
        return "Workspace name must be one word: 3-30 letters or numbers (no spaces or dashes)"
    if slug in RESERVED_SLUGS:
        return "This workspace URL is reserved"
    if get_tenant(slug):
        return "This workspace URL is already taken"
    return None


_PREFIX_FILLER = {'the', 'ltd', 'limited', 'llp', 'plc', 'co', 'company', 'inc', 'group', 'and', 'uk'}


def order_prefix_for(company_name):
    """Three letters for order numbers: 'Acme Transport Ltd' → ACT, 'Globex' → GLO, 'Big Red Bus' → BRB."""
    words = [w for w in re.split(r'[^A-Za-z0-9]+', (company_name or '').upper()) if w and w.lower() not in _PREFIX_FILLER]
    if not words:
        return 'ORD'
    if len(words) == 1:
        prefix = words[0][:3]
    elif len(words) == 2:
        prefix = words[0][:2] + words[1][:1]
    else:
        prefix = ''.join(w[0] for w in words[:3])
    return (prefix + 'XXX')[:3] if len(prefix) < 3 else prefix


def workspace_settings(tenant):
    """The company's own starting settings (never Brixen's): name, contact, prefixes and addresses."""
    url = workspace_url(tenant['slug'])
    return {
        'company_name': tenant['name'],
        'brand_name': tenant['name'],
        'support_email': tenant.get('owner_email') or '',
        'order_number_prefix': order_prefix_for(tenant['name']),
        'invoice_prefix': 'INV-',
        'frontend_url': url,
        'portal_url': url,
        'google_drive_root_folder': f"Finstap-{tenant['slug']}",
    }


def seed_workspace_settings(tenant):
    """Write the company's starting settings into its database. Only fills keys that are missing or
    empty, so anything the company already changed is left alone. Brixen's database is never touched."""
    if not tenant or tenant.get('plan') == 'legacy':
        return 0
    filled = 0
    for key, value in workspace_settings(tenant).items():
        if not value:
            continue
        row = db_mod.query_db("SELECT value FROM settings WHERE key = ?;", (key,), one=True)
        if row and str(row.get('value') or '').strip():
            continue
        db_mod.execute_db("INSERT INTO settings (key, value) VALUES (?, ?) "
                          "ON CONFLICT(key) DO UPDATE SET value = excluded.value;", (key, str(value)))
        filled += 1
    return filled


def create_tenant(company_name, slug, owner_name, owner_email, password):
    """Create a workspace database with its first Super Admin. Returns (tenant, admin_user_id)."""
    company_name = (company_name or '').strip()
    owner_name = (owner_name or '').strip()
    owner_email = (owner_email or '').strip().lower()
    slug = normalize_slug(slug or company_name)
    if not company_name:
        raise TenantError("Company name is required")
    if not owner_name:
        raise TenantError("Your name is required")
    if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', owner_email):
        raise TenantError("A valid email is required")
    if len(password or '') < 8:
        raise TenantError("Password must be at least 8 characters")
    problem = check_slug(slug)
    if problem:
        raise TenantError(problem)

    os.makedirs(TENANTS_DIR, exist_ok=True)
    db_path = os.path.join(TENANTS_DIR, f"{slug}.db")
    if os.path.exists(db_path):
        raise TenantError("This workspace URL is already taken")

    try:
        tenant_id = _platform_execute("""
            INSERT INTO tenants (slug, name, db_path, status, plan, trial_ends_at, owner_name, owner_email)
            VALUES (?, ?, ?, 'Provisioning', 'trial', datetime('now', ?), ?, ?);
        """, (slug, company_name, db_path, f'+{TRIAL_DAYS} days', owner_name, owner_email))
    except sqlite3.IntegrityError:
        raise TenantError("This workspace URL is already taken")

    tenant = get_tenant(slug)
    try:
        with use_tenant(tenant):
            db_mod.init_db()
            db_mod.ensure_performance_indexes()
            admin_id = db_mod.execute_db("""
                INSERT INTO users (email, password_hash, full_name, role, status)
                VALUES (?, ?, ?, 'SUPER_ADMIN', 'Active');
            """, (owner_email, hash_password(password), owner_name))
            seed_workspace_settings(tenant)
            try:
                from services.starter_catalog import sync_workspace_catalog
                sync_workspace_catalog(tenant)
            except Exception as exc:
                # The workspace still works without it; the admin can import it from Services
                print(f"[Tenancy] Starter catalog for '{slug}' was not added: {exc}")
            try:
                from services.starter_links import import_starter_links
                import_starter_links(admin_id)
            except Exception as exc:
                # The admin can add them from Smart Operations
                print(f"[Tenancy] Default Smart Operations links for '{slug}' were not added: {exc}")
    except Exception as exc:
        # Keep the file for inspection; the workspace just never goes Active
        _platform_execute("UPDATE tenants SET status = 'Failed', updated_at = datetime('now') WHERE id = ?;",
                          (tenant_id,))
        print(f"[Tenancy] Creating workspace '{slug}' failed: {exc}")
        raise TenantError("Could not create the workspace. Please try again.")

    _platform_execute("UPDATE tenants SET status = 'Active', updated_at = datetime('now') WHERE id = ?;",
                      (tenant_id,))
    return get_tenant(slug), admin_id
