import { cn } from "cn"

const LABELS = {
  users: "Team users",
  customers: "Customers",
  companies: "Companies",
  orders_month: "Orders this month",
  storage_gb: "Document storage",
  ai_month: "AI questions this month",
}

function shown(key, value) {
  if (key === "storage_gb") {
    const gb = Number(value || 0)
    return gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb.toFixed(1)} GB`
  }
  return Number(value || 0).toLocaleString("en-GB")
}

/**
 * One bar per limit: what the workspace uses against what its plan allows. Over 80% turns amber,
 * full turns red; unlimited shows the count alone.
 */
export function PlanUsage({ usage, limits, className }) {
  if (!usage) return <p className="text-sm text-muted-foreground">Usage is not available for this workspace.</p>
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {Object.keys(LABELS).map((key) => {
        const used = usage[key] ?? 0
        const limit = limits?.[key]
        const unlimited = limit === null || limit === undefined
        const pct = unlimited ? 0 : Math.min(100, limit === 0 ? 100 : (Number(used) / limit) * 100)
        const tone = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary"
        return (
          <div key={key} className="rounded-xl border bg-card p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{LABELS[key]}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{shown(key, used)}</span>
                {" / "}
                {unlimited ? "Unlimited" : key === "storage_gb" ? `${limit} GB` : limit.toLocaleString("en-GB")}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", unlimited ? "bg-emerald-500/60" : tone)}
                style={{ width: unlimited ? "100%" : `${Math.max(pct, used ? 2 : 0)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
