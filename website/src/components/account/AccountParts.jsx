"use client"

/** Small pieces shared by the My Account pages. */

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3.5 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30"
export const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
export const ghostClass =
  "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold text-brand-blue ring-1 ring-brand-blue/30 transition hover:bg-brand-mist disabled:opacity-60"

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-800">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-brand-slate">{hint}</span>}
    </label>
  )
}

export function Notice({ kind = "error", children }) {
  if (!children) return null
  const cls = kind === "ok" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : kind === "info" ? "bg-brand-mist text-brand-navy ring-brand-blue/20" : "bg-red-50 text-red-700 ring-red-200"
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm font-medium ring-1 ${cls}`}>
      {children}
    </p>
  )
}

const STATUS_COLORS = {
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
  closed: "bg-slate-100 text-slate-600 ring-slate-200",
  refunded: "bg-slate-100 text-slate-600 ring-slate-200",
  "documents required": "bg-amber-50 text-amber-800 ring-amber-200",
  "information required": "bg-amber-50 text-amber-800 ring-amber-200",
  unpaid: "bg-amber-50 text-amber-800 ring-amber-200",
  overdue: "bg-red-50 text-red-700 ring-red-200",
}

export function Status({ value }) {
  if (!value) return null
  const cls = STATUS_COLORS[String(value).toLowerCase()] || "bg-brand-mist text-brand-blue ring-brand-blue/20"
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${cls}`}>{value}</span>
}

export function money(n) {
  const v = Number(n || 0)
  return `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function date(value) {
  if (!value) return ""
  const d = new Date(String(value).replace(" ", "T"))
  return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export function Empty({ title, children }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center">
      <p className="font-display text-lg font-bold text-brand-navy">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-brand-slate">{children}</div>}
    </div>
  )
}

export function Loading() {
  return (
    <div className="space-y-3" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  )
}
