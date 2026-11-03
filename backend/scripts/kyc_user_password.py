"""Give a KYC team member (kyc.finstap.com) a new password, when the emailed set-password link is no use.

By default a strong random password is made and shown ONCE in this terminal: give it to the person safely
and ask them to change it after signing in (KYC panel > their account). --type asks you for one instead, at a
hidden prompt. Their other sessions are signed out. They still get the 6-digit email code at each sign-in.
Only an existing KYC team account is changed (add people first in admin.finstap.com > KYC > KYC team).

Run on the server (Coolify > Finstap Backend > Terminal):
    python /app/scripts/kyc_user_password.py --email person@example.com

Local test data folder:
    set FINSTAP_DATA_DIR=D:\\tmp-build\\finstap-local
    python scripts/kyc_user_password.py --email checker@kycteam.test
"""
import argparse
import getpass
import os
import secrets
import string
import sys

MIN_LENGTH = 12


def _random_password(length=16):
    """Letters, digits and a few symbols; at least one of each kind."""
    pools = (string.ascii_lowercase, string.ascii_uppercase, string.digits, '!@#$%*-_')
    chars = [secrets.choice(pool) for pool in pools]
    everything = ''.join(pools)
    chars += [secrets.choice(everything) for _ in range(length - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return ''.join(chars)


def main():
    parser = argparse.ArgumentParser(description="New password for a KYC team member (kyc.finstap.com)")
    parser.add_argument("--email", required=True, help="the KYC team member's email")
    parser.add_argument("--type", action="store_true", help="type the password yourself instead of a random one")
    args = parser.parse_args()

    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    from db import hash_password  # noqa: E402
    from tenancy import PLATFORM_DB_PATH, _platform_execute, _platform_query, ensure_platform  # noqa: E402

    ensure_platform()
    email = args.email.strip().lower()
    print(f"Platform database: {PLATFORM_DB_PATH}")
    row = _platform_query("SELECT id, full_name, role, status FROM platform_admins WHERE LOWER(email) = ?;",
                          (email,), one=True)
    if not row:
        sys.exit(f"No KYC team account for {email}. Add it in admin.finstap.com > KYC > KYC team first.")
    if row['role'] != 'kyc':
        sys.exit(f"{email} is an owner account, not a KYC team one. Use create_platform_owner.py for owners.")
    if row['status'] != 'Active':
        sys.exit(f"{email} is turned off. Turn it on in admin.finstap.com > KYC > KYC team first.")

    if args.type:
        password = getpass.getpass(f"New password (min {MIN_LENGTH} characters): ")
        if len(password) < MIN_LENGTH:
            sys.exit(f"Password is too short ({len(password)} characters, minimum {MIN_LENGTH}). Nothing was changed.")
        if password.lower() == email:
            sys.exit("The password must not be the email. Nothing was changed.")
        if getpass.getpass("Repeat password: ") != password:
            sys.exit("Passwords do not match. Nothing was changed.")
    else:
        password = _random_password()

    _platform_execute("UPDATE platform_admins SET password_hash = ? WHERE id = ?;", (hash_password(password), row['id']))
    _platform_execute("UPDATE platform_sessions SET revoked_at = datetime('now') WHERE admin_id = ? AND revoked_at IS NULL;",
                      (row['id'],))
    print(f"Done. {row['full_name'] or email} ({email}) can sign in at kyc.finstap.com.")
    if not args.type:
        print("")
        print(f"    New password: {password}")
        print("")
        print("It is shown only now. Give it to them safely and ask them to change it after signing in.")


if __name__ == "__main__":
    main()
