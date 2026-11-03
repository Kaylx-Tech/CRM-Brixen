import { useCallback, useEffect, useMemo, useState } from "react"
import { Table } from "@/components/ui/table"
import { Link } from "react-router-dom"
import {
  IconAdjustmentsHorizontal,
  IconCash,
  IconCircleCheck,
  IconCircleX,
  IconClockHour4,
  IconCopy,
  IconId,
  IconRefresh,
  IconSearch,
  IconTrash,
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
import { AMBER, GREEN, GREY, PILL, RED, REJECTED, SKY, kycLabel } from "../Kyc/kycStatus"
import KycTeam from "./KycTeam"
import { DeleteConfirmation } from "@/components/DeleteConfirmation"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import KycPartners from "./KycPartners"
import { useServiceSettings } from "./useServiceSettings"

function thisMonth() {
  return new Date().toISOString().slice(0, 7)
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
              A new form link is made and emailed to {check.email || check.client_email || "the client"}. The old link
              stops working.
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

/** Owner only: delete the photos, files, answers and result the person sent (the check stays in the list). */
function DeleteDataButton({ check, onDone }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  if (check.data_deleted_at)
    return <span className="w-full text-xs text-muted-foreground">Data deleted {shortDate(check.data_deleted_at)}</span>

  const remove = async () => {
    setBusy(true)
    const id = toastProcessing("Deleting…")
    const res = await ownerApi(`/desk/checks/${check.workspace}/${check.id}/delete-data`, { method: "POST" })
    setBusy(false)
    setOpen(false)
    if (res.ok) {
      toastDone(id, res.message)
      onDone()
    } else {
      toastFail(id, res.error)
    }
  }

  return (
    <>
      <Button
        size="icon-xs"
        variant="ghost"
        className="text-destructive"
        title="Delete KYC data"
        aria-label="Delete KYC data"
        onClick={() => setOpen(true)}
      >
        <IconTrash className="size-3.5" />
      </Button>
      <DeleteConfirmation
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={remove}
        isLoading={busy}
        title="Delete this person's KYC data?"
        description="Their photos, files, answers and result are deleted for good. The check and its status stay in the list."
      />
    </>
  )
}

// 03/11/26 (DD/MM/YY) for the KYC orders table
function ddmmyy(value) {
  const d = new Date(String(value || "").replace(" ", "T"))
  if (!value || Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

// £15 instead of £15.00 (pence only when there are any), for the By workspace table
const whole = (value) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(
    Number(value || 0),
  )

// The KYC orders table's columns (client and KYC form always show); the owner picks the rest, kept per browser
const KYC_COLUMNS = [
  ["contact", "Email and phone"],
  ["price", "Price"],
  ["date", "Date"],
  ["payment", "Payment"],
  ["order", "Order status"],
]
const COLUMNS_KEY = "owner-kyc-columns"

function useKycColumns() {
  const [hidden, setHidden] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(COLUMNS_KEY) || "[]")
    } catch {
      return []
    }
  })
  const toggle = (id, on) => {
    const next = on ? hidden.filter((h) => h !== id) : [...hidden, id]
    setHidden(next)
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next))
    } catch {
      /* private window: the choice lasts until reload */
    }
  }
  return [(id) => !hidden.includes(id), toggle]
}

