import sqlite3
from pathlib import Path

db = Path(__file__).resolve().parent.parent / "database" / "hypetex.db"
c = sqlite3.connect(str(db))
c.row_factory = sqlite3.Row

print("DB:", db, "size:", db.stat().st_size)
print("--- roles ---")
for r in c.execute("SELECT role, COUNT(*) AS c FROM users GROUP BY role ORDER BY c DESC"):
    print(dict(r))

print("--- non-client users ---")
for r in c.execute(
    "SELECT id, email, role, status, substr(password_hash,1,30) AS hash_prefix, length(password_hash) AS hash_len "
    "FROM users WHERE upper(COALESCE(role,'')) != 'CLIENT' ORDER BY id LIMIT 30"
):
    print(dict(r))

print("--- admin emails ---")
for r in c.execute(
    "SELECT id, email, role, status FROM users WHERE lower(email) LIKE '%admin%' OR upper(role) LIKE '%ADMIN%' LIMIT 20"
):
    print(dict(r))
