import { useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { cn } from "cn"
import {
  IconArrowRight,
  IconBell,
  IconBrandGoogleDrive,
  IconBrandStripe,
  IconBuildingBank,
  IconCalendarDue,
  IconChartBar,
  IconCheck,
  IconCircleCheckFilled,
  IconCrown,
  IconDeviceLaptop,
  IconFileCertificate,
  IconFileText,
  IconId,
  IconLock,
  IconMapPin,
  IconMenu2,
  IconMinus,
  IconPalette,
  IconPlus,
  IconReceipt2,
  IconSearch,
  IconShieldLock,
  IconSparkles,
  IconTable,
  IconUsers,
  IconUsersGroup,
  IconWorld,
  IconX,
} from "@tabler/icons-react"
import finstapLogo from "@/assets/finstap-logo.svg"
import finstapMark from "@/assets/finstap-mark.svg"
import dashboardShot from "@/assets/finstap-dashboard.png"
import { LegalLinks } from "@/Pages/Legal/LegalLayout"
import FinstapPricing from "@/Pages/FinstapPricing"
import { NewsletterSignup } from "@/Pages/Blog/Blog"

// Finstap brand: blue → violet from the logo. The landing page is always light.
const GRADIENT = "bg-linear-to-r from-[#297bff] to-[#834aff]"
const GRADIENT_TEXT =
  "bg-linear-to-r from-[#297bff] via-[#5f5cff] to-[#834aff] bg-clip-text text-transparent"
const CTA = cn(
  GRADIENT,
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_30px_-10px_rgba(101,89,255,0.7)] transition hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_16px_36px_-12px_rgba(101,89,255,0.8)]",
)
const GHOST =
  "inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-800 shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:text-[#5f5cff]"
// The white card used across the page: no border or edge, 20px corners and a very soft shadow
const CARD = "rounded-[20px] bg-white shadow-[0_1px_20px_rgba(0,0,0,0.04)]"
// Headings: medium weight, tight letter spacing, near black; body text medium grey
const H2 = "text-[34px] font-medium leading-[1.2] tracking-[-0.05em] text-[#121212] sm:text-[48px]"
const BODY = "text-base font-medium leading-[1.4] tracking-[-0.02em] text-[#575757]/80"

const NAV = [
  ["Features", "#features"],
  ["Services", "#services"],
  ["How it works", "#how"],
  ["Pricing", "#pricing"],
  ["FAQ", "#faq"],
  ["Blog", "/blog"],
]

// The four headline features, each shown with a small picture of the real screen
const BENTO = [
  {
    key: "clients",
    title: "Clients & companies in one place",
    text: "Every client, director and company together, with their orders, invoices and documents.",
  },
  {
    key: "ch",
    title: "Companies House, built in",
    text: "Type a company number and the details, officers and filing dates fill themselves in.",
  },
  {
    key: "invoices",
    title: "Orders & invoices",
    text: "Take orders through your own forms, send invoices and see what is paid at a glance.",
  },
  {
    key: "deadlines",
    title: "Deadlines you won't miss",
    text: "GOV forms, tasks and filing dates your team can work through, in order.",
  },
]

const BENEFITS = [
  [IconFileText, "Documents", "Store and share client documents securely, organised by client and company."],
  [IconChartBar, "Finance & revenue", "Revenue over time, balance sheet and expenses, ready when you need them."],
  [IconUsersGroup, "Team & roles", "Admins, managers and staff each see only what their role needs, prices included."],
  [IconPalette, "Your brand", "Your logo, your colours and your own address: yourcompany.finstap.com."],
  [IconDeviceLaptop, "Client portal", "Clients see their companies, orders, invoices and documents in one place."],
  [IconShieldLock, "Secure by design", "Your own database, and a login code by email on every new browser."],
]

