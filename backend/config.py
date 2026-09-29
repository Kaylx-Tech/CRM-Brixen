"""Brixen CRM - Global Configuration & Environment Settings
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Environment Variables Loading
def _load_env_file():
    for fname in ('.env', '.env.local', '.env.production'):
        fpath = BASE_DIR / fname
        if fpath.exists():
            try:
                with open(fpath, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            k, v = line.split('=', 1)
                            k = k.strip()
                            v = v.strip().strip("'").strip('"')
                            if k and k not in os.environ:
                                os.environ[k] = v
            except Exception:
                pass
            break

_load_env_file()

# Server Config
PORT = int(os.environ.get('PORT', '5050'))
HOST = os.environ.get('HOST', '0.0.0.0')
CRM_ENV = (os.environ.get('CRM_ENV') or os.environ.get('ENV') or 'development').strip().lower()
IS_PRODUCTION = CRM_ENV in ('production', 'prod', 'live')

# Database
_raw_db = os.environ.get('DATABASE_URL') or 'database/hypetex.db'
if os.name == 'nt' and _raw_db.startswith('/var/www/'):
    _raw_db = 'database/hypetex.db'
if not os.path.isabs(_raw_db):
    DB_PATH = str(BASE_DIR / _raw_db)
else:
    DB_PATH = _raw_db
SCHEMA_PATH = str(BASE_DIR / 'schema.sql')


# Storage Directories
_storage = os.environ.get('STORAGE_PATH') or 'storage'
if not os.path.isabs(_storage):
    STORAGE_DIR = str(BASE_DIR / _storage)
else:
    STORAGE_DIR = _storage
os.makedirs(STORAGE_DIR, exist_ok=True)
STATIC_DIR = str(BASE_DIR / 'static')

# CORS Origins — static allowlist + EXTRA_CORS_ORIGINS (comma-separated)
_cors = {
    'https://brixenconsultants.com',
    'https://www.brixenconsultants.com',
    'https://portal.brixenconsultants.com',
    'http://portal.brixenconsultants.com',
    'https://admin.brixenconsultants.com',
    'http://admin.brixenconsultants.com',
    'https://ledger-frontend-eosin.vercel.app',
    'http://127.0.0.1:5050',
    'http://localhost:5050',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
}
for _origin in (os.environ.get('EXTRA_CORS_ORIGINS') or '').split(','):
    _origin = _origin.strip().rstrip('/')
    if _origin:
        _cors.add(_origin)
ALLOWED_CORS_ORIGINS = frozenset(_cors)

# Authentication / Sessions
SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60  # 30 Days in seconds
INTERNAL_STAFF_ROLES = ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF')
COOKIE_SECURE = str(os.environ.get('COOKIE_SECURE', 'true' if IS_PRODUCTION else 'false')).strip().lower() in (
    '1', 'true', 'yes', 'on'
)

# Public app URLs (emails / reset links — never hardcode in routes)
FRONTEND_URL = (os.environ.get('FRONTEND_URL') or 'https://admin.brixenconsultants.com').rstrip('/')
PORTAL_URL = (os.environ.get('PORTAL_URL') or 'https://portal.brixenconsultants.com').rstrip('/')
API_PUBLIC_URL = (os.environ.get('API_PUBLIC_URL') or '').rstrip('/')
