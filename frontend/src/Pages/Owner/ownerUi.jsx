import { cn } from "cn"
import { Button as UiButton } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

/** The owner portal's button: the app's Button, a size larger by default so it sits well next to inputs. */
export function Button({ size = "lg", ...props }) {
  return <UiButton size={size} {...props} />
}

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
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Panel({ title, description, action, className, children }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6", className)}>
      {(title || action) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

// Soft colour behind each stat's icon, picked from the icon's text colour
const STAT_BG = {
  "text-primary": "bg-primary/10",
  "text-emerald-600": "bg-emerald-500/10",
  "text-sky-600": "bg-sky-500/10",
  "text-amber-600": "bg-amber-500/15",
  "text-violet-600": "bg-violet-500/10",
  "text-destructive": "bg-destructive/10",
  "text-muted-foreground": "bg-muted",
}

export function Stat({ label, value, hint, icon: Icon, tone = "text-primary" }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:shadow-md sm:p-5">
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-primary/5 blur-2xl transition group-hover:bg-primary/10" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
          <div className="mt-2 text-xl font-bold leading-none tabular-nums tracking-tight sm:text-[26px]">{value}</div>
        </div>
        {Icon && (
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl sm:size-10", STAT_BG[tone] || "bg-primary/10")}>
            <Icon className={cn("size-4 sm:size-5", tone)} />
          </span>
        )}
      </div>
      {hint && <div className="relative mt-3 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

/** Filter chips as real tabs: options = [[value, label], ...] ("" = all). */
export function FilterTabs({ value, onChange, options, className }) {
  return (
    <Tabs value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)} className={className}>
      <TabsList className="bg-muted/70">
        {options.map(([v, label]) => (
          <TabsTrigger key={label} value={v || "all"} className="px-3">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/** A friendly empty state inside a panel. */
export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
      {Icon && (
        <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
      )}
      {title && <p className="font-medium">{title}</p>}
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
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
