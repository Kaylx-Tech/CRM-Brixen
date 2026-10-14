import React, { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { IconBuilding, IconLoader2, IconFileText, IconAlertTriangle } from "@tabler/icons-react"
import { toast } from "sonner"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { apiRequest } from "@/lib/api"
import { openDocument } from "@/lib/documents"
import { usePortalData, PageHeader, PageState, StatusBadge, ProgressBar, formatDate } from "./portalShared"
import { OrderDetailDialog } from "./PortalOrders"
import { attentionIssues, needsAttention, attentionSummary } from "../Companies/attention"

function AttentionBox({ company }) {
  const issues = attentionIssues(company)
  if (!issues.length) return null
  return (
    <Alert variant="destructive" className="border-destructive/40">
      <IconAlertTriangle />
      <AlertTitle>Action needed at Companies House</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-0.5 pl-4">
          {issues.map((item) => (
            <li key={item.code}>
              <span className="font-medium">{item.title || item.code}</span>
              {item.due ? ` — due ${formatDate(item.due)}` : item.detail ? ` — ${item.detail}` : ""}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

function Detail({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium" title={value || ""}>{value || "—"}</p>
    </div>
  )
}

function CompanyDialog({ companyId, onClose }) {
  const [data, setData] = useState(null)
  const [openOrderId, setOpenOrderId] = useState(null)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    setData(null)
    apiRequest(`/client/companies/${companyId}`, { silent: true, label: "Company" }).then((res) => {
      if (cancelled) return
      if (res.ok) setData(res.data?.data || null)
      else {
        toast.error(res.reason || "Could not load the company")
        onClose()
      }
    })
    return () => {
      cancelled = true
    }
  }, [companyId, onClose])

  const c = data?.company || {}
  return (
    <>
      <Dialog open={!!companyId} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{c.name || "Company"}</DialogTitle>
            <DialogDescription>{c.company_number ? `Company number ${c.company_number}` : "Registration in progress"}</DialogDescription>
          </DialogHeader>
          {!data ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <IconLoader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
              <AttentionBox company={c} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Status</p><StatusBadge status={c.status} /></div>
                <Detail label="Incorporated" value={formatDate(c.inc_date)} />
                <Detail label="Director" value={c.director} />
                <Detail label="Accounts due" value={formatDate(c.accounts_next_due)} />
                <Detail label="Confirmation statement due" value={formatDate(c.confirmation_next_due)} />
                <Detail label="Package" value={c.package} />
              </div>
              <Detail label="Registered office" value={c.reg_office} />

              <div>
                <h4 className="mb-2 text-sm font-semibold">Orders</h4>
                {(data.orders || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No orders for this company.</p>
                ) : (
                  <ul className="divide-y rounded-xl border">
                    {data.orders.map((o) => (
                      <li key={o.id}>
                        <button type="button" className="w-full cursor-pointer px-3 py-2 text-left hover:bg-muted/40" onClick={() => setOpenOrderId(o.id)}>
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate font-medium">{o.order_number} · {o.service_name}</span>
                            <StatusBadge status={o.status} />
                          </div>
                          <div className="mt-1.5"><ProgressBar value={o.progress_percent} /></div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Documents</h4>
                {(data.documents || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents shared for this company yet.</p>
                ) : (
                  <ul className="divide-y rounded-xl border">
                    {data.documents.map((doc) => (
                      <li key={doc.id}>
                        <button
                          type="button"
                          className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                          onClick={() => openDocument(doc.id).catch((e) => toast.error(e.message))}
                        >
                          <IconFileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{doc.name}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatDate(doc.created_at)}</span>
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
      <OrderDetailDialog orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
    </>
  )
}

export default function PortalCompanies() {
  const { data, isLoading, error, reload } = usePortalData("/client/companies")
  const [openId, setOpenId] = useState(null)
  const companies = data?.companies || []
  const closeDialog = React.useCallback(() => setOpenId(null), [])

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <PageHeader title="Companies" description="Your registered companies and their deadlines" onRefresh={reload} isLoading={isLoading} />
      <PageState isLoading={isLoading && !data} error={error} onRetry={reload} isEmpty={!companies.length}
        emptyText="No companies yet. Companies we register or manage for you will appear here.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setOpenId(c.id)}
              className={`flex cursor-pointer flex-col gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted/40 ${needsAttention(c) ? "border-destructive/50" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <IconBuilding className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-semibold">{c.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {needsAttention(c) && (
                    <Badge variant="destructive" className="gap-1"><IconAlertTriangle className="size-3" />Attention</Badge>
                  )}
                  <StatusBadge status={c.status} />
                </div>
              </div>
              {needsAttention(c) && (
                <p className="text-xs font-medium text-destructive">{attentionSummary(c)}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Detail label="Company number" value={c.company_number || "Pending"} />
                <Detail label="Incorporated" value={formatDate(c.inc_date)} />
                <Detail label="Accounts due" value={formatDate(c.accounts_next_due)} />
                <Detail label="Confirmation due" value={formatDate(c.confirmation_next_due)} />
              </div>
            </button>
          ))}
        </div>
      </PageState>
      <CompanyDialog companyId={openId} onClose={closeDialog} />
    </div>
  )
}
