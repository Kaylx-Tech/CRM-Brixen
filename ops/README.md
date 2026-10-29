# 24/7 monitoring and auto-fix (free)

Two parts, both send alerts to Telegram (once when a problem starts, hourly while it lasts, once when fixed):

| Part | Runs where | Watches | Fixes by itself |
|---|---|---|---|
| `site-watcher/` | Cloudflare Worker, every 2 min (free plan) | finstap.com, www, workspace subdomain, Finstap API, Brixen admin / API / portal; R2 bucket settings; finstap.com DNS; server heartbeat | removes any public domain or r2.dev URL from the private R2 bucket; puts back missing finstap.com DNS records |
| `server-watchdog/` | the VPS, systemd timer every min | unhealthy / crash-looping containers, disk, memory, databases (read-only, hourly), backups | restarts unhealthy containers (max 3 times in 30 min, then asks a person); frees disk (unused Docker images and build cache older than 7 days, old journal) |

Never deleted or changed by either: databases, uploaded documents, volumes, R2 files, DNS records that already exist.
A DNS record pointing somewhere else is left alone (that may be on purpose).

## 1. Telegram bot (5 min)

1. In Telegram open **@BotFather**, send `/newbot`, pick a name. Copy the **bot token**.
2. Open your new bot and press **Start** (send it any message).
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy `"chat":{"id": ...}`. That is the **chat id**.
   For a group: add the bot to the group, send a message there, and use the group's (negative) id.

## 2. Site watcher (Cloudflare Worker)

1. Cloudflare > **My Profile > API Tokens > Create Token > Custom token** with:
   - Zone > DNS > Edit, Zone resources: finstap.com
   - Account > Workers R2 Storage > Edit
2. Cloudflare > finstap.com > Overview: copy the **Zone ID** into `wrangler.toml` (`CF_ZONE_ID`).
3. On your computer, in `ops/site-watcher`:
   ```
   npx wrangler login
   npx wrangler kv namespace create STATE        # paste the id into wrangler.toml
   npx wrangler secret put CF_API_TOKEN
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   npx wrangler secret put HEARTBEAT_KEY         # any long random string, e.g. openssl rand -hex 32
   npx wrangler deploy
   ```
4. Test: `curl -H "Authorization: Bearer <HEARTBEAT_KEY>" https://site-watcher.<you>.workers.dev/test` sends a Telegram message.
   `/run` runs all checks now and shows the result, `/status` shows what is currently down.

Every morning at 09:00 (Pakistan) it sends one "all good" message, so silence never means the watcher itself died.

## 3. Server watchdog (VPS)

1. Copy the `ops/server-watchdog` folder to the server and run `sudo bash install.sh`.
2. Edit `/etc/server-watchdog.env`: Telegram token + chat id, `HEARTBEAT_URL` (your worker URL + `/heartbeat`),
   the same `HEARTBEAT_KEY`, and check `DB_FILES` / `BACKUP_DIR` match the server.
3. `sudo apt install sqlite3` (for the hourly database check), then `server-watchdog --test`.
4. Logs: `journalctl -u server-watchdog -n 50`. Stop: `sudo systemctl disable --now server-watchdog.timer`.

## Changing what is watched

- Sites: `SITES` at the top of `site-watcher/src/index.js`, then `npx wrangler deploy`.
- DNS records kept alive: `dnsRecords()` in the same file.
- Limits: `/etc/server-watchdog.env` on the server (no restart needed).
