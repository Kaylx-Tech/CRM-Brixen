import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { IconMapPin, IconPlus, IconTrash } from "@tabler/icons-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { money, ownerApi, shortDate } from "@/lib/owner"
import { LoadError, PageTitle, Panel, SELECT, Stat } from "./ownerUi"
import { useServiceSettings } from "./useServiceSettings"

const EMPTY_ADDRESS = { label: "", line1: "", line2: "", city: "", postal_code: "", country: "United Kingdom" }
const FILTERS = [
  ["Pending", "Waiting"],
  ["Active", "Active"],
  ["", "All"],
]

const STATUS_TONE = {
  Pending: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  Active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Rejected: "bg-destructive/10 text-destructive",
  Cancelled: "bg-muted text-muted-foreground",
}

function daysLeft(date) {
  if (!date) return null
  return Math.ceil((new Date(`${date}T00:00:00`) - new Date()) / 86400000)
}

/** Finstap's yearly price and its own office addresses (remounted with the saved settings). */
function OfficeSettings({ settings, save, saving }) {
  const [price, setPrice] = useState(settings.ro_price_year ?? "")
  const [addresses, setAddresses] = useState(settings.ro_addresses?.length ? settings.ro_addresses : [EMPTY_ADDRESS])

  const change = (i, key, value) => setAddresses((list) => list.map((a, j) => (j === i ? { ...a, [key]: value } : a)))

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        save({ ro_price_year: price, ro_addresses: addresses })
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="ro-price" className="text-sm font-medium">
          Price a year (£, excl. VAT)
        </label>
        <Input id="ro-price" className="w-32" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <div className="space-y-3">
        <p className="text-sm font-medium">Finstap's office addresses</p>
        {addresses.map((a, i) => (
          <div key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-6">
            <Input className="sm:col-span-2" placeholder="Name (e.g. London office)" value={a.label} onChange={(e) => change(i, "label", e.target.value)} />
            <Input className="sm:col-span-2" placeholder="Address line 1" value={a.line1} onChange={(e) => change(i, "line1", e.target.value)} />
            <Input className="sm:col-span-2" placeholder="Address line 2" value={a.line2 || ""} onChange={(e) => change(i, "line2", e.target.value)} />
            <Input className="sm:col-span-2" placeholder="Town or city" value={a.city} onChange={(e) => change(i, "city", e.target.value)} />
            <Input placeholder="Postcode" value={a.postal_code} onChange={(e) => change(i, "postal_code", e.target.value)} />
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setAddresses((list) => list.filter((_, j) => j !== i))}
              aria-label="Remove address"
            >
              <IconTrash className="size-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setAddresses((list) => [...list, EMPTY_ADDRESS])}>
          <IconPlus className="size-4" /> Add address
        </Button>
      </div>
      <Button type="submit" disabled={saving}>
        Save
      </Button>
    </form>
  )
}

/** What the owner can do with one request: confirm or reject a new one; renew, mark paid or end an active one. */
function RequestActions({ request, offices, defaultPrice, onDone }) {
  const [form, setForm] = useState({ address_index: "0", start_date: new Date().toISOString().slice(0, 10), months: "12", price: "" })
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  const run = async (act, body, working) => {
    setBusy(true)
    const id = toastProcessing(working)
    const res = await ownerApi(`/registered-office/${request.id}/${act}`, { method: "POST", body })
    setBusy(false)
    if (res.ok) {
      toastDone(id, res.message)
      setReason("")
      onDone()
    } else {
      toastFail(id, res.error)
    }
  }

  if (request.status === "Pending") {
    return (
      <div className="space-y-3">
        {offices.length ? (
          <div className="grid gap-2 sm:grid-cols-4">
            <select
              className={cn(SELECT, "sm:col-span-2")}
              value={form.address_index}
              onChange={(e) => setForm({ ...form, address_index: e.target.value })}
              aria-label="Office address"
            >
              {offices.map((a, i) => (
                <option key={i} value={i}>
                  {a.label}
                </option>
              ))}
            </select>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} aria-label="Start date" />
            <select className={SELECT} value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} aria-label="Length">
              <option value="12">12 months</option>
              <option value="6">6 months</option>
              <option value="24">24 months</option>
            </select>
            <Input
              className="sm:col-span-2"
              inputMode="decimal"
              placeholder={`Price (default ${money(request.price ?? defaultPrice ?? 0)})`}
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
            <Button className="sm:col-span-2" disabled={busy} onClick={() => run("confirm", form, "Confirming…")}>
              Confirm registered office
            </Button>
          </div>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-300">Add an office address under Prices & addresses first.</p>
        )}
        <div className="flex gap-2">
          <Input placeholder="Reason to reject (the workspace sees it)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button variant="outline" disabled={busy || !reason.trim()} onClick={() => run("reject", { reason }, "Rejecting…")}>
            Reject
          </Button>
        </div>
      </div>
    )
  }

  if (request.status === "Active") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={request.paid ? "outline" : "default"}
          size="sm"
          disabled={busy}
          onClick={() => run("paid", { paid: !request.paid }, "Saving…")}
        >
          {request.paid ? "Mark unpaid" : "Mark paid"}
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run("renew", { months: 12 }, "Renewing…")}>
          Renew 12 months
        </Button>
        <Input className="h-8 min-w-48 flex-1" placeholder="Reason to end it" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button variant="destructive" size="sm" disabled={busy || !reason.trim()} onClick={() => run("end", { reason }, "Ending…")}>
          End
        </Button>
      </div>
    )
  }
  return request.reason ? <p className="text-sm text-muted-foreground">{request.reason}</p> : null
}

