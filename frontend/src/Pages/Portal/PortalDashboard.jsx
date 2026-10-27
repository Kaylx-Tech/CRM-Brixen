import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { SectionCards } from "@/Layout/StatsCard"
import { IconAlertCircle, IconUpload, IconCreditCard, IconInfoCircle, IconFileText, IconBuilding } from "@tabler/icons-react"
import { usePortalData, PageHeader, PageState, StatusBadge, ProgressBar, formatDate } from "./portalShared"
import { OrderDetailDialog } from "./PortalOrders"
import PortalIdVerification from "./PortalIdVerification"
import { openDocument } from "@/lib/documents"
import { toast } from "sonner"

const ACTION_ICONS = { upload: IconUpload, "credit-card": IconCreditCard, info: IconInfoCircle }

export default function PortalDashboard() {
  const navigate = useNavigate()
  const { data, isLoading, error, reload } = usePortalData("/client/dashboard")
  const [openOrderId, setOpenOrderId] = useState(null)
  const d = data || {}

  const stats = [
    { title: "Companies", value: String(d.total_companies ?? 0), onClick: () => navigate("/portal/companies") },
    { title: "Active orders", value: String(d.active_orders_count ?? 0), onClick: () => navigate("/portal/orders") },
    { title: "Documents", value: String(d.documents_count ?? 0), onClick: () => navigate("/portal/documents") },
    { title: "Needs your attention", value: String(d.pending_actions_count ?? 0) },
  ]

  const runAction = (a) => {
    if (a.kind === "order" && a.view !== "documents") setOpenOrderId(a.order_id)
    else navigate(`/portal/${a.view || "dashboard"}`)
  }

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <PageHeader
        title={d.user_name ? `${d.greeting || "Hello"}, ${String(d.user_name).split(" ")[0]}` : "Dashboard"}
        description={d.current_date || "Your companies, orders and documents"}
        onRefresh={reload}
        isLoading={isLoading}
      />
      <PageState isLoading={isLoading && !data} error={error} onRetry={reload}>
        <SectionCards stats={stats} isLoading={false} />

        {/* Directors / PSCs still to verify their identity (shown only while one is open) */}
        <PortalIdVerification onlyOpen />

        <div className="rounded-2xl border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Needs your attention</h3>
          </div>
          {(d.pending_actions || []).length === 0 ? (
            <p className="px-4 py-6 text-sm font-medium text-emerald-600">You're all caught up.</p>
          ) : (
            <ul className="divide-y">
              {d.pending_actions.map((a, i) => {
                const Icon = ACTION_ICONS[a.icon] || IconAlertCircle
                return (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.title}</p>
                      {a.detail ? <p className="truncate text-xs text-muted-foreground">{a.detail}</p> : null}
                    </div>
                    <Button size="sm" onClick={() => runAction(a)}>{a.action_label || "View"}</Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="font-semibold">Active orders</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate("/portal/orders")}>View all</Button>
            </div>
            {(d.active_orders || []).length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No orders in progress.</p>
            ) : (
              <ul className="divide-y">
                {d.active_orders.map((o) => (
                  <li key={o.id}>
                    <button type="button" className="w-full cursor-pointer px-4 py-3 text-left hover:bg-muted/40" onClick={() => setOpenOrderId(o.id)}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{o.order_number}</p>
                          <p className="truncate text-xs text-muted-foreground">{o.service_name}{o.company_name ? ` · ${o.company_name}` : ""}</p>
                        </div>
                        <StatusBadge status={o.status} />
                      </div>
                      <div className="mt-2"><ProgressBar value={o.progress_percent} /></div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="font-semibold">Companies</h3>
                <Button variant="ghost" size="sm" onClick={() => navigate("/portal/companies")}>View all</Button>
              </div>
              {(d.companies || []).length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No companies yet.</p>
              ) : (
                <ul className="divide-y">
                  {d.companies.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                      <IconBuilding className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.company_number || "Registration pending"}</p>
                      </div>
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="font-semibold">Recent documents</h3>
                <Button variant="ghost" size="sm" onClick={() => navigate("/portal/documents")}>View all</Button>
              </div>
              {(d.recent_documents || []).length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No documents shared with you yet.</p>
              ) : (
                <ul className="divide-y">
                  {d.recent_documents.map((doc) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                        onClick={() => openDocument(doc.id).catch((e) => toast.error(e.message))}
                      >
                        <IconFileText className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{doc.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{doc.category} · {formatDate(doc.created_at)}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </PageState>
      <OrderDetailDialog orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
    </div>
  )
}
