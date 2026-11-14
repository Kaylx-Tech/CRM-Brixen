# Brixen CRM: context for Claude

Claude Code reads this file by itself when it opens this folder. Keep it short and up to date.

## The user

- Writes in Roman Urdu / Hindi (sometimes Hindi script). **Answer in Roman Urdu**, simply, no jargon.
- Not a programmer by trade: explain what changed and what to check, not how the code works.
- Wants to see a change before it goes live. Ask before anything big or global.

## The project

This folder (**D:\CRM-Brixen**) is **Brixen Consultants' own CRM only**: repo `Kaylx-Tech/CRM-Brixen`, branch
**`master`**. Live at brixenconsultants.com (`portal.`, `admin.`).

- Backend: plain Python WSGI (`backend/main.py`, routes in `backend/routes`, logic in `backend/services`).
- Frontend: React 19 + Vite + Tailwind 4 + shadcn/Base UI (`frontend/src`).
- Old single-file app (`app.py`, `app.js`, `index.html` at the root) still runs Brixen's portal; see `docs/PARITY.md`.
- The website brixenconsultants.com is WordPress/WooCommerce today; it talks to this CRM through the WooCommerce
  webhook, `/api/v1/auth/sso` and `/api/v1/wordpress/documents`. The user plans to rebuild it in Next.js in this
  repo (its own folder, e.g. `website/`, deployed as its own Coolify app on the same API).

**Finstap is a separate product** in **D:\Finstap** (repo `Kaylx-Tech/finstap`, branch `main`). It started from this
code on 2026-10-20 and moved to its own repo on 2026-11-14. Never change Finstap from here. CRM-Brixen still has an
old `finstap` branch on GitHub until the user confirms Coolify deploys Finstap from its new repo; do not work on it.

## How we work (important)

- **Work on `master` in this folder.** Commit locally after each change. **Do not push** and do not keep asking
  "push karun?". Push only when the user says "push" / "push krdo"; a push to `master` can go live.
- Git identity in this repo: `mudassirsaleem47 <mudassirsaleem230@gmail.com>` (set with `git config`, repo only).
- **Brixen and Finstap are separate repos and folders; never merge one into the other.** When a fix might be needed
  in both, ask the user. If yes, commit it here, then copy that one commit to D:\Finstap (`git format-patch -1 <sha>`
  here, `git am` there; or write it again if it does not fit), with the same commit message. If it does not apply
  cleanly, stop and tell the user.
- Never reset or force-push.
- Files the user made that are not committed: `frontend/src/splite.tsx`. Leave it alone unless asked.

## This computer

- Python 3.15 is installed as `py` (not `python`), but the backend's libraries are not (argon2, requests, ...):
  `py -m py_compile` checks backend files. The full backend server cannot run here.
- Node 26 is installed. Dev server: `.claude/launch.json` → `frontend` (port 5179). Pages are checked in the browser
  with fake data (set `localStorage.user` / `token` and replace `window.fetch`).
- Files are CRLF. When editing with scripts, keep CRLF.
- Known on the live site: after a deploy, Cloudflare kept a 404 for the new script and the page loaded blank
  (fixed in Finstap on 2026-11-13 in `frontend/nginx.conf`: a 404 under `/assets/` is sent with `no-store`).
  Brixen's portal showed the same errors in GlitchTip ("Importing a module script failed"); the same nginx fix is
  likely needed here.
