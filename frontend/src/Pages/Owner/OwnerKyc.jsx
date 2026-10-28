import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  IconCash,
  IconCircleCheck,
  IconCircleX,
  IconClockHour4,
  IconCopy,
  IconId,
  IconRefresh,
  IconSearch,
  IconX,
} from "@tabler/icons-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { money, ownerApi, shortDate } from "@/lib/owner"
import { Button, FilterTabs, LoadError, PageTitle, Panel, SELECT, Stat } from "./ownerUi"
import { useServiceSettings } from "./useServiceSettings"

function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}

const PILL = "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"
const GREEN = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
const RED = "bg-destructive/10 text-destructive"
const AMBER = "bg-amber-500/15 text-amber-800 dark:text-amber-300"
const SKY = "bg-sky-500/10 text-sky-700 dark:text-sky-300"
const GREY = "bg-muted text-muted-foreground"

const REJECTED = ["Declined", "Abandoned", "Expired", "Kyc Expired"]

// Didit's status in the words the team uses: KYC Approved, Under Review, Rejected …
function kycLabel(status) {
  if (status === "Approved") return ["KYC Approved", GREEN]
  if (status === "Declined") return ["Rejected", RED]
  if (["Abandoned", "Expired", "Kyc Expired"].includes(status)) return [`Rejected (${status.toLowerCase()})`, RED]
  if (["In Review", "Resubmitted"].includes(status)) return ["Under Review", AMBER]
  if (status === "In Progress") return ["In progress", SKY]
  return ["Waiting for client", GREY]
}

function paymentTone(status) {
  if (status === "Paid") return GREEN
  if (status === "Unpaid" || status === "Partly paid") return AMBER
  return GREY
}

function orderTone(status) {
  const s = String(status || "")
  if (s === "Completed") return GREEN
  if (["Cancelled", "Refunded"].includes(s)) return RED
  if (["In Progress", "Processing"].includes(s)) return SKY
  return AMBER
}

