/** The home page's content, as on the WordPress home page (brixenconsultants.com, read on 2026-11-14). */

export const MARQUEE = [
  "Virtual Numbers",
  "Registered Agent Services",
  "Business Bank Accounts",
  "Tide Bank Accounts",
  "Wise Bank Accounts",
  "Shared Offices",
  "Virtual Offices",
  "Company Incorporation",
  "Mail Handling & Forwarding Services",
  "24/7 Call Answering",
]

export const BANKS = [
  ["Ifast", "/home/ifast.webp", "/ifast-business-bank/"],
  ["Zempler", "/home/zampler.webp", "/zempler-business-bank/"],
  ["CountingUp", "/home/counting.webp", "/countingup-business-bank/"],
  ["Tide", "/home/tide.webp", "/tide-business-bank/"],
  ["Monzo", "/home/monzo.webp", "/monzo-business-bank/"],
  ["Transwap", "/home/transwap.webp", "/transwap-business-bank/"],
  ["Wise", "/home/wise.webp", "/wise-business-bank/"],
]

export const SERVICES = [
  {
    title: "Identity Verification (KYC)",
    price: "£50",
    priceNote: "per director",
    text: "Keep your business active and compliant with our easy KYC services.",
    points: ["Complete compliance support", "Hassle-free process", "24hrs processing time", "ICO certified"],
    href: "/kyc-identity-verification/",
  },
  {
    title: "UK Company Formation",
    price: "From £60",
    text: "Complete LTD company registration with Companies House.",
    points: ["Certificate of Incorporation", "Memorandum & Articles", "Share Certificates", "Statutory Books"],
    href: "/company-formation/",
    popular: true,
  },
  {
    title: "UK Registered Address",
    price: "From £70",
    priceNote: "/year",
    text: "Professional London business address for your company.",
    points: ["UK mainland", "Mail forwarding", "Physical address", "Can be used as a warehouse"],
    href: "/registered-office-address/",
  },
  {
    title: "Business Bank Accounts",
    price: "From £100",
    text: "Connect with leading UK business banks like Tide, Wise and our partner Transwap.",
    points: ["Tide Business Bank", "PayPal & Stripe Business", "Transwap", "Wise multi-currency"],
    href: "/business-bank-accounts/",
  },
  {
    title: "Business Website",
    price: "From £200",
    text: "Get a professional website that helps your business grow online.",
    points: ["Professional online presence", "Custom business websites", "Digital brand identity", "Website design solutions"],
    href: "/business-website/",
  },
  {
    title: "VAT Registration",
    price: "From £250",
    text: "Register your business for VAT quickly and easily with our expert help.",
    points: ["Expert guidance and support", "Fast VAT registration", "Simple online process", "HMRC compliance"],
    href: "/vat-registration/",
  },
]

// The three formation packages, as on the WordPress /packages/ page (true = included)
const COMMON = [
  "LTD Company",
  "Online formation within 24-48 hrs.",
  "Digital Certificate of Incorporation",
  "Digital Share Certificate(s)",
  "Digital Articles of Association",
  "Online Company Manager",
  "£100 Companies House fee paid by us",
  "KYC Verification",
].map((f) => [f, true])

