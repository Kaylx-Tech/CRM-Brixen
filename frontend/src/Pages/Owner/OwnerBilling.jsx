import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { IconAlertTriangle, IconCash, IconClockHour4, IconId, IconMapPin, IconReceipt2, IconWallet, IconCheck, IconSearch } from "@tabler/icons-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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

const PAGE_SIZE = 25

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
  const [search, setSearch] = useState("")
  const [plan, setPlan] = useState("")
  const [view, setView] = useState("")
  const [sort, setSort] = useState("attention")
  const [page, setPage] = useState(0)
  const [openSlug, setOpenSlug] = useState("")

  const load = useCallback(() => {
    ownerApi("/billing").then((res) => (res.ok ? setData(res.data) : setError(res.error)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const plans = useMemo(() => [...new Set((data?.workspaces || []).map((w) => w.plan).filter(Boolean))].sort(), [data])
  const rows = useMemo(() => {
    const order = { overdue: 0, due_soon: 1, no_price: 2, paid: 3, trial: 4, cancelled: 5 }
    const q = search.trim().toLowerCase()
    const list = (data?.workspaces || []).filter((w) => {
      if (filter && w.state !== filter) return false
      if (plan && w.plan !== plan) return false
      if (view === "services" && !(w.services_unpaid > 0)) return false
      if (view === "subscription" && !(w.subscription_due > 0)) return false
      if (view === "balance" && !(w.balance > 0)) return false
      return !q || [w.name, w.slug, w.owner_email, w.plan].some((v) => String(v || "").toLowerCase().includes(q))
    })
    const by = {
      attention: (a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      due: (a, b) => (b.subscription_due || 0) + (b.services_unpaid || 0) - (a.subscription_due || 0) - (a.services_unpaid || 0),
      balance: (a, b) => (b.balance || 0) - (a.balance || 0),
      paid_until: (a, b) => String(a.current_period_end || "9999").localeCompare(String(b.current_period_end || "9999")),
    }
    return list.sort(by[sort] || by.attention)
  }, [data, filter, plan, view, search, sort])
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const reset = (fn) => (e) => {
    fn(e?.target ? e.target.value : e)
    setPage(0)
  }

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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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

      {/* Built for many workspaces: search, filters, sorting and pages; "Manage" opens payments and top-ups */}
      <div className="mt-8 mb-3 flex flex-col gap-3">
        <FilterTabs value={filter} onChange={reset(setFilter)} options={FILTERS} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search workspace name, web address or owner email…" value={search} onChange={reset(setSearch)} aria-label="Search workspaces" />
          </div>
          <select className={cn(SELECT, "sm:w-40 sm:shrink-0")} value={plan} onChange={reset(setPlan)} aria-label="Plan">
            <option value="">All plans</option>
            {plans.map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
          <select className={cn(SELECT, "sm:w-48 sm:shrink-0")} value={view} onChange={reset(setView)} aria-label="Show">
            <option value="">Everything</option>
            <option value="subscription">Subscription due</option>
            <option value="services">Services unpaid</option>
            <option value="balance">Has balance</option>
          </select>
          <select className={cn(SELECT, "sm:w-44 sm:shrink-0")} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="attention">Needs attention first</option>
            <option value="due">Most owed</option>
            <option value="paid_until">Paid until (soonest)</option>
            <option value="balance">Highest balance</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      {!rows.length ? (
        <Panel>
          <p className="text-sm text-muted-foreground">{search || plan || view ? "No matches. Try another search or filter." : "No workspaces here."}</p>
        </Panel>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Paid until</TableHead>
                <TableHead className="text-right">Subscription due</TableHead>
                <TableHead className="text-right">Services unpaid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((w) => {
                const [label, tone] = STATE[w.state] || [w.state, "bg-muted"]
                const opened = openSlug === w.slug
                return (
                  <Fragment key={w.slug}>
                    <TableRow className={cn(opened && "bg-muted/40")}>
                      <TableCell className="md:max-w-56">
                        <Link to={`/owner/workspaces/${w.slug}`} className="block font-semibold hover:text-primary md:truncate">{w.name}</Link>
                        <span className="block text-xs text-muted-foreground">{w.slug}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <PlanBadge plan={w.plan} />
                          {w.state !== "trial" && (
                            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>{label}</span>
                          )}
                        </div>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {w.cycle_amount ? `${money(w.cycle_amount)} ${w.billing_cycle === "yearly" ? "a year" : "a month"}` : "No price"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {w.state === "trial" && w.trial_ends_at ? `Trial ends ${shortDate(w.trial_ends_at)}` : w.current_period_end ? shortDate(w.current_period_end) : "—"}
                      </TableCell>
                      <TableCell className={cn("whitespace-nowrap text-right tabular-nums", w.subscription_due > 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>
                        {w.subscription_due > 0 ? money(w.subscription_due) : "—"}
                      </TableCell>
                      <TableCell className={cn("whitespace-nowrap text-right tabular-nums", w.services_unpaid > 0 ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                        {w.services_unpaid > 0 ? money(w.services_unpaid) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{money(w.balance)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant={opened ? "default" : "outline"} onClick={() => setOpenSlug(opened ? "" : w.slug)}>
                          {opened ? "Close" : "Manage"}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {opened && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={7} className="space-y-3">
                          <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                            <p>{w.last_payment ? `Last paid ${money(w.last_payment.amount)} on ${shortDate(w.last_payment.created_at)}` : "No payment recorded yet"}</p>
                            {w.services_unpaid > 0 && (
                              <p>
                                Services: {w.ro_unpaid ? `registered office ${money(w.ro_unpaid)}` : ""}
                                {w.ro_unpaid && w.kyc_unpaid ? ", " : ""}
                                {w.kyc_unpaid ? `KYC ${money(w.kyc_unpaid)}` : ""}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {!["trial", "no_price"].includes(w.state) && paying !== w.slug && (
                              <Button variant={w.state === "overdue" ? "default" : "outline"} onClick={() => { setPaying(w.slug); setTopping("") }}>
                                <IconCash className="size-4" /> Record payment
                              </Button>
                            )}
                            {topping !== w.slug && (
                              <Button variant="outline" onClick={() => { setTopping(w.slug); setPaying("") }}>
                                <IconWallet className="size-4" /> Top up balance
                              </Button>
                            )}
                            {w.ro_unpaid > 0 && (
                              <Button variant="outline" nativeButton={false} render={<Link to="/owner/registered-office" />}>
                                <IconMapPin className="size-4" /> Registered office
                              </Button>
                            )}
                            {w.kyc_unpaid > 0 && (
                              <Button variant="outline" nativeButton={false} render={<Link to="/owner/kyc" />}>
                                <IconId className="size-4" /> KYC
                              </Button>
                            )}
                          </div>
                          {topping === w.slug && (
                            <TopUpForm workspace={w} onCancel={() => setTopping("")} onDone={() => { setTopping(""); load() }} />
                          )}
                          {paying === w.slug && (
                            <PaymentForm workspace={w} methods={data.methods} onCancel={() => setPaying("")} onDone={() => { setPaying(""); load() }} />
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {rows.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= rows.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Panel title="Recent payments" className="mt-6">
        {data.payments.length ? (
          <div className="overflow-x-auto">
            <Table className="w-full md:min-w-[640px] text-left text-sm">
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
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        )}
      </Panel>
    </>
  )
}