/** Reject with a reason, or send the client a new link (with what to fix). */
function ActionDialog({ action, onClose, onDone }) {
  const [reason, setReason] = useState(action?.check.reason || "")
  const [busy, setBusy] = useState(false)
  if (!action) return null
  const { check, act } = action
  const reject = act === "reject"

  const submit = async () => {
    setBusy(true)
    const id = toastProcessing(reject ? "Rejecting…" : "Making a new link…")
    const res = await ownerApi(`/kyc/${check.workspace}/${check.id}/${act}`, { method: "POST", body: { reason } })
    setBusy(false)
    if (res.ok) {
      toastDone(id, res.message)
      onDone()
    } else {
      toastFail(id, res.error)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{reject ? "Reject this KYC" : "Resubmit KYC"}</DialogTitle>
          <DialogDescription>
            {check.full_name} · {check.workspace_name}
            {check.order_number ? ` · ${check.order_number}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="kyc-reason" className="block text-sm font-medium">
            {reject ? "Reason" : "What the client should fix (goes in the email)"}
          </label>
          <Textarea
            id="kyc-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: edited bank statement, the spelling is different from the ID"
          />
          {!reject && (
            <p className="text-xs text-muted-foreground">
              A new Didit link is made and emailed to {check.email || check.client_email || "the client"}. Didit counts a new
              session.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={reject ? "destructive" : "default"}
            onClick={submit}
            disabled={busy || (reject && !reason.trim())}
          >
            {reject ? "Reject" : "Send new link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function KycCell({ check, onAction }) {
  const [label, tone] = kycLabel(check.status)
  const rejected = REJECTED.includes(check.status)
  return (
    <div className="flex max-w-56 flex-col items-start gap-1">
      <span className={cn(PILL, tone)}>{label}</span>
      {check.reason && rejected && <span className="line-clamp-2 text-xs text-destructive">{check.reason}</span>}
      {"reason" in check && (
        <div className="flex flex-wrap gap-1">
          {rejected ? (
            <Button size="xs" onClick={() => onAction(check, "resubmit")}>
              <IconRefresh className="size-3.5" /> Resubmit
            </Button>
          ) : (
            check.status !== "Approved" && (
              <Button size="xs" variant="outline" onClick={() => onAction(check, "resubmit")}>
                <IconRefresh className="size-3.5" /> New link
              </Button>
            )
          )}
          {!rejected && (
            <Button size="xs" variant="ghost" className="text-destructive" onClick={() => onAction(check, "reject")}>
              <IconX className="size-3.5" /> Reject
            </Button>
          )}
          {check.session_url && !rejected && check.status !== "Approved" && (
            <Button
              size="xs"
              variant="ghost"
              title="Copy the client's link"
              onClick={() =>
                navigator.clipboard.writeText(check.session_url).then(
                  () => toastDone(undefined, "Link copied"),
                  () => toastFail(undefined, "Could not copy"),
                )
              }
            >
              <IconCopy className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
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
  const [kycFilter, setKycFilter] = useState("")
  const [search, setSearch] = useState("")
  const [action, setAction] = useState(null)

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

  const checks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.checks || []).filter((c) => {
      if (workspace && c.workspace !== workspace) return false
      if (kycFilter === "approved" && c.status !== "Approved") return false
      if (kycFilter === "rejected" && !REJECTED.includes(c.status)) return false
      if (kycFilter === "pending" && (c.status === "Approved" || REJECTED.includes(c.status))) return false
      if (!q) return true
      return [c.full_name, c.client_name, c.email, c.client_email, c.phone, c.order_number, c.workspace_name]
        .some((v) => String(v || "").toLowerCase().includes(q))
    })
  }, [data, workspace, kycFilter, search])

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
            title="KYC orders"
            description="Every ID check this month, with its client and order. Reject one with a reason, or send the client a new link."
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
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <FilterTabs
                value={kycFilter}
                onChange={setKycFilter}
                options={[
                  ["", "All"],
                  ["pending", "In progress"],
                  ["rejected", "Rejected"],
                  ["approved", "Approved"],
                ]}
              />
              <div className="relative sm:w-72">
                <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search client, email, phone, order…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {checks.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Client</th>
                      <th className="px-3 py-2.5 font-semibold">Email</th>
                      <th className="px-3 py-2.5 font-semibold">Phone</th>
                      <th className="px-3 py-2.5 font-semibold">Product</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Price</th>
                      <th className="px-3 py-2.5 font-semibold">Date</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-3 py-2.5 font-semibold">Order status</th>
                      <th className="px-3 py-2.5 font-semibold">Address</th>
                      <th className="px-3 py-2.5 font-semibold">KYC form</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((c) => (
                      <tr key={`${c.workspace}-${c.id}`} className="border-b align-top last:border-0">
                        <td className="px-3 py-3">
                          <div className="font-semibold uppercase">{c.full_name}</div>
                          <div className="text-xs text-muted-foreground">
                            <Link to={`/owner/workspaces/${c.workspace}`} className="hover:text-primary">
                              {c.workspace_name}
                            </Link>
                            {c.order_number ? ` · ${c.order_number}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{c.email || c.client_email || "—"}</td>
                        <td className="px-3 py-3 whitespace-nowrap">{c.phone || "—"}</td>
                        <td className="px-3 py-3">{c.service_name || "—"}</td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {c.total != null ? money(c.total) : "—"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                          {shortDate(c.order_date || c.created_at)}
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn(PILL, paymentTone(c.payment_status))}>{c.payment_status || "No invoice"}</span>
                        </td>
                        <td className="px-3 py-3">
                          {c.order_status ? (
                            <span className={cn(PILL, orderTone(c.order_status))}>{c.order_status}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {c.address ? (
                            <span className="line-clamp-2 max-w-48 text-xs">{c.address}</span>
                          ) : (
                            <span className={cn(PILL, GREY)}>N/A</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <KycCell check={c} onAction={(check, act) => setAction({ check, act })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No checks to show.</p>
            )}
          </Panel>
          <ActionDialog
            key={action ? `${action.check.workspace}-${action.check.id}-${action.act}` : "none"}
            action={action}
            onClose={() => setAction(null)}
            onDone={() => {
              setAction(null)
              load()
            }}
          />
        </>
      )}
    </>
  )
}