/** Registered office: workspaces ask for Finstap's address for a client company; the owner confirms and charges it. */
export default function OwnerRegisteredOffice() {
  const { settings, save, saving } = useServiceSettings()
  const [filter, setFilter] = useState("Pending")
  const [rows, setRows] = useState(null)
  const [error, setError] = useState("")
  const [showSettings, setShowSettings] = useState(false)

  const load = useCallback(() => {
    ownerApi("/registered-office").then((res) => (res.ok ? setRows(res.data.requests) : setError(res.error)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    const list = rows || []
    const active = list.filter((r) => r.status === "Active")
    return {
      pending: list.filter((r) => r.status === "Pending").length,
      active: active.length,
      expiring: active.filter((r) => (daysLeft(r.expiry_date) ?? 999) <= 30).length,
      unpaid: active.filter((r) => !r.paid).reduce((sum, r) => sum + Number(r.price || 0), 0),
    }
  }, [rows])

  const shown = (rows || []).filter((r) => !filter || r.status === filter)
  const offices = settings?.ro_addresses || []

  return (
    <>
      <PageTitle
        title="Registered office"
        description="Workspaces ask for Finstap's address for a client's company. Confirm it here and it appears in the client's portal."
      >
        <Button variant="outline" onClick={() => setShowSettings((v) => !v)}>
          <IconMapPin className="size-4" /> Prices & addresses
        </Button>
      </PageTitle>
      <LoadError error={error} />

      {settings && (showSettings || !offices.length) && (
        <Panel title="Prices & addresses" className="mb-4">
          <OfficeSettings key={JSON.stringify(settings)} settings={settings} save={save} saving={saving} />
        </Panel>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Waiting for you" value={stats.pending} tone="text-amber-600" />
        <Stat label="Active" value={stats.active} tone="text-emerald-600" />
        <Stat label="Ending in 30 days" value={stats.expiring} tone="text-sky-600" />
        <Stat label="Unpaid" value={money(stats.unpaid)} hint={settings?.ro_price_year ? `${money(settings.ro_price_year)} a year` : "No price set"} />
      </div>

      <div className="mt-4 mb-3 flex gap-1">
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

      <div className="space-y-3">
        {rows === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {rows !== null && !shown.length && (
          <Panel>
            <p className="text-sm text-muted-foreground">Nothing here.</p>
          </Panel>
        )}
        {shown.map((r) => {
          const left = daysLeft(r.expiry_date)
          return (
            <Panel key={r.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.company_name}</span>
                    {r.company_number && <span className="text-sm text-muted-foreground">{r.company_number}</span>}
                    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[r.status])}>
                      {r.status}
                    </span>
                    {r.status === "Active" && (
                      <span className={cn("text-xs font-semibold", r.paid ? "text-emerald-600" : "text-amber-700 dark:text-amber-300")}>
                        {r.paid ? "Paid" : "Unpaid"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <Link to={`/owner/workspaces/${r.tenant_slug}`} className="font-medium text-foreground hover:text-primary">
                      {r.workspace_name}
                    </Link>
                    {r.client_name ? ` · client ${r.client_name}` : ""} · asked {shortDate(r.created_at)}
                    {r.requested_by ? ` by ${r.requested_by}` : ""}
                  </p>
                  {r.notes && <p className="mt-1 text-sm">“{r.notes}”</p>}
                  {r.address && (
                    <p className="mt-1 text-sm">
                      <IconMapPin className="mr-1 inline size-4 text-muted-foreground" />
                      {[r.address.line1, r.address.line2, r.address.city, r.address.postal_code].filter(Boolean).join(", ")}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-sm sm:text-right">
                  {r.price != null && <div className="font-semibold">{money(r.price)}</div>}
                  {r.expiry_date && (
                    <div className={cn("text-muted-foreground", left !== null && left <= 30 && r.status === "Active" && "text-amber-700 dark:text-amber-300")}>
                      {shortDate(r.start_date)} – {shortDate(r.expiry_date)}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 border-t pt-4">
                <RequestActions request={r} offices={offices} defaultPrice={settings?.ro_price_year} onDone={load} />
              </div>
            </Panel>
          )
        })}
      </div>
    </>
  )
}
