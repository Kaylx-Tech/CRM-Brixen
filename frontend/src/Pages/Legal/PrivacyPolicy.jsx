import { Link } from "react-router-dom"
import LegalLayout, { Mail } from "./LegalLayout"

const A = "font-medium text-[#5f5cff] underline-offset-4 hover:underline"

const SECTIONS = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: [
      "Finstap is an online CRM for accounting practices, company formation agents and corporate service providers, available at finstap.com and at each customer's own address (for example yourcompany.finstap.com). In this policy \"Finstap\", \"we\", \"us\" and \"our\" mean the operator of Finstap.",
      <>
        For anything about this policy or your personal information, email us at <Mail />. We aim to reply within 5
        working days and to complete requests about your rights within one month.
      </>,
    ],
  },
  {
    id: "two-roles",
    title: "Our two roles",
    body: [
      "Data protection law gives us a different role depending on whose information it is:",
      {
        list: [
          "Controller: for information about the people who sign up for and use Finstap (account holders and their team members) and visitors to finstap.com. This policy explains how we handle that information.",
          "Processor: for the information our customers store in their workspaces, such as their own clients, company directors, orders, invoices and documents. The customer (the company that owns the workspace) is the controller and decides why and how that information is used. We only use it to run the service for them, under our Terms of Service.",
        ],
      },
      "If you are a client of a company that uses Finstap, please read that company's privacy notice and send requests about your information to them. If you contact us instead, we will pass your request to them.",
    ],
  },
  {
    id: "what-we-collect",
    title: "Information we collect",
    body: [
      {
        head: ["Type", "What it includes", "Where it comes from"],
        rows: [
          ["Account", "Your name, work email, role, and your password (stored only as a secure hash, never in readable form).", "You, at signup, or the workspace admin who invites you."],
          ["Workspace", "Company name, Finstap address, logo and colours, plan and trial dates.", "You, at signup and in Settings."],
          ["Sign-in and security", "IP address, browser and device type, approximate location (city and country, from our network provider), sign-in times, one-time login codes (stored only as a hash), a random id for each browser you confirm, and session records.", "Your browser and our network provider when you sign in."],
          ["Activity", "Records of important actions in a workspace (for example who changed or deleted a record and when) and a log of emails the service sends.", "Your use of Finstap."],
          ["Support", "Messages you send us and our replies.", "You."],
        ],
      },
      "We do not use advertising or analytics trackers, and we do not sell personal information.",
    ],
  },
  {
    id: "why",
    title: "Why we use it and our lawful basis",
    body: [
      {
        head: ["Purpose", "Lawful basis (UK GDPR Article 6)"],
        rows: [
          ["Creating your workspace, signing you in and providing the service", "Contract: we need it to provide the service you signed up for."],
          ["Confirming your email and sending login codes to new browsers", "Contract and legitimate interests: keeping accounts safe from misuse."],
          ["Security, fraud prevention, preventing abuse of signup, and keeping activity records", "Legitimate interests: protecting you, other customers and the service."],
          ["Service emails (for example code emails, password resets, important changes)", "Contract."],
          ["Answering support requests", "Legitimate interests, or contract when it concerns your account."],
          ["Keeping records for tax, accounting or legal claims", "Legal obligation, or legitimate interests for legal claims."],
          ["Product news by email (we do not send any at the moment)", "Consent only. You could withdraw it at any time."],
        ],
      },
      "We do not make decisions about you based solely on automated processing that have legal or similarly significant effects.",
    ],
  },
  {
    id: "workspace-data",
    title: "Information our customers store",
    body: [
      "Workspaces can hold information about our customers' own clients: names, contact details, dates of birth, addresses, company and director details, identity and company documents, orders and invoices. As a processor we:",
      {
        list: [
          "use it only to provide Finstap to the workspace owner and on their documented instructions;",
          "keep each workspace in its own separate database;",
          "never use it for our own marketing, never sell it and never use it to train AI models;",
          "let only the workspace's own users see it, according to the roles the workspace admin gives them.",
        ],
      },
    ],
  },
  {
    id: "ai",
    title: "The AI assistant",
    body: [
      "Finstap includes an optional AI assistant for workspace teams. When a team member asks it a question, the question and the workspace information needed to answer it are sent to Google's Gemini API. We use Google's paid service: under Google's terms, Google does not use these prompts or answers to improve its products, and keeps them only for a limited time to detect abuse and meet legal requirements.",
      "The assistant only reads information; it does not change records. Its answers can be wrong, so please check anything important.",
    ],
  },
  {
    id: "sharing",
    title: "Who we share information with",
    body: [
      "We use a small number of trusted service providers (sub-processors) to run Finstap. Each one only gets what it needs for its job and is bound by a contract to protect it:",
      {
        head: ["Provider", "What they do", "Location"],
        rows: [
          ["Cloudflare, Inc.", "Domain and network security, and private storage of uploaded documents (Cloudflare R2).", "Global network; US company"],
          ["Our server hosting provider", "Runs the Finstap application and databases.", "See the Security & Compliance page"],
          ["Our email delivery provider", "Sends service emails such as login codes and invoices.", "See the Security & Compliance page"],
          ["Google LLC", "Gemini API for the AI assistant, only when it is used.", "US company"],
        ],
      },
      "Finstap also looks up public company information at Companies House when a workspace asks it to; this sends company names or numbers, not your account details. We may also share information if the law requires it, to protect our rights or the safety of others, or with a buyer if Finstap is ever sold (who would have to keep this policy's promises).",
      <>
        The current list of providers is on our{" "}
        <Link to="/security" className={A}>
          Security &amp; Compliance
        </Link>{" "}
        page.
      </>,
    ],
  },
  {
    id: "transfers",
    title: "Transfers outside the UK",
    body: [
      "Some of our providers are based in, or can access information from, countries outside the UK, such as the United States. When this happens we make sure the transfer is protected by one of the measures UK law allows: UK adequacy regulations (including the UK-US data bridge for organisations certified to it), or the ICO's International Data Transfer Agreement or Addendum, with a transfer risk assessment where needed.",
    ],
  },
  {
    id: "retention",
    title: "How long we keep information",
    body: [
      {
        list: [
          "Account and workspace information: for as long as the workspace is active.",
          "After a workspace is closed: you can ask for an export for 30 days; we then delete the workspace data within 90 days, except copies the law requires us to keep.",
          "Login codes: they work for 10 minutes. A confirmed browser is trusted for 24 hours. Sign-in sessions end after 30 days at the latest.",
          "Security and sign-in records: up to 12 months, unless needed longer to investigate a problem.",
          "Billing records: 6 years, as UK tax law requires.",
          "Support messages: up to 2 years after the conversation ends.",
        ],
      },
    ],
  },
  {
    id: "cookies",
    title: "Cookies and browser storage",
    body: [
      "Finstap only uses cookies and browser storage that are strictly necessary to provide the service you ask for, so no consent banner is needed:",
      {
        list: [
          "a sign-in session cookie and token, so you stay signed in;",
          "your workspace name, so the login page knows where to send you;",
          "a random browser id, so we know whether this browser was already confirmed with a login code;",
          "display preferences such as light or dark mode and hiding amounts on screen.",
        ],
      },
      "We do not use advertising, tracking or analytics cookies. If we ever add any that are not strictly necessary, we will ask first where the law requires it and update this policy.",
    ],
  },
  {
    id: "security",
    title: "How we protect information",
    body: [
      <>
        We use measures such as encrypted connections, separate databases per workspace, hashed passwords, email
        login codes on new browsers, role-based access and private document storage. Details are on our{" "}
        <Link to="/security" className={A}>
          Security &amp; Compliance
        </Link>{" "}
        page.
      </>,
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    body: [
      "Under UK data protection law you have the right to:",
      {
        list: [
          "get a copy of your personal information (access);",
          "have wrong or incomplete information corrected;",
          "have your information deleted in some cases;",
          "restrict or object to how we use it, including where we rely on legitimate interests;",
          "receive information you gave us in a reusable format (portability);",
          "withdraw consent at any time where we rely on consent.",
        ],
      },
      <>
        To use any of these rights, email <Mail />. We may need to confirm who you are first. We reply within one
        month; for complex requests this can be extended by up to two more months, and we will tell you if so.
      </>,
    ],
  },
  {
    id: "complaints",
    title: "Complaints",
    body: [
      <>
        If you are unhappy with how we handle your information, please tell us first at <Mail /> so we can put it
        right. We will acknowledge your complaint within 30 days.
      </>,
      <>
        You can also complain to the UK regulator, the Information Commissioner's Office (ICO), at{" "}
        <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer" className={A}>
          ico.org.uk/make-a-complaint
        </a>{" "}
        or on 0303 123 1113.
      </>,
    ],
  },
  {
    id: "children",
    title: "Children",
    body: ["Finstap is a business service for people aged 18 and over. We do not knowingly collect information from children."],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: [
      "We may update this policy when our service or the law changes. The date at the top shows the latest version. If a change is important, we will tell workspace owners by email or in Finstap before it takes effect.",
    ],
  },
]

export default function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro="How Finstap collects, uses and protects personal information, and the rights you have under UK data protection law (the UK GDPR, the Data Protection Act 2018 and the Privacy and Electronic Communications Regulations)."
      sections={SECTIONS}
    />
  )
}
