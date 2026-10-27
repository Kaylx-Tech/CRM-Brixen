import { Link } from "react-router-dom"
import LegalLayout, { Mail } from "./LegalLayout"

const A = "font-medium text-[#5f5cff] underline-offset-4 hover:underline"

const SECTIONS = [
  {
    id: "about",
    title: "About these terms",
    body: [
      "These terms are the agreement between Finstap (\"we\", \"us\") and the business that creates or uses a Finstap workspace (\"you\"). By creating a workspace or using Finstap you accept them.",
      "Finstap is for business use only. If you accept these terms for a company or firm, you confirm that you are allowed to do so on its behalf and that you are 18 or over.",
      <>
        Our{" "}
        <Link to="/privacy" className={A}>
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link to="/security" className={A}>
          Security &amp; Compliance
        </Link>{" "}
        page also apply and form part of these terms.
      </>,
    ],
  },
  {
    id: "accounts",
    title: "Your workspace and accounts",
    body: [
      {
        list: [
          "Give accurate details when you sign up and keep them up to date.",
          "Your workspace address (yourname.finstap.com) must not copy another business's name or trade mark or mislead people. We may refuse or change an address that does.",
          "Keep passwords and login codes private. You are responsible for what happens under your workspace's accounts, so give each person their own account and remove people who leave.",
          "Tell us straight away at contact@finstap.com if you think an account has been misused.",
        ],
      },
    ],
  },
  {
    id: "trial",
    title: "Free trial",
    body: [
      "New workspaces get a 14-day free trial with no card needed. At the end of the trial you need a paid plan to keep using the workspace. If you do not choose one, we may limit or suspend the workspace; your data stays available for export as explained in section 13.",
    ],
  },
  {
    id: "fees",
    title: "Plans, fees and payment",
    body: [
      {
        list: [
          "Plans and prices are shown before you buy. Prices exclude VAT and other taxes unless stated.",
          "Paid plans renew automatically for the same period until you cancel. You can cancel at any time; the cancellation takes effect at the end of the period you have paid for.",
          "Fees already paid are not refundable, except where the law says otherwise or we end the service without a reason under these terms.",
          "We may change prices for a future period by telling you at least 30 days in advance. If you do not agree, you can cancel before the new price applies.",
          "If a payment fails, we will tell you. If it is still unpaid 14 days later, we may suspend the workspace until it is paid.",
        ],
      },
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: [
      "You must not, and must not let anyone else:",
      {
        list: [
          "use Finstap for anything unlawful, fraudulent or harmful, or to store content you have no right to hold;",
          "send spam or unlawful marketing through Finstap's email features;",
          "try to get into another workspace, account or system, or test our security without our written permission;",
          "upload viruses or harmful code, or overload, disrupt or attack the service;",
          "copy, resell or reverse engineer Finstap, or use it to build a competing product, except as the law allows;",
          "get around limits or security features, including those of the AI assistant.",
        ],
      },
    ],
  },
  {
    id: "your-data",
    title: "Your data",
    body: [
      "You own the data you and your team put into Finstap (\"Customer Data\"). You give us permission to host, copy, process and display it only as needed to provide, secure and support the service.",
      "You are the controller of personal information in your Customer Data. You are responsible for having a lawful basis to hold it, for telling your clients how you use it (your own privacy notice), and for the accuracy of what you enter.",
    ],
  },
  {
    id: "data-processing",
    title: "Data processing terms",
    body: [
      "This section is our data processing agreement under Article 28 of the UK GDPR. When we process personal information in your Customer Data we act as your processor and we will:",
      {
        list: [
          "process it only on your documented instructions, which are these terms and the way you use and set up Finstap, unless UK law requires otherwise (we will tell you if so, unless the law forbids it);",
          "make sure everyone who can access it is bound by confidentiality;",
          "keep appropriate technical and organisational security measures, described on our Security & Compliance page;",
          "only use the sub-processors listed on our Security & Compliance page, under written contracts that protect the data at least as well as these terms. We will give at least 30 days' notice of a new sub-processor; if you object on reasonable data protection grounds and we cannot resolve it, you may cancel and receive a pro-rata refund of prepaid fees;",
          "help you respond to requests from people using their data protection rights, taking into account what Finstap can do;",
          "help you with security, breach notification, data protection impact assessments and consultations with the ICO, as far as our part of the processing allows;",
          "tell you without undue delay, and aim to do so within 48 hours, after we become aware of a personal data breach affecting your Customer Data, with the information we have, so you can meet your own 72-hour reporting duty;",
          "at the end of the service, let you export your data and then delete it as set out in section 13, unless UK law requires us to keep it;",
          "give you the information you reasonably need to show that these obligations are met, and allow reasonable audits on 30 days' notice (normally by answering questionnaires and sharing documents).",
        ],
      },
      "Details of the processing: the subject matter is the provision of Finstap; it lasts for the term of these terms; the nature and purpose are hosting, storage, organisation, display, emailing and the other functions you use; the personal information can include contact details, identity details, dates of birth, addresses, company and director details, documents and financial records; and the people concerned are your users, clients, their directors, shareholders and contacts.",
      "Where Customer Data is transferred outside the UK, we will protect the transfer as UK law requires (see our Privacy Policy).",
    ],
  },
  {
    id: "third-party",
    title: "Third-party services",
    body: [
      "Some features connect to other services, such as Companies House, your website or Google's Gemini API for the AI assistant. Their own terms apply to them, and we are not responsible for their availability or for information they provide. Public records such as Companies House data may be out of date, so check anything important.",
    ],
  },
  {
    id: "ai",
    title: "AI assistant",
    body: [
      "The AI assistant is optional and only reads your workspace data. Its answers are generated automatically and can be incomplete or wrong. You are responsible for checking them before relying on them, especially for filings, deadlines or advice to clients.",
    ],
  },
  {
    id: "professional",
    title: "Your professional responsibilities",
    body: [
      "Finstap is software that helps you organise your work. It does not give legal, tax, accounting or compliance advice, and it does not file anything for you unless you do so. You remain responsible for your work for clients, your filings and deadlines, and your own legal duties, including anti-money laundering checks.",
    ],
  },
  {
    id: "availability",
    title: "Availability and changes to Finstap",
    body: [
      "We work hard to keep Finstap available and secure, but we cannot promise it will always be uninterrupted or free of errors. We may need to carry out maintenance, which we try to do at quiet times.",
      "We improve Finstap over time and may change or remove features. If we remove a major feature you pay for, we will tell you in advance and you may cancel and get a pro-rata refund of prepaid fees.",
    ],
  },
  {
    id: "ip",
    title: "Intellectual property",
    body: [
      "Finstap, its software, design and brand belong to us. You get a non-exclusive, non-transferable right to use it for your business during your subscription. If you send us feedback or ideas, we may use them freely.",
    ],
  },
  {
    id: "ending",
    title: "Suspension and ending",
    body: [
      {
        list: [
          "You can close your workspace at any time by contacting us.",
          "We may suspend or end access if you seriously or repeatedly break these terms, do not pay, or if we must do so to protect the service, other customers or comply with the law. Where reasonable we will warn you first and give you a chance to put it right.",
          "We may stop offering Finstap altogether by giving at least 60 days' notice and refunding prepaid fees for the unused period.",
          "When the service ends you can ask us for an export of your Customer Data for 30 days. After that we delete it within 90 days, except copies we must keep by law.",
        ],
      },
    ],
  },
  {
    id: "liability",
    title: "Liability",
    body: [
      "Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot be limited by law.",
      "Subject to that, we are not liable for loss of profit, revenue, business, goodwill or anticipated savings, or for any indirect or consequential loss. You are responsible for keeping your own copies of important records.",
      "Subject to the above, our total liability under or in connection with these terms in any 12-month period is limited to the fees you paid us in the 12 months before the event, or £100 if you have paid nothing.",
    ],
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: [
      "We may update these terms. For important changes we will tell workspace owners at least 30 days in advance by email or in Finstap. If you do not agree, you can cancel before they take effect; continuing to use Finstap after that means you accept them.",
    ],
  },
  {
    id: "general",
    title: "General",
    body: [
      {
        list: [
          "These terms are the whole agreement between us about Finstap.",
          "You may not transfer your rights under these terms without our written agreement. We may transfer ours to someone who takes over Finstap, who must keep these promises.",
          "If part of these terms cannot be enforced, the rest still applies.",
          "Not enforcing a right straight away does not mean we give it up.",
          "Neither of us is responsible for delays caused by events outside our reasonable control.",
          "These terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.",
        ],
      },
    ],
  },
  {
    id: "contact",
    title: "Contact",
    body: [
      <>
        Questions about these terms: <Mail />.
      </>,
    ],
  },
]

export default function Terms() {
  return (
    <LegalLayout
      title="Terms of Service"
      intro="The rules for using Finstap, what you can expect from us, and how we look after your data. Please read them before you create a workspace."
      sections={SECTIONS}
    />
  )
}
