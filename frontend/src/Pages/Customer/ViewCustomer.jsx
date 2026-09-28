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
import { toast } from "sonner"
import { IconBuildingSkyscraper, IconShoppingBag, IconReceipt, IconFileText, IconHelp, IconHistory } from '@tabler/icons-react'

const getInitials = (name) => {
  if (!name) return "CU"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const ViewCustomer = ({ customer, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState("overview")
  const [notificationEmail, setNotificationEmail] = useState("")
  const [isSaving, setIsSaving] = useState(false)

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
  const signedUp = customer?.signedUp || (raw.created_at ? new Date(raw.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : "Recent")
  const companiesCount = customer?.companies ?? raw.companies_count ?? 0
  const ordersCount = customer?.orders ?? raw.orders_count ?? 0

  useEffect(() => {
    if (raw.notification_email) {
      setNotificationEmail(raw.notification_email)
    } else {
      setNotificationEmail("")
    }
  }, [raw])

  const handleSaveNotificationEmail = async () => {
    if (!customer?.id) return
    setIsSaving(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem("token")
      const res = await fetch(`${apiUrl}/admin/customers/notification-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        credentials: "include",
        body: JSON.stringify({
          user_id: customer.id,
          notification_email: notificationEmail.trim()
        })
      })
      const data = await res.json()
      if (res.ok && (data.status === "success" || data.success === true)) {
        toast.success("Notification email updated successfully")
      } else {
        toast.error(data.message || data.error || "Failed to update notification email")
      }
    } catch (err) {
      toast.error("Network error while saving notification email")
    } finally {
      setIsSaving(false)
    }
  }

  if (!customer) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[780px] p-0 overflow-hidden">
        
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
                {wpId ? `WordPress User #${wpId} · ` : `Client ID #${customer.id || ''} · `}
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
              <TabsTrigger value="companies">
                Companies ({companiesCount})
              </TabsTrigger>
              <TabsTrigger value="orders">
                Orders ({ordersCount})
              </TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
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
              <TabsContent value="companies" className="m-0 space-y-3 outline-none">
                {companiesCount > 0 ? (
                  <div className="border rounded-xl p-4 bg-card shadow-xs flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                        <IconBuildingSkyscraper className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Registered Companies Portfolio</p>
                        <p className="text-xs text-muted-foreground">
                          {companiesCount} {companiesCount === 1 ? 'company' : 'companies'} assigned to this client.
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{companiesCount} Active</Badge>
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    No companies currently associated with this client.
                  </div>
                )}
              </TabsContent>

              {/* Orders Tab */}
              <TabsContent value="orders" className="m-0 space-y-3 outline-none">
                {ordersCount > 0 ? (
                  <div className="border rounded-xl p-4 bg-card shadow-xs flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                        <IconShoppingBag className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Recorded Client Orders</p>
                        <p className="text-xs text-muted-foreground">
                          {ordersCount} {ordersCount === 1 ? 'order' : 'orders'} placed.
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">{ordersCount} Total</Badge>
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    No orders recorded for this customer yet.
                  </div>
                )}
              </TabsContent>

              {/* Invoices Tab */}
              <TabsContent value="invoices" className="m-0 py-12 text-center text-muted-foreground text-sm outline-none">
                <IconReceipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No pending or past invoices found.
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity" className="m-0 space-y-3 outline-none">
                <div className="border rounded-xl p-3.5 bg-muted/20 text-sm flex items-start gap-3">
                  <IconHistory className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium text-xs text-muted-foreground">Account Created</p>
                    <p className="text-sm font-semibold">{signedUp}</p>
                  </div>
                </div>
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
    </Dialog>
  )
}

export default ViewCustomer
