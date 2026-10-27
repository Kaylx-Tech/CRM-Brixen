import { useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { cn } from "cn"
import {
  IconArrowRight,
  IconBuildingBank,
  IconBuildingSkyscraper,
  IconChartBar,
  IconCheck,
  IconChecklist,
  IconFileText,
  IconMenu2,
  IconMinus,
  IconPalette,
  IconPlus,
  IconReceipt2,
  IconShieldLock,
  IconTrendingUp,
  IconUsers,
  IconUsersGroup,
  IconWorld,
  IconX,
} from "@tabler/icons-react"
import finstapLogo from "@/assets/finstap-logo.svg"
import { LegalLinks } from "@/Pages/Legal/LegalLayout"

// Finstap brand: blue → violet from the logo. The landing page is always light.
const GRADIENT = "bg-linear-to-r from-[#297bff] to-[#834aff]"
const GRADIENT_TEXT = "bg-linear-to-r from-[#297bff] via-[#5f5cff] to-[#834aff] bg-clip-text text-transparent"
const CTA = cn(
  GRADIENT,
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(101,89,255,0.7)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-12px_rgba(101,89,255,0.8)]",
)
const GHOST = "inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-800 transition hover:border-[#6559ff]/40 hover:text-[#5f5cff]"

const NAV = [
  ["Features", "#features"],
  ["How it works", "#how"],
  ["Why Finstap", "#why"],
  ["FAQ", "#faq"],
]

const FEATURES = [
  [IconUsers, "Clients & companies", "Every client, director and company in one place, with their orders, invoices and documents."],
  [IconBuildingBank, "Companies House sync", "Pull company details, officers and filing dates straight from Companies House."],
  [IconReceipt2, "Orders & invoices", "Take orders through your own forms, send invoices and see what is paid at a glance."],
  [IconFileText, "Documents", "Store and share client documents securely, organised by client and company."],
  [IconChecklist, "Smart Operations", "GOV forms, tasks and deadlines your team can work through without missing a date."],
  [IconChartBar, "Finance & revenue", "Revenue over time, balance sheet and company expenses, ready when you need them."],
  [IconUsersGroup, "Team & roles", "Admins, managers and staff each see only what their role needs, prices included."],
  [IconPalette, "Your brand", "Your logo, your colours and your own address: yourcompany.finstap.com."],
]

const STEPS = [
  ["Create your workspace", "Confirm your email, name your company and pick your Finstap address."],
  ["Bring in your team", "Invite colleagues and give each one the right role."],
  ["Run your practice", "Clients, orders, invoices and deadlines in one calm dashboard."],
]

const WHY = [
  "Your own workspace with its own database",
  "Login codes by email on every new browser",
  "Built for UK accountants and company formation firms",
  "Works on phone, tablet and desktop",
]

