import React, { useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  IconBriefcase, 
  IconCurrencyPound, 
  IconTag, 
  IconFileText, 
  IconChecklist, 
  IconTrendingUp, 
  IconEdit, 
  IconShieldCheck,
  IconReceipt2,
  IconBox,
  IconCornerDownRight,
  IconForms,
} from '@tabler/icons-react'
import { FIELD_TYPES } from './FormFieldsBuilder'
import { canViewRevenue } from '@/lib/permissions'

/** Read-only view of a service's order form (as built in Edit Service), with sub-fields under their trigger. */
function FormFieldsPreview({ fields, nested = false }) {
  return (
    <ul className={nested ? 'mt-2 space-y-2 border-l-2 border-dashed pl-3' : 'space-y-2'}>
      {fields.map((f, i) => {
        const type = FIELD_TYPES.find((t) => t.value === f.type)
        const Icon = type?.icon || IconForms
        return (
          <li key={f.id || i} className={`rounded-lg border p-3 ${nested ? 'bg-background' : 'bg-muted/20'}`}>
            <div className="flex items-start gap-2">
              <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{f.label}</span>
                  {f.required ? (
                    <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                      {f.type === 'checkbox' ? 'Must be ticked' : 'Required'}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {type?.label || f.type}
                  {f.placeholder ? ` · hint: "${f.placeholder}"` : ''}
                </p>
                {f.type === 'radio' ? (
                  <ul className="mt-2 space-y-1.5">
                    {(f.options || []).map((opt, oi) => {
                      const branch = (f.option_fields || [])[oi] || []
                      return (
                        <li key={opt} className="text-sm">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full border border-muted-foreground/60" />
                            {opt}
                          </span>
                          {branch.length ? (
                            <div className="ml-4">
                              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <IconCornerDownRight className="w-3.5 h-3.5" /> When chosen, also ask:
                              </p>
                              <FormFieldsPreview fields={branch} nested />
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
                {f.type === 'checkbox' && (f.fields || []).length ? (
                  <>
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <IconCornerDownRight className="w-3.5 h-3.5" /> When ticked, also ask:
                    </p>
                    <FormFieldsPreview fields={f.fields} nested />
                  </>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const getCategoryColor = (category) => {
  switch (category?.toLowerCase()) {
    case 'corporate':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
    case 'solutions':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800'
    case 'professional':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
    case 'forms':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
    case 'digital':
      return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
  }
}

const getCategoryIcon = (category) => {
  switch (category?.toLowerCase()) {
    case 'corporate':
      return <IconBriefcase className="w-6 h-6" />
    case 'solutions':
      return <IconBox className="w-6 h-6" />
    case 'professional':
      return <IconShieldCheck className="w-6 h-6" />
    case 'forms':
      return <IconFileText className="w-6 h-6" />
    default:
      return <IconTag className="w-6 h-6" />
  }
}

const ViewService = ({ service, isOpen, onClose, onEdit }) => {
  const [activeTab, setActiveTab] = useState("overview")

  if (!service) return null

  // Cost price, profit and margin are for admins only; the team sees the sell price
  const showFinance = canViewRevenue()

  // Calculate pricing numbers safely
  const sellPriceNum = typeof service.price === 'number' 
    ? service.price 
    : parseFloat(String(service.sellPrice || service.price || '0').replace(/[^0-9.-]+/g, "")) || 0
  
  const costPriceNum = typeof service.cost_price === 'number' 
    ? service.cost_price 
    : parseFloat(String(service.originalPrice || service.cost_price || '0').replace(/[^0-9.-]+/g, "")) || 0
  
  const profitNum = sellPriceNum - costPriceNum
  const marginPercent = sellPriceNum > 0 ? ((profitNum / sellPriceNum) * 100).toFixed(1) : "0.0"

  const serviceId = service.id ? `SRV-${String(service.id).padStart(4, '0')}` : 'SRV-0000'
  const category = service.category || 'Corporate'
  const status = service.status || 'Active'
  const description = service.description || 'No detailed description provided for this catalog service.'
  const formFields = Array.isArray(service.form_fields) ? service.form_fields : []

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-180 p-0 max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header Section */}
        <div className="p-6 border-b bg-muted/20 shrink-0">
          <DialogHeader className="flex-row items-center gap-4 space-y-0 text-left">
          
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-xl font-bold truncate">{service.name}</DialogTitle>
                <Badge variant={status === 'Active' ? 'default' : 'secondary'} className={status === 'Active' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}>
                  {status}
                </Badge>
                <Badge variant="outline" className="font-mono text-sm">
                  {serviceId}
                </Badge>
              </div>
              <DialogDescription className="text-sm mt-1 flex items-center gap-2">
                <span className="font-medium text-foreground">{category}</span>
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex min-h-0 flex-1 flex-col">
          <div className="px-6 py-2 border-b bg-background shrink-0">
            <TabsList className="flex w-full justify-start overflow-x-auto h-auto py-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              {showFinance ? <TabsTrigger value="pricing">Financials & Margin</TabsTrigger> : null}
              <TabsTrigger value="compliance">Requirements & Docs</TabsTrigger>
              <TabsTrigger value="form">
                Order Form{formFields.length ? ` (${formFields.length})` : ''}
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="min-h-0 flex-1 w-full">
            <div className="p-6 space-y-6">
            
              {/* Overview Tab */}
              <TabsContent value="overview" className="m-0 space-y-6 outline-none">
                {/* Financial KPI Cards */}
                <div className={`grid grid-cols-1 gap-3 ${showFinance ? 'sm:grid-cols-3' : ''}`}>
                  <div className="p-4 rounded-xl border bg-card/60 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-sm font-semibold uppercase tracking-wider">Sell Price</span>
                      <IconCurrencyPound className="w-4 h-4 text-primary" />
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl font-bold text-foreground">£{sellPriceNum.toFixed(2)}</div>
                      <span className="text-sm text-muted-foreground">Customer price</span>
                    </div>
                  </div>

                  {showFinance ? (
                  <>
                  <div className="p-4 rounded-xl border bg-card/60 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-sm font-semibold uppercase tracking-wider">Cost Price</span>
                      <IconReceipt2 className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl font-bold text-muted-foreground">£{costPriceNum.toFixed(2)}</div>
                      <span className="text-sm text-muted-foreground">Base cost</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border bg-card/60 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-sm font-semibold uppercase tracking-wider">Profit Margin</span>
                      <IconTrendingUp className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        £{profitNum.toFixed(2)}
                      </div>
                      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        {marginPercent}% net margin
                      </span>
                    </div>
                  </div>
                  </>
                  ) : null}
                </div>

                {/* Details Grid */}
                <div className="border rounded-xl p-5 bg-card/40 space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Service Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">Service Name</span>
                      <span className="font-semibold text-foreground">{service.name}</span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">Category</span>
                      <span className="font-medium">{category}</span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">Current Status</span>
                      <div>
                        <Badge variant={status === 'Active' ? 'outline' : 'secondary'} className={status === 'Active' ? 'text-emerald-600 border-emerald-300' : ''}>
                          {status}
                        </Badge>
                      </div>
                    </div>

                    {service.vat_rate !== undefined && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">VAT Rate</span>
                        <span className="font-medium">{service.vat_rate || '20% (Standard)'}</span>
                      </div>
                    )}

                    {service.estimated_delivery_time && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">Delivery Turnaround</span>
                        <span className="font-medium">{service.estimated_delivery_time}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                <div className="border rounded-xl p-5 bg-card/40 space-y-2">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Description & Scope</h4>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {description}
                  </p>
                </div>
              </TabsContent>

              {/* Pricing & Margins Tab */}
              <TabsContent value="pricing" className="m-0 space-y-5 outline-none">
                <div className="border rounded-xl p-5 bg-card space-y-4">
                  <h4 className="text-sm font-semibold">Pricing & Cost Structure</h4>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b text-sm">
                      <span className="text-muted-foreground">Retail Selling Price</span>
                      <span className="font-bold text-base">£{sellPriceNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b text-sm">
                      <span className="text-muted-foreground">Original / Fulfillment Cost</span>
                      <span className="font-medium text-muted-foreground">£{costPriceNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b text-sm">
                      <span className="text-muted-foreground">Gross Profit per Unit</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">£{profitNum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 text-sm">
                      <span className="text-muted-foreground">Profit Margin Ratio</span>
                      <span className="font-semibold text-primary">{marginPercent}%</span>
                    </div>
                  </div>

                  {/* Visual Margin Bar */}
                  <div className="pt-2">
                    <div className="flex justify-between text-sm text-muted-foreground mb-1.5 font-medium">
                      <span>Cost: {costPriceNum > 0 && sellPriceNum > 0 ? (100 - parseFloat(marginPercent)).toFixed(1) : 0}%</span>
                      <span>Profit: {marginPercent}%</span>
                    </div>
                    <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden flex">
                      <div 
                        className="bg-slate-300 dark:bg-slate-600 h-full" 
                        style={{ width: `${Math.max(0, 100 - parseFloat(marginPercent))}%` }} 
                      />
                      <div 
                        className="bg-emerald-500 h-full" 
                        style={{ width: `${Math.min(100, Math.max(0, parseFloat(marginPercent)))}%` }} 
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Compliance & Requirements Tab */}
              <TabsContent value="compliance" className="m-0 space-y-4 outline-none">
                <div className="border rounded-xl p-5 bg-card space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                      <IconChecklist className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Standard Intake Documents</p>
                      <p className="text-sm text-muted-foreground">
                        Required identification and compliance paperwork for client delivery.
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border">
                      <IconShieldCheck className="w-4 h-4 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Proof of Identity (Photo ID)</p>
                        <p className="text-sm text-muted-foreground">Passport or Driving Licence (PDF, JPG, PNG)</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border">
                      <IconShieldCheck className="w-4 h-4 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Proof of Address</p>
                        <p className="text-sm text-muted-foreground">Utility bill or Bank statement issued within last 3 months</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border">
                      <IconBriefcase className="w-4 h-4 text-primary mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">Service Authorization Details</p>
                        <p className="text-sm text-muted-foreground">Client authorization form and designated company details</p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Order Form Tab: the questions asked when this service is ordered */}
              <TabsContent value="form" className="m-0 space-y-4 outline-none">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">Order form</p>
                    <p className="text-sm text-muted-foreground">
                      Asked in the Create Order wizard when this service is selected.
                    </p>
                  </div>
                  {onEdit ? (
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => {
                        onClose()
                        onEdit(service)
                      }}>
                      <IconEdit className="w-4 h-4" /> Edit form
                    </Button>
                  ) : null}
                </div>
                {formFields.length ? (
                  <FormFieldsPreview fields={formFields} />
                ) : (
                  <p className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    No order form yet. The order uses the standard details only.
                  </p>
                )}
              </TabsContent>

            </div>
          </ScrollArea>
        </Tabs>

        {/* Footer Section */}
        <div className="p-4 border-t bg-muted/10 flex items-center justify-between shrink-0">
          <div className="text-sm text-muted-foreground">
            ID: <span className="font-mono">{serviceId}</span>
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-1.5"
                onClick={() => {
                  onClose()
                  onEdit(service)
                }}
              >
                <IconEdit className="w-4 h-4" />
                Edit Service
              </Button>
            )}
            <Button variant="default" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}

export default ViewService
