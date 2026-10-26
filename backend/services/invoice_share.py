"""Private links to one invoice's PDF without signing in (the "View invoice" button in invoice emails).

A link holds a long random code; only its SHA-256 hash is stored, it opens that one invoice only and it
stops working after LINK_DAYS. In a Finstap workspace the code starts with the workspace name
('acme.<code>') so the link page knows which company's database to ask.
"""
import hashlib
import re
import secrets

from db import execute_db, query_db

LINK_DAYS = 30
TOKEN_RE = re.compile(r'^(?:[a-z0-9]{1,40}\.)?[A-Za-z0-9_-]{30,64}$')


def _ensure_table():
    execute_db("""
        CREATE TABLE IF NOT EXISTS invoice_share_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash TEXT NOT NULL UNIQUE,
            invoice_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL
        );
    """)


def _hash(token):
    return hashlib.sha256(str(token).encode('utf-8')).hexdigest()


def create_share_token(invoice_id, days=LINK_DAYS):
    """A new private code for the invoice (valid for `days`)."""
    _ensure_table()
    try:
        from tenancy import current_tenant
        slug = str((current_tenant() or {}).get('slug') or '').lower()
    except ImportError:
        slug = ''
    code = secrets.token_urlsafe(32)
    token = f'{slug}.{code}' if slug else code
    execute_db("INSERT INTO invoice_share_links (token_hash, invoice_id, expires_at) VALUES (?, ?, datetime('now', ?));",
               (_hash(token), int(invoice_id), f'+{int(days)} days'))
    return token


def invoice_for_token(token):
    """(invoice_id, None) for a valid code, or (None, 'expired' | 'invalid')."""
    token = str(token or '').strip()
    if not TOKEN_RE.match(token):
        return None, 'invalid'
    _ensure_table()
    row = query_db("SELECT invoice_id, expires_at > datetime('now') AS live FROM invoice_share_links "
                   "WHERE token_hash = ?;", (_hash(token),), one=True)
    if not row:
        return None, 'invalid'
    if not row['live']:
        return None, 'expired'
    return row['invoice_id'], None
