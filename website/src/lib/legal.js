import cookies from "@/content/legal/cookies-policy.json"
import privacy from "@/content/legal/gdpr-privacy-policy.json"
import refund from "@/content/legal/refund-and-cancellation-policy.json"
import terms from "@/content/legal/terms-conditions.json"

/** The legal pages, with their text copied from the WordPress site (src/content/legal). */
export const LEGAL = {
  "terms-conditions": {
    path: "/terms-conditions/",
    title: "Terms &",
    highlight: "Conditions",
    pageTitle: "Terms & Conditions",
    description: "The terms and conditions for using the Brixen Consultants website and our company formation and business services.",
    blocks: terms,
  },
  "gdpr-privacy-policy": {
    path: "/gdpr-privacy-policy/",
    title: "GDPR",
    highlight: "Privacy Policy",
    pageTitle: "GDPR Privacy Policy",
    description: "How Brixen Consultants Ltd collects, uses, stores and protects your personal data under the UK GDPR.",
    blocks: privacy,
  },
  "cookies-policy": {
    path: "/cookies-policy/",
    title: "Cookies",
    highlight: "Policy",
    pageTitle: "Cookies Policy",
    description: "Which cookies the Brixen Consultants website uses and how you can control them.",
    blocks: cookies,
  },
  "refund-and-cancellation-policy": {
    path: "/refund-and-cancellation-policy/",
    title: "Refund &",
    highlight: "Cancellation",
    pageTitle: "Refund and Cancellation Policy",
    description: "When and how Brixen Consultants refunds or cancels orders for company formation and business services.",
    blocks: refund,
  },
}

export function legalMetadata(slug) {
  const page = LEGAL[slug]
  return { title: page.pageTitle, description: page.description, alternates: { canonical: page.path } }
}
