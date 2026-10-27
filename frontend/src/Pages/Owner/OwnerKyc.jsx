import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { IconCash, IconCircleCheck, IconCircleX, IconClockHour4, IconId } from "@tabler/icons-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { toastDone, toastFail } from "@/lib/toastActions"
import { money, ownerApi, shortDate } from "@/lib/owner"
import { Button, LoadError, PageTitle, Panel, SELECT, Stat } from "./ownerUi"
import { useServiceSettings } from "./useServiceSettings"

function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}

function checkTone(status) {
  if (status === "Approved") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  if (["Declined", "Abandoned", "Expired", "Kyc Expired"].includes(status)) return "bg-destructive/10 text-destructive"
  return "bg-amber-500/15 text-amber-800 dark:text-amber-300"
}

/** The price a workspace pays for one ID check (remounted with the saved settings). */
function PriceForm({ settings, save, saving, onSaved }) {
  const [price, setPrice] = useState(settings.kyc_price ?? "")
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        save({ kyc_price: price }).then((ok) => ok && onSaved())
      }}
    >
      <span className="text-sm text-muted-foreground">£</span>
      <Input className="w-32" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
      <Button type="submit" disabled={saving}>
        Save price
      </Button>
      {!settings.kyc_price && (
        <span className="text-sm text-amber-700 dark:text-amber-300">No price set yet: checks count as £0.</span>
      )}
    </form>
  )
}

/** KYC verification: every ID check a workspace ran on Finstap's Didit account, and what to charge. */
export default function OwnerKyc() {
  const { settings, save, saving } = useServiceSettings()
  const [period, setPeriod] = useState(thisMonth())
  const [workspace, setWorkspace] = useState("")
  const [data, setData] = useState(null)
  const [error, setError] = useState("")

  const load = useCallback(() => {
    ownerApi(`/kyc?period=${period}`).then((res) => (res.ok ? setData(res.data) : setError(res.error)))
  }, [period])

  useEffect(() => {
    load()
  }, [load])

  const setBilling = async (slug, status) => {
    const res = await ownerApi("/kyc/billing", { method: "POST", body: { slug, period, status } })
    if (res.ok) {
      toastDone(undefined, res.message)
      load()
    } else {
      toastFail(undefined, res.error)
    }
  }

  const checks = useMemo(
    () => (data?.checks || []).filter((c) => !workspace || c.workspace === workspace),
    [data, workspace],
  )

  return (
    <>
      <PageTitle
        title="KYC verification"
        description="ID checks your workspaces run on Finstap's Didit account. Each started check is charged to the workspace."
      >
        <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value || thisMonth())} className="w-44" />
      </PageTitle>
      <LoadError error={error} />

      <Panel
        title="Price per check"
        description="What a workspace pays Finstap for one ID check (excl. VAT). Changes apply to the months you look at from now on."
        className="mb-4"
      >
        {settings ? (
          <PriceForm key={settings.kyc_price ?? ""} settings={settings} save={save} saving={saving} onSaved={load} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </Panel>

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Checks this month" value={data.totals.checks} icon={IconId} />
            <Stat label="Approved" value={data.totals.approved} icon={IconCircleCheck} tone="text-emerald-600" />
            <Stat label="Declined" value={data.totals.declined} icon={IconCircleX} tone="text-destructive" />
            <Stat label="In progress" value={data.totals.pending} icon={IconClockHour4} tone="text-amber-600" />
            <Stat
              label="To charge"
              value={money(data.totals.amount)}
              hint={`${money(data.totals.paid)} paid · ${money(data.price)} a check`}
              icon={IconCash}
              tone="text-emerald-600"
            />
          </div>

          <Panel title="By workspace" description="Mark each month as invoiced, then paid." className="mt-4">
            {data.workspaces.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2.5 pr-4 font-semibold">Workspace</th>
                      <th className="px-3 py-2.5 font-semibold">Checks</th>
                      <th className="px-3 py-2.5 font-semibold">Approved</th>
                      <th className="px-3 py-2.5 font-semibold">Declined</th>
                      <th className="px-3 py-2.5 font-semibold">In progress</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                      <th className="py-2.5 pl-3 font-semibold">Billing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.workspaces.map((w) => (
                      <tr key={w.slug} className="border-b last:border-0">
                        <td className="py-2.5 pr-4">
                          <Link to={`/owner/workspaces/${w.slug}`} className="font-medium hover:text-primary">
                            {w.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{w.owner_email}</div>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums font-medium">{w.checks}</td>
                        <td className="px-3 py-2.5 tabular-nums">{w.approved}</td>
                        <td className="px-3 py-2.5 tabular-nums">{w.declined}</td>
                        <td className="px-3 py-2.5 tabular-nums">{w.pending}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {money(w.amount)}
                          {w.billing_status && w.billed_amount !== w.amount && (
                            <div className="text-xs text-muted-foreground">billed {money(w.billed_amount)}</div>
                          )}
                        </td>
                        <td className="py-2.5 pl-3">
                          <select
                            className={cn(SELECT, "w-36")}
                            value={w.billing_status}
                            onChange={(e) => setBilling(w.slug, e.target.value)}
                            aria-label={`Billing for ${w.name}`}
                          >
                            <option value="">Not billed</option>
                            <option value="invoiced">Invoiced</option>
                            <option value="paid">Paid</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No ID checks were started this month.</p>
            )}
          </Panel>

          <Panel
            title="Checks"
            description="Status only. ID photos and documents stay in the workspace and at Didit."
            className="mt-4"
            action={
              <select className={cn(SELECT, "w-48")} value={workspace} onChange={(e) => setWorkspace(e.target.value)} aria-label="Workspace">
                <option value="">All workspaces</option>
                {data.workspaces.map((w) => (
                  <option key={w.slug} value={w.slug}>
                    {w.name}
                  </option>
                ))}
              </select>
            }
          >
            {checks.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2.5 pr-4 font-semibold">Date</th>
                      <th className="px-3 py-2.5 font-semibold">Workspace</th>
                      <th className="px-3 py-2.5 font-semibold">Person</th>
                      <th className="px-3 py-2.5 font-semibold">Order</th>
                      <th className="px-3 py-2.5 font-semibold">Result</th>
                      <th className="py-2.5 pl-3 font-semibold">CH personal code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((c) => (
                      <tr key={`${c.workspace}-${c.id}`} className="border-b last:border-0">
                        <td className="py-2.5 pr-4 text-muted-foreground">{shortDate(c.created_at)}</td>
                        <td className="px-3 py-2.5">{c.workspace_name}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{c.full_name}</div>
                          <div className="text-xs text-muted-foreground">{c.person_role}</div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{c.order_number || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", checkTone(c.status))}>
                            {c.status}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3">{c.ch_personal_code ? "Saved" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No checks to show.</p>
            )}
          </Panel>
        </>
      )}
    </>
  )
}
