import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { IconCash, IconMapPin, IconPlus, IconRefresh, IconSearch, IconTrash } from "@tabler/icons-react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { money, ownerApi, shortDate } from "@/lib/owner"
import { Button, Empty, FilterTabs, LoadError, PageTitle, Panel, SELECT, Stat } from "./ownerUi"
import { useServiceSettings } from "./useServiceSettings"

const EMPTY_ADDRESS = { label: "", line1: "", line2: "", city: "", postal_code: "", country: "United Kingdom" }
const FILTERS = [
  ["Pending", "Waiting"],
  ["Verifying", "Verifying"],
  ["Active", "Active"],
  ["Expired", "Expired"],
  ["", "All"],
]
const PAGE_SIZE = 25

const STATUS_TONE = {
  Pending: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  Verifying: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  Active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Rejected: "bg-destructive/10 text-destructive",
  "Verification failed": "bg-destructive/10 text-destructive",
  Expired: "bg-muted text-muted-foreground",
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
  const [bank, setBank] = useState(settings.topup_bank_details ?? "")

  const change = (i, key, value) => setAddresses((list) => list.map((a, j) => (j === i ? { ...a, [key]: value } : a)))

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        save({ ro_price_year: price, ro_addresses: addresses, topup_bank_details: bank })
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
        <Button type="button" variant="outline" onClick={() => setAddresses((list) => [...list, EMPTY_ADDRESS])}>
          <IconPlus className="size-4" /> Add address
        </Button>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="topup-bank" className="text-sm font-medium">
          Bank details for workspace balance top-ups
        </label>
        <Textarea
          id="topup-bank"
          rows={3}
          placeholder={"Account name, sort code, account number (workspaces see this in their Balance button)"}
          value={bank}
          onChange={(e) => setBank(e.target.value)}
        />
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
          disabled={busy}
          onClick={() => run("paid", { paid: !request.paid }, "Saving…")}
        >
          <IconCash className="size-4" /> {request.paid ? "Mark unpaid" : "Mark paid"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => run("renew", { months: 12 }, "Renewing…")}>
          <IconRefresh className="size-4" /> Renew 12 months
        </Button>
        <Input className="min-w-48 flex-1" placeholder="Reason to end it" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button variant="destructive" disabled={busy || !reason.trim()} onClick={() => run("end", { reason }, "Ending…")}>
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
  const [filter, setFilter] = useState("")
  const [rows, setRows] = useState(null)
  const [error, setError] = useState("")
  const [showSettings, setShowSettings] = useState(false)
  const [search, setSearch] = useState("")
  const [workspace, setWorkspace] = useState("")
  const [view, setView] = useState("")
  const [sort, setSort] = useState("newest")
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState(null)

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

  const workspaces = useMemo(
    () => [...new Map((rows || []).map((r) => [r.tenant_slug, r.workspace_name || r.tenant_slug])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [rows],
  )
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = (rows || []).filter((r) => {
      if (filter && r.status !== filter) return false
      if (workspace && r.tenant_slug !== workspace) return false
      if (view === "unpaid" && (r.status !== "Active" || r.paid)) return false
      if (view === "paid" && (r.status !== "Active" || !r.paid)) return false
      if (view === "ending" && !(r.status === "Active" && (daysLeft(r.expiry_date) ?? 999) <= 30)) return false
      if (!q) return true
      return [r.office_number && `office ${r.office_number}`, r.office_number, r.company_name, r.company_number, r.workspace_name,
        r.tenant_slug, r.client_name, r.client_email, r.order_number, r.requested_by]
        .some((v) => String(v ?? "").toLowerCase().includes(q))
    })
    const by = {
      newest: (a, b) => b.id - a.id,
      office: (a, b) => (a.office_number ?? 1e9) - (b.office_number ?? 1e9),
      ending: (a, b) => String(a.expiry_date || "9999").localeCompare(String(b.expiry_date || "9999")),
      company: (a, b) => String(a.company_name).localeCompare(String(b.company_name)),
    }
    return list.sort(by[sort] || by.newest)
  }, [rows, filter, workspace, view, search, sort])
  const pageRows = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const offices = settings?.ro_addresses || []

  return (
    <>
      <PageTitle
        title="Registered office"
        description="Every Finstap office address given to a workspace's client company, by Office number."
      >
        <Button variant="outline" size="lg" onClick={() => setShowSettings((v) => !v)}>
          <IconMapPin className="size-4" /> Prices & addresses
        </Button>
      </PageTitle>
      <LoadError error={error} />

      {settings && (showSettings || !offices.length) && (
        <Panel title="Prices & addresses" className="mb-4">
          <OfficeSettings key={JSON.stringify(settings)} settings={settings} save={save} saving={saving} />
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Waiting for you" value={stats.pending} tone="text-amber-600" />
        <Stat label="Active" value={stats.active} tone="text-emerald-600" />
        <Stat label="Ending in 30 days" value={stats.expiring} tone="text-sky-600" />
        <Stat label="Unpaid" value={money(stats.unpaid)} hint={settings?.ro_price_year ? `${money(settings.ro_price_year)} a year` : "No price set"} />
      </div>

      {/* Built for many rows: search, filters, sorting and pages; "Manage" opens a row's actions */}
      <div className="mt-8 mb-3 flex flex-col gap-3">
        <FilterTabs value={filter} onChange={(v) => { setFilter(v); setPage(0) }} options={FILTERS} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search office, company, workspace, client, order…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              aria-label="Search registered offices"
            />
          </div>
          <select className={cn(SELECT, "sm:w-44 sm:shrink-0")} value={workspace} onChange={(e) => { setWorkspace(e.target.value); setPage(0) }} aria-label="Workspace">
            <option value="">All workspaces</option>
            {workspaces.map(([slug, name]) => (
              <option key={slug} value={slug}>{name}</option>
            ))}
          </select>
          <select className={cn(SELECT, "sm:w-44 sm:shrink-0")} value={view} onChange={(e) => { setView(e.target.value); setPage(0) }} aria-label="Show">
            <option value="">Any payment</option>
            <option value="unpaid">Unpaid only</option>
            <option value="paid">Paid only</option>
            <option value="ending">Ending in 30 days</option>
          </select>
          <select className={cn(SELECT, "sm:w-44 sm:shrink-0")} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="office">Office number</option>
            <option value="ending">Ending soonest</option>
            <option value="company">Company A–Z</option>
          </select>
        </div>
      </div>

      {rows === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows !== null && !shown.length && (
        <Empty icon={IconMapPin} title={search || workspace || view ? "No matches" : filter === "Pending" ? "No requests waiting" : "Nothing here"}>
          {search || workspace || view ? "Try another search or filter." : "Workspaces ask for a registered office from Smart Operations → Registered Office."}
        </Empty>
      )}
      {shown.length > 0 && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Office</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Workspace · client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((r) => {
                const left = daysLeft(r.expiry_date)
                const opened = openId === r.id
                return (
                  <Fragment key={r.id}>
                    <TableRow className={cn(opened && "bg-muted/40")}>
                      <TableCell className="whitespace-nowrap font-semibold text-primary">
                        {r.office_number ? `Office ${r.office_number}` : "—"}
                        {r.status === "Verifying" && r.office_number ? <span className="ml-1 text-xs font-normal text-muted-foreground">booked</span> : null}
                      </TableCell>
                      <TableCell className="md:max-w-56">
                        <span className="block font-medium md:truncate">{r.company_name}</span>
                        <span className="block text-xs text-muted-foreground">{r.company_number || ""}</span>
                      </TableCell>
                      <TableCell className="md:max-w-48">
                        <Link to={`/owner/workspaces/${r.tenant_slug}`} className="block font-medium hover:text-primary md:truncate">
                          {r.workspace_name}
                        </Link>
                        <span className="block text-xs text-muted-foreground md:truncate">{r.client_name || "—"}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[r.status])}>{r.status}</span>
                          {r.status === "Active" && (
                            <span className={cn("text-xs font-semibold", r.paid ? "text-emerald-600" : "text-amber-700 dark:text-amber-300")}>
                              {r.paid ? "Paid" : "Unpaid"}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={cn("whitespace-nowrap text-sm text-muted-foreground", left !== null && left <= 30 && r.status === "Active" && "font-medium text-amber-700 dark:text-amber-300")}>
                        {r.expiry_date ? `${shortDate(r.start_date)} – ${shortDate(r.expiry_date)}` : shortDate(r.created_at)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{r.price != null ? money(r.price) : "—"}</TableCell>
                      <TableCell>
                        <Button size="sm" variant={opened ? "default" : "outline"} onClick={() => setOpenId(opened ? null : r.id)}>
                          {opened ? "Close" : "Manage"}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {opened && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={7} className="space-y-3">
                          <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                            {r.address && (
                              <p className="sm:col-span-2">
                                <IconMapPin className="mr-1 inline size-4" />
                                <span className="text-foreground">{[r.address.line1, r.address.line2, r.address.city, r.address.postal_code].filter(Boolean).join(", ")}</span>
                              </p>
                            )}
                            <p>Asked {shortDate(r.created_at)}{r.requested_by ? ` by ${r.requested_by}` : ""}</p>
                            {r.order_number && <p>{r.source === "autoallot" ? "AutoAllot · " : ""}Order {r.order_number}</p>}
                            {r.notes && <p className="sm:col-span-2">“{r.notes}”</p>}
                          </div>
                          <RequestActions request={r} offices={offices} defaultPrice={settings?.ro_price_year} onDone={load} />
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
      {shown.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, shown.length)} of {shown.length}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= shown.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </>
  )
}
