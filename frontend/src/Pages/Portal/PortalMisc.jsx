import React, { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SectionCards } from "@/Layout/StatsCard"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { IconSearch, IconMessagePlus, IconShoppingCartPlus, IconRefresh, IconCreditCard, IconFileText, IconExternalLink, IconLoader2, IconRepeat } from "@tabler/icons-react"
import { toast } from "sonner"
import { apiRequest } from "@/lib/api"
import { openInvoice } from "@/lib/invoices"
import { usePortalData, PageHeader, PageState, StatusBadge, money, formatDate } from "./portalShared"

/** Service catalog: customers order a service (order wizard) or ask about it through a support request. */
export function PortalServices() {
  const navigate = useNavigate()
  const { data, isLoading, error, reload } = usePortalData("/client/services")
  const [search, setSearch] = useState("")
  const services = data?.services || []

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = {}
    services
      .filter((s) => !q || [s.name, s.description, s.category].some((v) => String(v || "").toLowerCase().includes(q)))
      .forEach((s) => {
        const key = s.category || "Other"
        ;(out[key] = out[key] || []).push(s)
      })
    return out
  }, [services, search])

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <PageHeader title="Services" description="Everything we can do for your business" onRefresh={reload} isLoading={isLoading}>
        <div className="relative w-64">
          <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search services…" className="pl-9" />
        </div>
      </PageHeader>
      <PageState isLoading={isLoading && !data} error={error} onRetry={reload} isEmpty={!Object.keys(grouped).length} emptyText="No services found.">
        {Object.entries(grouped).map(([category, items]) => (
          <section key={category} className="flex flex-col gap-3">
            <h3 className="font-semibold">{category}</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((s) => (
                <div key={s.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{money(s.price)}</span>
                  </div>
                  {s.description && s.description !== s.name ? (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{s.description}</p>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {s.duration ? <Badge className="bg-muted text-muted-foreground">{s.duration}</Badge> : null}
                      {s.estimated_delivery_time ? <Badge className="bg-muted text-muted-foreground">{s.estimated_delivery_time}</Badge> : null}
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/portal/support?subject=${encodeURIComponent(`Service request: ${s.name}`)}`)}>
                        <IconMessagePlus className="size-4" /> Ask
                      </Button>
                      <Button size="sm" onClick={() => navigate("/portal/orders?new=1")}>
                        <IconShoppingCartPlus className="size-4" /> Order
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </PageState>
    </div>
  )
}

/** How to pay an address renewal invoice: Tide pay link, bank transfer details, the invoice PDF. */
function RenewalPayDialog({ open, onOpenChange, address, pay }) {
  const invoice = address?.renewal_invoice
  if (!invoice) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay your address renewal</DialogTitle>
          <DialogDescription>
            {address.company_name} · {money(invoice.total)} for one more year. The address stays active once the payment arrives.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {pay?.pay_url ? (
            <a href={pay.pay_url} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
              <IconCreditCard className="size-4" /> Pay by card <IconExternalLink className="size-3.5" />
            </a>
          ) : null}
          {pay?.account_number ? (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-2 font-medium">Or pay by bank transfer</p>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Account name</dt><dd>{pay.account_name}</dd>
                <dt className="text-muted-foreground">Account number</dt><dd className="tabular-nums">{pay.account_number}</dd>
                <dt className="text-muted-foreground">Sort code</dt><dd className="tabular-nums">{pay.sort_code}</dd>
                <dt className="text-muted-foreground">Reference</dt><dd className="font-medium">{invoice.invoice_number}</dd>
              </dl>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => openInvoice(invoice.id, { client: true })}>
            <IconFileText className="size-4" /> View invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Registered office / mail forwarding addresses the customer subscribes to. */
export function PortalAddresses() {
  const { data, isLoading, error, reload } = usePortalData("/client/addresses")
  const rows = data?.addresses || []
  const [renewing, setRenewing] = useState(null)
  const [payFor, setPayFor] = useState(null)

  const renew = async (a) => {
    setRenewing(a.id)
    const res = await apiRequest(`/client/addresses/${a.id}/renew`, { method: "POST", silent: true })
    setRenewing(null)
    if (!res.ok) {
      toast.error(res.reason || "Could not renew this address")
      return
    }
    toast.success("Renewal invoice created")
    setPayFor((res.data?.data ?? res.data)?.address || null)
    reload()
  }

  // Card auto-renew and "Manage card" both continue on Stripe's own pages
  const goToStripe = async (key, path, failText) => {
    setRenewing(key)
    const res = await apiRequest(path, { method: "POST", silent: true })
    const url = (res.data?.data ?? res.data)?.url
    if (!res.ok || !url) {
      setRenewing(null)
      toast.error(res.reason || failText)
      return
    }
    window.location.assign(url)
  }

  // Back from Stripe Checkout: Stripe tells the CRM a moment later, so load the page again shortly
  const [searchParams, setSearchParams] = useSearchParams()
  const returnHandled = useRef(false)
  useEffect(() => {
    if (!searchParams.get("auto_renew") || returnHandled.current) return
    returnHandled.current = true
    toast.success("Auto-renew is on", { description: "Your card is charged on the renewal date." })
    // Not cleared on purpose: clearing the ?auto_renew=1 below re-runs this effect
    setTimeout(reload, 4000)
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams, reload])

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <PageHeader title="Addresses" description="Registered office and mail forwarding addresses" onRefresh={reload} isLoading={isLoading} />
      <PageState isLoading={isLoading && !data} error={error} onRetry={reload} isEmpty={!rows.length}
        emptyText="No address services yet. Registered office and mail forwarding subscriptions appear here.">
        <div className="rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Renews</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="md:max-w-72">
                    {/* Phones wrap the whole address; wider screens keep one line */}
                    <span className="block font-medium md:truncate">{[a.line1, a.line2].filter(Boolean).join(", ")}</span>
                    <span className="block text-xs text-muted-foreground md:truncate">{[a.city, a.postal_code, a.country].filter(Boolean).join(", ")}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{a.service_name || a.type || "—"}</TableCell>
                  <TableCell className="text-muted-foreground md:max-w-48 md:truncate">{a.company_name || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {a.price != null ? `£${Number(a.price).toFixed(2)}${a.billing_period ? ` / ${a.billing_period}` : ""}` : "—"}
                    {a.late_fee > 0 ? <span className="block text-xs text-destructive">+ £{Number(a.late_fee).toFixed(2)} late fee</span> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(a.expiry_date)}
                    {a.auto_renew?.cancel_at ? <span className="block text-xs">Auto-renew ends</span> : null}
                  </TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {/* Renew opens 30 days before the year ends; an unpaid renewal shows how to pay it */}
                      {a.renewal_invoice ? (
                        <Button size="sm" className="h-7 gap-1" onClick={() => setPayFor(a)}>
                          <IconCreditCard className="size-3.5" /> Pay renewal
                        </Button>
                      ) : a.can_renew ? (
                        <Button size="sm" className="h-7 gap-1" disabled={renewing === a.id} onClick={() => renew(a)}>
                          {renewing === a.id ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconRefresh className="size-3.5" />} Renew
                        </Button>
                      ) : null}
                      {/* Card auto-renew (Stripe) for our registered office addresses */}
                      {a.auto_renew ? (
                        <Button size="sm" variant="outline" className="h-7 gap-1" disabled={renewing === "card"}
                          onClick={() => goToStripe("card", "/client/addresses/card", "Could not open your card details")}>
                          {renewing === "card" ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconCreditCard className="size-3.5" />} Manage card
                        </Button>
                      ) : data?.auto_renew_available && String(a.id).startsWith("company-") ? (
                        <Button size="sm" variant="outline" className="h-7 gap-1" disabled={renewing === `auto-${a.id}`}
                          onClick={() => goToStripe(`auto-${a.id}`, `/client/addresses/${a.id}/auto-renew`, "Could not start auto-renew")}>
                          {renewing === `auto-${a.id}` ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconRepeat className="size-3.5" />} Auto-renew
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PageState>
      <RenewalPayDialog open={!!payFor} onOpenChange={(open) => !open && setPayFor(null)} address={payFor} pay={data?.pay} />
    </div>
  )
}

/** Annual accounts and confirmation statement deadlines for the customer's companies. */
export function PortalAccountancy() {
  const { data, isLoading, error, reload } = usePortalData("/client/accountancy")
  const rows = data?.filings || []
  const m = data?.metrics || {}
  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <PageHeader title="Accountancy" description="Annual accounts and filing deadlines for your companies" onRefresh={reload} isLoading={isLoading} />
      <SectionCards
        compact
        isLoading={isLoading && !data}
        stats={[
          { title: "Overdue", value: String(m.overdue ?? 0) },
          { title: "Due in 60 days", value: String(m.due_in_60_days ?? 0) },
          { title: "In progress", value: String(m.in_progress ?? 0) },
          { title: "Filed", value: String(m.filed ?? 0) },
        ]}
      />
      <PageState isLoading={isLoading && !data} error={error} onRetry={reload} isEmpty={!rows.length} emptyText="No companies to file accounts for yet.">
        <div className="rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Year end</TableHead>
                <TableHead>Accounts due</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>ID check</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-64">
                    <span className="block truncate font-medium">{r.company_name}</span>
                    <span className="block text-xs text-muted-foreground">{r.company_number || "—"}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.year_end || "—"}</TableCell>
                  <TableCell className={r.status === "Overdue" ? "font-semibold text-destructive" : "text-muted-foreground"}>{r.due_date}</TableCell>
                  <TableCell className="text-muted-foreground">{r.type}</TableCell>
                  <TableCell><StatusBadge status={r.idv_status} /></TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PageState>
    </div>
  )
}
