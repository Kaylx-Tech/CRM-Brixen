import { Link } from "react-router-dom"
import LegalLayout, { Mail } from "./LegalLayout"

const A = "font-medium text-[#5f5cff] underline-offset-4 hover:underline"

const SECTIONS = [
  {
    id: "overview",
    title: "Overview",
    body: [
      "Finstap holds sensitive business information: client identities, company records, documents and invoices. This page explains how we protect it and how Finstap meets UK data protection law.",
    ],
  },
  {
    id: "separation",
    title: "Each workspace kept apart",
    body: [
      {
        list: [
          "Every company gets its own workspace with its own separate database, not a shared table with other customers.",
          "Each workspace has its own address (yourcompany.finstap.com), and a sign-in only works for the workspace it belongs to.",
          "Uploaded documents are stored under each workspace's own folder in private storage.",
        ],
      },
    ],
  },
  {
    id: "sign-in",
    title: "Sign-in protection",
    body: [
      {
        list: [
          "Passwords are stored only as Argon2id hashes, a modern algorithm designed to resist cracking. Nobody at Finstap can see your password.",
          "Signing in from a new browser needs a 6-digit code sent by email. A code works for 10 minutes and allows 5 tries; a confirmed browser is trusted for 24 hours.",
          "Login codes are stored only as hashes, and the email shows the device, approximate location, IP address and time of the sign-in so you can spot misuse.",
          "Every new workspace owner confirms their email with a code before the workspace is created, and signups are rate limited.",
          "Sign-in sessions end after 30 days at the latest and password resets use single-use emailed links.",
        ],
      },
    ],
  },
  {
    id: "access",
    title: "Access control and records",
    body: [
      {
        list: [
          "Roles (admin, manager, staff and client portal) decide what each person can see and do. Operations staff can be kept from seeing prices and invoices altogether.",
          "Important actions, such as changes and deletions, are recorded with who did them and when.",
          "Your clients only see their own companies, orders, invoices and documents in the client portal.",
          "We do not access your workspace data except to provide support you ask for, keep the service secure, or when the law requires it.",
        ],
      },
    ],
  },
  {
    id: "encryption",
    title: "Encryption and storage",
    body: [
      {
        list: [
          "All traffic to Finstap is encrypted in transit with HTTPS (TLS).",
          "Documents are kept in a private Cloudflare R2 bucket, which encrypts stored files at rest. There are no public file links: Finstap checks the user's access before streaming each file.",
          "Invoice links in emails use long random private tokens.",
          "Finstap sits behind Cloudflare's network, which helps protect it from attacks and abuse.",
        ],
      },
    ],
  },
  {
    id: "law",
    title: "Compliance with UK data protection law",
    body: [
      "Finstap is designed for UK businesses and follows:",
      {
        list: [
          "the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018;",
          "the Privacy and Electronic Communications Regulations (PECR), as amended by the Data (Use and Access) Act 2025, for cookies and emails;",
          "guidance from the Information Commissioner's Office (ICO).",
        ],
      },
      <>
        For your clients' information you are the controller and Finstap is your processor. Our{" "}
        <Link to="/terms#data-processing" className={A}>
          data processing terms
        </Link>{" "}
        (section 7 of the Terms of Service) cover everything Article 28 of the UK GDPR requires, so you do not need a
        separate agreement. For our own account holders we are the controller, as explained in our{" "}
        <Link to="/privacy" className={A}>
          Privacy Policy
        </Link>
        .
      </>,
      "Transfers outside the UK are protected by UK adequacy regulations (including the UK-US data bridge) or the ICO's International Data Transfer Agreement or Addendum.",
    ],
  },
  {
    id: "sub-processors",
    title: "Sub-processors",
    body: [
      "These providers help us run Finstap and may process Customer Data. We will give at least 30 days' notice before adding a new one.",
      {
        head: ["Provider", "Purpose", "Data", "Transfer protection"],
        rows: [
          ["Cloudflare, Inc.", "Domain, network security, document storage (R2)", "All traffic; uploaded documents", "UK-US data bridge / IDTA"],
          ["Server hosting provider", "Runs the Finstap application and databases", "All workspace data", "To be confirmed"],
          ["Email delivery provider", "Sends login codes, invoices and other service emails", "Recipient addresses and email content", "To be confirmed"],
          ["Google LLC (Gemini API, paid)", "AI assistant, only when a team member uses it", "The question and the workspace data needed to answer it", "UK-US data bridge / Google's data processing terms"],
        ],
      },
    ],
  },
  {
    id: "incidents",
    title: "If something goes wrong",
    body: [
      {
        list: [
          "We investigate any suspected security incident straight away and act to contain it.",
          "If a personal data breach affects your Customer Data, we tell you without undue delay, aiming for within 48 hours of becoming aware, so you can meet your own 72-hour duty to report to the ICO.",
          "Where we are the controller, we report notifiable breaches to the ICO within 72 hours and tell the people affected when the risk to them is high.",
        ],
      },
    ],
  },
  {
    id: "your-part",
    title: "Your part",
    body: [
      "Security works best together. We recommend that you:",
      {
        list: [
          "use a strong, unique password for Finstap and never share accounts;",
          "give each person the lowest role they need and remove leavers on their last day;",
          "only upload documents you need, and delete those you no longer have a reason to keep;",
          "keep your own privacy notice up to date for your clients.",
        ],
      },
    ],
  },
  {
    id: "report",
    title: "Report a security issue",
    body: [
      <>
        If you think you have found a security problem in Finstap, please email <Mail /> with the details. Please do
        not access other people's data or disrupt the service while testing. We will reply quickly and keep you
        updated while we fix it.
      </>,
    ],
  },
]

export default function Security() {
  return (
    <LegalLayout
      title="Security & Compliance"
      intro="How Finstap keeps your workspace and your clients' information safe, and how we meet UK data protection law."
      sections={SECTIONS}
    />
  )
}
