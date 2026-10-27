"""Create a Finstap owner portal account (admin.finstap.com), or give an existing one a new password.

The password is typed at a hidden prompt (never on the command line, never printed). Owners always
get a 6-digit email code after the password, so the email must be one you can open.

Run on the server (Coolify backend terminal):
    python /app/scripts/create_platform_owner.py --email you@finstap.com --name "Your Name"

Local test data folder:
    set FINSTAP_DATA_DIR=D:\\tmp-build\\finstap-local
    python scripts/create_platform_owner.py --email you@finstap.com --name "Your Name"
"""
import argparse
import getpass
import os
import sys

MIN_LENGTH = 12


def main():
    parser = argparse.ArgumentParser(description="Create or update a Finstap owner portal account")
    parser.add_argument("--email", required=True, help="the owner's email (sign-in codes go here)")
    parser.add_argument("--name", default="", help="the owner's name")
    args = parser.parse_args()

    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from tenancy import PLATFORM_DB_PATH  # noqa: E402
    from services.owner_auth import OwnerAuthError, save_admin  # noqa: E402

    print(f"Platform database: {PLATFORM_DB_PATH}")
    password = getpass.getpass(f"Password (min {MIN_LENGTH} characters): ")
    if len(password) < MIN_LENGTH:
        sys.exit(f"Password is too short ({len(password)} characters, minimum {MIN_LENGTH}). Nothing was changed.")
    if password.lower() == args.email.strip().lower():
        sys.exit("The password must not be the email. Nothing was changed.")
    if getpass.getpass("Repeat password: ") != password:
        sys.exit("Passwords do not match. Nothing was changed.")
    try:
        save_admin(args.email, args.name, password)
    except OwnerAuthError as exc:
        sys.exit(f"{exc}. Nothing was changed.")
    print(f"Done. {args.email.strip().lower()} can sign in to the owner portal (admin.finstap.com).")


if __name__ == "__main__":
    main()