export const PACKAGES = [
  {
    name: "Digital",
    price: "£170",
    text: "Cheap and cheerful: just the basics to get you up and running.",
    features: [
      ...COMMON,
      ["Registered office address", true],
      ["Directors office address", true],
      ["TapTap Business Bank Account (free)", true],
      ["Tide Business Bank Account (£50 at checkout)", false],
      [".co.uk or .com domain name", false],
      ["Web Filing Account Activation", false],
      ["HMRC UTR Number", false],
      ["Logo Design", false],
      ["Website Design", false],
    ],
    href: "/digital-package-name-search/",
    slug: "digital",
    next: "/digital-package-company-registration/",
    button: "Continue with Digital Package",
  },
  {
    name: "Professional",
    price: "£300",
    text: "Protect your privacy and professional image with our address services.",
    features: [
      ...COMMON,
      ["Tide Business Bank Account", true],
      ["Registered office address", true],
      ["Directors office address", true],
      ["HMRC UTR Number", true],
      [".co.uk or .com domain name", false],
      ["Web Filing Account Activation", false],
      ["Logo Design", false],
      ["Website Design", false],
    ],
    href: "/professional-package-name-search/",
    slug: "professional",
    next: "/professional-package-company-registration/",
    button: "Continue with Pro Package",
    popular: true,
  },
  {
    name: "All Inclusive",
    price: "£450",
    text: "For entrepreneurs who want to focus on growth.",
    features: [
      ...COMMON,
      ["Tide Business Bank Account", true],
      ["PayPal & Stripe Business Account", true],
      ["Registered office address", true],
      ["Directors office address", true],
      [".co.uk or .com domain name", true],
      ["Web Filing Account Activation", true],
      ["HMRC UTR Number", true],
      ["Logo Design", true],
      ["Website Design", true],
    ],
    href: "/all-inclusive-name-search/",
    slug: "all-inclusive",
    next: "/all-inclusive-package-company-registration/",
    button: "Continue with Inclusive Package",
  },
]

export const REVIEWS = [
  ["cartwave LTD", "Google", "I'm really impressed with Brixen Consultant's service! I verified my Ltd company through them, and the whole process was completed within just one hour. Their team was professional, responsive, and made everything so simple and smooth."],
  ["Hussain Ali Khan", "Facebook", "I tried many times to make a Tide business account but couldn't trust anyone. Then I found Brixen, and within just 2–3 days, they got my Tide account approved on my LTD. Super fast, trusted, and professional service."],
  ["Abdulrehman", "Google", "Brixen Consultants provided excellent support and clear advice throughout the process. Their professional approach and deep understanding of business banking made everything smooth and straightforward."],
  ["XAin Ul Abideen", "Facebook", "I have been using the services of Brixen Consultants for almost 3 years now, and I am extremely satisfied. They handle every issue quickly and professionally, and have truly made my business journey stress free."],
  ["Penta Global Limited", "Google", "Glad to share the best support experience getting guidance from Brixen Consultants to set up a Tide account and fix all Companies House related queries."],
  ["Ameen Ullah Kandhro", "Facebook", "Excellent service from Brixen Consultants: professional, insightful, and results-driven. Highly recommended!"],
]

export const STATS = [
  ["700+", "Clients served to date"],
  ["3+", "Years of Brixen Consultants"],
  ["8+", "Countries our clients come from"],
  ["24 hrs", "Average application processing time"],
]

export const FAQS = [
  ["What services does Brixen offer?", "We specialise in UK company formation (LTD) and setting up business bank accounts with Stripe, Wise, Payoneer, Monzo, Zempler, Transwap, Ifast, Countingup and Tide."],
  ["Can I open a UK company if I'm not a resident?", "Yes, we help non-residents register LTDs in the UK, including all required legal documents and compliance."],
  ["Do you provide UTR numbers for my business?", "Yes, we assist with obtaining a UTR for UK businesses as part of our formation packages."],
  ["How long does it take to form a company?", "UK LTDs can be registered within 1 day, depending on government processing times."],
  ["Which bank accounts can you help open?", "We help open business accounts with Stripe, Wise, Monzo, Payoneer, Zempler, Transwap, Ifast, Countingup and Tide, based on your company type and location."],
  ["Do I need a physical address to open a company?", "No, we offer virtual office and registered agent services so you can register your business remotely."],
  ["Can I get a business bank account without visiting the UK?", "Yes, we help you open accounts that support remote onboarding and do not require in-person visits."],
  ["Is Stripe available for international clients?", "Yes, with a UK company and the right setup, Stripe can be used by international clients to receive payments."],
  ["Do you offer support after company formation?", "Absolutely! We offer post-formation support including compliance, tax ID help, virtual address services, and annual filing reminders."],
  ["How do I get started with Brixen?", "Simply contact us through our website or WhatsApp, and we'll guide you through the onboarding and document submission process."],
]
