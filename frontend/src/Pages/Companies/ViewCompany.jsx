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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IconBuilding, IconCheck, IconFileText, IconShoppingBag, IconAlertCircle, IconShieldCheck, IconLoader2, IconDeviceFloppy, IconShieldCheckFilled, IconClock, IconAlertTriangle } from '@tabler/icons-react'
import { apiRequest } from '@/lib/api'
import { toast } from 'sonner'

const getInitials = (name) => {
  if (!name) return 'CO'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const ViewCompany = ({ company, isOpen, onClose, onUpdate }) => {
  const [activeTab, setActiveTab] = useState('overview')
  const [detail, setDetail] = useState(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [formData, setFormData] = useState({
    identity_verified: 'Not started',
    account_status: 'Good Standing',
    psc_verified: 'Not started',
    status: 'Active',
    utr_number: '',
    authentication_code: '',
    accounts_next_due: '',
    confirmation_next_due: '',
  })

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

  // Sync formData when detail or company changes
  useEffect(() => {
    const src = detail || company?.raw || company || {}
    setFormData({
      identity_verified: src.identity_verified || 'Not started',
      account_status: src.account_status || src.standing || 'Good Standing',
      psc_verified: src.psc_verified || 'Not started',
      status: src.status || 'Active',
      utr_number: src.utr_number || '',
      authentication_code: src.authentication_code || src.auth_code || '',
      accounts_next_due: src.accounts_next_due ? String(src.accounts_next_due).slice(0, 10) : '',
      confirmation_next_due: (src.confirmation_next_due || src.confirmation_statement_next_due) ? String(src.confirmation_next_due || src.confirmation_statement_next_due).slice(0, 10) : '',
    })
  }, [detail, company])

  const handleSaveCompliance = async () => {
    if (!company?.id) return
    setIsSaving(true)
    try {
      const res = await apiRequest(`/admin/companies/${company.id}`, {
        method: 'PUT',
        body: formData,
        label: 'Update Company Compliance',
      })
      if (res.ok) {
        toast.success('Company compliance & status updated successfully')
        const updatedData = res.data || {}
        setDetail((prev) => ({ ...(prev || {}), ...formData, ...updatedData }))
        if (onUpdate) onUpdate({ ...(company || {}), ...formData, ...updatedData })
      } else {
        toast.error(res.reason || 'Failed to update compliance status')
      }
    } catch (err) {
      toast.error(err?.message || 'Error updating compliance status')
    } finally {
      setIsSaving(false)
    }
  }

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
  const isGenuine = Boolean(d.is_genuine || d.data_locked || raw.is_genuine || raw.data_locked || company.is_genuine || company.data_locked)
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
                {isGenuine && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <IconShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    Genuine Record
                  </span>
                )}
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
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">Record Security</span>
                    <span className="font-medium text-foreground flex items-center gap-1.5">
                      {isGenuine ? (
                        <>
                          <IconShieldCheck className="w-4 h-4 text-emerald-600" /> Genuine Protected Record
                        </>
                      ) : (
                        'Standard Record'
                      )}
                    </span>
                  </div>
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

              {/* Compliance Tab (matching app.js / legacy compliance layout 1:1) */}
              <TabsContent value="compliance" className="m-0 space-y-6 outline-none">
                <p className="text-sm text-muted-foreground">
                  Stored on this company card for filings and HMRC / Companies House work.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSaveCompliance()
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="portfolio-compliance-utr" className="text-sm font-medium text-foreground">
                        UTR number
                      </Label>
                      <Input
                        id="portfolio-compliance-utr"
                        placeholder="e.g. 1234567890"
                        maxLength={15}
                        value={formData.utr_number}
                        onChange={(e) => setFormData((prev) => ({ ...prev, utr_number: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="portfolio-compliance-auth" className="text-sm font-medium text-foreground">
                        Authentication code
                      </Label>
                      <Input
                        id="portfolio-compliance-auth"
                        placeholder="Companies House auth code"
                        maxLength={12}
                        value={formData.authentication_code}
                        onChange={(e) => setFormData((prev) => ({ ...prev, authentication_code: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="portfolio-compliance-activation" className="text-sm font-medium text-foreground">
                      Personal 11 digits code
                    </Label>
                    <Input
                      id="portfolio-compliance-activation"
                      placeholder="11-digit personal code"
                      maxLength={40}
                      value={formData.activation_code}
                      onChange={(e) => setFormData((prev) => ({ ...prev, activation_code: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-foreground">
                        Identity verification
                      </Label>
                      <Select
                        value={formData.identity_verified}
                        onValueChange={(val) => setFormData((prev) => ({ ...prev, identity_verified: val }))}
                      >
                        <SelectTrigger className="w-full h-10 text-sm">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectGroup>
                          <SelectContent className="overflow-hidden p-0">
                            {['Not started', 'In progress', 'Verified', 'Failed'].map((st) => (
                              <SelectItem key={st} value={st}>
                                {st}
                              </SelectItem>
                          ))}
                        </SelectContent>
                        </SelectGroup>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-foreground">
                        PSC verification
                      </Label>
                      <Select
                        value={formData.psc_verified}
                        onValueChange={(val) => setFormData((prev) => ({ ...prev, psc_verified: val }))}
                      >
                        <SelectTrigger className="w-full h-10 text-sm">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectGroup>
                        <SelectContent className="overflow-hidden p-0">
                          {['Not started', 'In progress', 'Verified', 'Update required'].map((st) => (
                            <SelectItem key={st} value={st}>
                              {st}
                            </SelectItem>
                          ))}
                        </SelectContent>
                        </SelectGroup>
                      </Select>
                    </div>
                  </div>

                  <div className="pt-1">
                    <Button
                      type="submit"
                      disabled={isSaving}
                    >
                      {isSaving && <IconLoader2 className="w-4 h-4 animate-spin" />}
                      {isSaving ? 'Saving…' : 'Save codes'}
                    </Button>
                  </div>
                </form>

                {/* Standing Box matching screenshot */}
                <div className="p-4 rounded-xl border bg-muted/10 space-y-1 mt-4">
                  <span className="text-xs text-muted-foreground block font-medium">Standing</span>
                  <span className="text-sm font-bold text-foreground">
                    {detail?.account_status || raw.account_status || company.account_status || 'Good Standing'}
                  </span>
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