// The company services a formation agent sells, each with what Finstap actually does for it
const SERVICES = [
  [
    IconId,
    "Director ID verification, tracked",
    "Companies House now needs every director to verify their identity. Keep it under control for all your clients.",
    [
      "Take ID verification orders through your own forms",
      "Store each director's 11-digit Companies House personal code",
      "See who is verified, in progress or needs attention",
    ],
  ],
  [
    IconFileCertificate,
    "Company accounts in one flow",
    "From bank statement to filed accounts without leaving Finstap.",
    [
      "Build micro-entity or dormant accounts from a bank statement",
      "Filing deadline and Corporation Tax estimate worked out for you",
      "File with Companies House, or download for GOV.UK",
    ],
  ],
  [
    IconMapPin,
    "Your own registered office service",
    "Sell registered office and mail forwarding addresses under your own name.",
    [
      "Add registered office and mail forwarding to your price list",
      "Take each client's details through your own order form",
      "Clients see their address services in their own portal",
    ],
  ],
  [
    IconDeviceLaptop,
    "A portal for your clients",
    "Give clients one place to see their work, at your own address and in your colours.",
    [
      "Companies, orders, invoices and documents in one view",
      "Clients upload documents and message your team",
      "Invoice emails open the invoice through a private link",
    ],
  ],
]

const STEPS = [
  ["Create your workspace", "Confirm your email, name your company and pick your Finstap address.", "workspace"],
  ["Bring in your team", "Invite colleagues and give each one the right role.", "team"],
  ["Run your practice", "Clients, orders, invoices and deadlines in one calm dashboard.", "run"],
]

// Services Finstap works with (it uses them; no partnership is implied)
const WORKS_WITH = [
  [IconBuildingBank, "Companies House"],
  [IconWorld, "GOV.UK"],
  [IconBrandStripe, "Stripe"],
  [IconBrandGoogleDrive, "Google Drive"],
]

const COMPARE = [
  "Clients, companies and orders in one place",
  "Company details straight from Companies House",
  "Deadlines and GOV forms tracked for the whole team",
  "Invoices with a clear paid / due view",
  "A branded portal for your clients",
  "Each role sees only what it needs",
]

const FAQ = [
  ["Is there a free trial?", "Yes. Every new workspace starts with a 14-day free trial, no card needed to begin."],
  [
    "Who is Finstap for?",
    "Accounting practices, company formation agents and corporate service providers who manage many clients and companies.",
  ],
  ["Is my data kept separate?", "Yes. Each company gets its own workspace and its own database, reached at its own address."],
  ["Can my team use it?", "Yes. Invite your team and choose a role for each person: admin, manager or staff."],
  ["Can my clients log in?", "Yes. Clients get their own portal at your address, in your colours, to see their companies, orders and invoices."],
]

function FadeUp({ children, delay = 0, className }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** A small pill above each section's heading. */
function Eyebrow({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#5f5cff]/[0.07] px-3 py-1 text-xs font-semibold text-[#5f5cff] ring-1 ring-[#5f5cff]/15">
      {children}
    </span>
  )
}

function SectionHead({ eyebrow, title, text, className }) {
  return (
    <FadeUp className={cn("mx-auto max-w-2xl text-center", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className={cn("mt-4", H2)}>{title}</h2>
      {text && <p className={cn("mx-auto mt-4 max-w-xl", BODY)}>{text}</p>}
    </FadeUp>
  )
}

function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 bg-[#fcfcfc]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center">
          <img src={finstapLogo} alt="Finstap" className="h-7 w-auto" />
        </a>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-3.5 py-2 text-[15px] font-medium tracking-[-0.02em] text-[#575757] transition hover:text-[#121212]"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link to="/login" className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            Log in
          </Link>
          <Link to="/signup" className={cn(CTA, "px-5 py-2.5")}>
            Start free trial
          </Link>
        </div>
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <IconX className="size-5" /> : <IconMenu2 className="size-5" />}
        </button>
      </div>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(CARD, "mx-auto mt-2 max-w-6xl p-3 md:hidden")}
        >
          {NAV.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {label}
            </a>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link to="/login" className={GHOST}>
              Log in
            </Link>
            <Link to="/signup" className={CTA}>
              Start free trial
            </Link>
          </div>
        </motion.div>
      )}
    </header>
  )
}

/** A feature icon floating beside the hero heading (big screens), drifting gently. */
function FloatIcon({ icon: Icon, className, delay = 0, tilt = 0 }) {
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, rotate: tilt, y: [0, -10, 0] }}
      transition={{
        opacity: { duration: 0.6, delay },
        scale: { duration: 0.6, delay },
        rotate: { duration: 0.6, delay },
        y: { duration: 5, delay, repeat: Infinity, ease: "easeInOut" },
      }}
      className={cn(
        "absolute hidden size-[72px] items-center justify-center rounded-[20px] bg-white text-[#5f5cff] shadow-[0_8px_30px_rgba(0,0,0,0.08)] lg:flex",
        className,
      )}
    >
      <Icon className="size-8" stroke={1.6} />
    </motion.span>
  )
}

