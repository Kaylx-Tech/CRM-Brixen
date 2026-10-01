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
import { IconBuilding, IconCheck, IconFileText, IconShoppingBag, IconAlertCircle } from '@tabler/icons-react'
import { apiRequest } from '@/lib/api'
import { toast } from 'sonner'

const getInitials = (name) => {
  if (!name) return 'CO'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const ViewCompany = ({ company, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('overview')
  const [detail, setDetail] = useState(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

  // Fetch full details if company has ID
  useEffect(() => {
    if (!isOpen || !company?.id) {
      setDetail(null)
      return
    }
    let isMounted = true
    setIsLoadingDetail(true)
    apiRequest(`/admin/companies/${company.id}`, { label: 'Company Details' })
      .then((res) => {
        if (isMounted && res.ok && res.data) {
          setDetail(res.data)
        }
      })
      .catch((err) => {
        console.error('Error fetching company details:', err)
      })
      .finally(() => {
        if (isMounted) setIsLoadingDetail(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, company?.id])

  if (!company) return null

  const raw = company.raw || {}
  const d = detail || {}

  const name = d.company_name || d.name || company.name || raw.company_name || 'Unnamed Company'
  const number = d.company_number || d.number || company.number || raw.company_number || '—'
  const director = d.director || d.director_name || company.director || raw.director || '—'
  const address = d.reg_office || d.registered_office_address || company.address || raw.registered_office_address || 'United Kingdom'
  const status = d.status || company.status || raw.status || 'Active'
  const countryFlag = company.countryFlag || '🇬🇧'
  const countryName = company.countryName || 'UK'
  
  const incDateRaw = d.incorporation_date || d.inc_date || company.incDate || raw.incorporation_date || raw.inc_date
  const incDateFormatted = incDateRaw
    ? (isNaN(new Date(incDateRaw).getTime()) ? incDateRaw : new Date(incDateRaw).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }))
    : '—'

  const clientName = d.client_name || raw.client_name || '—'
  const clientEmail = d.client_email || raw.client_email || raw.email || ''
  const clientPhone = d.client_phone || raw.client_phone || raw.phone || ''
  const accountsDue = d.accounts_next_due || raw.accounts_next_due || company.deadlineText || 'No upcoming deadlines'
  const confirmationDue = d.confirmation_statement_next_due || d.confirmation_next_due || raw.confirmation_statement_next_due || raw.confirmation_next_due || '—'
  const authCode = d.auth_code || raw.auth_code || ''
  const utrNumber = d.utr_number || d.utr || raw.utr_number || ''
  const sicCodes = d.sic_codes || raw.sic_codes || d.sic_description || raw.sic_description || 'Standard commercial trading'

  const directorsList = Array.isArray(d.directors) && d.directors.length > 0 
    ? d.directors 
    : [{ name: director, role: 'Director' }]

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden">
        
        {/* Header Section */}
        <div className="p-6 border-b bg-muted/20">
          <DialogHeader className="flex-row items-center gap-4 space-y-0 text-left">
            <Avatar className="w-14 h-14 bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">
              <AvatarFallback>{getInitials(name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-xl font-bold truncate max-w-[500px]" title={name}>{name}</DialogTitle>
                <Badge className={
                  status === 'Active' ? 'badge-green' :
                  status === 'Dissolved' ? 'badge-red' :
                  status === 'Inactive' ? 'badge-amber' : 'badge-blue'
                }>
                  {status}
                </Badge>
              </div>
              <DialogDescription className="text-sm mt-1 flex items-center gap-2 flex-wrap">
                <span>#{number}</span>
                <span>•</span>
                <span>{countryFlag} {countryName}</span>
                <span>•</span>
                <span className="truncate max-w-[320px]" title={address}>{address}</span>
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col">
          <div className="px-6 py-2 border-b overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <TabsList className="flex w-max">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="registered-office">Registered Office</TabsTrigger>
              <TabsTrigger value="business-activity">Business Activity</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
              <TabsTrigger value="orders">Orders / Services</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="h-[55vh] min-h-[380px] w-full">
            <div className="p-6 overflow-x-hidden">
            
              {/* Overview Tab */}
              <TabsContent value="overview" className="m-0 space-y-6 outline-none">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Company Name</span>
                    <span className="font-semibold text-foreground">{name}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Company Number</span>
                    <span className="font-semibold text-foreground">{number}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Status</span>
                    <div>
                      <Badge className={status === 'Active' ? 'badge-green' : 'badge-amber'}>
                        {status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Country</span>
                    <span className="font-medium text-foreground">United Kingdom</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Incorporation Date</span>
                    <span className="font-medium text-foreground">{incDateFormatted}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Director</span>
                    <span className="font-medium text-foreground">{director}</span>
                  </div>
                  {clientName !== '—' && (
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Client Owner</span>
                      <span className="font-medium text-foreground">{clientName}</span>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Business / Contact Email</Label>
                    <div className="flex items-center gap-3">
                      <Input value={clientEmail || '—'} className="max-w-md bg-muted/40" readOnly />
                      {clientEmail && <Badge variant="secondary" className="shrink-0">Verified</Badge>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Phone / WhatsApp Number</Label>
                    <div className="flex items-center gap-3">
                      <Input value={clientPhone || '—'} className="max-w-md bg-muted/40" readOnly />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Registered Office Tab */}
              <TabsContent value="registered-office" className="m-0 space-y-6 outline-none">
                <div className="grid grid-cols-1 gap-y-4">
                  <div className="space-y-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Registered Office Address</span>
                    <p className="text-sm font-medium bg-muted/30 p-3 rounded-lg border">{address}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Jurisdiction</span>
                      <p className="text-sm font-medium text-foreground">England & Wales</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Entity Type</span>
                      <p className="text-sm font-medium text-foreground">Private Limited Company (LTD)</p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Business Activity Tab */}
              <TabsContent value="business-activity" className="m-0 space-y-6 outline-none">
                <div className="border rounded-xl p-4 space-y-2 bg-background shadow-xs">
                  <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Principal Activity / SIC</div>
                  <div className="font-medium text-sm text-foreground">
                    {sicCodes}
                  </div>
                </div>
              </TabsContent>

              {/* Compliance Tab */}
              <TabsContent value="compliance" className="m-0 space-y-6 outline-none">
                <p className="text-xs text-muted-foreground">
                  Filing deadlines and official reference codes for this company.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 p-3 rounded-lg border bg-muted/10">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Next Accounts Due</span>
                    <p className="text-sm font-medium text-foreground">{accountsDue}</p>
                  </div>
                  
                  <div className="space-y-1.5 p-3 rounded-lg border bg-muted/10">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Confirmation Statement Due</span>
                    <p className="text-sm font-medium text-foreground">{confirmationDue}</p>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-lg border bg-muted/10">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">UTR Number</span>
                    <p className="text-sm font-medium text-foreground">{utrNumber || 'Not recorded'}</p>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-lg border bg-muted/10">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Companies House Auth Code</span>
                    <p className="text-sm font-medium text-foreground">{authCode || 'Not recorded'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 pt-2">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Identity Verification</span>
                    <Badge variant="outline" className="badge-green">Verified</Badge>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground block font-medium">Standing</span>
                    <Badge variant="outline" className="badge-blue">Good Standing</Badge>
                  </div>
                </div>
              </TabsContent>

              {/* Orders Tab */}
              <TabsContent value="orders" className="m-0 outline-none">
                {Array.isArray(d.orders) && d.orders.length > 0 ? (
                  <div className="space-y-3">
                    {d.orders.map((ord, idx) => (
                      <div key={ord.id || idx} className="border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-background shadow-xs">
                        <div>
                          <div className="font-semibold text-sm mb-1 flex items-center gap-1.5 flex-wrap">
                            #{ord.order_number || ord.id} <span className="font-normal text-muted-foreground">— {ord.service_name || ord.title || 'Service'}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Status: <span className="font-medium text-foreground">{ord.status || 'In Progress'}</span>
                          </div>
                        </div>
                        <div className="text-sm font-semibold">
                          {ord.total ? `£${ord.total}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed rounded-xl p-8 text-center bg-muted/10">
                    <IconShoppingBag className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                    <p className="text-sm font-medium text-muted-foreground">No orders linked directly to this company.</p>
                  </div>
                )}
              </TabsContent>

              {/* Documents Tab */}
              <TabsContent value="documents" className="m-0 space-y-6 outline-none">
                {Array.isArray(d.documents) && d.documents.length > 0 ? (
                  <div className="space-y-3">
                    {d.documents.map((doc, idx) => (
                      <div key={doc.id || idx} className="border rounded-xl p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 bg-background shadow-xs">
                        <div className="space-y-1">
                          <h4 className="font-medium text-sm text-foreground">{doc.title || doc.filename || 'Document'}</h4>
                          <p className="text-xs text-muted-foreground">{doc.category || 'Company Document'} • {doc.size || ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed rounded-xl p-8 text-center bg-muted/10">
                    <IconFileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                    <p className="text-sm font-medium text-muted-foreground">No documents uploaded for this company record.</p>
                  </div>
                )}
              </TabsContent>

            </div>
          </ScrollArea>
        </Tabs>

        {/* Footer Section */}
        <div className="p-4 border-t flex justify-end bg-muted/10">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  )
}

export default ViewCompany