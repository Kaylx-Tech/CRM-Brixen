import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { IconChevronRight,
  IconArrowRight,
  IconAlertTriangle,
  IconBuildingSkyscraper,
  IconCash,
  IconClockHour4,
  IconUserPlus,
} from "@tabler/icons-react"
import { money, ownerApi, shortDate } from "@/lib/owner"
import { Button, LoadError, PageTitle, Panel, PlanBadge, Stat, StatusBadge } from "./ownerUi"

const PLAN_KEYS = ["trial", "starter", "pro", "business", "enterprise"]

/** New workspaces per day over the last 30 days, as simple bars. */
function SignupBars({ rows }) {
  const byDay = Object.fromEntries((rows || []).map((r) => [r.day, r.count]))
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    const key = d.toISOString().slice(0, 10)
    return { key, count: byDay[key] || 0, label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) }
  })
  const max = Math.max(1, ...days.map((d) => d.count))
  return (
    <div>
      <div className="flex h-36 items-end gap-1">
        {days.map((d) => (
          <div key={d.key} className="group relative flex h-full flex-1 items-end" title={`${d.label}: ${d.count}`}>
            <div
              className="w-full rounded-t bg-primary/80 transition group-hover:bg-primary"
              style={{ height: d.count ? `${(d.count / max) * 100}%` : "2px", opacity: d.count ? 1 : 0.25 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{days[0].label}</span>
        <span>Today</span>
      </div>
    </div>
  )
}

export default function OwnerOverview() {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    ownerApi("/overview").then((res) => (res.ok ? setData(res.data) : setError(res.error)))
  }, [])

  if (error) return <LoadError error={error} />
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>

  const total = Math.max(1, data.workspaces)
  return (
    <>
      <PageTitle title="Overview" description="Every Finstap workspace at a glance." />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Monthly revenue (MRR)"
          value={money(data.mrr)}
          hint={`${money(data.arr)} a year · ${data.paying} paying`}
          icon={IconCash}
          tone="text-emerald-600"
        />
        <Stat
          label="Workspaces"
          value={data.workspaces}
          hint={`${data.active} active · ${data.suspended} suspended`}
          icon={IconBuildingSkyscraper}
        />
        <Stat
          label="On free trial"
          value={data.on_trial}
          hint={`${data.trial_ended} trial(s) ended without a plan`}
          icon={IconClockHour4}
          tone="text-sky-600"
        />
        <Stat
          label="New in 30 days"
          value={data.new_30d}
          hint={data.past_due ? `${data.past_due} payment(s) past due` : "No payments past due"}
          icon={data.past_due ? IconAlertTriangle : IconUserPlus}
          tone={data.past_due ? "text-amber-600" : "text-violet-600"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="New workspaces" description="Signups per day, last 30 days" className="lg:col-span-2">
          <SignupBars rows={data.signups_30d} />
        </Panel>
        <Panel title="Plans" description="Workspaces on each plan">
          <div className="space-y-3">
            {PLAN_KEYS.map((key) => (
              <div key={key}>
                <div className="flex items-center justify-between text-sm">
                  <PlanBadge plan={key} />
                  <span className="tabular-nums font-medium">{data.by_plan[key] || 0}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${((data.by_plan[key] || 0) / total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Across all workspaces">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {[
              ["Team users", data.totals.users],
              ["Customers", data.totals.customers],
              ["Companies", data.totals.companies],
              ["Storage", `${data.totals.storage_gb} GB`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">{Number.isFinite(value) ? value.toLocaleString("en-GB") : value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Trials ending this week" className="lg:col-span-2">
          {data.trials_ending.length ? (
            <ul className="divide-y">
              {data.trials_ending.map((t) => (
                <li key={t.slug} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <Link to={`/owner/workspaces/${t.slug}`} className="min-w-0 font-medium hover:text-primary">
                    <span className="block truncate">{t.name}</span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">{t.owner_email}</span>
                  </Link>
                  <span className="shrink-0 text-muted-foreground">ends {shortDate(t.trial_ends_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No trials end in the next 7 days.</p>
          )}
        </Panel>
      </div>

      <Panel
        title="Latest workspaces"
        className="mt-4"
        action={
          <Button variant="outline" size="lg" nativeButton={false} render={<Link to="/owner/workspaces" />}>
            See all <IconArrowRight className="size-4" />
          </Button>
        }
      >
        {data.recent.length ? (
          <ul className="divide-y">
            {data.recent.map((w) => (
              <li key={w.slug}>
                {/* Same two lines on every screen: name and date, then address and badges */}
                <Link to={`/owner/workspaces/${w.slug}`} className="group flex items-center gap-3 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium group-hover:text-primary">{w.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{shortDate(w.created_at)}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs text-muted-foreground">{w.slug}</span>
                      <PlanBadge plan={w.plan} />
                      <StatusBadge workspace={w} />
                    </span>
                  </span>
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No workspaces yet.</p>
        )}
      </Panel>
    </>
  )
}
