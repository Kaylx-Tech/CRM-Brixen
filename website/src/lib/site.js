/**
 * Everything the site shows about Brixen in one place: company details, the menu, the footer and the list of pages.
 * Built from the WordPress site (docs/WEBSITE-MIGRATION.md). The URLs are the same as on WordPress, so links and
 * Google results keep working when brixenconsultants.com moves here.
 */

export const SITE = {
  name: "Brixen Consultants",
  legalName: "Brixen Consultants Ltd.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://brixenconsultants.com",
  // The CRM's client portal and API (backend in this repo)
  portalUrl: process.env.NEXT_PUBLIC_PORTAL_URL || "https://portal.brixenconsultants.com",
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "https://api.brixenconsultants.com/api",
  tagline: "UK company formation and business services",
  companyNumber: "17314564",
  icoNumber: "ZB941411",
  phone: "+44 7490 359487",
  phoneHref: "tel:+447490359487",
  email: "contact@brixenconsultants.com",
  address: "57 Wellesley Road, Ilford, United Kingdom, IG1 4JZ",
  mapUrl: "https://maps.app.goo.gl/NMkEJ9NNvVWX5Sst7",
  social: [
    ["Facebook", "https://www.facebook.com/brixenconsultants/"],
    ["Instagram", "https://www.instagram.com/brixen_consultants"],
  ],
}

// ── Pages ───────────────────────────────────────────────────────────────────
// [path, title, group]. Each one is built for real step by step; until then it shows a short holding page.
// "details" pages are the order forms that sit behind each service page.
const LIST = [
  // Main
  ["/about/", "About Us", "main"],
  ["/contact/", "Contact Us", "main"],
  ["/faqs/", "FAQs", "main"],
  ["/packages/", "Company Formation Packages", "main"],
  ["/services/", "Our Services", "main"],
  ["/renewals/", "Renewals", "main"],
  ["/id-requirements/", "ID Requirements", "main"],
  ["/thankyou/", "Thank You", "main"],
  ["/web-design-and-marketing/", "Web Design and Marketing", "business"],
  // Legal
  ["/terms-conditions/", "Terms & Conditions", "legal"],
  ["/privacy-policy/", "Privacy Policy", "legal"],
  ["/gdpr-privacy-policy/", "GDPR Privacy Policy", "legal"],
  ["/cookies-policy/", "Cookies Policy", "legal"],
  ["/refund-and-cancellation-policy/", "Refund and Cancellation Policy", "legal"],
  // Company services
  ["/company-formation/", "Company Formation", "company"],
  ["/kyc-identity-verification/", "Identity Verification (KYC)", "company"],
  ["/kyc-service-details/", "KYC Service Details", "company-details"],
  ["/companies-house-id-verification/", "Companies House ID Verification", "company"],
  ["/confirmation-statement-service/", "Confirmation Statement Service", "company"],
  ["/confirmation-statement-service-details/", "Confirmation Statement Service Details", "company-details"],
  ["/company-dissolution-2/", "Company Dissolution", "company"],
  ["/company-dissolution-service-details/", "Company Dissolution Service Details", "company-details"],
  ["/company-name-change-service/", "Company Name Change", "company"],
  ["/company-name-change-details/", "Company Name Change Details", "company-details"],
  ["/dormant-company-accounts-service/", "Dormant Company Accounts", "company"],
  ["/dormant-company-accounts/", "Dormant Company Accounts", "company"],
  ["/dormant-company-accounts-service-details/", "Dormant Company Accounts Service Details", "company-details"],
  ["/directors-appointment-or-resignation/", "Directors Appointment or Resignation", "company"],
  ["/directors-appointment-or-resignation-details/", "Directors Appointment or Resignation Details", "company-details"],
  ["/company-secretary-services/", "Company Secretary Services", "company"],
  ["/company-secretary-service/", "Company Secretary Service", "company"],
  ["/company-secretary-service-details/", "Company Secretary Service Details", "company-details"],
  ["/certification-of-good-standing/", "Certification of Good Standing", "company"],
  ["/certification-good-standing-service-details/", "Certification of Good Standing Details", "company-details"],
  ["/apostilled-documents-service/", "Apostilled Documents Service", "company"],
  ["/apostilled-documents-service-details/", "Apostilled Documents Service Details", "company-details"],
  // Business services
  ["/business-website/", "Business Website", "business"],
  ["/business-website-service-details/", "Business Website Service Details", "business-details"],
  ["/vat-registration/", "VAT Registration", "business"],
  ["/vat-registration-service-details/", "VAT Registration Service Details", "business-details"],
  // Address services
  ["/registered-office-address-service/", "Registered Office Address Service", "address"],
  ["/registered-office-address/", "Registered Office Address", "address"],
  ["/registered-office-address-details/", "Registered Office Address Details", "address-details"],
  ["/business-mail-forwarding-address/", "Business Mail Forwarding Address", "address"],
  ["/business-mail-forwarding-address-details/", "Business Mail Forwarding Address Details", "address-details"],
  ["/directors-services-address/", "Directors Service Address", "address"],
  ["/directors-service-address/", "Directors Service Address", "address"],
  ["/directors-service-address-details/", "Directors Service Address Details", "address-details"],
  // Packages
  ["/digital-package-name-search/", "Digital Package: Name Search", "packages"],
  ["/digital-package-company-registration/", "Digital Package: Company Registration", "packages"],
  ["/professional-package-name-search/", "Professional Package: Name Search", "packages"],
  ["/professional-package-company-registration/", "Professional Package: Company Registration", "packages"],
  ["/all-inclusive-name-search/", "All Inclusive Package: Name Search", "packages"],
  ["/all-inclusive-package-company-registration/", "All Inclusive Package: Company Registration", "packages"],
  // Banking
  ["/business-bank-accounts/", "Business Banking for Non-UK Residents", "banking"],
  ...["Tide", "Zempler", "Wise", "Countingup", "Ifast", "Monzo", "Transwap"].flatMap((bank) => [
    [`/${bank.toLowerCase()}-business-bank/`, `${bank} Business Bank Account`, "banking"],
    [`/${bank.toLowerCase()}-business-bank-details/`, `${bank} Business Bank Details`, "banking-details"],
  ]),
]

