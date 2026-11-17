
// WordPress pages that are not rebuilt: theme demos and old account pages. Each sends visitors (and Google) to the
// right place with a permanent redirect, so old links keep working.
const DEMO_PAGES = [
  "/blog/", "/blog-grid/", "/blog-grid-2-columns/", "/blog-grid-4-columns-full-width/", "/blog-carousel/",
  "/portfolio-grid/", "/portfolio-grid-2-columns/", "/portfolio-grid-3-columns/", "/portfolio-carousel/",
  "/wishlist/", "/shop/",
]
// WordPress account pages -> My Account on this site (/my-account/ itself is a page now)
const ACCOUNT_PAGES = [
  "/login/", "/login-2/", "/login-3/", "/register/", "/registration/", "/my-account-2/", "/client-panel/", "/user/",
  "/logout/", "/customer-area/",
]
// WooCommerce My Account sections -> the same tab
const ACCOUNT_TABS = {
  "orders": "orders", "view-order": "orders", "downloads": "files", "customer-messages": "files",
  "edit-account": "account", "edit-address": "account", "payment-methods": "invoices",
}

// WooCommerce product pages (/product/<slug>/) -> the page that sells it now. Products with no page of their own
// (add-ons and offers) go to the services list.
const PRODUCTS = {
  "digital-package": "/digital-package-name-search/",
  "professional-package": "/professional-package-name-search/",
  "all-inclusive": "/all-inclusive-name-search/",
  "digital-package-2": "/packages/",
  "same-day-incorporation": "/packages/",
  "identity-verification": "/companies-house-id-verification/",
  "kyc-verification": "/kyc-identity-verification/",
  "confirmation-statement-service": "/confirmation-statement-service/",
  "company-dissolution-service": "/company-dissolution-2/",
  "company-name-change-service": "/company-name-change-service/",
  "dormant-company-accounts-service": "/dormant-company-accounts-service/",
  "directors-appointment-or-resignation": "/directors-appointment-or-resignation/",
  "company-secretary-service": "/company-secretary-services/",
  "certification-of-good-standing-service": "/certification-of-good-standing/",
  "apostilled-documents-service": "/apostilled-documents-service/",
  "apostilled-documents-service-2": "/apostilled-documents-service/",
  "business-website": "/business-website/",
  "business-email-and-website": "/business-website/",
  "vat-registration": "/vat-registration/",
  "vat-registration-2": "/vat-registration/",
  "registered-office-address": "/registered-office-address-service/",
  "business-mail-forwarding-address": "/business-mail-forwarding-address/",
  "directors-service-address-1": "/directors-services-address/",
  "tide-business-bank": "/tide-business-bank/",
  "zempler-business-bank": "/zempler-business-bank/",
  "wise-business-bank": "/wise-business-bank/",
  "countingup-business-bank": "/countingup-business-bank/",
  "ifast-business-bank": "/ifast-business-bank/",
  "monzo-business-bank": "/monzo-business-bank/",
  "transwap-business-bank": "/transwap-business-bank/",
  "taptap-business-bank": "/business-bank-accounts/",
  "accountancy-services": "/services/",
  "business-telephone-services": "/services/",
  "company-seal": "/services/",
  "xero-100-off-for-6-months": "/services/",
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker (website/Dockerfile): a small server with only the files it needs
  output: "standalone",
  // The same addresses as WordPress (/about/, /contact/ …), ending in a slash
  trailingSlash: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      { source: "/home-2/", destination: "/", permanent: true },
      // WordPress's /privacy-policy/ was its sample page; the real policy is the GDPR one
      { source: "/privacy-policy/", destination: "/gdpr-privacy-policy/", permanent: true },
      // Empty duplicates of service pages on WordPress, and its old order thank-you page
      { source: "/dormant-company-accounts/", destination: "/dormant-company-accounts-service/", permanent: true },
      { source: "/company-secretary-service/", destination: "/company-secretary-services/", permanent: true },
      { source: "/registered-office-address/", destination: "/registered-office-address-service/", permanent: true },
      { source: "/directors-service-address/", destination: "/directors-services-address/", permanent: true },
      { source: "/thankyou/", destination: "/order-complete/", permanent: true },
      ...Object.entries(PRODUCTS).map(([slug, destination]) => ({ source: `/product/${slug}/`, destination, permanent: true })),
      // Any other product, category or tag page, and WooCommerce's own cart / checkout pages
      { source: "/product/:path*", destination: "/services/", permanent: true },
      { source: "/product-category/:path*", destination: "/services/", permanent: true },
      { source: "/product-tag/:path*", destination: "/services/", permanent: true },
      { source: "/cart-2/", destination: "/cart/", permanent: true },
      { source: "/checkout-2/:path*", destination: "/packages/", permanent: true },
      { source: "/checkout/:path*", destination: "/packages/", permanent: true },
      ...DEMO_PAGES.map((source) => ({ source, destination: "/", permanent: true })),
      ...ACCOUNT_PAGES.map((source) => ({ source, destination: "/my-account/", permanent: true })),
      { source: "/customer-area/:path*", destination: "/my-account/", permanent: true },
      { source: "/client-panel/:path*", destination: "/my-account/", permanent: true },
      { source: "/lost-password/", destination: "/my-account/lost-password/", permanent: true },
      { source: "/password-reset/", destination: "/my-account/lost-password/", permanent: true },
      { source: "/my-account/customer-logout/", destination: "/my-account/", permanent: false },
      ...Object.entries(ACCOUNT_TABS).map(([wp, tab]) => ({
        source: `/my-account/${wp}/:path*`, destination: `/my-account/?tab=${tab}`, permanent: true,
      })),
    ]
  },
}

export default nextConfig