function ColumnsMenu({ shows, toggle }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-muted">
        <IconAdjustmentsHorizontal className="size-4" /> Columns
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {KYC_COLUMNS.map(([id, label]) => (
          <DropdownMenuCheckboxItem key={id} checked={shows(id)} onCheckedChange={(on) => toggle(id, !!on)}>
            {label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The workspace's own price per check; empty uses the general price. Saved when the field is left. */
function WorkspacePrice({ workspace, general, onSaved }) {
  const [value, setValue] = useState(workspace.own_price ?? "")
  const save = async () => {
    const next = String(value).trim()
    if (next === String(workspace.own_price ?? "")) return
    const res = await ownerApi("/kyc/price", { method: "POST", body: { slug: workspace.slug, price: next } })
    if (res.ok) {
      toastDone(undefined, res.message)
      onSaved()
    } else {
      toastFail(undefined, res.error)
      setValue(workspace.own_price ?? "")
    }
  }
  return (
    <div className="relative w-[4.5rem]">
      <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">£</span>
      <Input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        className="h-7 rounded-md pr-2 pl-5 text-right text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        value={value}
        placeholder={general != null ? String(Number(general)) : "0"}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label={`Price per check for ${workspace.name}`}
        title="Empty: the general price"
      />
    </div>
  )
}

function KycCell({ check, onAction, onDeleted }) {
  const [label, tone] = kycLabel(check.status)
  const rejected = REJECTED.includes(check.status)
  return (
    <div className="flex min-w-40 flex-col items-start gap-1.5">
      <span className={cn(PILL, tone)}>{label}</span>
      {check.reason && rejected && <span className="line-clamp-2 text-xs text-destructive">{check.reason}</span>}
      {check.reviewed_by && <span className="text-xs text-muted-foreground">by {check.reviewed_by} (KYC desk)</span>}
      {"reason" in check && (
        <div className="flex flex-wrap items-center gap-0.5">
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
            <Button
              size="icon-xs"
              variant="ghost"
              className="text-destructive"
              title="Reject"
              aria-label="Reject"
              onClick={() => onAction(check, "reject")}
            >
              <IconX className="size-3.5" />
            </Button>
          )}
          <DeleteDataButton check={check} onDone={onDeleted} />
          {check.session_url && !rejected && check.status !== "Approved" && (
            <Button
              size="icon-xs"
              variant="ghost"
              title="Copy the client's link"
              aria-label="Copy the client's link"
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

/** KYC verification: every ID check a workspace ran (Finstap's own KYC form), and what to charge. */
export default function OwnerKyc() {
  const { settings, save, saving } = useServiceSettings()
  const [period, setPeriod] = useState(thisMonth())
  const [workspace, setWorkspace] = useState("")
  const [shows, toggleColumn] = useKycColumns()
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
        description="ID checks your workspaces run with Finstap's KYC form. Each started check is charged to the workspace. Open one to see the documents."
      >
        <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value || thisMonth())} className="w-44" />
      </PageTitle>
      <LoadError error={error} />

      <Panel
        title="Price per check"
        description="What a workspace pays Finstap for one ID check (excl. VAT), unless it has its own price under By workspace. Changes apply to checks from now on."
        className="mb-4"
      >
        {settings ? (
          <PriceForm key={settings.kyc_price ?? ""} settings={settings} save={save} saving={saving} onSaved={load} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </Panel>

      <KycTeam />

      <KycPartners />

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
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

          <Panel
            title="By workspace"
            description="Every workspace's KYC checks this month (each is charged from its balance; older months are marked invoiced, then paid)."
            className="mt-4"
          >
            {data.workspaces.length ? (
              <div className="overflow-x-auto">
                <Table className="w-full md:min-w-[720px] text-left text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2.5 pr-4 font-semibold">Workspace</th>
                      <th className="px-3 py-2.5 font-semibold">Checks</th>
                      <th className="px-3 py-2.5 font-semibold">All time</th>
                      <th className="px-3 py-2.5 font-semibold">Approved</th>
                      <th className="px-3 py-2.5 font-semibold">Declined</th>
                      <th className="px-3 py-2.5 font-semibold">In progress</th>
                      <th className="px-3 py-2.5 font-semibold" title="This workspace's price per check. Empty: the general price">
                        Price / check
                      </th>
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
                        <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{w.all_time ?? "—"}</td>
                        <td className="px-3 py-2.5 tabular-nums">{w.approved}</td>
                        <td className="px-3 py-2.5 tabular-nums">{w.declined}</td>
                        <td className="px-3 py-2.5 tabular-nums">{w.pending}</td>
                        <td className="px-3 py-2.5">
                          <WorkspacePrice
                            key={`${w.slug}-${w.own_price ?? ""}`}
                            workspace={w}
                            general={settings?.kyc_price}
                            onSaved={load}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {whole(w.amount)}
                          {w.billing_status && w.billed_amount > 0 && w.billed_amount !== w.amount && (
                            <div className="text-xs text-muted-foreground">billed {whole(w.billed_amount)}</div>
                          )}
                        </td>
                        <td className="py-2.5 pl-3">
                          <select
                            className={cn(SELECT, "h-7 w-28 rounded-md px-2 text-xs")}
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
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No ID checks were started this month.</p>
            )}
          </Panel>

          <Panel
            title="KYC orders"
            description="Every ID check this month, with its client and order. Reject one with a reason, or send the client a new link."
            className="mt-4"
          >
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className={cn(SELECT, "sm:w-48")}
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  aria-label="Workspace"
                >
                  <option value="">All workspaces</option>
                  {data.workspaces.map((w) => (
                    <option key={w.slug} value={w.slug}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <div className="relative sm:w-64">
                  <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search client, email, phone, order…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <ColumnsMenu shows={shows} toggle={toggleColumn} />
              </div>
            </div>
            {checks.length ? (
              <div className="overflow-x-auto">
                <Table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {shows("date") && <th className="px-3 py-2.5 font-semibold">Date</th>}
                      <th className="px-3 py-2.5 font-semibold">Workspace</th>
                      <th className="px-3 py-2.5 font-semibold">Client</th>
                      {shows("contact") && <th className="px-3 py-2.5 font-semibold">Contact</th>}
                      {shows("price") && <th className="px-3 py-2.5 text-right font-semibold" title="What Finstap charges the workspace for this check">Price</th>}
                      {shows("payment") && <th className="px-3 py-2.5 font-semibold">Payment</th>}
                      {shows("order") && <th className="px-3 py-2.5 font-semibold">Order</th>}
                      <th className="px-3 py-2.5 font-semibold">KYC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((c) => (
                      <tr key={`${c.workspace}-${c.id}`} className="border-b align-top last:border-0 hover:bg-muted/30">
                        {shows("date") && (
                          <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                            {ddmmyy(c.order_date || c.created_at)}
                          </td>
                        )}
                        <td className="min-w-36 px-3 py-3">
                          <Link to={`/owner/workspaces/${c.workspace}`} className="font-medium hover:text-primary">
                            {c.workspace_name}
                          </Link>
                          {c.order_number && <div className="font-mono text-[11px] text-muted-foreground">{c.order_number}</div>}
                        </td>
                        <td className="min-w-40 px-3 py-3">
                          <Link to={`/owner/kyc/${c.workspace}/${c.id}`} className="font-semibold hover:text-primary">
                            {c.full_name}
                          </Link>
                        </td>
                        {shows("contact") && (
                          <td className="px-3 py-3">
                            <div className="max-w-56 truncate" title={c.email || c.client_email || ""}>
                              {c.email || c.client_email || "—"}
                            </div>
                            {c.phone && <div className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{c.phone}</div>}
                          </td>
                        )}
                        {shows("price") && (
                          <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                            {c.kyc_free ? (
                              <span className="text-muted-foreground">Free</span>
                            ) : c.charge_amount != null ? (
                              <>
                                {whole(c.charge_amount)}
                                <div className={cn("text-xs", c.charge === "paid" ? "text-emerald-600" : "text-amber-600")}>
                                  {c.charge === "paid" ? "Paid" : "Due"}
                                </div>
                              </>
                            ) : (
                              <span className="text-muted-foreground" title="Not charged yet">—</span>
                            )}
                          </td>
                        )}
                        {shows("payment") && (
                          <td className="px-3 py-3">
                            <span className={cn(PILL, paymentTone(c.payment_status))}>{c.payment_status || "No invoice"}</span>
                          </td>
                        )}
                        {shows("order") && (
                          <td className="px-3 py-3">
                            {c.order_status ? (
                              <span className={cn(PILL, orderTone(c.order_status))}>{c.order_status}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <KycCell check={c} onAction={(check, act) => setAction({ check, act })} onDeleted={load} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
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