const FAQ = [
  ["Is there a free trial?", "Yes. Every new workspace starts with a 14-day free trial, no card needed to begin."],
  ["Who is Finstap for?", "Accounting practices, company formation agents and corporate service providers who manage many clients and companies."],
  ["Is my data kept separate?", "Yes. Each company gets its own workspace and its own database, reached at its own address."],
  ["Can my team use it?", "Yes. Invite your team and choose a role for each person: admin, manager or staff."],
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

function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center">
          <img src={finstapLogo} alt="Finstap" className="h-8 w-auto" />
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map(([label, href]) => (
            <a key={href} href={href} className="text-sm font-medium text-slate-600 transition hover:text-[#5f5cff]">
              {label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link to="/login" className="text-sm font-semibold text-slate-700 hover:text-[#5f5cff]">
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
          className="border-t border-slate-200/60 bg-white px-4 pb-5 pt-2 md:hidden"
        >
          {NAV.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-2 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {label}
            </a>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2">
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

/** The dashboard preview next to the hero text: a revenue card, a clients donut and two small figures. */
function HeroVisual() {
  const bars = [38, 52, 44, 66, 58, 82, 70]
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <span aria-hidden className="absolute -top-10 right-0 size-72 rounded-full bg-[#834aff]/25 blur-3xl" />
      <span aria-hidden className="absolute -bottom-10 left-0 size-72 rounded-full bg-[#297bff]/25 blur-3xl" />

      {/* Revenue overview */}
      <motion.div
        initial={{ opacity: 0, y: 30, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: -2 }}
        transition={{ duration: 0.7, delay: 0.2 }}
        className="relative w-[78%] rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_30px_60px_-30px_rgba(41,64,140,0.35)] sm:p-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Revenue</p>
            <p className="text-xs text-slate-500">This month vs last month</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
            <IconTrendingUp className="size-3" /> 24%
          </span>
        </div>
        <div className="mt-5 flex h-32 items-end gap-2 sm:h-36 sm:gap-3">
          {bars.map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ duration: 0.8, delay: 0.5 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
              className={cn("flex-1 rounded-t-lg", i === 5 ? GRADIENT : "bg-slate-200")}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate-400">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d} className="flex-1 text-center">{d}</span>
          ))}
        </div>
      </motion.div>

      {/* Clients donut */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.45 }}
        className="relative -mt-16 ml-auto w-[62%] rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_30px_60px_-25px_rgba(101,89,255,0.45)] sm:-mt-20 sm:p-5"
      >
        <p className="text-center text-sm font-semibold text-slate-900">Clients</p>
        <p className="text-center text-xs text-slate-500">Active this quarter</p>
        <div className="relative mx-auto mt-3 size-32 sm:size-36">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90">
            <defs>
              <linearGradient id="fs-donut" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#297bff" />
                <stop offset="100%" stopColor="#834aff" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="48" fill="none" stroke="#eef0f6" strokeWidth="14" />
            <motion.circle
              cx="60"
              cy="60"
              r="48"
              fill="none"
              stroke="url(#fs-donut)"
              strokeWidth="14"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 0.68 }}
              transition={{ duration: 1.2, delay: 0.8, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-slate-900">68%</span>
            <span className="text-[10px] text-slate-500">Returning clients</span>
          </div>
        </div>
      </motion.div>

      {/* Small figures */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.75 }}
        className="absolute bottom-6 left-2 flex gap-5 rounded-2xl border border-slate-200/80 bg-white px-5 py-3 shadow-xl sm:left-6"
      >
        <div>
          <p className="text-[11px] font-medium text-slate-500">Paid</p>
          <p className="text-lg font-bold text-slate-900">£8.2K</p>
        </div>
        <div className="w-px bg-slate-200" />
        <div>
          <p className="text-[11px] font-medium text-slate-500">Due</p>
          <p className="text-lg font-bold text-slate-900">£2.2K</p>
        </div>
      </motion.div>
    </div>
  )
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="font-semibold text-slate-900">{q}</span>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          {open ? <IconMinus className="size-4" /> : <IconPlus className="size-4" />}
        </span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.25 }}
        className="overflow-hidden"
      >
        <p className="px-5 pb-5 text-sm leading-relaxed text-slate-600">{a}</p>
      </motion.div>
    </div>
  )
}

