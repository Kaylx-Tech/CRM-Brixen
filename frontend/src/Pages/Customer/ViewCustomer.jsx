import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from "sonner"
import { apiRequest } from '@/lib/api'
import { downloadDocument } from '@/lib/documents'
import DocumentPreview from '@/components/DocumentPreview'

const getInitials = (name) => {
  if (!name) return "CU"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const fmtDate = (v) => {
  if (!v) return '—'
  const d = new Date(String(v).replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? String(v).slice(0, 10)
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const money = (v) => (v === undefined || v === null || v === '' ? null : `£${Number(v).toFixed(2)}`)

const Empty = ({ children }) => (
  <div className="py-12 text-center text-muted-foreground text-sm">{children}</div>
)

const Row = ({ title, meta, right }) => (
  <div className="border rounded-xl p-3.5 bg-card shadow-xs flex items-start justify-between gap-3">
    <div className="min-w-0">
      <p className="font-semibold text-sm truncate">{title}</p>
      {meta && <p className="text-xs text-muted-foreground mt-0.5">{meta}</p>}
    </div>
    {right}
  </div>
)

const ViewCustomer = ({ customer, isOpen, onClose, onCustomerUpdated }) => {
  const [activeTab, setActiveTab] = useState("overview")
  const [notificationEmail, setNotificationEmail] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [previewDoc, setPreviewDoc] = useState(null)

  const raw = customer?.raw || {}
  const name = customer?.name || raw.full_name || "Customer"
  const email = customer?.email || raw.email || ""
  const phone = raw.phone || customer?.phone || "N/A"
  const address = raw.address || customer?.address || "N/A"
  const country = raw.country || customer?.country || "United Kingdom"
  const status = customer?.status || raw.status || "Active"
  const type = customer?.type || (raw.is_b2b ? "B2B" : raw.client_type || "Individual")
  const b2bId = raw.b2b_id || (type === "B2B" ? `B2B-${String(customer?.id || 1).padStart(6, '0')}` : null)
  const wpId = raw.wordpress_user_id || customer?.wordpress_user_id
  const signedUp = customer?.signedUp || fmtDate(raw.created_at)
  const companies = detail?.companies || []
  const orders = detail?.orders || []
  const invoices = detail?.invoices || []
  const documents = detail?.documents || []
  const tickets = detail?.support_tickets || []
  const logs = detail?.activity_logs || []
  const companiesCount = detail ? companies.length : (customer?.companies ?? raw.companies_count ?? 0)
  const ordersCount = detail ? orders.length : (customer?.orders ?? raw.orders_count ?? 0)

  useEffect(() => {
    setNotificationEmail(raw.notification_email || "")
  }, [raw])

  // Load the full profile (companies, orders, invoices, documents, tickets, activity)
  useEffect(() => {
    if (!isOpen || !customer?.id) return
    let cancelled = false
    setDetailLoading(true)
    apiRequest(`/admin/customers/${customer.id}`, { label: 'Customer profile', silent: true })
      .then((res) => {
        if (cancelled) return
        if (res.ok) setDetail(res.data?.data || res.data)
        else toast.error(res.reason || 'Could not load customer profile')
      })
      .finally(() => !cancelled && setDetailLoading(false))
    return () => { cancelled = true }
  }, [isOpen, customer?.id])

  const handleSaveNotificationEmail = async () => {
    if (!customer?.id) return
    setIsSaving(true)
    const res = await apiRequest('/admin/customers/notification-email', {
      method: 'POST',
      label: 'Notification email',
      silent: true,
      body: JSON.stringify({ customer_id: customer.id, notification_email: notificationEmail.trim() }),
    })
    setIsSaving(false)
    if (res.ok) {
      toast.success(res.data?.message || "Notification email updated successfully")
      onCustomerUpdated?.()
    } else {
      toast.error(res.reason || "Failed to update notification email")
    }
  }

  if (!customer) return null

  const loading = detailLoading && !detail

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[820px] p-0 overflow-hidden">

        {/* Header Section */}
        <div className="p-6 border-b bg-muted/20">
          <DialogHeader className="flex-row items-center gap-4 space-y-0 text-left">
            <Avatar className="w-14 h-14 bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold">
              <AvatarFallback>{getInitials(name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-xl font-bold">{name}</DialogTitle>
                <Badge variant={type === "B2B" ? "default" : type === "Business" ? "outline" : "secondary"}>
                  {type}
                </Badge>
                <Badge variant={status === "Active" ? "outline" : "destructive"}>
                  {status}
                </Badge>
              </div>
              <DialogDescription className="text-sm mt-1 truncate">
                {wpId ? `WP User ID: ${wpId} · ` : `Client ID #${customer.id || ''} · `}
                {email}
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col">
          <div className="px-6 py-2">
            <TabsList className="flex w-full justify-start overflow-x-auto h-auto py-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="companies">Companies ({companiesCount})</TabsTrigger>
              <TabsTrigger value="orders">Orders ({ordersCount})</TabsTrigger>
              <TabsTrigger value="invoices">Invoices{detail ? ` (${invoices.length})` : ''}</TabsTrigger>
              <TabsTrigger value="documents">Documents{detail ? ` (${documents.length})` : ''}</TabsTrigger>
              <TabsTrigger value="support">Support{detail ? ` (${tickets.length})` : ''}</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="h-[50vh] min-h-[340px] w-full">
            <div className="p-6">

              {/* Overview Tab */}
              <TabsContent value="overview" className="m-0 space-y-6 outline-none">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
                  {b2bId && (
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">B2B Identifier</span>
                      <span className="font-semibold text-primary">{b2bId}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Customer Type</span>
                    <span className="font-medium">{type} Account</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Login Email</span>
                    <span className="font-medium truncate">{email}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Phone Number</span>
                    <span className="font-medium">{phone}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Country</span>
                    <span className="font-medium">{country}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Registration Date</span>
                    <span className="font-medium">{signedUp}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Source</span>
                    <span className="font-medium">{customer.source || "CRM"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Access</span>
                    <span className="font-medium">{customer.access || '—'}</span>
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Address</span>
                    <span className="font-medium">{address}</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label className="font-semibold text-sm">Notification Email Dispatch</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      placeholder="Leave blank to use primary login email"
                      className="max-w-md h-9"
                      value={notificationEmail}
                      onChange={(e) => setNotificationEmail(e.target.value)}
                    />
                    <Button size="sm" className="h-9" onClick={handleSaveNotificationEmail} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    All automated intake alerts, compliance deadlines, and order receipts will be delivered to this address.
                  </p>
                </div>
              </TabsContent>

              {/* Companies Tab */}
              <TabsContent value="companies" className="m-0 space-y-2 outline-none">
                {loading ? <Skeleton className="h-16 w-full" /> : companies.length === 0 ? (
                  <Empty>No registered companies for this client.</Empty>
                ) : companies.map((c) => (
                  <Row
                    key={c.id}
                    title={`${c.name || c.company_name} ${c.company_number ? `(#${c.company_number})` : ''}`}
                    meta={`${c.package ? `${c.package} · ` : ''}Office: ${c.reg_office || '—'} · Status: ${c.status || '—'}`}
                    right={<Badge variant="outline">{c.status || '—'}</Badge>}
                  />
                ))}
              </TabsContent>

              {/* Orders Tab */}
              <TabsContent value="orders" className="m-0 space-y-2 outline-none">
                {loading ? <Skeleton className="h-16 w-full" /> : orders.length === 0 ? (
                  <Empty>No order history available.</Empty>
                ) : orders.map((o) => (
                  <Row
                    key={o.id}
                    title={`${o.order_number} — ${o.products_summary || o.service_name || ''}`}
                    meta={`${fmtDate(o.created_at)}${o.company_name ? ` · ${o.company_name}` : ''}${o.payment_status ? ` · Payment: ${o.payment_status}` : ''}`}
                    right={(
                      <div className="flex items-center gap-2 shrink-0">
                        {money(o.total) && <span className="text-sm font-medium">{money(o.total)}</span>}
                        <Badge variant="secondary">{o.status}</Badge>
                      </div>
                    )}
                  />
                ))}
              </TabsContent>

              {/* Invoices Tab */}
              <TabsContent value="invoices" className="m-0 space-y-2 outline-none">
                {loading ? <Skeleton className="h-16 w-full" /> : invoices.length === 0 ? (
                  <Empty>No invoices available.</Empty>
                ) : invoices.map((i) => (
                  <Row
                    key={i.id}
                    title={i.invoice_number}
                    meta={`${fmtDate(i.created_at)}${i.due_date ? ` · Due ${fmtDate(i.due_date)}` : ''}${i.paid_at ? ` · Paid ${fmtDate(i.paid_at)}` : ''}`}
                    right={(
                      <div className="flex items-center gap-2 shrink-0">
                        {money(i.total) && <span className="text-sm font-medium">{money(i.total)}</span>}
                        <Badge variant="outline">{i.status}</Badge>
                      </div>
                    )}
                  />
                ))}
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="m-0 space-y-2 outline-none">
                {loading ? <Skeleton className="h-16 w-full" /> : documents.length === 0 ? (
                  <Empty>No documents uploaded.</Empty>
                ) : documents.map((d) => (
                  <Row
                    key={d.id}
                    title={d.name}
                    meta={`${d.category || '—'} · ${d.order_number || 'No order'} · ${fmtDate(d.created_at)}${d.uploaded_by ? ` · ${d.uploaded_by}` : ''}`}
                    right={(
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline">{d.status || '—'}</Badge>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPreviewDoc(d)}>
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => downloadDocument(d.id, d.name).catch((e) => toast.error(e.message || 'Download failed'))}
                        >
                          Download
                        </Button>
                      </div>
                    )}
                  />
                ))}
              </TabsContent>

              {/* Support Tab */}
              <TabsContent value="support" className="m-0 space-y-2 outline-none">
                {loading ? <Skeleton className="h-16 w-full" /> : tickets.length === 0 ? (
                  <Empty>No support tickets filed.</Empty>
                ) : tickets.map((t) => (
                  <Row
                    key={t.id}
                    title={`Ticket #${t.ticket_number}: ${t.subject || ''}`}
                    meta={`${fmtDate(t.created_at)}${t.priority ? ` · ${t.priority}` : ''}`}
                    right={<Badge variant="outline">{t.status}</Badge>}
                  />
                ))}
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity" className="m-0 space-y-2 outline-none">
                {loading ? <Skeleton className="h-16 w-full" /> : logs.length === 0 ? (
                  <Empty>No audit trail recorded.</Empty>
                ) : logs.map((l, idx) => (
                  <Row
                    key={idx}
                    title={l.action}
                    meta={`${fmtDate(l.created_at)}${l.details ? ` · ${l.details}` : ''}`}
                  />
                ))}
                <Row title="Account created" meta={signedUp} />
              </TabsContent>

            </div>
          </ScrollArea>
        </Tabs>

        {/* Footer Section */}
        <div className="p-4 border-t bg-muted/10 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

      </DialogContent>

      {/* Document viewer (streamed through the API) */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="sm:max-w-[900px] p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-base truncate pr-6">{previewDoc?.name}</DialogTitle>
            <DialogDescription className="text-xs">{previewDoc?.category || 'Document'}</DialogDescription>
          </DialogHeader>
          <div className="p-4 max-h-[80vh] overflow-auto">
            {previewDoc && <DocumentPreview doc={previewDoc} />}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

export default ViewCustomer
