import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { IconChevronRight, IconCircleCheck, IconCircleX, IconClockHour4, IconId, IconSearch } from "@tabler/icons-react"
import { cn } from "cn"
import { Table } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { kycApi, shortDate } from "@/lib/owner"
import { Empty, FilterTabs, LoadError, PageTitle, Panel, SELECT, Stat } from "../Owner/ownerUi"
import { PILL, kycBucket, kycLabel } from "./kycStatus"

function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}

/** The KYC team's list: every workspace's ID checks for one month; open one to review it. */
export default function KycDesk() {
  // Filters live in the address, so coming back from a check keeps them
  const [params, setParams] = useSearchParams()
  const period = params.get("month") || thisMonth()
  const workspace = params.get("workspace") || ""
  const filter = params.get("show") || ""
  const [search, setSearch] = useState("")
  const [data, setData] = useState(null)
  const [error, setError] = useState("")

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const load = useCallback(() => {
    kycApi(`/desk/checks?period=${period}`).then((res) => {
      setError(res.ok ? "" : res.error)
      if (res.ok) setData(res.data)
    })
  }, [period])

  useEffect(() => {
    load()
  }, [load])

  const checks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.checks || []).filter((c) => {
      if (workspace && c.workspace !== workspace) return false
      if (filter && kycBucket(c.status) !== filter) return false
      if (!q) return true
      return [c.full_name, c.client_name, c.email, c.client_email, c.phone, c.order_number, c.workspace_name]
        .some((v) => String(v || "").toLowerCase().includes(q))
    })
  }, [data, workspace, filter, search])

  return (
    <>
      <PageTitle title="KYC checks" description="ID checks from every Finstap workspace. Open one to see the documents and set its status.">
        <Input
          type="month"
          value={period}
          onChange={(e) => setParam("month", e.target.value)}
          className="w-44"
          aria-label="Month"
        />
      </PageTitle>
      <LoadError error={error} />

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label="Checks this month" value={data.totals.checks} icon={IconId} />
            <Stat label="To review / in progress" value={data.totals.pending} icon={IconClockHour4} tone="text-amber-600" />
            <Stat label="Approved" value={data.totals.approved} icon={IconCircleCheck} tone="text-emerald-600" />
            <Stat label="Rejected" value={data.totals.declined} icon={IconCircleX} tone="text-destructive" />
          </div>

          <Panel
            className="mt-4"
            title="Checks"
            action={
              <select
                className={cn(SELECT, "w-52")}
                value={workspace}
                onChange={(e) => setParam("workspace", e.target.value)}
                aria-label="Workspace"
              >
                <option value="">All workspaces</option>
                {data.workspaces.map((w) => (
                  <option key={w.slug} value={w.slug}>
                    {w.name}
                  </option>
                ))}
              </select>
            }
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <FilterTabs
                value={filter}
                onChange={(v) => setParam("show", v)}
                options={[
                  ["", "All"],
                  ["pending", "To review"],
                  ["approved", "Approved"],
                  ["rejected", "Rejected"],
                ]}
              />
              <div className="relative sm:w-72">
                <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search name, email, phone, order…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {checks.length ? (
              <div className="overflow-x-auto">
                <Table className="w-full md:min-w-[900px] text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Person</th>
                      <th className="px-3 py-2.5 font-semibold">Workspace · order</th>
                      <th className="px-3 py-2.5 font-semibold">Product</th>
                      <th className="px-3 py-2.5 font-semibold">Started</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold">Reviewed</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((c) => {
                      const [label, tone] = kycLabel(c.status)
                      const to = `/kyc/checks/${c.workspace}/${c.id}`
                      return (
                        <tr key={`${c.workspace}-${c.id}`} className="border-b align-top last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-3">
                            <Link to={to} className="font-semibold uppercase hover:text-primary">
                              {c.full_name}
                            </Link>
                            <div className="text-xs text-muted-foreground">{c.email || c.client_email || "—"}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div>{c.workspace_name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{c.order_number || "No order"}</div>
                          </td>
                          <td className="px-3 py-3">{c.service_name || "—"}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">{shortDate(c.created_at)}</td>
                          <td className="px-3 py-3">
                            <span className={cn(PILL, tone)}>{label}</span>
                            {c.reason && kycBucket(c.status) === "rejected" && (
                              <div className="mt-1 line-clamp-2 max-w-56 text-xs text-destructive">{c.reason}</div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {c.reviewed_by ? (
                              <>
                                <div className="text-foreground">{c.reviewed_by}</div>
                                {shortDate(c.reviewed_at)}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Link
                              to={to}
                              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                            >
                              Open <IconChevronRight className="size-4" />
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              </div>
            ) : (
              <Empty icon={IconId} title="No checks to show">
                Try another month, workspace or filter.
              </Empty>
            )}
          </Panel>
        </>
      )}
    </>
  )
}
