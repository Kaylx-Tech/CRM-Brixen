# CRM-Brixen / Finstap: context for Claude

Written 2026-11-07 so a new Claude account (or a new session) can pick up where the last one stopped.
Claude Code reads this file by itself when it opens this folder. Keep it short and up to date.

The full chat that this came from (2026-11-04 to 2026-11-07) is exported at
`.claude/chat-history/finstap-work-2026-11-07.zip` (on this computer only, kept out of git).

## The user

- Writes in Roman Urdu / Hindi (sometimes Hindi script). **Answer in Roman Urdu**, simply, no jargon.
- Not a programmer by trade: explain what changed and what to check, not how the code works.
- Shares screenshots of other products (Shopify admin, a Framer SaaS template) as **style references**:
  copy the look, keep Finstap's own content, colours and logo. Never copy their text, images or logos.
- Wants to see a change before it goes live. Ask before anything big or global.

## The project

| Branch | What | Live |
|---|---|---|
| `master` | Brixen Consultants' own CRM (one company) | brixenconsultants.com (portal., admin.) |
| `finstap` | Finstap: the same CRM as a multi-tenant SaaS (one SQLite DB per workspace, `backend/tenancy.py`) | was live until 2026-11-06 |
| **`finstap-ui-redesign`** | `finstap` (eab46e1) + the whole UI redesign below | **live now**: Coolify deploys Finstap from this branch |

- Finstap addresses: `finstap.com` (landing, signup, find workspace), `acme.finstap.com` (a company's CRM and
  client portal), `admin.finstap.com` (owner portal, `Pages/Owner/*`), `kyc.finstap.com` (KYC team desk).
- Backend: plain Python WSGI (`backend/main.py`, routes in `backend/routes`, logic in `backend/services`).
- Frontend: React 19 + Vite + Tailwind 4 + shadcn/Base UI (`frontend/src`). `VITE_PRODUCT=finstap` builds Finstap.
- Old single-file app (`app.py`, `app.js`, `index.html` at the root) still runs Brixen's portal; see `docs/PARITY.md`.
- Another Claude session (remote) also worked on the `finstap` branch (KYC, orders, invoices).

## How we work (important)

- **Work on `finstap-ui-redesign`.** Commit locally after each change. **Do not push** and do not keep asking
  "push karun?". Push only when the user says "push" / "push krdo". A push to this branch goes live in 3-5 min.
- Git identity in this repo: `mudassirsaleem47 <mudassirsaleem230@gmail.com>` (set with `git config`, repo only).
- Restore point for the old look: tag `dashboard-ui-backup-2026-11-06` (= eab46e1, before the redesign).
  To undo a piece, check out only those files from the tag and commit. Never reset or force-push.
- Never mass-replace colours or styles across the app (e.g. turning every emerald/amber into tokens): the user
  set some colours on purpose. Change one component or page at a time and show it first.
- The user edits the UI too, with **JSXCanvas** (a dev overlay in `vite.config.js`). If a page shows
  "JSXcanvas UI", that is the user's editor (`sessionStorage['jsxcanvas-active']`); do not fight it, use another tab.
- Files the user made that are not committed: `frontend/src/splite.tsx`. Leave it alone unless asked.

## This computer

- **No Python** installed: the backend cannot run here, so nothing that needs the API can be checked locally.
- Node 26 is installed (it has `node:sqlite`, handy to test SQL).
- Dev server: `.claude/launch.json` → `finstap-web` (port 5180, `VITE_PRODUCT=finstap`). Pages are checked in the
  browser with fake data: set `localStorage.user` / `token` (or `owner_token`) and replace `window.fetch` for the
  API calls the page makes, then `history.pushState` to the page.
- Files are CRLF. When editing with scripts, keep CRLF.

## The redesign so far (finstap-ui-redesign)

Style: Shopify-admin feel, Finstap's blue → purple (#297bff → #5f5cff → #834aff), soft "3D" surfaces.