/** The product in a browser window under the hero: a real screenshot of a Finstap workspace's dashboard. */
function ProductShot() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto mt-16 max-w-6xl"
    >
      <span aria-hidden className="absolute -inset-x-10 -top-10 bottom-10 -z-10 rounded-[48px] bg-linear-to-b from-[#5f5cff]/15 to-transparent blur-3xl" />
      <div className="rounded-[28px] bg-white/70 p-2 shadow-[0_0_0_1px_rgba(95,92,255,0.18),0_0_40px_rgba(95,92,255,0.18),0_40px_80px_-40px_rgba(41,64,140,0.45)] backdrop-blur sm:p-3">
        <div className="overflow-hidden rounded-[20px] bg-white ring-1 ring-slate-200/70">
          {/* Window bar */}
          <div className="flex items-center gap-2 border-b border-slate-200/70 bg-white px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
            <span className="mx-auto flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-500">
              <IconLock className="size-3" /> yourcompany.finstap.com
            </span>
          </div>
          <img
            src={dashboardShot}
            alt="The Finstap dashboard: sales, revenue, customers, orders, documents and a revenue chart"
            width={1917}
            height={911}
            className="block h-auto w-full"
            fetchPriority="high"
          />
        </div>
      </div>
    </motion.div>
  )
}

