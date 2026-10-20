"""Finstap multi-tenancy: every company (workspace) gets its own SQLite database.

platform.db keeps the registry of workspaces. Each workspace's CRM data lives in
its own file under TENANTS_DIR, so existing queries need no company filter and one
company can never read another's rows.

Which workspace a request belongs to comes from (first match wins):
  1. the session token prefix  "<slug>.<uuid>"
  2. the X-Tenant header or ?tenant= query value
  3. DEFAULT_TENANT (Brixen's existing database), when that workspace is registered
"""
import os
import re
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from pathlib import Path

import db as db_mod
from db import set_db_path, NO_TENANT_DB, hash_password

DATA_DIR = os.environ.get('FINSTAP_DATA_DIR') or os.path.dirname(db_mod.DB_PATH)
PLATFORM_DB_PATH = os.environ.get('PLATFORM_DB_PATH') or os.path.join(DATA_DIR, 'platform.db')
TENANTS_DIR = os.environ.get('TENANTS_DIR') or os.path.join(DATA_DIR, 'tenants')
DEFAULT_TENANT = (os.environ.get('DEFAULT_TENANT') or 'brixen').strip().lower()
TRIAL_DAYS = int(os.environ.get('TRIAL_DAYS') or 14)

SLUG_RE = re.compile(r'^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$')
RESERVED_SLUGS = frozenset({
    'www', 'api', 'app', 'admin', 'portal', 'platform', 'finstap', 'mail', 'static',
    'assets', 'login', 'signup', 'support', 'help', 'billing', 'status', 'docs', 'blog',
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
"""

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
            known = conn.execute("SELECT 1 FROM tenants WHERE slug = ?;", (DEFAULT_TENANT,)).fetchone()
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
    slug = slug_from_token(token)
    if slug:
        return slug
    header = (environ.get('HTTP_X_TENANT') or '').strip().lower()
    if header:
        return header
    if query:
        value = query.get('tenant') or query.get('workspace')
        if value:
            return str(value[0] if isinstance(value, list) else value).strip().lower()
    return None


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


# ── signup: create a workspace ──────────────────────────────────────────────

def normalize_slug(value):
    slug = re.sub(r'[^a-z0-9-]+', '-', (value or '').strip().lower()).strip('-')
    return re.sub(r'-{2,}', '-', slug)[:40].strip('-')


def check_slug(slug):
    """Return an error message, or None when the slug can be used."""
    if not SLUG_RE.match(slug or ''):
        return "Workspace URL must be 3-40 letters, numbers or dashes"
    if slug in RESERVED_SLUGS:
        return "This workspace URL is reserved"
    if get_tenant(slug):
        return "This workspace URL is already taken"
    return None


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
    except Exception as exc:
        # Keep the file for inspection; the workspace just never goes Active
        _platform_execute("UPDATE tenants SET status = 'Failed', updated_at = datetime('now') WHERE id = ?;",
                          (tenant_id,))
        print(f"[Tenancy] Creating workspace '{slug}' failed: {exc}")
        raise TenantError("Could not create the workspace. Please try again.")

    _platform_execute("UPDATE tenants SET status = 'Active', updated_at = datetime('now') WHERE id = ?;",
                      (tenant_id,))
    return get_tenant(slug), admin_id
