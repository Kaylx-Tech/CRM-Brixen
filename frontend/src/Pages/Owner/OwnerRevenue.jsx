import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { IconCash, IconCreditCard, IconId, IconMapPin } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { money, ownerApi } from "@/lib/owner"
import { LoadError, Panel, Stat } from "./ownerUi"

function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}

function monthName(period) {
  const [y, m] = String(period).split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
}

const SOURCES = [
  ["subscriptions", "Subscriptions", "bg-indigo-500"],
  ["kyc", "KYC checks", "bg-cyan-500"],
  ["registered_office", "Registered office", "bg-violet-500"],
]

/** Billing › Revenue: what Finstap earned in a month (paid only), by source and by workspace, and the last 12 months. */
export default function OwnerRevenue() {
  const [period, setPeriod] = useState(thisMonth())
  const [data, setData] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    ownerApi(`/billing/revenue?period=${period}`).then((res) => (res.ok ? setData(res.data) : setError(res.error)))
  }, [period])

  if (error) return <LoadError error={error} />
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  const t = data.totals
  const peak = Math.max(1, ...data.trend.map((m) => m.total))

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Money received (paid only), by the month it was paid.</p>
        <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value || thisMonth())} className="w-44" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={`Revenue · ${monthName(data.period)}`} value={money(t.total)} icon={IconCash} tone="text-emerald-600" />
        <Stat label="Subscriptions" value={money(t.subscriptions)} icon={IconCreditCard} />
        <Stat label="KYC checks" value={money(t.kyc)} icon={IconId} tone="text-cyan-600" />
        <Stat label="Registered office" value={money(t.registered_office)} icon={IconMapPin} tone="text-violet-600" />
      </div>

      <Panel title="Last 12 months" className="mt-6">
        <div className="flex h-44 items-end gap-1.5 sm:gap-2">
          {data.trend.map((m) => (
            <button
              key={m.period}
              type="button"
              onClick={() => setPeriod(m.period)}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              title={`${monthName(m.period)}: ${money(m.total)}`}
            >
              <div className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-md bg-muted/60" style={{ height: `${Math.max(2, (m.total / peak) * 100)}%` }}>
                {SOURCES.map(([key, , color]) =>
                  m[key] ? <div key={key} className={color} style={{ height: `${(m[key] / m.total) * 100}%` }} /> : null,
                )}
              </div>
              <span className={`text-[11px] ${m.period === data.period ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {monthName(m.period).split(" ")[0]}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {SOURCES.map(([key, label, color]) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className={`size-2.5 rounded-sm ${color}`} /> {label}
            </span>
          ))}
        </div>
      </Panel>

      <Panel title={`By workspace · ${monthName(data.period)}`} className="mt-6">
        {data.workspaces.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead className="text-right">Subscriptions</TableHead>
                  <TableHead className="text-right">KYC checks</TableHead>
                  <TableHead className="text-right">Registered office</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.workspaces.map((w) => (
                  <TableRow key={w.slug}>
                    <TableCell>
                      <Link to={`/owner/workspaces/${w.slug}`} className="font-medium hover:text-primary">
                        {w.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{w.subscriptions ? money(w.subscriptions) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{w.kyc ? money(w.kyc) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{w.registered_office ? money(w.registered_office) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{money(w.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No money received in {monthName(data.period)}.</p>
        )}
      </Panel>
    </>
  )
}
