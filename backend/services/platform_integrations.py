"""The API keys Finstap runs for every company workspace (Didit, Companies House, Gemini, Cloudflare R2, the
no-reply mailbox), managed by the Finstap owner in the owner portal (Integrations).

The sensitive ones (Stripe, Didit, Companies House, Gemini, R2: groups with 'server_only') come ONLY from the
server env (Coolify): the owner portal shows whether they are set, never a field to type them (user, 2026-10-28).
Values saved for them in the portal before that are ignored, not deleted. For the rest (the no-reply email) a
value saved in the owner portal comes first, then the server env under the same name. Company workspaces cannot
set or see any of these (services/settings_service.py). Secrets are never sent back to the browser.
"""
import os
import threading
import time

from tenancy import _platform_execute, _platform_query

PREFIX = 'integration:'

# Each group is one card on the owner's Integrations page: (env name, label, secret, help)
GROUPS = [
    {
        'id': 'stripe', 'server_only': True, 'title': 'Stripe (payments)',
        'description': 'Workspaces pay their plan and Finstap services by card through this Stripe account.',
        'fields': [
            ('STRIPE_SECRET_KEY', 'Secret key', True, 'Stripe dashboard › Developers › API keys (sk_live_… or sk_test_…)'),
            ('STRIPE_WEBHOOK_SECRET', 'Webhook signing secret', True, 'Stripe › Developers › Webhooks › your endpoint (whsec_…)'),
        ],
    },
    {
        'id': 'didit', 'server_only': True, 'title': 'Didit identity verification',
        'description': 'KYC checks for every workspace run on this Didit account.',
        'fields': [
            ('DIDIT_API_KEY', 'API key', True, 'Didit console › API keys'),
            ('DIDIT_WEBHOOK_SECRET', 'Webhook secret', True, 'Didit console › Webhooks'),
            ('DIDIT_WORKFLOW_ID', 'Workflow ID', False, 'The KYC workflow (a UUID)'),
            ('DIDIT_CALLBACK_URL', 'Callback URL (optional)', False, 'Where people land after the check'),
        ],
    },
    {
        'id': 'companies_house', 'server_only': True, 'title': 'Companies House',
        'description': 'Company search and lookups for every workspace.',
        'fields': [
            ('COMPANIES_HOUSE_API_KEY', 'API key', True, 'developer.company-information.service.gov.uk'),
        ],
    },
    {
        'id': 'gemini', 'server_only': True, 'title': 'Google Gemini (AI assistant)',
        'description': 'The AI assistant in every workspace. UK users need a paid (billing-enabled) key.',
        'fields': [
            ('GEMINI_API_KEY', 'API key', True, 'Google AI Studio › API keys'),
            ('GEMINI_MODEL', 'Model (optional)', False, 'Empty = gemini-2.5-flash'),
        ],
    },
    {
        'id': 'r2', 'server_only': True, 'title': 'Cloudflare R2 (documents)',
        'description': 'Where workspace documents are stored. Changing the bucket does not move files already there.',
        'fields': [
            ('R2_ACCOUNT_ID', 'Account ID', False, ''),
            ('R2_ACCESS_KEY_ID', 'Access key ID', True, ''),
            ('R2_SECRET_ACCESS_KEY', 'Secret access key', True, ''),
            ('R2_BUCKET', 'Bucket', False, ''),
            ('R2_ENDPOINT', 'Endpoint (optional)', False, 'Empty = https://<account id>.r2.cloudflarestorage.com'),
        ],
    },
    {
        'id': 'platform_email', 'title': 'No-reply email (Finstap)',
        'description': "Finstap's own emails: signup and owner codes, links, newsletters.",
        'fields': [
            ('PLATFORM_SMTP_HOST', 'SMTP host', False, 'Empty = the server SMTP host'),
            ('PLATFORM_SMTP_PORT', 'SMTP port', False, 'Usually 587 or 465'),
            ('PLATFORM_SMTP_USER', 'Username', False, 'For example noreply@finstap.com'),
            ('PLATFORM_SMTP_PASS', 'Password', True, ''),
            ('PLATFORM_SMTP_FROM', 'From address (optional)', False, 'Empty = the username'),
        ],
    },
]

