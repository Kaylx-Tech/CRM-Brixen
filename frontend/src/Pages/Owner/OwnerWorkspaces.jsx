import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { IconSearch } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { money, ownerApi, shortDate } from "@/lib/owner"
import { LoadError, PageTitle, PlanBadge, SELECT, StatusBadge } from "./ownerUi"

const PLAN_FILTERS = [
  ["", "All plans"],
  ["trial", "Free trial"],
  ["starter", "Starter"],
  ["pro", "Pro"],
  ["business", "Business"],
  ["enterprise", "Enterprise"],
]

function usedOf(usage, limits, key) {
  const used = usage?.[key] ?? 0
  const limit = limits?.[key]
  return limit === null || limit === undefined ? `${used}` : `${used} / ${limit}`
}

export default function OwnerWorkspaces() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [plan, setPlan] = useState("")
  const [status, setStatus] = useState("")

  useEffect(() => {
    ownerApi("/workspaces").then((res) => (res.ok ? setRows(res.data.workspaces) : setError(res.error)))
  }, [])

  // Filtering happens here, so typing stays instant
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows || []).filter(
      (w) =>
        (!plan || w.plan === plan) &&
        (!status || w.status === status) &&
        (!q || [w.name, w.slug, w.owner_name, w.owner_email].join(" ").toLowerCase().includes(q)),
    )
  }, [rows, search, plan, status])

  return (
    <>
      <PageTitle title="Workspaces" description="Every company using Finstap, its plan and what it uses." />
      <LoadError error={error} />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by company, address or owner"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className={SELECT} value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan">
          {PLAN_FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select className={SELECT} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Failed">Failed</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-xs">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Workspace</th>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Users</th>
              <th className="px-4 py-3 font-semibold">Customers</th>
              <th className="px-4 py-3 font-semibold">Companies</th>
              <th className="px-4 py-3 text-right font-semibold">Pays / month</th>
              <th className="px-4 py-3 font-semibold">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && !error && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {rows !== null && !shown.length && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No workspaces match.
                </td>
              </tr>
            )}
            {shown.map((w) => (
              <tr
                key={w.slug}
                onClick={() => navigate(`/owner/workspaces/${w.slug}`)}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/owner/workspaces/${w.slug}`}
                    className="font-medium hover:text-primary"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {w.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{w.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-[200px] truncate">{w.owner_name}</div>
                  <div className="max-w-[200px] truncate text-xs text-muted-foreground">{w.owner_email}</div>
                </td>
                <td className="px-4 py-3">
                  <PlanBadge plan={w.plan} />
                  {w.plan === "trial" && w.trial_ends_at && (
                    <div className="mt-1 text-xs text-muted-foreground">ends {shortDate(w.trial_ends_at)}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge workspace={w} />
                </td>
                <td className="px-4 py-3 tabular-nums">{usedOf(w.usage, w.limits, "users")}</td>
                <td className="px-4 py-3 tabular-nums">{usedOf(w.usage, w.limits, "customers")}</td>
                <td className="px-4 py-3 tabular-nums">{usedOf(w.usage, w.limits, "companies")}</td>
                <td className="px-4 py-3 text-right tabular-nums">{w.monthly_value ? money(w.monthly_value) : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{shortDate(w.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
