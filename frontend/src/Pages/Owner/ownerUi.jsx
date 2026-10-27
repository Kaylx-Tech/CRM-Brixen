import { cn } from "cn"

const PLAN_TONE = {
  trial: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  starter: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  pro: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  business: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  enterprise: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
}

const PLAN_NAMES = { trial: "Free trial", starter: "Starter", pro: "Pro", business: "Business", enterprise: "Enterprise" }

export function PlanBadge({ plan, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        PLAN_TONE[plan] || PLAN_TONE.starter,
        className,
      )}
    >
      {PLAN_NAMES[plan] || plan}
    </span>
  )
}

/** Active / Suspended, plus what the trial or subscription says. */
export function StatusBadge({ workspace }) {
  const w = workspace || {}
  let label = w.status
  let tone = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  if (w.status === "Suspended") {
    tone = "bg-destructive/10 text-destructive"
  } else if (w.status !== "Active") {
    tone = "bg-muted text-muted-foreground"
  } else if (w.plan === "trial" && w.trial_running === false) {
    label = "Trial ended"
    tone = "bg-amber-500/15 text-amber-800 dark:text-amber-300"
  } else if (w.subscription_status === "past_due") {
    label = "Past due"
    tone = "bg-amber-500/15 text-amber-800 dark:text-amber-300"
  } else if (w.subscription_status === "cancelled") {
    label = "Cancelled"
    tone = "bg-muted text-muted-foreground"
  }
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>{label}</span>
}

export function PageTitle({ title, description, children }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export function Panel({ title, description, action, className, children }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-xs", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint, icon: Icon, tone = "text-primary" }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn("size-5", tone)} />}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

export const SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"

export function LoadError({ error }) {
  return error ? (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {error}
    </div>
  ) : null
}