FIELDS = {f[0]: f for g in GROUPS for f in g['fields']}
SECRETS = {name for name, _l, secret, _h in FIELDS.values() if secret}
# Read from the server env only, never from (or saved to) the owner portal
SERVER_ONLY = {f[0] for g in GROUPS if g.get('server_only') for f in g['fields']}
# Not needed for "connected" (they have defaults: the server's SMTP host and port)
OPTIONAL = {'PLATFORM_SMTP_HOST', 'PLATFORM_SMTP_PORT'}

_cache = {'at': 0.0, 'values': {}}
_lock = threading.Lock()
CACHE_SECONDS = 30


class IntegrationError(ValueError):
    """Shown to the owner as it is."""


def _env(name):
    value = os.environ.get(name, '').strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        value = value[1:-1].strip()
    return value


def _saved():
    """The values saved in the owner portal (cached for a few seconds: R2 and email ask on every use)."""
    with _lock:
        if time.time() - _cache['at'] < CACHE_SECONDS:
            return _cache['values']
    try:
        rows = _platform_query("SELECT key, value FROM platform_settings WHERE key LIKE ?;", (PREFIX + '%',))
        values = {r['key'][len(PREFIX):]: (r['value'] or '').strip() for r in rows if (r['value'] or '').strip()}
    except Exception:
        values = {}
    with _lock:
        _cache.update(at=time.time(), values=values)
    return values


def get(name):
    """The key to use: the server env's for a server-only key; else the owner portal's value, then the env's."""
    if name in SERVER_ONLY:
        return _env(name)
    return _saved().get(name) or _env(name)


def overview():
    """Every group with, per field: whether it is set and where from; a value only for non-secret fields."""
    saved = _saved()
    groups = []
    for g in GROUPS:
        server_only = bool(g.get('server_only'))
        fields = []
        for name, label, secret, help_text in g['fields']:
            if server_only:
                # Only whether the env has it: no value, not even a non-secret one
                fields.append({'name': name, 'label': label, 'secret': True, 'help': help_text,
                               'source': 'server' if _env(name) else '', 'value': '', 'server_value': ''})
                continue
            source = 'portal' if saved.get(name) else ('server' if _env(name) else '')
            fields.append({
                'name': name, 'label': label, 'secret': secret, 'help': help_text, 'source': source,
                'value': '' if secret else (saved.get(name) or ''),
                'server_value': '' if secret else _env(name),
            })
        # Connected once every field that is not marked optional has a value
        required = [f for f in fields if '(optional)' not in f['label'] and f['name'] not in OPTIONAL]
        groups.append({'id': g['id'], 'title': g['title'], 'description': g['description'],
                       'server_only': server_only,
                       'connected': all(f['source'] for f in required), 'fields': fields})
    return groups


def save(values, clear=None):
    """Save the typed values (an empty secret keeps the saved one); `clear` lists names to forget, so the
    server env is used again. Returns the names that changed."""
    values = values if isinstance(values, dict) else {}
    if any(name in SERVER_ONLY for name in list(values) + list(clear or [])):
        raise IntegrationError("This key is set on the server (Coolify env), not here")
    clear = [c for c in (clear or []) if c in FIELDS]
    changed = []
    for name, value in values.items():
        if name not in FIELDS or name in clear:
            continue
        value = str(value if value is not None else '').strip()
        if len(value) > 4000:
            raise IntegrationError(f"{FIELDS[name][1]} is too long")
        if name in SECRETS and not value:
            continue  # left empty: keep what is saved
        if name == 'PLATFORM_SMTP_PORT' and value and not value.isdigit():
            raise IntegrationError("SMTP port must be a number")
        current = _saved().get(name, '')
        if value == current:
            continue
        _platform_execute("""
            INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
        """, (PREFIX + name, value))
        changed.append(name)
    for name in clear:
        _platform_execute("UPDATE platform_settings SET value = '', updated_at = datetime('now') WHERE key = ?;",
                          (PREFIX + name,))
        changed.append(name)
    with _lock:
        _cache['at'] = 0.0
    return changed
