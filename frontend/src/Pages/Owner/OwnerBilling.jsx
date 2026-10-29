import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { IconAlertTriangle, IconCash, IconClockHour4, IconId, IconMapPin, IconReceipt2, IconWallet, IconCheck } from "@tabler/icons-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { checkField } from "@/lib/validation"
import { FieldMessage } from "@/components/FormField"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { money, ownerApi, shortDate } from "@/lib/owner"
import { Button, FilterTabs, LoadError, PageTitle, Panel, PlanBadge, SELECT, Stat } from "./ownerUi"

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
  const [amountError, setAmountError] = useState("")
  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    if (key === "amount") setAmountError("")
  }
  const expected = workspace.cycle_amount * Number(form.periods || 1)

  const save = async (e) => {
    e.preventDefault()
    const msg = checkField(form.amount, { label: "Amount paid", required: true, type: "amount", min: 0.01 })
    setAmountError(msg)
    if (msg) return
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
      <div>
        <Input inputMode="decimal" placeholder={`£${expected.toFixed(2)}`} value={form.amount} onChange={set("amount")} aria-label="Amount paid" aria-invalid={amountError ? true : undefined} />
        <FieldMessage message={amountError} />
      </div>
      <select className={SELECT} value={form.method} onChange={set("method")} aria-label="Paid by">
        {methods.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <Input className="sm:col-span-3" placeholder="Note (e.g. bank reference)" value={form.note} onChange={set("note")} />
      <div className="flex gap-2 sm:col-span-6">
        <Button type="submit" size="lg" disabled={busy}>
          Save payment
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** The owner records a bank transfer a workspace sent to top up its balance (due services are paid from it). */
function TopUpForm({ workspace, onDone, onCancel }) {
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    const msg = checkField(amount, { label: "Amount received", required: true, type: "amount", min: 0.01 })
    setError(msg)
    if (msg) return
    setBusy(true)
    const id = toastProcessing("Adding to balance…")
    const res = await ownerApi(`/billing/${workspace.slug}/wallet`, { method: "POST", body: { amount, note } })
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
      <div className="sm:col-span-2">
        <Input inputMode="decimal" placeholder="Amount received (£)" value={amount} onChange={(e) => { setAmount(e.target.value); setError("") }} aria-label="Amount received" aria-invalid={error ? true : undefined} />
        <FieldMessage message={error} />
      </div>
      <Input className="sm:col-span-4" placeholder={`Note (e.g. bank reference FINSTAP-${workspace.slug.toUpperCase()})`} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex gap-2 sm:col-span-6">
        <Button type="submit" size="lg" disabled={busy}>
          Add to balance
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

/** Bank transfers workspaces say they sent: approve when the money arrived (balance goes up) or reject with a reason. */
function TopUpRequests({ onChange }) {
  const [rows, setRows] = useState(null)
  const [amounts, setAmounts] = useState({})
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(null)

  const load = useCallback(() => {
    ownerApi("/billing/topups?status=Pending").then((res) => res.ok && setRows(res.data.requests || []))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const decide = async (r, action) => {
    setBusy(r.id)
    const id = toastProcessing(action === "approve" ? "Approving…" : "Rejecting…")
    const body = action === "approve" ? { amount: amounts[r.id] ?? "" } : { reason }
    const res = await ownerApi(`/billing/topups/${r.id}/${action}`, { method: "POST", body })
    setBusy(null)
    if (res.ok) {
      toastDone(id, res.message)
      setRejecting(null)
      setReason("")
      load()
      onChange()
    } else {
      toastFail(id, res.error)
    }
  }

  if (!rows?.length) return null
  return (
    <Panel title={`Top-up requests to check (${rows.length})`} className="mb-6">
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-semibold">
                  {r.workspace_name || r.tenant_slug} · {money(r.amount)} by bank transfer
                </p>
                <p className="text-muted-foreground">
                  Reference {r.reference || "—"} · {r.requested_by || "workspace"} · {shortDate(r.created_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="w-32"
                  inputMode="decimal"
                  placeholder={`Received £${Number(r.amount).toFixed(2)}`}
                  value={amounts[r.id] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [r.id]: e.target.value }))}
                  aria-label="Amount received"
                />
                <Button size="lg" disabled={busy === r.id} onClick={() => decide(r, "approve")}>
                  <IconCheck className="size-4" /> Approve
                </Button>
                <Button size="lg" variant="ghost" onClick={() => setRejecting(rejecting === r.id ? null : r.id)}>
                  Reject
                </Button>
              </div>
            </div>
            {rejecting === r.id && (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input placeholder="Why (the workspace sees this), e.g. Not received yet" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button size="lg" variant="outline" disabled={busy === r.id || !reason.trim()} onClick={() => decide(r, "reject")}>
                  Reject request
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )
}

/** Billing: every workspace's subscription (paid until, overdue) and what it owes for Finstap's services. */
export default function OwnerBilling() {
  const [data, setData] = useState(null)
  const [error, setError] = useState("")
  const [filter, setFilter] = useState("")
  const [paying, setPaying] = useState("")
  const [topping, setTopping] = useState("")

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
      <TopUpRequests onChange={load} />
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

      <FilterTabs value={filter} onChange={setFilter} options={FILTERS} className="mt-8 mb-4" />

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
                  <p className="mt-1 text-sm text-muted-foreground">Balance: {money(w.balance)}</p>
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
                  {w.ro_unpaid > 0 && (
                    <Button variant="outline" size="lg" nativeButton={false} render={<Link to="/owner/registered-office" />}>
                      <IconMapPin className="size-4" /> Registered office
                    </Button>
                  )}
                  {w.kyc_unpaid > 0 && (
                    <Button variant="outline" size="lg" nativeButton={false} render={<Link to="/owner/kyc" />}>
                      <IconId className="size-4" /> KYC
                    </Button>
                  )}
                  {topping !== w.slug && (
                    <Button size="lg" variant="outline" onClick={() => setTopping(w.slug)}>
                      <IconWallet className="size-4" /> Top up balance
                    </Button>
                  )}
                  {!["trial", "no_price"].includes(w.state) && paying !== w.slug && (
                    <Button size="lg" variant={w.state === "overdue" ? "default" : "outline"} onClick={() => setPaying(w.slug)}>
                      <IconCash className="size-4" /> Record payment
                    </Button>
                  )}
                </div>
              </div>
              {topping === w.slug && (
                <div className="mt-3">
                  <TopUpForm
                    workspace={w}
                    onCancel={() => setTopping("")}
                    onDone={() => {
                      setTopping("")
                      load()
                    }}
                  />
                </div>
              )}
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