/** The small picture inside each bento card. */
function BentoVisual({ kind }) {
  if (kind === "clients") {
    return (
      <div className="space-y-2">
        {[
          ["AT", "Acme Trading Ltd", "3 companies"],
          ["NW", "Northwind Logistics", "1 company"],
          ["BO", "Blue Oak Consulting", "2 companies"],
        ].map(([initials, name, sub], i) => (
          <div key={name} className={cn("flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-[0_0_0_1px_rgba(15,23,42,0.05)]", i === 0 && "ml-6")}>
            <span className={cn("flex size-8 items-center justify-center rounded-full text-[11px] font-semibold text-white", GRADIENT)}>{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-slate-800">{name}</span>
              <span className="block text-[11px] text-slate-500">{sub}</span>
            </span>
            <IconCircleCheckFilled className="size-4 text-emerald-500" />
          </div>
        ))}
      </div>
    )
  }
  if (kind === "ch") {
    return (
      <div className="rounded-2xl bg-white p-3 shadow-[0_0_0_1px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 ring-1 ring-[#5f5cff]/30">
          <IconSearch className="size-3.5 text-slate-400" /> 14839201
          <span className="ml-auto rounded-full bg-[#5f5cff]/10 px-2 py-0.5 text-[10px] font-semibold text-[#5f5cff]">Found</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          {[
            ["Company", "ACME TRADING LTD"],
            ["Status", "Active"],
            ["Accounts due", "30 Sep 2027"],
            ["Confirmation", "14 Mar 2027"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
              <dt className="text-slate-400">{k}</dt>
              <dd className="truncate font-semibold text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    )
  }
  if (kind === "invoices") {
    return (
      <div className="relative rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-800">Invoice INV-1042</span>
          <span className="text-slate-400">Acme Trading</span>
        </div>
        {[
          ["Company formation", "£79.00"],
          ["Registered office (1 year)", "£49.00"],
          ["Confirmation statement", "£45.00"],
        ].map(([item, price]) => (
          <div key={item} className="mt-2 flex justify-between text-[11px] text-slate-600">
            <span>{item}</span>
            <span className="tabular-nums">{price}</span>
          </div>
        ))}
        <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-xs font-semibold text-slate-900">
          <span>Total</span>
          <span>£173.00</span>
        </div>
        <motion.span
          initial={{ opacity: 0, scale: 1.6, rotate: -18 }}
          whileInView={{ opacity: 1, scale: 1, rotate: -12 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.3 }}
          className="absolute right-4 top-10 rounded-lg border-2 border-emerald-500 px-2 py-0.5 text-sm font-bold uppercase tracking-wider text-emerald-600"
        >
          Paid
        </motion.span>
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-white p-3 shadow-[0_0_0_1px_rgba(15,23,42,0.05)]">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
        {Array.from({ length: 21 }, (_, i) => {
          const due = [4, 9, 16].includes(i)
          return (
            <span
              key={i}
              className={cn(
                "flex aspect-square items-center justify-center rounded-lg text-[11px]",
                due ? cn(GRADIENT, "font-semibold text-white") : "bg-slate-50 text-slate-600",
              )}
            >
              {i + 1}
            </span>
          )
        })}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
        <IconCalendarDue className="size-3.5 text-[#5f5cff]" /> 3 filing dates this month
      </p>
    </div>
  )
}

/** The small picture inside each "how it works" step. */
function StepVisual({ kind }) {
  if (kind === "workspace") {
    return (
      <div className="rounded-2xl bg-white p-3 text-xs shadow-[0_0_0_1px_rgba(15,23,42,0.05)]">
        <p className="text-[11px] text-slate-400">Your Finstap address</p>
        <p className="mt-1.5 flex items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 font-medium text-slate-800 ring-1 ring-[#5f5cff]/30">
          <IconWorld className="size-3.5 text-[#5f5cff]" /> acme<span className="text-slate-400">.finstap.com</span>
        </p>
      </div>
    )
  }
  if (kind === "team") {
    return (
      <div className="space-y-1.5">
        {[
          ["Sarah", "Admin"],
          ["James", "Manager"],
          ["Aisha", "Staff"],
        ].map(([name, role]) => (
          <div key={name} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs shadow-[0_0_0_1px_rgba(15,23,42,0.05)]">
            <span className="flex items-center gap-2 font-medium text-slate-800">
              <span className={cn("flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white", GRADIENT)}>
                {name[0]}
              </span>
              {name}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{role}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-white p-3 shadow-[0_0_0_1px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-800">This month</span>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">+18%</span>
      </div>
      <div className="mt-3 flex h-16 items-end gap-1.5">
        {[40, 55, 48, 70, 62, 88].map((h, i) => (
          <span key={i} className="flex-1 rounded-md bg-linear-to-t from-[#297bff] to-[#834aff] opacity-80" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

/** Finstap's mark in the middle with the work it brings together circling around it. */
function Orbit() {
  const ring = [IconUsers, IconBuildingBank, IconReceipt2, IconId, IconFileText, IconCalendarDue, IconMapPin, IconBell]
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[380px]">
      <span aria-hidden className="absolute inset-0 rounded-full border border-dashed border-[#5f5cff]/20" />
      <span aria-hidden className="absolute inset-[18%] rounded-full border border-dashed border-[#5f5cff]/20" />
      <span aria-hidden className="absolute inset-[30%] rounded-full bg-[#5f5cff]/10 blur-2xl" />
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      >
        {ring.map((Icon, i) => {
          const angle = (i / ring.length) * Math.PI * 2
          return (
            <motion.span
              key={i}
              animate={{ rotate: -360 }}
              transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
              className="absolute flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-white text-[#5f5cff] shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_12px_24px_-12px_rgba(41,64,140,0.45)]"
              style={{ left: `${50 + 50 * Math.cos(angle)}%`, top: `${50 + 50 * Math.sin(angle)}%` }}
            >
              <Icon className="size-5" />
            </motion.span>
          )
        })}
      </motion.div>
      <div className="absolute inset-[34%] flex items-center justify-center rounded-[28px] bg-white shadow-[inset_0_1px_0_#fff,0_0_0_1px_rgba(15,23,42,0.06),0_24px_48px_-20px_rgba(95,92,255,0.55)]">
        <img src={finstapMark} alt="Finstap" className="size-1/2" />
      </div>
    </div>
  )
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn(CARD, "rounded-2xl")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="font-medium text-slate-900">{q}</span>
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
            open ? cn(GRADIENT, "text-white") : "bg-slate-100 text-slate-600",
          )}
        >
          {open ? <IconMinus className="size-4" /> : <IconPlus className="size-4" />}
        </span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="overflow-hidden"
      >
        <p className="px-5 pb-5 text-sm leading-relaxed text-slate-500">{a}</p>
      </motion.div>
    </div>
  )
}

/** Finstap's public home page on finstap.com: what it is, what it does, and the way into a free trial. */
export default function FinstapLanding() {
  return (
    <div
      id="top"
      className="min-h-screen scroll-smooth bg-[#fcfcfc] font-sans text-[#121212] antialiased [color-scheme:light]"
    >
      <Header />

      {/* Hero: the promise in the middle, feature icons floating around it, the product under it */}
      <section className="relative overflow-hidden pb-16 sm:pb-24">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-[640px] bg-[radial-gradient(50%_60%_at_50%_0%,rgba(95,92,255,0.16),transparent),radial-gradient(30%_40%_at_15%_20%,rgba(41,123,255,0.12),transparent),radial-gradient(30%_40%_at_85%_20%,rgba(131,74,255,0.12),transparent)]"
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-16 text-center sm:px-6 sm:pt-24">
          <FloatIcon icon={IconBuildingBank} className="left-[4%] top-[14%]" delay={0.3} tilt={-8} />
          <FloatIcon icon={IconReceipt2} className="left-[9%] top-[40%]" delay={0.6} tilt={6} />
          <FloatIcon icon={IconId} className="right-[4%] top-[12%]" delay={0.45} tilt={8} />
          <FloatIcon icon={IconCalendarDue} className="right-[9%] top-[38%]" delay={0.75} tilt={-6} />

          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full bg-white px-1.5 py-1 pr-3 text-xs font-medium text-slate-600 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_4px_12px_-6px_rgba(41,64,140,0.3)]"
          >
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold text-white", GRADIENT)}>New</span>
            Director ID verification, built in
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mx-auto mt-6 max-w-3xl text-[42px] font-medium leading-[1.2] tracking-[-0.05em] text-[#121212] sm:text-[56px] lg:text-[64px]"
          >
            Run your whole practice <span className={GRADIENT_TEXT}>in one calm place</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className={cn("mx-auto mt-6 max-w-xl", BODY)}
          >
            The CRM for UK accountants and company formation firms. Clients, companies, orders, invoices and
            deadlines together, so your team spends less time chasing.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"
          >
            <Link to="/signup" className={CTA}>
              Start free trial <IconArrowRight className="size-4" />
            </Link>
            <a href="#features" className={GHOST}>
              See what's inside
            </a>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500"
          >
            <IconCheck className="size-4 text-[#5f5cff]" /> 14-day free trial
            <span className="text-slate-300">·</span>
            <IconCheck className="size-4 text-[#5f5cff]" /> No card to start
          </motion.p>

          <ProductShot />
        </div>

        {/* Works with */}
        <div className="mx-auto mt-14 max-w-4xl px-4 text-center sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Works with</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {WORKS_WITH.map(([Icon, name]) => (
              <span key={name} className="flex items-center gap-2 text-base font-semibold text-slate-400">
                <Icon className="size-5" /> {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features as a bento grid, each with a picture of the screen */}
      <section id="features" className="scroll-mt-24 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHead
            eyebrow={<><IconSparkles className="size-3.5" /> Features</>}
            title={<>Make your practice<br className="hidden sm:block" /> work harder for you</>}
            text="One workspace for the work you do every day, from the first order to the final filing."
          />
          <div className="mt-14 grid gap-4 md:grid-cols-2">
            {BENTO.map((b, i) => (
              <FadeUp key={b.key} delay={(i % 2) * 0.08}>
                <div className={cn(CARD, "group flex h-full flex-col overflow-hidden p-2 transition duration-300 hover:-translate-y-1")}>
                  <div className="rounded-[20px] bg-linear-to-br from-[#297bff]/[0.07] via-[#f7f7fb] to-[#834aff]/[0.09] p-6 sm:p-8">
                    <BentoVisual kind={b.key} />
                  </div>
                  <div className="p-5 sm:p-6">
                    <h3 className="text-xl font-medium tracking-[-0.03em] text-[#121212]">{b.title}</h3>
                    <p className={cn("mt-1.5 text-[15px]", BODY)}>{b.text}</p>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHead
            eyebrow="Benefits"
            title={<>Everything that matters<br className="hidden sm:block" /> to a busy practice</>}
            text="The everyday pieces, done properly, so nothing falls between spreadsheets and inboxes."
          />
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map(([Icon, title, text], i) => (
              <FadeUp key={title} delay={(i % 3) * 0.06}>
                <div className={cn(CARD, "h-full p-6 transition duration-300 hover:-translate-y-1")}>
                  <span className="flex size-11 items-center justify-center rounded-xl bg-linear-to-br from-[#297bff]/12 to-[#834aff]/15 text-[#5f5cff] shadow-[inset_0_1px_0_#fff]">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-medium tracking-[-0.03em] text-[#121212]">{title}</h3>
                  <p className={cn("mt-2 text-[15px]", BODY)}>{text}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHead eyebrow="How it works" title={<>Up and running<br className="hidden sm:block" /> in 3 simple steps</>} />
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {STEPS.map(([title, text, kind], i) => (
              <FadeUp key={title} delay={i * 0.1}>
                <div className={cn(CARD, "h-full overflow-hidden p-2")}>
                  <div className="rounded-[20px] bg-[#f4f4fa] p-5">
                    <StepVisual kind={kind} />
                  </div>
                  <div className="p-5">
                    <span className="text-xs font-semibold text-[#5f5cff]">Step {i + 1}</span>
                    <h3 className="mt-1 text-xl font-medium tracking-[-0.03em] text-[#121212]">{title}</h3>
                    <p className={cn("mt-1.5 text-[15px]", BODY)}>{text}</p>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Services: the company work formation agents sell, done inside Finstap */}
      <section id="services" className="scroll-mt-24 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHead
            eyebrow="Services"
            title={<>Built for <span className={GRADIENT_TEXT}>UK company services</span></>}
            text="The services your clients buy from you every day, handled in the same place as their companies."
          />
          <div className="mt-14 grid gap-4 md:grid-cols-2">
            {SERVICES.map(([Icon, title, text, points], i) => (
              <FadeUp key={title} delay={(i % 2) * 0.08}>
                <div className={cn(CARD, "h-full p-7 transition duration-300 hover:-translate-y-1 sm:p-8")}>
                  <div className="flex items-start gap-4">
                    <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_20px_-10px_rgba(95,92,255,0.6)]", GRADIENT)}>
                      <Icon className="size-6" />
                    </span>
                    <div>
                      <h3 className="text-xl font-medium tracking-[-0.03em] text-[#121212]">{title}</h3>
                      <p className={cn("mt-1.5 text-[15px]", BODY)}>{text}</p>
                    </div>
                  </div>
                  <ul className="mt-6 grid gap-2.5 border-t border-slate-100 pt-5">
                    {points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm text-slate-700">
                        <IconCircleCheckFilled className="mt-0.5 size-4 shrink-0 text-[#5f5cff]" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Your address, your data */}
      <section id="why" className="scroll-mt-24 py-24 sm:py-32">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
          <FadeUp>
            <Eyebrow>Why Finstap</Eyebrow>
            <h2 className={cn("mt-4", H2)}>Your practice, your address, your data</h2>
            <p className={cn("mt-4 max-w-lg", BODY)}>
              Each company gets its own Finstap workspace at its own address, with your logo and your colours,
              and its own database.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-[0_0_0_1px_rgba(15,23,42,0.06)]">
              <IconWorld className="size-4 text-[#5f5cff]" />
              yourcompany<span className="text-slate-400">.finstap.com</span>
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                "Your own database",
                "Login codes on new browsers",
                "Built for UK firms",
                "Phone, tablet and desktop",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
                  <IconCircleCheckFilled className="size-4 text-[#5f5cff]" /> {item}
                </li>
              ))}
            </ul>
          </FadeUp>
          <FadeUp delay={0.1}>
            <Orbit />
          </FadeUp>
        </div>
      </section>

      {/* Pricing (plans come from the server) */}
      <FinstapPricing />

      {/* A smarter way: before and after */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <SectionHead eyebrow="Compare" title={<>A smarter way<br className="hidden sm:block" /> to run your practice</>} />
          <div className="mt-14 grid gap-4 md:grid-cols-2">
            <FadeUp>
              <div className="h-full rounded-3xl bg-slate-100/70 p-7 sm:p-8">
                <p className="flex items-center gap-2 font-semibold text-slate-700">
                  <IconTable className="size-5 text-slate-400" /> Spreadsheets & email
                </p>
                <ul className="mt-6 grid gap-3">
                  {COMPARE.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-slate-500">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-slate-300 text-white">
                        <IconX className="size-3" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeUp>
            <FadeUp delay={0.08}>
              <div className={cn(CARD, "relative h-full overflow-hidden p-7 ring-2 ring-[#5f5cff]/25 sm:p-8")}>
                <span aria-hidden className="absolute -right-16 -top-16 size-48 rounded-full bg-[#834aff]/15 blur-3xl" />
                <p className="relative flex items-center gap-2 font-semibold text-slate-900">
                  <img src={finstapMark} alt="" className="size-5" /> Finstap
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#5f5cff]/10 px-2 py-0.5 text-[11px] font-semibold text-[#5f5cff]">
                    <IconCrown className="size-3" /> Recommended
                  </span>
                </p>
                <ul className="relative mt-6 grid gap-3">
                  {COMPARE.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <IconCircleCheckFilled className="mt-0.5 size-4 shrink-0 text-[#5f5cff]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionHead eyebrow="FAQ" title={<>Common questions,<br className="hidden sm:block" /> clear answers</>} />
          <div className="mt-12 grid gap-3">
            {FAQ.map(([q, a]) => (
              <FaqItem key={q} q={q} a={a} />
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action with the newsletter */}
      <section className="pb-20 pt-8 sm:pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <FadeUp>
            <div className="relative overflow-hidden rounded-[32px] bg-linear-to-br from-[#297bff] via-[#5f5cff] to-[#834aff] px-6 py-14 text-center text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_30px_60px_-30px_rgba(95,92,255,0.7)] sm:px-12 sm:py-20">
              <span aria-hidden className="absolute -right-16 -top-20 size-72 rounded-full bg-white/15 blur-3xl" />
              <span aria-hidden className="absolute -bottom-24 -left-10 size-72 rounded-full bg-[#297bff]/50 blur-3xl" />
              <h2 className="relative mx-auto max-w-2xl text-[34px] font-medium leading-[1.2] tracking-[-0.05em] sm:text-[48px]">
                Ready to give your practice a calmer week?
              </h2>
              <p className="relative mx-auto mt-4 max-w-xl text-white/85">
                Create your workspace in a few minutes and try everything free for 14 days.
              </p>
              <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#5f5cff] shadow-lg transition hover:-translate-y-0.5"
                >
                  Start free trial <IconArrowRight className="size-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-full bg-white/10 px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/40 transition hover:bg-white/20"
                >
                  Log in to your workspace
                </Link>
              </div>
              {/* Newsletter sign-up (Content > Newsletter in the owner portal) */}
              <div className="relative mx-auto mt-12 max-w-md border-t border-white/20 pt-8">
                <p className="text-sm font-semibold">Get the Finstap newsletter</p>
                <p className="mt-1 text-xs text-white/75">Product news and practical tips for UK practices.</p>
                <NewsletterSignup source="landing" dark className="mx-auto mt-4" />
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/70 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <img src={finstapLogo} alt="Finstap" className="h-7 w-auto" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-500">
              The CRM for UK accountants and company formation firms.
            </p>
            <Link to="/signup" className={cn(CTA, "mt-5 px-5 py-2.5")}>
              Start free trial
            </Link>
          </div>
          {[
            ["Product", [["Features", "#features"], ["Services", "#services"], ["Pricing", "#pricing"], ["FAQ", "#faq"]]],
            ["Company", [["Blog", "/blog"], ["How it works", "#how"], ["Why Finstap", "#why"]]],
            ["Account", [["Log in", "/login"], ["Start free trial", "/signup"]]],
          ].map(([heading, links]) => (
            <div key={heading}>
              <p className="text-sm font-semibold text-slate-900">{heading}</p>
              <ul className="mt-4 grid gap-2.5 text-sm text-slate-500">
                {links.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith("#") ? (
                      <a href={href} className="hover:text-[#5f5cff]">
                        {label}
                      </a>
                    ) : (
                      <Link to={href} className="hover:text-[#5f5cff]">
                        {label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:px-6">
            <p>© 2026 Finstap. All rights reserved.</p>
            <LegalLinks />
          </div>
        </div>
      </footer>
    </div>
  )
}