/** Finstap's public home page on finstap.com: what it is, what it does, and the way into a free trial. */
export default function FinstapLanding() {
  return (
    <div id="top" className="min-h-screen scroll-smooth bg-white font-sans text-slate-900 antialiased [color-scheme:light]">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_20%_0%,rgba(41,123,255,0.12),transparent),radial-gradient(50%_50%_at_90%_10%,rgba(131,74,255,0.14),transparent)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:pb-28 lg:pt-20">
          <div>
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 rounded-full border border-[#6559ff]/20 bg-[#6559ff]/5 px-3 py-1 text-xs font-semibold text-[#5f5cff]"
            >
              <IconBuildingSkyscraper className="size-3.5" /> CRM for accountants & company formation
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[56px]"
            >
              Run your whole practice <span className={GRADIENT_TEXT}>in one calm place</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg"
            >
              Finstap brings your clients, companies, orders, invoices and deadlines together, so your
              team spends less time chasing and more time helping clients.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
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
              className="mt-5 flex items-center gap-2 text-sm text-slate-500"
            >
              <IconCheck className="size-4 text-emerald-500" /> 14-day free trial
              <span className="text-slate-300">·</span>
              <IconCheck className="size-4 text-emerald-500" /> No card to start
            </motion.p>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 bg-slate-50/70 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#5f5cff]">Features</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Everything your practice runs on</h2>
            <p className="mt-4 text-slate-600">
              One workspace for the work you do every day, from the first order to the final filing.
            </p>
          </FadeUp>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([Icon, title, text], i) => (
              <FadeUp key={title} delay={(i % 4) * 0.06}>
                <div className="group h-full rounded-2xl border border-slate-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-[#6559ff]/30 hover:shadow-[0_20px_40px_-20px_rgba(101,89,255,0.35)]">
                  <span className={cn("flex size-11 items-center justify-center rounded-xl text-white", GRADIENT)}>
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 font-semibold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#5f5cff]">How it works</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Up and running in minutes</h2>
          </FadeUp>
          <div className="relative mt-14 grid gap-6 md:grid-cols-3">
            <span aria-hidden className="absolute left-[16%] right-[16%] top-7 hidden h-px bg-linear-to-r from-[#297bff]/40 via-[#5f5cff]/40 to-[#834aff]/40 md:block" />
            {STEPS.map(([title, text], i) => (
              <FadeUp key={title} delay={i * 0.1} className="relative text-center">
                <span className={cn("relative mx-auto flex size-14 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg ring-8 ring-white", GRADIENT)}>
                  {i + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600">{text}</p>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Why Finstap */}
      <section id="why" className="scroll-mt-20 pb-20 sm:pb-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <FadeUp>
            <div className="grid items-center gap-10 overflow-hidden rounded-3xl border border-slate-200 bg-linear-to-br from-[#297bff]/[0.06] via-white to-[#834aff]/[0.08] p-8 sm:p-12 lg:grid-cols-2">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-[#5f5cff]">Why Finstap</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight">Your practice, your address, your data</h2>
                <p className="mt-4 text-slate-600">
                  Each company gets its own Finstap workspace at its own address, with your logo and your colours.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
                  <IconWorld className="size-4 text-[#5f5cff]" />
                  yourcompany<span className="text-slate-400">.finstap.com</span>
                </div>
              </div>
              <ul className="grid gap-3">
                {WHY.map((item) => (
                  <li key={item} className="flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-3.5 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-200/70">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      {item.startsWith("Login") ? <IconShieldLock className="size-4" /> : <IconCheck className="size-4" />}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 bg-slate-50/70 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <FadeUp className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#5f5cff]">FAQ</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Questions, answered</h2>
          </FadeUp>
          <div className="mt-10 grid gap-3">
            {FAQ.map(([q, a]) => (
              <FaqItem key={q} q={q} a={a} />
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <FadeUp>
            <div className={cn("relative overflow-hidden rounded-3xl px-6 py-14 text-center text-white sm:px-12 sm:py-16", "bg-linear-to-br from-[#297bff] via-[#5f5cff] to-[#834aff]")}>
              <span aria-hidden className="absolute -right-16 -top-20 size-72 rounded-full bg-white/15 blur-3xl" />
              <span aria-hidden className="absolute -bottom-24 -left-10 size-72 rounded-full bg-[#297bff]/50 blur-3xl" />
              <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">Ready to give your practice a calmer week?</h2>
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
                  className="inline-flex items-center justify-center rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Log in to your workspace
                </Link>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row sm:px-6">
          <img src={finstapLogo} alt="Finstap" className="h-7 w-auto" />
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} className="hover:text-[#5f5cff]">
                {label}
              </a>
            ))}
            <Link to="/login" className="hover:text-[#5f5cff]">
              Log in
            </Link>
          </nav>
          <p className="text-sm text-slate-500">© 2026 Finstap. All rights reserved.</p>
        </div>
        <div className="border-t border-slate-100 py-4 text-sm text-slate-500">
          <LegalLinks />
        </div>
      </footer>
    </div>
  )
}
