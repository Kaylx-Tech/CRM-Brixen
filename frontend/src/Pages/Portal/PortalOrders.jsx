import React, { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { IconLoader2, IconSearch, IconFileText, IconCircleCheck, IconCircle, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { apiRequest } from "@/lib/api"
import { openDocument } from "@/lib/documents"
import { usePortalData, PageHeader, PageState, StatusBadge, money, formatDate } from "./portalShared"
import CreateOrderWizard from "@/Pages/Orders/CreateOrderWizard"

/** One order's progress, products and shared documents (customer-safe fields only). */
export function OrderDetailDialog({ orderId, onClose }) {
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    setIsLoading(true)
    setOrder(null)
    apiRequest(`/client/orders/${orderId}`, { silent: true, label: "Order" }).then((res) => {
      if (cancelled) return
      if (res.ok) setOrder(res.data?.data || null)
      else toast.error(res.reason || "Could not load the order")
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [orderId])

  const timeline = [...(order?.timeline || [])].reverse()
  const items = order?.line_items || []

  return (
    <Dialog open={!!orderId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{order?.order_number || "Order"}</DialogTitle>
          <DialogDescription>{order?.service_name || ""}</DialogDescription>
        </DialogHeader>
        {isLoading || !order ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" /> Loading order…
          </div>
        ) : (
          <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Status</p><StatusBadge status={order.status} /></div>
              <div><p className="text-xs text-muted-foreground">Placed</p><p className="font-medium">{formatDate(order.created_at)}</p></div>
              <div><p className="text-xs text-muted-foreground">Company</p><p className="truncate font-medium">{order.company_name || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Total</p><p className="font-medium">{money(order.total)}</p></div>
            </div>

            {items.length ? (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Products</h4>
                <ul className="divide-y rounded-xl border">
                  {items.map((li) => (
                    <li key={li.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="truncate">{li.product_name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <StatusBadge status={li.fulfillment_status || "Pending"} />
                        <span className="tabular-nums text-muted-foreground">{money(li.line_total ?? li.unit_price)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <h4 className="mb-2 text-sm font-semibold">Progress</h4>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">We'll post updates here as your order moves along.</p>
              ) : (
                <ol className="space-y-2">
                  {timeline.map((step) => (
                    <li key={step.id} className="flex items-start gap-2 text-sm">
                      {step.status === "Completed" ? (
                        <IconCircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      ) : (
                        <IconCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">{step.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(step.step_date)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Documents</h4>
                <Button variant="outline" size="sm" onClick={() => navigate(`/portal/documents?order=${order.id}`)}>
                  Upload for this order
                </Button>
              </div>
              {(order.documents || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents shared on this order yet.</p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {order.documents.map((doc) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                        onClick={() => openDocument(doc.id).catch((e) => toast.error(e.message))}
                      >
                        <IconFileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{doc.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const FILTERS = [
  ["all", "All"],
  ["active", "In progress"],
  ["Completed", "Completed"],
  ["Cancelled", "Cancelled"],
]

export default function PortalOrders() {
  const { data, isLoading, error, reload } = usePortalData("/client/orders?limit=100")
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [openOrderId, setOpenOrderId] = useState(null)
  // /portal/orders?new=1 (e.g. from the Services page) opens the order wizard straight away
  const [wizardOpen, setWizardOpen] = useState(params.get("new") === "1")
  const closeWizard = () => {
    setWizardOpen(false)
    if (params.has("new")) setParams({}, { replace: true })
  }
  const orders = data?.orders || []

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (filter === "active" && ["Completed", "Cancelled", "Refunded"].includes(o.status)) return false
      if (filter !== "all" && filter !== "active" && o.status !== filter) return false
      if (!q) return true
      return [o.order_number, o.service_name, o.company_name].some((v) => String(v || "").toLowerCase().includes(q))
    })
  }, [orders, filter, search])

  const spent = orders.filter((o) => o.status !== "Cancelled").reduce((s, o) => s + Number(o.total || 0), 0)

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <PageHeader title="Orders" description={`${orders.length} orders · ${money(spent)} total`} onRefresh={reload} isLoading={isLoading}>
        <Button onClick={() => setWizardOpen(true)}>
          <IconPlus className="size-4" /> New Order
        </Button>
      </PageHeader>
      <CreateOrderWizard
        portal
        open={wizardOpen}
        onClose={closeWizard}
        onCreated={() => {
          closeWizard()
          reload()
        }}
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            {FILTERS.map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="relative md:w-72">
          <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search orders…" className="pl-9" />
        </div>
      </div>
      <PageState isLoading={isLoading && !data} error={error} onRetry={reload} isEmpty={!visible.length} emptyText="No orders found.">
        <div className="rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setOpenOrderId(o.id)}>
                  <TableCell className="font-medium">{o.order_number}</TableCell>
                  <TableCell className="max-w-64 truncate">{o.service_name}</TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">{o.company_name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(o.created_at)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(o.total)}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PageState>
      <OrderDetailDialog orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
    </div>
  )
}
