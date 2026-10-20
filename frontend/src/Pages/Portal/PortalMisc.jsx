import React, { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SectionCards } from "@/Layout/StatsCard"
import { IconSearch, IconMessagePlus, IconShoppingCartPlus } from "@tabler/icons-react"
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

/** Registered office / mail forwarding addresses the customer subscribes to. */
export function PortalAddresses() {
  const { data, isLoading, error, reload } = usePortalData("/client/addresses")
  const rows = data?.addresses || []
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
                <TableHead>Renews</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="max-w-72">
                    <span className="block truncate font-medium">{[a.line1, a.line2].filter(Boolean).join(", ")}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[a.city, a.postal_code, a.country].filter(Boolean).join(", ")}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{a.service_name || a.type || "—"}</TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">{a.company_name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(a.expiry_date)}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PageState>
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
