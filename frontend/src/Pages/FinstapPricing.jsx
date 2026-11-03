import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import { cn } from "cn"
import { IconArrowRight, IconCheck, IconChevronDown, IconMinus, IconSparkles } from "@tabler/icons-react"
import { getApiBase } from "@/lib/api"

const GRADIENT = "bg-linear-to-r from-[#297bff] to-[#834aff]"

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

function PlanCard({ data, index, yearly }) {
  const key = data.order[index]
  const plan = data.plans[key]
  const popular = Boolean(plan.popular)
  const custom = Boolean(plan.custom)
  const price = yearly ? plan.price_year : plan.price_month
  const previous = index ? data.plans[data.order[index - 1]].name : ""

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative flex flex-col rounded-3xl p-7",
        popular
          ? "bg-white shadow-[0_30px_60px_-30px_rgba(101,89,255,0.55)] ring-2 ring-[#6559ff] lg:-translate-y-3"
          : custom
            ? "bg-slate-900 text-white"
            : "border border-slate-200 bg-white",
      )}
    >
      {popular && (
        <span className={cn("absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white shadow", GRADIENT)}>
          Most popular
        </span>
      )}
      <h3 className={cn("text-lg font-semibold", custom ? "text-white" : "text-slate-900")}>{plan.name}</h3>
      <p className={cn("mt-1 text-sm", custom ? "text-slate-300" : "text-slate-600")}>{plan.tagline}</p>

      <div className="mt-6 flex items-baseline gap-1">
        {custom ? (
          <span className="text-3xl font-bold tracking-tight">Let's talk</span>
        ) : (
          <>
            <span className="text-4xl font-bold tracking-tight text-slate-900">
              {money(yearly ? Math.round((price / 12) * 100) / 100 : price)}
            </span>
            <span className="text-sm text-slate-500">/month</span>
          </>
        )}
      </div>
      <p className={cn("mt-1 h-5 text-xs", custom ? "text-slate-400" : "text-slate-500")}>
        {custom ? "Custom software, limits and support" : yearly ? `${money(price)} billed yearly, excl. VAT` : "Billed monthly, excl. VAT"}
      </p>

      {custom ? (
        <a
          href="mailto:contact@finstap.com?subject=Finstap%20Enterprise"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5"
        >
          Contact us <IconArrowRight className="size-4" />
        </a>
      ) : (
        <Link
          to="/signup"
          className={cn(
            "mt-6 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition hover:-translate-y-0.5",
            popular ? cn(GRADIENT, "text-white shadow-[0_10px_30px_-10px_rgba(101,89,255,0.7)]") : "border border-slate-200 text-slate-800 hover:border-[#6559ff]/40 hover:text-[#5f5cff]",
          )}
        >
          Start free trial <IconArrowRight className="size-4" />
        </Link>
      )}

      <ul className={cn("mt-7 space-y-2.5 border-t pt-6 text-sm", custom ? "border-white/10" : "border-slate-100")}>
        {Object.keys(LIMIT_LINE).map((k) => {
          const n = plan.limits[k]
          return (
            <li key={k} className={cn("flex items-start gap-2.5", custom ? "text-slate-200" : "text-slate-700")}>
              <IconCheck className={cn("mt-0.5 size-4 shrink-0", custom ? "text-violet-300" : "text-[#5f5cff]")} />
              {n === null ? UNLIMITED_LINE[k] : LIMIT_LINE[k](n)}
            </li>
          )
        })}
      </ul>

      <div className="mt-6">
        <p className={cn("text-xs font-semibold uppercase tracking-wider", custom ? "text-slate-400" : "text-slate-500")}>
          {previous ? `Everything in ${previous}, plus` : "Includes"}
        </p>
        <ul className="mt-3 space-y-2.5 text-sm">
          {newFeatures(data, index).map((f) => (
            <li key={f} className={cn("flex items-start gap-2.5", custom ? "text-slate-200" : "text-slate-700")}>
              <IconSparkles className={cn("mt-0.5 size-4 shrink-0", custom ? "text-amber-300" : "text-emerald-500")} />
              {f}
            </li>
          ))}
        </ul>
      </div>
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
      .then((json) => json.success && setData(json.data))
      .catch(() => {})
  }, [])

  return (
    <section id="pricing" className="scroll-mt-20 bg-linear-to-b from-white to-[#f6f5ff] py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#5f5cff]">Pricing</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Simple plans that grow with you</h2>
          <p className="mt-4 text-slate-600">
            One price for your whole workspace. Every plan starts with a 14-day free trial, no card needed.
          </p>
          <div className="mt-8 inline-flex items-center rounded-full border border-slate-200 bg-white p-1 text-sm font-semibold shadow-sm">
            {[
              [false, "Monthly"],
              [true, "Yearly"],
            ].map(([value, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setYearly(value)}
                className={cn(
                  "rounded-full px-5 py-2 transition",
                  yearly === value ? cn(GRADIENT, "text-white shadow") : "text-slate-600 hover:text-slate-900",
                )}
              >
                {label}
                {value && <span className={cn("ml-2 text-xs", yearly ? "text-white/85" : "text-emerald-600")}>2 months free</span>}
              </button>
            ))}
          </div>
        </div>

        {data ? (
          <>
            <div className="mt-14 grid items-start gap-6 md:grid-cols-2 lg:grid-cols-4">
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
                {compare ? "Hide" : "Compare all features"}
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
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[520px] animate-pulse rounded-3xl border border-slate-200 bg-white" />
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
