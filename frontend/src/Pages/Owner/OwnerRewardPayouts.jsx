import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { IconCash } from "@tabler/icons-react"
import { ownerApi } from "@/lib/owner"
import { formatGBP } from "@/lib/money"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { Button, Empty, FilterTabs, LoadError, PageTitle, Panel } from "./ownerUi"

function month(period) {
  const d = new Date(`${period}-01T00:00:00`)
  return Number.isNaN(d.getTime()) ? period : d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}

function day(value) {
  const d = new Date(String(value || "").replace(" ", "T") + "Z")
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** Partner Perks reward payouts: from the 5th of each month, each workspace's rewards left after its due
 *  services were paid. Finstap pays them and marks them paid (the amount leaves the workspace's balance). */
export default function OwnerRewardPayouts() {
  const [rows, setRows] = useState(null)
  const [day5, setDay5] = useState(5)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("Due")

  const load = useCallback(() => {
    ownerApi(`/reward-payouts?status=${encodeURIComponent(status)}`).then((res) => {
      if (res.ok) {
        setRows(res.data.payouts)
        setDay5(res.data.payout_day || 5)
      } else {
        setError(res.error)
      }
    })
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  const pay = async (p) => {
    if (!window.confirm(`Mark ${formatGBP(p.amount)} for ${p.workspace_name || p.tenant_slug} (${month(p.period)}) as paid?`)) return
    const id = toastProcessing("Saving…")
    const res = await ownerApi(`/reward-payouts/${p.id}/paid`, { method: "POST", body: {} })
    if (res.ok) {
      toastDone(id, res.message)
      load()
    } else {
      toastFail(id, res.error)
    }
  }

  const total = (rows || []).filter((p) => p.status === "Due").reduce((s, p) => s + Number(p.amount || 0), 0)

  return (
    <>
      <PageTitle
        title="Reward payouts"
        description={`On the ${day5}th of every month each workspace's due services are paid from its balance first; the Partner Perks rewards left become a payout here. Pay it, then mark it paid.`}
      />
      <LoadError error={error} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs value={status} onChange={setStatus} options={[["Due", "To pay"], ["Paid", "Paid"], ["", "All"]]} />
        {status === "Due" && rows?.length ? (
          <p className="text-sm text-muted-foreground">To pay: <span className="font-semibold text-foreground">{formatGBP(total)}</span></p>
        ) : null}
      </div>
      <Panel>
        {rows === null && !error ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !rows?.length ? (
          <Empty icon={IconCash} title={status === "Due" ? "Nothing to pay" : "No payouts yet"}>
            Payouts appear from the {day5}th of the month for workspaces with eligible rewards.
          </Empty>
        ) : (
          <ul className="divide-y text-sm">
            {rows.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <Link to={`/owner/workspaces/${p.tenant_slug}`} className="font-medium text-primary hover:underline">
                    {p.workspace_name || p.tenant_slug}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {month(p.period)} · balance now {formatGBP(p.balance)}
                    {p.status === "Paid" ? ` · paid ${formatGBP(p.paid_amount)} on ${day(p.paid_at)} by ${p.paid_by}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-base font-semibold tabular-nums">{formatGBP(p.amount)}</span>
                  {p.status === "Due" ? (
                    <Button size="sm" onClick={() => pay(p)}>Mark paid</Button>
                  ) : (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Paid</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
