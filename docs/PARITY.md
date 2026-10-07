# Old app (app.py / app.js) → New app (modular backend + React) parity checklist

Goal: React admin (`admin.`) + modular Python backend (`api.`) must cover everything the old
single-file portal (`portal.`, `app.py` + `app.js` + `index.html`) does, then do it better.
Nothing in the old app is deleted or switched off until a section is ticked here.

Method: old routes were extracted from `app.py`, new ones from `backend/routes/*.py`
(string match, so treat "missing" as "needs a manual check"). Browser walkthrough of
`portal.` adds UI details (filters, buttons, flows) per section.

## 1. Admin screens (old sidebar → React page)

| Old section (`#hash`) | React page | Status |
|---|---|---|
| Overview (`#admin-dashboard`) | `/admin/dashboard` | built, needs UI/data check against old (cards, revenue, sales analytics, trend, top performer, month filter, hide-profit toggle) |
| Customers / Signups (`#admin-customers`) | `/admin/customers` | built, check filters (type/source/date), set password, B2B open, delete, profile |
| Company Registered (`#admin-companies`) | `/admin/companies` | built; was 500 (`orders.products_summary`) → fixed in 6e7aab6, verify after deploy |
| Accountancy (`#admin-accountancy`) | `/admin/accountancy` | built, check accounts-file flow |
| Orders Manager (`#admin-orders`) | `/admin/orders` | built, check wizard, draft, status flow |
| Tasks & Team (`#admin-tasks`) | `/admin/tasks` | built; **API `/api/admin/tasks` + incentives report not found in new backend** |
| Services Catalog (`#admin-services`) | `/admin/services` | built |
| Payment/Invoices (`#admin-payments`) | `/admin/payments` | built; **`/invoice/<id>` HTML view missing** |
| Documents Review (`#admin-documents`) | `/admin/documents` | built; **promote-to-companies missing** |
| Smart Intake (`#admin-intake`) | `/admin/intake` | built; **google-drive-import missing** |
| Audit Logs (`#admin-logs`) | `/admin/logs` | built |
| System Settings (`#admin-settings`) | `/admin/settings` | built; **`/api/settings` GET missing** |
| Profile & Password (`#profile`) | `/admin/settings?tab=profile` | redirect only, check |
| Staff dashboard (`#staff-dashboard`) | none | **missing** (`/api/staff/my-dashboard`) |
| Global search (Ctrl+K) | header search | **`/api/search` missing** |
| Notifications bell | `/admin/notifications` | built |
| Theme / user preferences | - | **`/api/user/preferences` missing** |

## 2. Customer portal (old app, clients log in here) — NOT in React at all

Needed backend + a client-facing React area (`/portal/...`):
dashboard, stats, companies, orders, invoices, payments, documents (+upload), services,
catalog, addresses, tickets, messages, accounts-file.
Routes missing in new backend: `/api/client/{dashboard,stats,companies,documents,documents/upload,
invoices,payments,services,catalog,addresses,tickets,messages,accounts-file}`.

## 3. Integrations (missing in new backend)

- WordPress/WooCommerce: `/api/v1/wordpress/{webhook,sync-users,sync-orders,sync-products,documents}`, `/api/v1/auth/sso`
- Companies House helpers: `/api/companies-house/{name-availability,officers,sic-codes}`,
  `/api/admin/companies/{name-availability,officers,sic-codes,import-webfiling,bulk-update}`
- UK postcode lookup: `/api/uk-postcode/addresses`, `/api/admin/uk-postcode/addresses`
- Form-fill AD01: `/api/admin/{formfill,uk-formfill}/...`, `/formfill`, `/formfill/ad01`
- Compliance alerts: `/api/admin/compliance-alerts/{run,test-rmk}`, `/api/public/compliance-engage`
- Public incorporation certificate: `/api/public/incorporation-certificate`
- Impersonate customer: `/api/admin/impersonate`, `/impersonate/stop`
- Webhooks admin: `/api/admin/webhooks`
- Google Drive: uploads exist, **378 of 1252 documents still not on Drive** (sync script needed)

## 4. Suggested order

1. Verify companies fix after deploy; walk all admin screens in browser vs old (UI + data) — fix bugs.
2. Tasks API + incentives, settings GET, preferences, search, staff dashboard.
3. Companies House helpers, postcode, import-webfiling, bulk-update.
4. WordPress sync + SSO (website signups/orders depend on this).
5. Customer portal (backend routes first, then React pages).
6. Compliance alerts, form-fill AD01, impersonate, invoice HTML, certificate.
7. Drive sync of the 378 pending documents.

## 5. Infra rules for the new app

- DB: directory mount `/var/www/brixen-new/data → /app/data` (never single-file), WAL stays on host.
- Storage: `/var/www/brixen-new/storage → /app/storage`.
- Env: `CRM_ENV=production`, `COOKIE_SECURE=true`, `DEV_AUTH_BYPASS=0`.
- Before any cutover: fresh `sqlite3 .backup` from the old live DB + storage rsync (new DB is a snapshot from 2026-10-07 12:15 UTC).
