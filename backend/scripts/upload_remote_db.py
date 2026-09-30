#!/usr/bin/env python3
"""
Upload local SQLite DB to the production host mount path (SFTP).

Live app reads:
  Host:      /var/www/brixen-crm/hypetex.db
  Container: /app/data/hypetex.db  (file mount)

Usage (prompt for password):
  python scripts/upload_remote_db.py --host 1.2.3.4 --user root

Usage (env password):
  set REMOTE_SSH_PASS=...
  python scripts/upload_remote_db.py --host 1.2.3.4 --user root

After upload, restart the API container / Coolify redeploy so it picks up the file.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path
from stat import S_ISDIR, S_ISREG

try:
    import paramiko
except ImportError:
    print("paramiko is required: pip install paramiko", file=sys.stderr)
    sys.exit(1)

DEFAULT_REMOTE = "/var/www/brixen-crm/hypetex.db"
BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_LOCAL = BACKEND_DIR / "database" / "hypetex.db"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Upload local hypetex.db to live mount path over SFTP")
    p.add_argument("--host", required=True, help="Server IP or hostname")
    p.add_argument("--user", default="root", help="SSH username (default: root)")
    p.add_argument("--port", type=int, default=22, help="SSH port (default: 22)")
    p.add_argument("--remote", default=DEFAULT_REMOTE, help=f"Remote DB path (default: {DEFAULT_REMOTE})")
    p.add_argument(
        "--local",
        default=str(DEFAULT_LOCAL),
        help=f"Local source DB (default: {DEFAULT_LOCAL})",
    )
    p.add_argument(
        "--password",
        default=None,
        help="SSH password (prefer prompt or REMOTE_SSH_PASS env; do not commit)",
    )
    p.add_argument(
        "--no-backup",
        action="store_true",
        help="Do not rename existing remote DB before overwrite",
    )
    p.add_argument(
        "--skip-checkpoint",
        action="store_true",
        help="Skip local WAL checkpoint before upload",
    )
    return p.parse_args()


def resolve_password(cli_password: str | None) -> str:
    env = os.environ.get("REMOTE_SSH_PASS", "").strip()
    if cli_password:
        return cli_password
    if env:
        return env
    return getpass.getpass("SSH password: ")


def checkpoint_wal(local_path: Path) -> None:
    print(f"[..] WAL checkpoint on {local_path}")
    conn = sqlite3.connect(str(local_path))
    try:
        result = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        print(f"[ok] Checkpoint result: {result}")
    finally:
        conn.close()


def sftp_mkdir_p(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    remote_dir = remote_dir.replace("\\", "/").rstrip("/")
    if not remote_dir or remote_dir == "/":
        return
    parts = remote_dir.split("/")
    cur = ""
    for part in parts:
        if not part:
            cur = "/"
            continue
        cur = f"{cur.rstrip('/')}/{part}"
        try:
            attrs = sftp.stat(cur)
            if not S_ISDIR(attrs.st_mode):
                raise RuntimeError(f"Remote path exists but is not a directory: {cur}")
        except FileNotFoundError:
            sftp.mkdir(cur)
            print(f"[ok] Created remote dir {cur}")


def main() -> int:
    args = parse_args()
    local_path = Path(args.local)

    if not local_path.is_file():
        print(f"[fail] Local DB not found: {local_path}", file=sys.stderr)
        return 1
    if local_path.stat().st_size <= 0:
        print(f"[fail] Local DB is empty: {local_path}", file=sys.stderr)
        return 1

    if not args.skip_checkpoint:
        try:
            checkpoint_wal(local_path)
        except Exception as exc:
            print(f"[warn] Checkpoint failed (continuing): {exc}")

    size_mb = local_path.stat().st_size / (1024 * 1024)
    password = resolve_password(args.password)

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

    remote = args.remote.replace("\\", "/")
    remote_parent = str(Path(remote).parent).replace("\\", "/")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    try:
        sftp = client.open_sftp()
        sftp_mkdir_p(sftp, remote_parent)

        try:
            attrs = sftp.stat(remote)
        except FileNotFoundError:
            attrs = None

        if attrs is not None:
            if S_ISDIR(attrs.st_mode):
                print(
                    f"[fail] Remote path is a DIRECTORY (Docker often creates this when "
                    f"the host file was missing). Remove it first:\n"
                    f"  ssh {args.user}@{args.host} 'rm -rf {remote}'\n"
                    f"Then re-run this script.",
                    file=sys.stderr,
                )
                return 1
            if S_ISREG(attrs.st_mode) and not args.no_backup and (attrs.st_size or 0) > 0:
                backup = f"{remote}.{stamp}.bak"
                print(f"[..] Backing up remote → {backup}")
                sftp.rename(remote, backup)
                print(f"[ok] Remote backup saved")

        print(f"[..] Uploading {local_path} ({size_mb:.2f} MB) → {remote}")

        def _progress(transferred: int, total: int) -> None:
            if total <= 0:
                return
            pct = transferred * 100 / total
            if transferred == total or transferred % max(total // 20, 1) < 65536:
                print(f"\r[..] {pct:5.1f}% ({transferred}/{total} bytes)", end="", flush=True)

        sftp.put(str(local_path), remote, callback=_progress)
        print()

        remote_size = sftp.stat(remote).st_size
        sftp.close()
    finally:
        client.close()

    print(f"[ok] Uploaded {remote} ({remote_size} bytes)")
    print("[next] Restart API / Coolify redeploy so the container remounts the file.")
    print("       Coolify File Mount must be:")
    print("         Source:      /var/www/brixen-crm/hypetex.db")
    print("         Destination: /app/data/hypetex.db")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
