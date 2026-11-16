/**
 * The service and bank pages: where each lives, its order form ("details" page) and its price.
 * Text: src/content/services/<content>.json (copied from WordPress). Order form: src/lib/service-forms.js.
 * Prices are the WooCommerce prices rounded to whole pounds, as the site shows them; the CRM charges the same
 * (backend/services/website_service_orders.py SERVICES), so change both together.
 */
export const SERVICE_PAGES = [
  // Company services
  { path: "/company-formation/", content: "company-formation", group: "company", name: "Company Formation", priceFrom: "£170", cta: ["View Packages", "/packages/"] },
  { path: "/kyc-identity-verification/", content: "kyc-identity-verification", group: "company", name: "Identity Verification (KYC)", order: "kyc-verification", details: "/kyc-service-details/", price: 30 },
  { path: "/confirmation-statement-service/", content: "confirmation-statement-service", group: "company", name: "Confirmation Statement Service", order: "confirmation-statement", details: "/confirmation-statement-service-details/", price: 100 },
  { path: "/company-dissolution-2/", content: "company-dissolution-2", group: "company", name: "Company Dissolution", order: "company-dissolution", details: "/company-dissolution-service-details/", price: 90 },
  { path: "/company-name-change-service/", content: "company-name-change-service", group: "company", name: "Company Name Change", order: "company-name-change", details: "/company-name-change-details/", price: 90 },
  { path: "/dormant-company-accounts-service/", content: "dormant-company-accounts-service", group: "company", name: "Dormant Company Accounts", order: "dormant-company-accounts", details: "/dormant-company-accounts-service-details/", price: 100 },
  { path: "/directors-appointment-or-resignation/", content: "directors-appointment-or-resignation", group: "company", name: "Directors Appointment or Resignation", order: "directors-appointment-or-resignation", details: "/directors-appointment-or-resignation-details/", price: 50 },
  { path: "/company-secretary-services/", content: "company-secretary-services", group: "company", name: "Company Secretary Service", order: "company-secretary", details: "/company-secretary-service-details/", price: 150 },
  { path: "/certification-of-good-standing/", content: "certification-of-good-standing", group: "company", name: "Certification of Good Standing", order: "certification-of-good-standing", details: "/certification-good-standing-service-details/", price: 80 },
  { path: "/apostilled-documents-service/", content: "apostilled-documents-service", group: "company", name: "Apostilled Documents Service", order: "apostilled-documents", details: "/apostilled-documents-service-details/", price: 100 },
  // On WordPress this page is the order form itself (Companies House identity verification, ACSP)
  { path: "/companies-house-id-verification/", group: "company", name: "Companies House ID Verification", order: "companies-house-id-verification", details: "/companies-house-id-verification/", price: 20, formOnly: true, intro: "Verify your identity with Companies House through Brixen Consultants, a registered Authorised Corporate Service Provider (ACSP). Fill in the form, pay, and we guide you through the checks." },
  // Business services
  { path: "/business-website/", content: "business-website", group: "business", name: "Business Website", order: "business-website", details: "/business-website-service-details/", price: 200 },
  { path: "/vat-registration/", content: "vat-registration", group: "business", name: "VAT Registration", order: "vat-registration", details: "/vat-registration-service-details/", price: 250 },
  // Address services
  { path: "/registered-office-address-service/", content: "registered-office-address-service", group: "address", name: "Registered Office Address", order: "registered-office-address", details: "/registered-office-address-details/", price: 70 },
  { path: "/business-mail-forwarding-address/", content: "business-mail-forwarding-address", group: "address", name: "Business Mail Forwarding Address", order: "business-mail-forwarding-address", details: "/business-mail-forwarding-address-details/", price: 100 },
  { path: "/directors-services-address/", content: "directors-services-address", group: "address", name: "Directors Service Address", order: "directors-service-address", details: "/directors-service-address-details/", price: 30 },
  // Banking
  { path: "/business-bank-accounts/", content: "business-bank-accounts", group: "banking", name: "Business Banking for Non-UK Residents", priceFrom: "£50", cta: ["Start with a Company", "/packages/"] },
  ...[
    ["tide", "Tide", 50],
    ["zempler", "Zempler", 100],
    ["wise", "Wise", 100],
    ["countingup", "Countingup", 200],
    ["ifast", "Ifast", 100],
    ["monzo", "Monzo", 200],
    ["transwap", "Transwap", 200],
  ].map(([slug, bank, price]) => ({
    path: `/${slug}-business-bank/`,
    content: `${slug}-business-bank`,
    group: "banking",
    name: `${bank} Business Bank`,
    order: `${slug}-business-bank`,
    details: `/${slug}-business-bank-details/`,
    price,
    icon: `/home/banks/${slug === "zempler" ? "zempler" : slug}.png`,
  })),
]

export const serviceByPath = (path) => SERVICE_PAGES.find((s) => s.path === path)
export const serviceByOrder = (key) => SERVICE_PAGES.find((s) => s.order === key)

export const GROUP_TITLES = {
  company: "Company Services",
  business: "Business Services",
  address: "Address Services",
  banking: "Banking Services",
}

export const money = (n) => `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2 })}`