export const PAGES = LIST.map(([path, title, group]) => ({
  path,
  title,
  group,
  // Order forms are reached from their service page; they are not offered to search engines on their own
  index: !group.endsWith("-details") && path !== "/thankyou/",
}))

export const pageByPath = (path) => PAGES.find((p) => p.path === path)

// ── Menu ────────────────────────────────────────────────────────────────────
export const TOP_LINKS = [
  ["About Us", "/about/"],
  ["FAQ", "/faqs/"],
  ["My Account", `${SITE.portalUrl}/`],
]

export const NAV = [
  { label: "Home", href: "/" },
  {
    label: "Packages",
    href: "/packages/",
    items: [
      ["Digital Package", "/digital-package-name-search/"],
      ["Professional Package", "/professional-package-name-search/"],
      ["All Inclusive Package", "/all-inclusive-name-search/"],
    ],
  },
  {
    label: "Services",
    href: "/services/",
    groups: [
      {
        title: "Company Services",
        items: [
          ["Identity Verification (KYC)", "/kyc-identity-verification/"],
          ["Confirmation Statement Service", "/confirmation-statement-service/"],
          ["Company Dissolution", "/company-dissolution-2/"],
          ["Company Formation", "/company-formation/"],
          ["Company Name Change", "/company-name-change-service/"],
          ["Dormant Company Accounts", "/dormant-company-accounts-service/"],
          ["Directors Appointment or Resignation", "/directors-appointment-or-resignation/"],
        ],
      },
      {
        title: "Business Services",
        items: [
          ["Business Website", "/business-website/"],
          ["VAT Registration", "/vat-registration/"],
        ],
      },
      {
        title: "Address Services",
        items: [["Registered Office Address Service", "/registered-office-address-service/"]],
      },
      {
        title: "Banking Services",
        items: [
          ["Business Banking for Non-UK Residents", "/business-bank-accounts/"],
          ["Tide Business Account", "/tide-business-bank/"],
          ["Zempler Business Account", "/zempler-business-bank/"],
          ["Wise Business Account", "/wise-business-bank/"],
          ["CountingUp Business Account", "/countingup-business-bank/"],
          ["Ifast Business Account", "/ifast-business-bank/"],
          ["Monzo Business Account", "/monzo-business-bank/"],
          ["Transwap Business Account", "/transwap-business-bank/"],
        ],
      },
    ],
  },
  { label: "Id Verification", href: "/companies-house-id-verification/" },
  { label: "Web Design & Marketing", href: "/web-design-and-marketing/" },
  { label: "Contact", href: "/contact/" },
]

// ── Footer ──────────────────────────────────────────────────────────────────
export const FOOTER = [
  {
    title: "Company Services",
    items: [
      ["Identity Verification (KYC)", "/kyc-identity-verification/"],
      ["Confirmation Statement Service", "/confirmation-statement-service/"],
      ["Company Dissolution", "/company-dissolution-2/"],
      ["Company Name Change", "/company-name-change-service/"],
      ["Director's Appointment or Resignation", "/directors-appointment-or-resignation/"],
      ["Company Formation", "/company-formation/"],
      ["Dormant Company Accounts", "/dormant-company-accounts-service/"],
    ],
  },
  {
    title: "Business & Address",
    items: [
      ["Business Website", "/business-website/"],
      ["VAT Registration", "/vat-registration/"],
      ["Registered Office Address", "/registered-office-address-service/"],
    ],
  },
  {
    title: "Packages",
    items: [
      ["Digital Package", "/digital-package-company-registration/"],
      ["Professional Package", "/professional-package-company-registration/"],
      ["All Inclusive Package", "/all-inclusive-package-company-registration/"],
    ],
  },
  {
    title: "Banking Services",
    items: [
      ["Tide Business Bank", "/tide-business-bank/"],
      ["Zempler Business Bank", "/zempler-business-bank/"],
      ["Wise Business Bank", "/wise-business-bank/"],
      ["Countingup Business Bank", "/countingup-business-bank/"],
      ["Ifast Business Bank", "/ifast-business-bank/"],
      ["Monzo Business Bank", "/monzo-business-bank/"],
      ["Transwap Business Bank", "/transwap-business-bank/"],
    ],
  },
  {
    title: "Legal Details",
    items: [
      ["Refund and Cancellation Policy", "/refund-and-cancellation-policy/"],
      ["Terms & Conditions", "/terms-conditions/"],
      ["Cookies Policy", "/cookies-policy/"],
      ["ID Requirements", "/id-requirements/"],
      ["GDPR Privacy Policy", "/gdpr-privacy-policy/"],
    ],
  },
]
