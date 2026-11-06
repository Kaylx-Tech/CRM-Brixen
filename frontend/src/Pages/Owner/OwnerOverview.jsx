import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBuilding,
  IconBuildingSkyscraper,
  IconCash,
  IconChevronRight,
  IconClockHour4,
  IconDatabase,
  IconUserPlus,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react"
import { money, ownerApi, shortDate } from "@/lib/owner"
import { Button, LoadError, PageTitle, Panel, PlanBadge, Stat, StatusBadge } from "./ownerUi"

const PLAN_KEYS = ["trial", "starter", "pro", "business", "enterprise"]
const PLAN_NAMES = { trial: "Free trial", starter: "Starter", pro: "Pro", business: "Business", enterprise: "Enterprise" }

// The logo's blue to purple, for bars and avatars
const BRAND_GRADIENT = "bg-linear-to-t from-[#297bff] to-[#834aff]"

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

/** A round chip with a workspace's first letters, on the logo gradient. */
function Initials({ name }) {
  const letters = String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#297bff] to-[#834aff] text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
      {letters || "?"}
    </span>
  )
}

/** New workspaces per day over the last 30 days: gradient bars, the count shows on hover. */
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
      <div className="flex h-44 items-end gap-1.5">
        {days.map((d) => (
          <div key={d.key} className="group relative flex h-full flex-1 items-end" title={`${d.label}: ${d.count}`}>
            {d.count > 0 && (
              <span className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background opacity-0 transition group-hover:opacity-100">
                {d.count}
              </span>
            )}
            <div
              className={
                d.count
                  ? `w-full rounded-md ${BRAND_GRADIENT} opacity-85 transition group-hover:opacity-100`
                  : "w-full rounded-md bg-muted"
              }
              style={{ height: d.count ? `${Math.max(8, (d.count / max) * 100)}%` : "6px" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[11px] text-muted-foreground">
        <span>{days[0].label}</span>
        <span>Today</span>
      </div>
    </div>
  )
}

export default function OwnerOverview() {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")
  // Taken once, for the days left on each trial
  const [now] = useState(() => Date.now())

  useEffect(() => {
    ownerApi("/overview").then((res) => (res.ok ? setData(res.data) : setError(res.error)))
  }, [])

  if (error) return <LoadError error={error} />
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>

  const total = Math.max(1, data.workspaces)
  const signups30 = (data.signups_30d || []).reduce((sum, r) => sum + (r.count || 0), 0)
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })

  return (
    <>
      <PageTitle title={`${greeting()} 👋`} description={`${today} · Every Finstap workspace at a glance.`}>
        <Button variant="outline" nativeButton={false} render={<Link to="/owner/workspaces" />}>
          <IconBuildingSkyscraper className="size-4" /> Workspaces
        </Button>
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          label="Monthly revenue (MRR)"
          value={money(data.mrr)}
          hint={`${money(data.arr)} a year · ${data.paying} paying`}
          icon={IconCash}
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
        />
        <Stat
          label="New in 30 days"
          value={data.new_30d}
          hint={data.past_due ? `${data.past_due} payment(s) past due` : "No payments past due"}
          icon={data.past_due ? IconAlertTriangle : IconUserPlus}
          tone={data.past_due ? "text-amber-600" : "text-primary"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          title="New workspaces"
          description="Signups per day, last 30 days"
          className="lg:col-span-2"
          action={
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums">
              {signups30} in 30 days
            </span>
          }
        >
          <SignupBars rows={data.signups_30d} />
        </Panel>
        <Panel title="Plans" description="Workspaces on each plan">
          <div className="space-y-4">
            {PLAN_KEYS.map((key) => {
              const count = data.by_plan[key] || 0
              const pct = Math.round((count / total) * 100)
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{PLAN_NAMES[key]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{count}</span> · {pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-linear-to-r from-[#297bff] to-[#834aff]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Across all workspaces">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Team users", data.totals.users, IconUsersGroup],
              ["Customers", data.totals.customers, IconUsers],
              ["Companies", data.totals.companies, IconBuilding],
              ["Storage", `${data.totals.storage_gb} GB`, IconDatabase],
            ].map(([label, value, Icon]) => (
              <div key={label} className="rounded-2xl bg-muted/50 p-3">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="size-3.5" /> {label}
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {Number.isFinite(value) ? value.toLocaleString("en-GB") : value}
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Trials ending this week" description="Workspaces to reach out to before their trial ends" className="lg:col-span-2">
          {data.trials_ending.length ? (
            <ul className="-mx-2 flex flex-col">
              {data.trials_ending.map((t) => {
                const days = Math.max(0, Math.ceil((new Date(String(t.trial_ends_at).replace(" ", "T")) - now) / 86_400_000))
                return (
                  <li key={t.slug}>
                    <Link to={`/owner/workspaces/${t.slug}`} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm transition-colors hover:bg-muted/60">
                      <Initials name={t.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium group-hover:text-primary">{t.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{t.owner_email}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        {days === 0 ? "Ends today" : `${days} day${days === 1 ? "" : "s"} left`}
                      </span>
                    </Link>
                  </li>
                )
              })}
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
          <Button variant="outline" nativeButton={false} render={<Link to="/owner/workspaces" />}>
            See all <IconArrowRight className="size-4" />
          </Button>
        }
      >
        {data.recent.length ? (
          <ul className="-mx-2 flex flex-col">
            {data.recent.map((w) => (
              <li key={w.slug}>
                <Link to={`/owner/workspaces/${w.slug}`} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm transition-colors hover:bg-muted/60">
                  <Initials name={w.name} />
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
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
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