- **Font**: Geist Sans everywhere (`index.css`, `@fontsource-variable/geist`).
- **Workspace sidebar** (`Layout/Sidebar.jsx`, `Layout/nav-main.jsx`, `lib/finstap-menu.js`): small logo (opens the
  dashboard), raised 3D search box and active row (`.fs-raised`, 14px corners), sentence-case groups, Settings,
  the person + a **notifications bell that opens the list** (`components/Notification.jsx` placement="sidebar"),
  trial card for admins. Purple-black (#0b0919) with a soft accent glow at the bottom-left shared with the frame.
- **Header** (`Layout/Header.jsx`): 53px; balance button, privacy eye, avatar only (`components/TeamSwitcher.jsx`
  holds Profile, System logs, Email log, Billing, Appearance, Log out). No bell, no sidebar-toggle in the sidebar.
- **Dark mode** (Finstap): neutral greys, page #141416, cards #1c1c1f, popovers #252527 (no navy).
- **Popovers, dropdowns, selects, modals**: float like 3D cards (light top edge, fine outline, soft deep shadow).
- **Ctrl K search**: plain list; its field looks like the sidebar search; chosen row a lighter grey.
- **Stat cards** (`Layout/StatsCard.jsx`, `.fs-stat`): no outline, faint blue→purple wash, gradient icon chip;
  the chosen card has no edge, a stronger wash and the icon on the logo gradient.
- **Tabs** (`components/ui/tabs.jsx`): a white raised key that **slides** to the chosen tab (Base UI Indicator).
- **Buttons** (`components/ui/button.jsx`): the primary button has an inset 3D look.
- **Inputs/selects**: 10px corners, 2px soft focus ring that fades in.
- **Balance modal** (`components/WalletButton.jsx`): wide, two columns.
- **Sign-in** (`components/finstap-auth-layout.jsx`, `finstap-login-form.jsx`): one centred card, no side image;
  login in two steps (workspace, then email + password) when subdomains are off.
- **Owner portal**: left sidebar menu (`Pages/Owner/OwnerPortal.jsx`); Overview redesigned; `Stat`/`Panel` in
  `Pages/Owner/ownerUi.jsx` use the same 3D style (`.fs-panel`).
- **Landing page finstap.com** (`Pages/FinstapLanding.jsx`, `Pages/FinstapPricing.jsx`), after the Framer template
  alytics.framer.website: full-width header; centred hero with tilted floating icons and a **real dashboard
  screenshot** (`assets/finstap-dashboard.png`) in a plain rounded frame with a blue glow that **leans back at the
  top of the page and straightens as you scroll**; bento features; benefits; 3 steps; services; orbit; pricing
  (3 plans, short lists, Enterprise hidden, popular plan in a gradient frame); compare; FAQ; CTA; a newsletter card
  with drawn SVG envelopes on gradient ribbons; column footer. Headings 64/48px weight 500, tight tracking.
  3D buttons from `lib/finstap-buttons.js` (BRAND_BUTTON / LIGHT_BUTTON). No testimonials or client logos (none real).
- Many CSS classes for this live at the end of `frontend/src/index.css` (`.fs-*`).

## Other work done in the earlier session (on `finstap`, already live)

- Login OTP only on a new browser, trusted 30 days, for workspaces, owner portal and KYC panel; device id shared
  across *.finstap.com by cookie (`backend/services/owner_auth.py`, `lib/device.js`).
- Every email field accepts only a real email (`utils/validation.py email_problem`, `lib/validation.js emailProblem`).
- Partner Perks links open in a popup window with the referral link (`Pages/SmartOperations/SmartOperations.jsx`).

## Open / next

- Phone layout of the landing page, sign-in and owner portal not checked yet.
- `assets/finstap-dashboard.png` (395KB) shows the demo workspace; a WebP version would load faster.
- Design-system audit (2026-11-07) found many hard-coded colours and font sizes; the user said **do not**
  change them all at once.
- Partner Perks "send client data to banks": discussed (needs partner APIs/agreements), parked by the user.
- A stray empty file `D:\edits.tmp` (outside the repo) can be deleted by the user.
