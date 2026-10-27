import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { IconAlertTriangle, IconCash, IconClockHour4, IconReceipt2 } from "@tabler/icons-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { money, ownerApi, shortDate } from "@/lib/owner"
import { LoadError, PageTitle, Panel, PlanBadge, SELECT, Stat } from "./ownerUi"

const STATE = {
  paid: ["Paid", "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"],
  due_soon: ["Due soon", "bg-amber-500/15 text-amber-800 dark:text-amber-300"],
  overdue: ["Overdue", "bg-destructive/10 text-destructive"],
  trial: ["Free trial", "bg-sky-500/10 text-sky-700 dark:text-sky-300"],
  cancelled: ["Cancelled", "bg-muted text-muted-foreground"],
  no_price: ["No price", "bg-muted text-muted-foreground"],
}

const FILTERS = [
  ["", "All"],
  ["overdue", "Overdue"],
  ["due_soon", "Due soon"],
  ["paid", "Paid"],
  ["trial", "Trial"],
]

/** The owner records a payment for one workspace: amount, periods, how it was paid. */
function PaymentForm({ workspace, methods, onDone, onCancel }) {
  const [form, setForm] = useState({ periods: "1", amount: "", method: methods[0], note: "" })
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const expected = workspace.cycle_amount * Number(form.periods || 1)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    const id = toastProcessing("Saving payment…")
    const res = await ownerApi(`/billing/${workspace.slug}/payments`, { method: "POST", body: form })
    setBusy(false)
    if (res.ok) {
      toastDone(id, res.message)
      onDone()
    } else {
      toastFail(id, res.error)
    }
  }

  return (
    <form onSubmit={save} className="grid gap-2 rounded-xl border bg-muted/30 p-3 sm:grid-cols-6">
      <select className={SELECT} value={form.periods} onChange={set("periods")} aria-label="Periods paid">
        {[1, 2, 3, 6, 12].map((n) => (
          <option key={n} value={n}>
            {n} {workspace.billing_cycle === "yearly" ? (n === 1 ? "year" : "years") : n === 1 ? "month" : "months"}
          </option>
        ))}
      </select>
      <Input inputMode="decimal" placeholder={`£${expected.toFixed(2)}`} value={form.amount} onChange={set("amount")} aria-label="Amount paid" />
      <select className={SELECT} value={form.method} onChange={set("method")} aria-label="Paid by">
        {methods.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <Input className="sm:col-span-3" placeholder="Note (e.g. bank reference)" value={form.note} onChange={set("note")} />
      <div className="flex gap-2 sm:col-span-6">
        <Button type="submit" size="sm" disabled={busy}>
          Save payment
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** Billing: every workspace's subscription (paid until, overdue) and what it owes for Finstap's services. */
export default function OwnerBilling() {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")
  const [filter, setFilter] = useState("")
  const [paying, setPaying] = useState("")

  const load = useCallback(() => {
    ownerApi("/billing").then((res) => (res.ok ? setData(res.data) : setError(res.error)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const rows = useMemo(() => {
    const order = { overdue: 0, due_soon: 1, no_price: 2, paid: 3, trial: 4, cancelled: 5 }
    return (data?.workspaces || [])
      .filter((w) => !filter || w.state === filter)
      .sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name))
  }, [data, filter])

  if (error) return <LoadError error={error} />
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  const t = data.totals

  return (
    <>
      <PageTitle
        title="Billing"
        description="Subscriptions and service charges for every workspace. Record payments here until online payment is switched on."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Monthly revenue (MRR)" value={money(t.mrr)} icon={IconCash} tone="text-emerald-600" />
        <Stat label="Collected this month" value={money(t.collected_this_month)} icon={IconReceipt2} />
        <Stat
          label="Overdue subscriptions"
          value={t.overdue}
          hint={`${money(t.overdue_amount)} due · ${t.due_soon} due in 7 days`}
          icon={IconAlertTriangle}
          tone="text-destructive"
        />
        <Stat
          label="Unpaid services"
          value={money(t.services_unpaid)}
          hint="Registered offices and invoiced KYC"
          icon={IconClockHour4}
          tone="text-amber-600"
        />
      </div>

      <div className="mt-6 mb-3 flex flex-wrap gap-1">
        {FILTERS.map(([value, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition",
              filter === value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {!rows.length && (
          <Panel>
            <p className="text-sm text-muted-foreground">No workspaces here.</p>
          </Panel>
        )}
        {rows.map((w) => {
          const [label, tone] = STATE[w.state] || [w.state, "bg-muted"]
          return (
            <div key={w.slug} className="rounded-2xl border bg-card p-4 shadow-xs">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/owner/workspaces/${w.slug}`} className="font-semibold hover:text-primary">
                      {w.name}
                    </Link>
                    <PlanBadge plan={w.plan} />
                    {w.state !== "trial" && (
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>{label}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {w.cycle_amount ? `${money(w.cycle_amount)} ${w.billing_cycle === "yearly" ? "a year" : "a month"}` : "No subscription price"}
                    {w.state === "trial" && w.trial_ends_at ? ` · trial ends ${shortDate(w.trial_ends_at)}` : ""}
                    {w.current_period_end ? ` · paid until ${shortDate(w.current_period_end)}` : ""}
                    {w.last_payment ? ` · last paid ${money(w.last_payment.amount)} on ${shortDate(w.last_payment.created_at)}` : ""}
                  </p>
                  {w.services_unpaid > 0 && (
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                      Services unpaid: {money(w.services_unpaid)}
                      {w.ro_unpaid ? ` (registered office ${money(w.ro_unpaid)}` : " ("}
                      {w.ro_unpaid && w.kyc_unpaid ? ", " : ""}
                      {w.kyc_unpaid ? `KYC ${money(w.kyc_unpaid)}` : ""})
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {w.subscription_due > 0 && <span className="text-sm font-semibold text-destructive">{money(w.subscription_due)} due</span>}
                  {!["trial", "no_price"].includes(w.state) && paying !== w.slug && (
                    <Button size="sm" variant={w.state === "overdue" ? "default" : "outline"} onClick={() => setPaying(w.slug)}>
                      Record payment
                    </Button>
                  )}
                  {w.ro_unpaid > 0 && (
                    <Link to="/owner/registered-office" className="text-sm font-medium text-primary hover:underline">
                      Registered office
                    </Link>
                  )}
                  {w.kyc_unpaid > 0 && (
                    <Link to="/owner/kyc" className="text-sm font-medium text-primary hover:underline">
                      KYC
                    </Link>
                  )}
                </div>
              </div>
              {paying === w.slug && (
                <div className="mt-3">
                  <PaymentForm
                    workspace={w}
                    methods={data.methods}
                    onCancel={() => setPaying("")}
                    onDone={() => {
                      setPaying("")
                      load()
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Panel title="Recent payments" className="mt-6">
        {data.payments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2.5 pr-4 font-semibold">Date</th>
                  <th className="px-3 py-2.5 font-semibold">Workspace</th>
                  <th className="px-3 py-2.5 font-semibold">Period</th>
                  <th className="px-3 py-2.5 font-semibold">Paid by</th>
                  <th className="py-2.5 pl-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 text-muted-foreground">{shortDate(p.created_at)}</td>
                    <td className="px-3 py-2.5">{p.tenant_slug}</td>
                    <td className="px-3 py-2.5">
                      {shortDate(p.period_start)} – {shortDate(p.period_end)}
                    </td>
                    <td className="px-3 py-2.5">
                      {p.method}
                      {p.note && <div className="text-xs text-muted-foreground">{p.note}</div>}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-medium tabular-nums">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        )}
      </Panel>
    </>
  )
}
