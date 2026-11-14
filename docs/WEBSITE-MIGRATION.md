# brixenconsultants.com: WordPress → Next.js inventory

Read on 2026-11-14 from the hosting files (`public_html.zip`) and the database dump (`u181418208_1GK6P.sql`) the user
downloaded to `D:\wp-site-temp-data\` (outside every repo: it also holds customers, orders, users and keys, so it is
never committed and should be deleted when the new site is live), and from the live site.

## The site today

- WordPress, theme **itfirm** (Case Themes), pages built with **Elementor Pro**; fonts Inter and Nunito.
- Permalinks `/%postname%/`; the home page is the page `/home-2/` served at `/`. Currency GBP.
- **SEO is weak today:** no SEO plugin, no meta descriptions, no H1 on the home page, title "Brixen – Consultants".
- Chat and extras: Tawk.to live chat, WhatsApp button, Google and Facebook review widgets, Mailchimp form.
- Payments: WooCommerce with Stripe and WooCommerce Payments.

## Pages (111 published; about 60 are real, the rest are theme demos)

**Main pages:** `/` (home), `/about/`, `/contact/`, `/faqs/`, `/packages/`, `/services/`, `/renewals/`,
`/id-requirements/`, `/thankyou/`, `/web-design-and-marketing/`, `/business-website/`.

**Legal:** `/terms-conditions/`, `/privacy-policy/`, `/gdpr-privacy-policy/`, `/cookies-policy/`,
`/refund-and-cancellation-policy/`.

**Service pages** (each has a sales page and a `…-details` page with its order form):
apostilled documents, business mail forwarding address, certification of good standing, company dissolution,
company name change, company secretary, confirmation statement, directors appointment or resignation, directors
service address, dormant company accounts, registered office address, VAT registration, KYC identity verification
(`/kyc-identity-verification/`, `/kyc-service-details/`, `/companies-house-id-verification/`), company formation
(`/company-formation/`).

**Company formation packages:** `/digital-package-…`, `/professional-package-…`, `/all-inclusive-package-…`
(each a name search page and a company registration page).

**Business bank pages** (sales + details): Countingup, Ifast, Monzo, Tide, Transwap, Wise, Zempler, and
`/business-bank-accounts/`.

**Accounts:** `/login/`, `/register/`, `/my-account/`, `/client-panel/` (WooCommerce "my account"), `/cart-2/`,
`/checkout-2/`, `/lost-password/`, `/password-reset/`, `/logout/`. In Next.js these become the CRM client portal
(portal.brixenconsultants.com) and a checkout that creates the order in the CRM.

**Theme demos and leftovers (not to rebuild):** `/blog*`, `/portfolio*`, `/shop/`, `/cart/`, `/checkout/`,
`/wishlist/`, `/login-2/`, `/login-3/`, `/my-account-2/`, `/registration/`, `/user/`, `/customer-area/*`, and the
"Menu Onepage…" / "Menu Landing" menus.

## Menu (real one: "Main Brixen")

Home · Packages (mega menu) · Services (mega menu: Company / Business / Address / Banking services) ·
Id Verification · Web Design & Marketing · Contact. Mobile adds Login, Register, My account.

## Services sold (WooCommerce products, 35)

| Price | Service | URL |
|---|---|---|
| £170 / £299.99 / £449.99 | Digital / Professional / All Inclusive package | `/product/digital-package/`, `/product/professional-package/`, `/product/all-inclusive/` |
| £39.99 | Same Day Incorporation | `/product/same-day-incorporation/` |
| £69.99 | Registered Office Address | `/product/registered-office-address/` |
| £98.99 | Business Mail Forwarding Address | `/product/business-mail-forwarding-address/` |
| £29.99 | Directors Service Address | `/product/directors-service-address-1/` |
| £100 | Confirmation Statement | `/product/confirmation-statement-service/` |
| £99.99 | Dormant company accounts | `/product/dormant-company-accounts-service/` |
| £65 | Accountancy Services | `/product/accountancy-services/` |
| £149.99 | Company Secretary | `/product/company-secretary-service/` |
| £89.99 | Company name change / Company dissolution | `/product/company-name-change-service/`, `/product/company-dissolution-service/` |
| £49.99 | Directors Appointment or Resignation | `/product/directors-appointment-or-resignation/` |
| £79.99 | Certification of Good Standing | `/product/certification-of-good-standing-service/` |
| £99.99 | Apostilled Documents | `/product/apostilled-documents-service/` (+ a `-2` copy) |
| £249.99 | VAT Registration | `/product/vat-registration/` (+ a `-2` copy) |
| £20 / £29.99 | Identity Verification / KYC Verification | `/product/identity-verification/`, `/product/kyc-verification/` |
| £199.99 / £29.99 / £29.99 | Business Email and Website / Telephone / Company Seal | … |
| £0–£199.99 | Bank accounts: Countingup, Ifast, Monzo, TapTap, Tide, Transwap, Wise, Zempler | `/product/<bank>-business-bank/` |
| £0 | Xero 100% off for 6 months | `/product/xero-100-off-for-6-months/` |

Prices here are from the database dump; the CRM's own services catalogue should be the one source in Next.js.

## What the custom plugins do (to rebuild in Next.js against the CRM)

| Plugin | What it does | In Next.js |
|---|---|---|
| `brixen-crm-sync` | Sends registrations and WooCommerce orders to the CRM; SSO to the portal; documents | Orders and signups go straight to the CRM API; no sync needed |
| `brixen-company-formation` | Company formation details form (Digital / Professional / All Inclusive) with UK address lookup (`/api/public/address/find`) | A formation order form on the CRM API |
| `all-products-forms`, `registered-office-address-service`, the per-service plugins | Order forms for each service | One order form per service, from the CRM's service forms |
| `multi-company-checker`, `company-checker-default` | Company name availability (Companies House) | A name check on the CRM's Companies House lookup |
| `company-details-for-woocommerce`, `customer-message-portal-fixed` | Company details and messages for customers | Already in the CRM client portal |
| `brixen-keep-wp-login` | Sends guest log-in links to the CRM portal | Links point to the portal |
| Contact Form 7 (8 forms, 2 in use) | Contact and "get in touch" | A contact form that creates a CRM enquiry |

**Why the WordPress ↔ CRM link fails today:** `brixen-crm-sync` calls `/api/v1/wordpress/sync-users`,
`/sync-orders` and `/sync-products`, which the new modular backend does not have (see `docs/PARITY.md`, section 3).
The webhook, SSO and documents routes do exist.

## Plan

1. Agree this list with the user (which pages to keep, which services to sell online).
2. Next.js app in `website/` (this repo, `master`), its own Coolify app; Brixen colours, logo, Inter/Nunito.
3. Pages one by one, each shown to the user; same URLs as today; `/home-2/` and dropped pages redirected.
4. Order forms, checkout (Stripe) and signups straight into the CRM API; portal login links.
5. SEO: one H1 and a description per page, sitemap, structured data, Open Graph.
6. Test address first; WordPress keeps running until the user switches brixenconsultants.com over.
