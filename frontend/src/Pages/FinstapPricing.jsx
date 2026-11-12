import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { cn } from "cn"
import { IconCheck, IconChevronDown, IconMinus } from "@tabler/icons-react"
import { getApiBase } from "@/lib/api"
import { BRAND_BUTTON } from "@/lib/finstap-buttons"

const money = (v) => `£${Number(v).toLocaleString("en-GB")}`

const LIMIT_LINE = {
  users: (n) => `${n} team users`,
  customers: (n) => `${n.toLocaleString("en-GB")} customers`,
  companies: (n) => `${n.toLocaleString("en-GB")} companies`,
  orders_month: (n) => `${n} orders a month`,
  storage_gb: (n) => `${n} GB document storage`,
  ai_month: (n) => `${n.toLocaleString("en-GB")} AI questions a month`,
}
const UNLIMITED_LINE = {
  users: "Unlimited team users",
  customers: "Unlimited customers",
  companies: "Unlimited companies",
  orders_month: "Unlimited orders",
  storage_gb: "Storage sized for you",
  ai_month: "AI sized for you",
}

/** What a plan adds to the one before it ("Everything in Starter, plus …"). */
function newFeatures(data, index) {
  const plan = data.plans[data.order[index]]
  const before = index ? data.plans[data.order[index - 1]].features : []
  return plan.features.filter((f) => !before.includes(f)).map((f) => data.features[f])
}

// The two limits shown on each card (the full list is in Compare all features)
const CARD_LIMITS = ["users", "customers"]

/** A short list of what a plan includes (at most 6 lines): what it adds to the plan before it, then two limits. */
function includedLines(data, index) {
  const plan = data.plans[data.order[index]]
  const previous = index ? data.plans[data.order[index - 1]].name : ""
  const added = newFeatures(data, index).slice(0, previous ? 3 : 4)
  const limits = CARD_LIMITS.map((k) => (plan.limits[k] === null ? UNLIMITED_LINE[k] : LIMIT_LINE[k](plan.limits[k])))
  return [...(previous ? [`Everything in ${previous}`] : []), ...added, ...limits]
}

