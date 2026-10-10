"""Reset one user's login password straight in the SQLite database.

The new password is typed at a hidden prompt (never passed on the command line, never printed).
It uses the same argon2 hashing as the app, clears any pending reset token and signs the user
out everywhere by revoking their sessions.

Run on the server (Coolify backend terminal, live database):
    python /app/scripts/reset_password.py --email admin@brixenconsultants.com

Run on a local copy of the database:
    python scripts/reset_password.py --email admin@brixenconsultants.com --db D:\\mudassir\\hypetex-migrate.db
"""
import argparse
import getpass
import os
import sqlite3
import sys

MIN_LENGTH = 12


def main():
    parser = argparse.ArgumentParser(description="Reset a user's password in the CRM database")
    parser.add_argument("--email", required=True, help="login email of the user")
    parser.add_argument(
        "--db",
        default=os.environ.get("DATABASE_URL") or "/app/data/hypetex.db",
        help="path to hypetex.db (default: $DATABASE_URL or /app/data/hypetex.db)",
    )
    args = parser.parse_args()

    db_path = os.path.abspath(args.db)
    if not os.path.isfile(db_path):
        sys.exit(f"Database not found: {db_path}")

    # The app's own hasher reads DATABASE_URL on import, so point it at the same file first.
    os.environ["DATABASE_URL"] = db_path
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from db import hash_password  # noqa: E402

    email = args.email.strip().lower()
    con = sqlite3.connect(db_path, timeout=30)
    con.row_factory = sqlite3.Row
    user = con.execute(
        "SELECT id, full_name, email, role, status FROM users WHERE lower(email) = ?;", (email,)
    ).fetchone()
    if not user:
        sys.exit(f"No user with email {email}")

    print(f"User: {user['full_name']} <{user['email']}>  role={user['role']}  status={user['status']}")
    print(f"Database: {db_path}")

    password = getpass.getpass(f"New password (min {MIN_LENGTH} characters): ")
    if len(password) < MIN_LENGTH:
        sys.exit(
            f"Password is too short: the script received {len(password)} character(s), minimum is {MIN_LENGTH}. "
            "Nothing was changed. (If you typed more, the terminal dropped characters: type it in a text editor "
            "first, then paste with Ctrl+Shift+V / right-click.)"
        )
    if password.lower() == email or password.lower() == (user["full_name"] or "").lower():
        sys.exit("Password must not be the email or the name. Nothing was changed.")
    if getpass.getpass("Repeat new password: ") != password:
        sys.exit("Passwords do not match. Nothing was changed.")

    with con:  # single transaction
        con.execute(
            "UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?;",
            (hash_password(password), user["id"]),
        )
        revoked = con.execute(
            "UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL;",
            (user["id"],),
        ).rowcount
        con.execute(
            "INSERT INTO activity_logs (user_id, user_email, action, entity_type, entity_id, details) VALUES (NULL, 'SYSTEM', ?, 'users', ?, ?);",
            ("PASSWORD_RESET_CLI", str(user["id"]), f"Password reset from the server script for {user['email']}"),
        )
    con.close()

    print(f"Done. Password updated for {user['email']}; {revoked} active session(s) signed out.")
    print("Log in with the new password. Do not share it in chat.")


if __name__ == "__main__":
    main()
