#!/usr/bin/env python3
"""
Download live SQLite DB from the production host via SFTP.

Default remote path (host mount from docker-compose):
  /var/www/brixen-crm/hypetex.db

Usage (prompt for password):
  python scripts/download_remote_db.py --host 1.2.3.4 --user root

Usage (env password — avoid putting secrets in shell history if possible):
  set REMOTE_SSH_PASS=...
  python scripts/download_remote_db.py --host 1.2.3.4 --user root
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from datetime import datetime
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("paramiko is required: pip install paramiko", file=sys.stderr)
    sys.exit(1)

DEFAULT_REMOTE = "/var/www/brixen-crm/hypetex.db"
BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_LOCAL = BACKEND_DIR / "database" / "hypetex.db"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Download remote hypetex.db over SFTP")
    p.add_argument("--host", required=True, help="Server IP or hostname")
    p.add_argument("--user", default="root", help="SSH username (default: root)")
    p.add_argument("--port", type=int, default=22, help="SSH port (default: 22)")
    p.add_argument("--remote", default=DEFAULT_REMOTE, help=f"Remote DB path (default: {DEFAULT_REMOTE})")
    p.add_argument(
        "--local",
        default=str(DEFAULT_LOCAL),
        help=f"Local destination (default: {DEFAULT_LOCAL})",
    )
    p.add_argument(
        "--password",
        default=None,
        help="SSH password (prefer prompt or REMOTE_SSH_PASS env; do not commit)",
    )
    p.add_argument(
        "--backup-existing",
        action="store_true",
        help="If local file exists, rename it with a timestamp before overwrite",
    )
    return p.parse_args()


def resolve_password(cli_password: str | None) -> str:
    env = os.environ.get("REMOTE_SSH_PASS", "").strip()
    if cli_password:
        return cli_password
    if env:
        return env
    return getpass.getpass("SSH password: ")


def main() -> int:
    args = parse_args()
    password = resolve_password(args.password)
    local_path = Path(args.local)
    local_path.parent.mkdir(parents=True, exist_ok=True)

    if local_path.exists() and args.backup_existing:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup = local_path.with_name(f"{local_path.stem}.{stamp}{local_path.suffix}")
        local_path.rename(backup)
        print(f"[ok] Existing local DB moved to {backup}")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    print(f"[..] Connecting {args.user}@{args.host}:{args.port}")
    try:
        client.connect(
            hostname=args.host,
            port=args.port,
            username=args.user,
            password=password,
            timeout=30,
            allow_agent=False,
            look_for_keys=False,
        )
    except Exception as exc:
        print(f"[fail] SSH connect failed: {exc}", file=sys.stderr)
        return 1

    try:
        sftp = client.open_sftp()
        try:
            remote_stat = sftp.stat(args.remote)
        except FileNotFoundError:
            print(f"[fail] Remote file not found: {args.remote}", file=sys.stderr)
            # Helpful listing of parent dir
            parent = str(Path(args.remote).parent).replace("\\", "/")
            try:
                names = sftp.listdir(parent)
                print(f"[hint] Contents of {parent}: {', '.join(names[:40])}")
            except Exception:
                pass
            return 1

        size_mb = (remote_stat.st_size or 0) / (1024 * 1024)
        print(f"[..] Downloading {args.remote} ({size_mb:.2f} MB) → {local_path}")

        def _progress(transferred: int, total: int) -> None:
            if total <= 0:
                return
            pct = transferred * 100 / total
            if transferred == total or transferred % max(total // 20, 1) < 65536:
                print(f"\r[..] {pct:5.1f}% ({transferred}/{total} bytes)", end="", flush=True)

        sftp.get(args.remote, str(local_path), callback=_progress)
        print()
        sftp.close()
    finally:
        client.close()

    local_size = local_path.stat().st_size
    print(f"[ok] Saved {local_path} ({local_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