function PlanCard({ data, index, yearly }) {
  const key = data.order[index]
  const plan = data.plans[key]
  const popular = Boolean(plan.popular)
  const custom = Boolean(plan.custom)
  const price = yearly ? plan.price_year : plan.price_month

  const card = (
    <div className={cn("flex h-full flex-col rounded-[20px] bg-white p-7", !popular && "shadow-[0_1px_20px_rgba(0,0,0,0.05)]")}>
      <h3 className="text-[17px] font-medium tracking-[-0.02em] text-[#121212]">{plan.name}</h3>

      <div className="mt-6 flex items-baseline gap-1">
        {custom ? (
          <span className="text-[44px] font-medium leading-none tracking-[-0.05em] text-[#121212]">Let's talk</span>
        ) : (
          <>
            <span className="text-[48px] font-medium leading-none tracking-[-0.05em] text-[#121212]">
              {money(yearly ? Math.round((price / 12) * 100) / 100 : price)}
            </span>
            <span className="text-[15px] text-[#575757]/80">/month</span>
          </>
        )}
      </div>
      <p className="mt-3 min-h-[44px] text-[15px] font-medium leading-snug tracking-[-0.02em] text-[#575757]/80">{plan.tagline}</p>
      <p className="h-4 text-xs text-slate-400">
        {custom ? "Custom software, limits and support" : yearly ? `${money(price)} billed yearly, excl. VAT` : "Billed monthly, excl. VAT"}
      </p>

      {custom ? (
        <a href="mailto:contact@finstap.com?subject=Finstap%20Enterprise" className={cn(BRAND_BUTTON, "mt-6 w-full")}>
          Contact Us
        </a>
      ) : (
        <Link to="/signup" className={cn(BRAND_BUTTON, "mt-6 w-full")}>
          Start Free Trial
        </Link>
      )}

      <p className="mt-7 text-[13px] text-[#575757]/80">What's included</p>
      <ul className="mt-3 space-y-2.5 text-[15px] tracking-[-0.01em] text-[#121212]">
        {includedLines(data, index).map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            <IconCheck className="mt-[3px] size-4 shrink-0 text-[#121212]/70" stroke={2} />
            {line}
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className={cn("h-full", popular && "lg:-mt-12")}
    >
      {popular ? (
        // The popular plan sits in a thick frame of the logo gradient with "Most popular" on its top band
        <div className="flex h-full flex-col rounded-[24px] bg-linear-to-b from-[#297bff] to-[#834aff] p-[5px] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_24px_50px_-20px_rgba(95,92,255,0.6)]">
          <p className="py-2.5 text-center text-sm font-semibold tracking-[-0.01em] text-white">Most popular</p>
          {card}
        </div>
      ) : (
        card
      )}
    </motion.div>
  )
}

function CompareTable({ data }) {
  const plans = data.order.map((k) => data.plans[k])
  const cell = (p, k) => {
    const n = p.limits[k]
    if (n === null) return "Unlimited"
    return k === "storage_gb" ? `${n} GB` : n.toLocaleString("en-GB")
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-5 py-3 font-semibold text-slate-500" />
            {plans.map((p) => (
              <th key={p.key} className="px-5 py-3 font-semibold text-slate-900">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(data.limits).map(([k, label]) => (
            <tr key={k} className="border-b border-slate-100">
              <td className="px-5 py-3 text-slate-600">{label}</td>
              {plans.map((p) => (
                <td key={p.key} className="px-5 py-3 font-medium tabular-nums text-slate-900">
                  {cell(p, k)}
                </td>
              ))}
            </tr>
          ))}
          {Object.entries(data.features).map(([k, label]) => (
            <tr key={k} className="border-b border-slate-100 last:border-0">
              <td className="px-5 py-3 text-slate-600">{label}</td>
              {plans.map((p) => (
                <td key={p.key} className="px-5 py-3">
                  {p.features.includes(k) ? (
                    <IconCheck className="size-4 text-emerald-500" />
                  ) : (
                    <IconMinus className="size-4 text-slate-300" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Landing page pricing: the plans from the server (services/plans.py), monthly or yearly. */
export default function FinstapPricing() {
  const [data, setData] = useState(null)
  const [yearly, setYearly] = useState(false)
  const [compare, setCompare] = useState(false)

  useEffect(() => {
    fetch(`${getApiBase()}/platform/plans`)
      .then((r) => r.json())
      // Enterprise (a custom plan) is not shown on the landing page: three plans, like a simple price list
      .then((json) => json.success && setData({ ...json.data, order: json.data.order.filter((k) => !json.data.plans[k].custom) }))
      .catch(() => {})
  }, [])

  return (
    <section id="pricing" className="scroll-mt-24 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full bg-[#5f5cff]/[0.07] px-3 py-1 text-xs font-semibold text-[#5f5cff] ring-1 ring-[#5f5cff]/15">Pricing</span>
          <h2 className="mt-4 text-[34px] font-medium leading-[1.2] tracking-[-0.05em] text-[#121212] sm:text-[48px]">Simple Plans That Grow with You</h2>
          <p className="mt-4 text-base font-medium tracking-[-0.02em] text-[#575757]/80">
            One price for your whole workspace. Every plan starts with a 14-day free trial, no card needed.
          </p>
          <div className="mt-8 inline-flex items-center gap-1 rounded-[16px] bg-white p-1.5 shadow-[0_1px_20px_rgba(0,0,0,0.05)]">
            {[
              [false, "Monthly"],
              [true, "Yearly"],
            ].map(([value, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setYearly(value)}
                className={cn(
                  "flex items-center gap-2 rounded-[12px] px-5 py-2.5 text-[15px] font-medium tracking-[-0.01em] transition-colors",
                  yearly === value ? "bg-[#5f5cff]/10 text-[#5f5cff]" : "text-[#575757] hover:text-[#121212]",
                )}
              >
                {label}
                {value && (
                  <span className="rounded-md border border-[#5f5cff]/60 px-1.5 py-px text-[11px] font-semibold text-[#5f5cff]">
                    2 months free
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {data ? (
          <>
            <div className="mx-auto mt-24 grid max-w-5xl items-stretch gap-5 md:grid-cols-3">
              {data.order.map((key, i) => (
                <PlanCard key={key} data={data} index={i} yearly={yearly} />
              ))}
            </div>
            <div className="mt-10 text-center">
              <button
                type="button"
                onClick={() => setCompare((v) => !v)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#5f5cff] hover:underline"
                aria-expanded={compare}
              >
                {compare ? "Hide" : "Compare All Features"}
                <IconChevronDown className={cn("size-4 transition", compare && "rotate-180")} />
              </button>
            </div>
            {compare && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
                <CompareTable data={data} />
              </motion.div>
            )}
          </>
        ) : (
          <div className="mx-auto mt-24 grid max-w-5xl gap-5 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[480px] animate-pulse rounded-[20px] bg-white shadow-[0_1px_20px_rgba(0,0,0,0.05)]" />
            ))}
          </div>
        )}
        <p className="mt-8 text-center text-xs text-slate-500">
          Need more team members? Add extra users to any plan. Prices exclude VAT.
        </p>
      </div>
    </section>
  )
}
