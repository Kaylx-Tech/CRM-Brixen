import React, { useState, useEffect, useMemo, useCallback } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  IconCopy,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconPencil,
  IconTrash,
  IconDeviceFloppy,
  IconX,
  IconFileText,
  IconPackage,
  IconBuilding,
  IconUser,
  IconMail,
  IconPhone,
  IconKey,
  IconDownload,
  IconSearch,
  IconUpload,
  IconExternalLink,
  IconLoader2,
} from '@tabler/icons-react'
import { apiRequest, getApiBase, authHeaders } from '@/lib/api'
import { toast } from 'sonner'
import { toastProcessing, toastDone, toastFail } from '@/lib/toastActions'
import ToastSave from '@/components/ToastSave'
import DocumentPreview from '@/components/DocumentPreview'
import { downloadDocument } from '@/lib/documents'

const PAYMENT_MODES = [
  { value: 'PKR(Bank Transfer)', label: 'PKR (Bank Transfer)' },
  { value: 'GBP(Bank Transfer)', label: 'GBP (Bank Transfer)' },
  { value: 'Website Charge', label: 'Website Charge' },
]

const STATUS_OPTIONS = [
  'Pending Verification',
  'Pending',
  'Processing',
  'In Progress',
  'Completed',
  'Cancelled',
  'Refunded',
]

function formatOrderNumberDisplay(raw) {
  const s = String(raw ?? '').trim()
  if (!s || s === '—') return '—'
  const tail = s.match(/(\d+)\s*$/)
  const digits = tail ? tail[1] : s.replace(/\D/g, '')
  if (!digits) return s
  return `#GB${String(parseInt(digits, 10))}`
}

function formatDateDisplay(raw) {
  if (!raw) return '—'
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return String(raw)
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(raw)
  }
}

function isWideField(label) {
  return /address|description|activity|activities|proof|source of funds/i.test(label || '')
}

export default function ViewOrder({ orderId, isOpen, onClose, onOrderUpdated }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [order, setOrder] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Edit details mode
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [formFields, setFormFields] = useState([])
  const [isSavingDetails, setIsSavingDetails] = useState(false)

  // Edit credentials mode
  const [isEditingCreds, setIsEditingCreds] = useState(false)
  const [accessEmail, setAccessEmail] = useState('')
  const [accessPassword, setAccessPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSavingCreds, setIsSavingCreds] = useState(false)

  // Add product catalog picker
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [catalogServices, setCatalogServices] = useState([])
  const [productSearch, setProductSearch] = useState('')

  // Order meta edits (status, payment_mode, notes)
  const [status, setStatus] = useState('')
  const [paymentMode, setPaymentMode] = useState('')
  const [notes, setNotes] = useState('')
  const [isSavingMeta, setIsSavingMeta] = useState(false)

  // Copy helpers
  const [copiedKey, setCopiedKey] = useState(null)

  // Toast confirmation for unsaved changes
  const [showUnsavedToast, setShowUnsavedToast] = useState(false)

  // Document upload & download states
  const [isUploadingDoc, setIsUploadingDoc] = useState(false)
  const [previewDoc, setPreviewDoc] = useState(null)
  const fileInputRef = React.useRef(null)

  const handleDownloadDoc = (doc) => {
    downloadDocument(doc.id, doc.name).catch((err) => toast.error(err.message || 'File could not be downloaded'))
  }

  const handleViewDoc = (doc) => {
    setPreviewDoc(doc)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingDoc(true)
    const tId = toastProcessing(`Uploading ${file.name} to Google Drive...`)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const raw = String(reader.result || '')
        const base64Data = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw
        const res = await apiRequest('/admin/documents/upload', {
          method: 'POST',
          silent: true,
          label: 'Document upload',
          body: {
            order_id: order?.id,
            client_id: order?.user_id,
            company_id: order?.company_id,
            name: file.name,
            file_name: file.name,
            file_content_base64: base64Data,
            mime_type: file.type || 'application/pdf',
            category: 'Order Documents',
          },
        })
        if (res.ok) {
          toastDone(tId, `${file.name} uploaded to Google Drive!`)
          fetchOrderDetails()
        } else {
          toastFail(tId, res.reason || 'Upload failed')
        }
        setIsUploadingDoc(false)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      toastFail(tId, err?.message || 'Upload error')
      setIsUploadingDoc(false)
    }
    e.target.value = ''
  }

  const copyToClipboard = (text, key) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // Fetch single order details
  const fetchOrderDetails = useCallback(async () => {
    if (!orderId) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiRequest(`/orders/${orderId}`, { label: 'Order Details' })
      if (!res.ok) {
        const res2 = await apiRequest(`/admin/orders/${orderId}`, { label: 'Order Details' })
        if (!res2.ok) {
          setError(res2.reason || res.reason || 'Failed to load order')
          return
        }
        processOrderData(res2.data?.data || res2.data || {})
        return
      }
      processOrderData(res.data?.data || res.data || {})
    } catch (err) {
      setError(err?.message || 'Error loading order')
    } finally {
      setIsLoading(false)
    }
  }, [orderId])

  function processOrderData(data) {
    const o = data.order || data
    setOrder(o)
    setStatus(o.status || 'Pending')
    setPaymentMode(o.payment_mode || 'none')
    setNotes(o.notes || '')
    setAccessEmail(o.access_email || '')
    setAccessPassword(o.access_email_password || '')

    // Resolve checkout form fields
    let fields = []
    if (Array.isArray(o.checkout_form) && o.checkout_form.length > 0) {
      fields = o.checkout_form.map((f) => ({
        label: f.label || f.name || '',
        value: f.value != null ? String(f.value) : '',
      }))
    } else if (o.checkout_form_json) {
      try {
        const parsed = JSON.parse(o.checkout_form_json)
        if (Array.isArray(parsed)) {
          fields = parsed.map((f) => ({
            label: f.label || f.name || '',
            value: f.value != null ? String(f.value) : '',
          }))
        }
      } catch {
        // ignore
      }
    }

    // Default standard fields if empty
    if (fields.length === 0) {
      if (o.company_name) fields.push({ label: 'Desired company name', value: o.company_name })
      if (o.company_address) fields.push({ label: 'Registered office address', value: o.company_address })
      if (o.client_name || o.owner_name) fields.push({ label: 'Director name', value: o.client_name || o.owner_name })
      if (o.client_email || o.owner_form_email) fields.push({ label: 'Email', value: o.client_email || o.owner_form_email })
      if (o.client_phone) fields.push({ label: 'UK phone number', value: o.client_phone })
      if (o.business_activities) fields.push({ label: 'Business activities', value: o.business_activities })
      if (o.company_number) fields.push({ label: 'Company number', value: o.company_number })
      if (o.company_status) fields.push({ label: 'Company status', value: o.company_status || 'Active' })
      if (o.incorporation_date) fields.push({ label: 'Incorporation date', value: o.incorporation_date })
      if (o.trading_proof) fields.push({ label: 'Trading proof', value: o.trading_proof })
    }

    setFormFields(fields)
  }

  useEffect(() => {
    if (isOpen && orderId) {
      setActiveTab('overview')
      setIsEditingDetails(false)
      setIsEditingCreds(false)
      setShowProductPicker(false)
      setShowPassword(false)
      fetchOrderDetails()
    }
  }, [isOpen, orderId, fetchOrderDetails])

  // Fetch catalog services
  useEffect(() => {
    if (showProductPicker && catalogServices.length === 0) {
      apiRequest('/catalog/products', { label: 'Catalog' }).then((res) => {
        if (res.ok) {
          const list = res.data?.data || res.data?.services || res.data || []
          const active = (Array.isArray(list) ? list : []).filter((s) => !s.status || String(s.status).toLowerCase() === 'active')
          setCatalogServices(active)
        }
      })
    }
  }, [showProductPicker, catalogServices.length])

  const filteredServices = useMemo(() => {
    if (!productSearch.trim()) return catalogServices
    const q = productSearch.toLowerCase()
    return catalogServices.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.category?.toLowerCase().includes(q) ||
        s.category_name?.toLowerCase().includes(q)
    )
  }, [catalogServices, productSearch])

  // Save edited checkout form fields
  const handleSaveDetails = async () => {
    if (!orderId) return
    setIsSavingDetails(true)
    const toastId = toastProcessing('Saving order details…')
    try {
      const res = await apiRequest(`/orders/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify({
          checkout_form: formFields,
        }),
        label: 'Save order details',
        silent: true,
      })
      if (res.ok) {
        toastDone(toastId, 'Order details updated')
        setIsEditingDetails(false)
        fetchOrderDetails()
        if (onOrderUpdated) onOrderUpdated()
      } else {
        toastFail(toastId, res.reason || 'Failed to update order details')
      }
    } finally {
      setIsSavingDetails(false)
    }
  }

  // Save credentials
  const handleSaveCredentials = async () => {
    if (!orderId) return
    setIsSavingCreds(true)
    const toastId = toastProcessing('Saving credentials…')
    try {
      const res = await apiRequest(`/orders/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify({
          access_email: accessEmail.trim(),
          access_email_password: accessPassword.trim(),
        }),
        label: 'Save credentials',
        silent: true,
      })
      if (res.ok) {
        toastDone(toastId, 'Service credentials saved')
        setIsEditingCreds(false)
        fetchOrderDetails()
        if (onOrderUpdated) onOrderUpdated()
      } else {
        toastFail(toastId, res.reason || 'Failed to save credentials')
      }
    } finally {
      setIsSavingCreds(false)
    }
  }

  // Update order status / payment / notes
  const handleUpdateMeta = async (fieldsToUpdate) => {
    if (!orderId) return
    setIsSavingMeta(true)
    const toastId = toastProcessing('Updating order…')
    try {
      const res = await apiRequest(`/orders/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify(fieldsToUpdate),
        label: 'Update order',
        silent: true,
      })
      if (res.ok) {
        toastDone(toastId, 'Order updated')
        fetchOrderDetails()
        if (onOrderUpdated) onOrderUpdated()
      } else {
        toastFail(toastId, res.reason || 'Failed to update')
      }
    } finally {
      setIsSavingMeta(false)
    }
  }

  // Products on the order (real rows from order_line_items; legacy orders show one virtual row)
  const orderItems = useMemo(() => {
    const items = Array.isArray(order?.line_items) ? order.line_items : []
    if (items.length > 0) return items
    if (!order) return []
    const total = Number(order.total || 0)
    return [{ id: 0, product_name: order.service_name || 'Standard Package', category_name: '', quantity: 1, unit_price: total, line_total: total }]
  }, [order])

  const applyLineItemResult = (res) => {
    const d = res.data?.data || res.data || {}
    setOrder((prev) => (prev ? { ...prev, line_items: d.line_items || prev.line_items, total: d.total ?? prev.total } : prev))
    fetchOrderDetails()
    if (onOrderUpdated) onOrderUpdated()
  }

  const handleAddProduct = async (service) => {
    if (!orderId || !service) return
    const toastId = toastProcessing('Adding product…')
    const res = await apiRequest(`/orders/${orderId}/line-items`, {
      method: 'POST',
      body: { service_id: service.id, product_name: service.name },
      label: 'Add product',
      silent: true,
    })
    if (res.ok) {
      toastDone(toastId, `Added "${service.name}" to order`)
      setShowProductPicker(false)
      setProductSearch('')
      applyLineItemResult(res)
    } else {
      toastFail(toastId, res.reason || 'Failed to add product')
    }
  }

  const handleSaveItemPrice = async (item, value) => {
    const price = Number(value)
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Enter a valid price')
      return
    }
    if (Number(item.unit_price || 0) === price) return
    const res = await apiRequest(`/orders/${orderId}/line-items/${item.id}`, {
      method: 'PATCH',
      body: { unit_price: price },
      label: 'Update price',
      silent: true,
    })
    if (res.ok) {
      toast.success('Price updated')
      applyLineItemResult(res)
    } else {
      toast.error(res.reason || 'Could not update price')
    }
  }

  const handleRemoveItem = async (item) => {
    if (!window.confirm(`Remove "${item.product_name}" from this order?`)) return
    const res = await apiRequest(`/orders/${orderId}/line-items/${item.id}`, {
      method: 'DELETE',
      label: 'Remove product',
      silent: true,
    })
    if (res.ok) {
      toast.success('Product removed')
      applyLineItemResult(res)
    } else {
      toast.error(res.reason || 'Could not remove product')
    }
  }

  // Add custom field
  const handleAddField = () => {
    const label = window.prompt('Enter field name (e.g. SIC Code, VAT Number):')
    if (!label || !label.trim()) return
    setFormFields((prev) => [...prev, { label: label.trim(), value: '' }])
  }

  // Delete field in edit mode
  const handleDeleteField = (index) => {
    setFormFields((prev) => prev.filter((_, i) => i !== index))
  }

  // Field value change
  const handleFieldValueChange = (index, val) => {
    setFormFields((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], value: val }
      return next
    })
  }

  const isDirty = isEditingDetails || isEditingCreds

  const handleAttemptClose = () => {
    if (isDirty) {
      setShowUnsavedToast(true)
    } else {
      onClose()
    }
  }

  const handleDiscardAndClose = () => {
    setShowUnsavedToast(false)
    setIsEditingDetails(false)
    setIsEditingCreds(false)
    onClose()
  }

  const handleSaveAndClose = async () => {
    if (isEditingDetails) await handleSaveDetails()
    if (isEditingCreds) await handleSaveCredentials()
    setShowUnsavedToast(false)
    onClose()
  }

  const statusBadgeColor = (st) => {
    if (st === 'Completed') return 'badge-green'
    if (st === 'Cancelled' || st === 'Refunded') return 'bg-destructive/15 text-destructive'
    if (st === 'In Progress' || st === 'Processing') return 'badge-sky'
    return 'badge-amber'
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleAttemptClose() }}>
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden">
          {/* Header Section */}
          <div className="p-6 border-b bg-muted/20">
            <DialogHeader className="flex-row items-center gap-4 space-y-0 text-left">
              <Avatar className="w-13 h-13 bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold">
                <AvatarFallback>
                  <IconPackage className="w-6 h-6" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <DialogTitle className="text-xl font-bold tracking-tight">
                    {formatOrderNumberDisplay(order?.order_number || orderId)}
                  </DialogTitle>
                  <Badge className={`${statusBadgeColor(order?.status)} text-xs`}>
                    {order?.status || 'Processing'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    title="Copy Order #"
                    onClick={() => copyToClipboard(order?.order_number || String(orderId), 'order_num')}
                  >
                    {copiedKey === 'order_num' ? <IconCheck className="w-3.5 h-3.5 text-emerald-600" /> : <IconCopy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                  <span>{formatDateDisplay(order?.created_at)}</span>
                  {order?.company_name && (
                    <>
                      <span>•</span>
                      <span className="font-medium text-foreground">{order.company_name}</span>
                    </>
                  )}
                  <span>•</span>
                  <span className="font-semibold text-primary">£{Number(order?.total || 0).toFixed(2)}</span>
                </DialogDescription>
              </div>
            </DialogHeader>
          </div>

          {/* Tabs Navigation */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col">
            <div className="px-6 py-2 border-b overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <TabsList className="flex w-max">
                <TabsTrigger value="overview">Order Details</TabsTrigger>
                <TabsTrigger value="credentials">Service Credentials</TabsTrigger>
                <TabsTrigger value="products">Products & Pricing</TabsTrigger>
                <TabsTrigger value="documents">
                  Documents ({order?.documents?.length || 0})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Scrollable Body */}
            <ScrollArea className="h-[55vh] min-h-[380px] w-full">
              <div className="p-6">
                {isLoading ? (
                  <div className="space-y-4 py-12 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    <p className="text-sm text-muted-foreground">Loading order details...</p>
                  </div>
                ) : error ? (
                  <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-sm">
                    {error}
                  </div>
                ) : (
                  <>
                    {/* ── TAB 1: OVERVIEW / ORDER DETAILS ──────────────────────── */}
                    <TabsContent value="overview" className="m-0 space-y-6 outline-none">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-foreground">Formation & Checkout Data</h4>
                          <p className="text-xs text-muted-foreground">
                            Fields collected when this order was placed.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isEditingDetails ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-xs h-8 gap-1.5"
                              onClick={() => setIsEditingDetails(true)}
                            >
                              <IconPencil className="w-3.5 h-3.5" />
                              Edit Details
                            </Button>
                          ) : (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-xs h-8 gap-1"
                                onClick={handleAddField}
                              >
                                <IconPlus className="w-3.5 h-3.5" />
                                Add Field
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="text-xs h-8 gap-1"
                                disabled={isSavingDetails}
                                onClick={handleSaveDetails}
                              >
                                <IconDeviceFloppy className="w-3.5 h-3.5" />
                                {isSavingDetails ? 'Saving...' : 'Save Changes'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-xs h-8"
                                disabled={isSavingDetails}
                                onClick={() => {
                                  setIsEditingDetails(false)
                                  fetchOrderDetails()
                                }}
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {!isEditingDetails ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                          {formFields.length === 0 ? (
                            <p className="text-xs text-muted-foreground col-span-2">
                              No checkout form details recorded.
                            </p>
                          ) : (
                            formFields.map((field, idx) => {
                              const wide = isWideField(field.label)
                              return (
                                <div
                                  key={`${field.label}-${idx}`}
                                  className={`flex flex-col gap-1 ${wide ? 'md:col-span-2' : ''}`}
                                >
                                  <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                                    {field.label}
                                  </span>
                                  <span className="font-semibold text-foreground text-sm break-words">
                                    {field.value || '—'}
                                  </span>
                                </div>
                              )
                            })
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {formFields.map((field, idx) => {
                            const wide = isWideField(field.label)
                            return (
                              <div key={idx} className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs font-semibold text-foreground">
                                    {field.label}
                                  </Label>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDeleteField(idx)}
                                  >
                                    <IconTrash className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                                {wide ? (
                                  <Textarea
                                    rows={2}
                                    value={field.value}
                                    onChange={(e) => handleFieldValueChange(idx, e.target.value)}
                                    className="text-xs bg-background resize-none"
                                  />
                                ) : (
                                  <Input
                                    value={field.value}
                                    onChange={(e) => handleFieldValueChange(idx, e.target.value)}
                                    className="h-8 text-xs bg-background"
                                  />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      <Separator />

                      {/* Status & Payment Settings */}
                      <div className="space-y-3">
                        <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                          Order Status & Payment
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Order Status</Label>
                            <Select
                              value={status}
                              onValueChange={(val) => {
                                setStatus(val)
                                handleUpdateMeta({ status: val })
                              }}
                              disabled={isSavingMeta}
                            >
                              <SelectTrigger className="h-8 text-xs w-full">
                                <SelectValue placeholder="Status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {STATUS_OPTIONS.map((st) => (
                                    <SelectItem key={st} value={st} className="text-xs">
                                      {st}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Payment Mode</Label>
                            <Select
                              value={paymentMode}
                              onValueChange={(val) => {
                                const next = val === 'none' ? null : val
                                setPaymentMode(val)
                                handleUpdateMeta({ payment_mode: next })
                              }}
                              disabled={isSavingMeta}
                            >
                              <SelectTrigger className="h-8 text-xs w-full">
                                <SelectValue placeholder="Payment Mode" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="none" className="text-xs">None</SelectItem>
                                  {PAYMENT_MODES.map((pm) => (
                                    <SelectItem key={pm.value} value={pm.value} className="text-xs">
                                      {pm.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      {/* Internal Notes */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                            Internal Order Notes
                          </Label>
                          {notes !== (order?.notes || '') && (
                            <Button
                              size="sm"
                              className="h-6 text-xs px-2.5"
                              onClick={() => handleUpdateMeta({ notes })}
                              disabled={isSavingMeta}
                            >
                              Save Note
                            </Button>
                          )}
                        </div>
                        <Textarea
                          placeholder="Add internal remarks here..."
                          rows={2}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="text-xs resize-none"
                        />
                      </div>
                    </TabsContent>

                    {/* ── TAB 2: SERVICE CREDENTIALS ───────────────────────────── */}
                    <TabsContent value="credentials" className="m-0 space-y-6 outline-none">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-foreground">Service Access Credentials</h4>
                          <p className="text-xs text-muted-foreground">
                            Client mailbox and service login credentials.
                          </p>
                        </div>
                        <div>
                          {!isEditingCreds ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs h-8 gap-1.5"
                              onClick={() => setIsEditingCreds(true)}
                            >
                              <IconPencil className="w-3.5 h-3.5" />
                              Edit Credentials
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className="text-xs h-8 gap-1"
                                disabled={isSavingCreds}
                                onClick={handleSaveCredentials}
                              >
                                <IconDeviceFloppy className="w-3.5 h-3.5" />
                                Save
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-xs h-8"
                                disabled={isSavingCreds}
                                onClick={() => {
                                  setIsEditingCreds(false)
                                  setAccessEmail(order?.access_email || '')
                                  setAccessPassword(order?.access_email_password || '')
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>

                      {!isEditingCreds ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                              Service Account Email
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground truncate">
                                {order?.access_email || 'None recorded'}
                              </span>
                              {order?.access_email && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground"
                                  title="Copy Email"
                                  onClick={() => copyToClipboard(order.access_email, 'acc_email')}
                                >
                                  {copiedKey === 'acc_email' ? <IconCheck className="w-3.5 h-3.5 text-emerald-600" /> : <IconCopy className="w-3.5 h-3.5" />}
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                              Email Password / Access Code
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-foreground">
                                {showPassword ? (order?.access_email_password || '—') : '••••••••'}
                              </span>
                              {order?.access_email_password && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground"
                                    title={showPassword ? 'Hide' : 'Show'}
                                    onClick={() => setShowPassword((v) => !v)}
                                  >
                                    {showPassword ? <IconEyeOff className="w-3.5 h-3.5" /> : <IconEye className="w-3.5 h-3.5" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground"
                                    title="Copy Password"
                                    onClick={() => copyToClipboard(order.access_email_password, 'acc_pass')}
                                  >
                                    {copiedKey === 'acc_pass' ? <IconCheck className="w-3.5 h-3.5 text-emerald-600" /> : <IconCopy className="w-3.5 h-3.5" />}
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Service Email</Label>
                            <Input
                              type="email"
                              placeholder="e.g. info@clientcompany.co.uk"
                              value={accessEmail}
                              onChange={(e) => setAccessEmail(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Email Password / Access Code</Label>
                            <Input
                              type="text"
                              placeholder="Enter access code"
                              value={accessPassword}
                              onChange={(e) => setAccessPassword(e.target.value)}
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* ── TAB 3: PRODUCTS & PRICING ─────────────────────────────── */}
                    <TabsContent value="products" className="m-0 space-y-6 outline-none">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-foreground">Products on this Order</h4>
                          <p className="text-xs text-muted-foreground">
                            Purchased service package and add-ons.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-xs h-8 gap-1.5"
                          onClick={() => setShowProductPicker((v) => !v)}
                        >
                          <IconPlus className="w-3.5 h-3.5" />
                          Add Product
                        </Button>
                      </div>

                      {showProductPicker && (
                        <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground">
                              Select a catalog service to add:
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => setShowProductPicker(false)}
                            >
                              <IconX className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          <div className="relative">
                            <IconSearch className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                            <Input
                              placeholder="Search catalog..."
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              className="pl-9 h-8 text-xs"
                            />
                          </div>
                          <div className="max-h-40 overflow-y-auto space-y-1 rounded border bg-background p-1">
                            {filteredServices.map((svc) => (
                              <div
                                key={svc.id}
                                className="flex items-center justify-between p-2 rounded hover:bg-muted text-xs cursor-pointer"
                                onClick={() => handleAddProduct(svc)}
                              >
                                <div>
                                  <span className="font-semibold">{svc.name}</span>
                                  <span className="text-[10px] text-muted-foreground ml-2">({svc.category || svc.category_name})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold">£{Number(svc.price || 0).toFixed(2)}</span>
                                  <Button size="icon-xs" variant="outline" className="h-5 w-5">
                                    <IconPlus className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg border overflow-hidden">
                        <div className="p-3 bg-muted/30 border-b flex items-center justify-between text-xs font-semibold text-muted-foreground">
                          <span>Product / Service</span>
                          <span>Price</span>
                        </div>
                        {orderItems.map((item) => (
                          <div key={item.id} className="p-4 flex items-center justify-between gap-3 text-sm border-b last:border-b-0">
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-foreground truncate">{item.product_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {item.category_name || order?.delivery_label || 'Standard Processing'}
                                {Number(item.quantity || 1) > 1 ? ` · Qty ${item.quantity}` : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm text-muted-foreground">£</span>
                              <Input
                                key={`${item.id}-${item.unit_price}`}
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={Number(item.unit_price || 0).toFixed(2)}
                                className="h-8 w-28 text-right font-bold"
                                aria-label={`Price for ${item.product_name}`}
                                onBlur={(e) => handleSaveItemPrice(item, e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                              />
                              {orderItems.length > 1 && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  title="Remove product"
                                  onClick={() => handleRemoveItem(item)}
                                >
                                  <IconTrash className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        <div className="p-3 bg-muted/30 border-t flex items-center justify-between text-sm font-semibold">
                          <span>Total</span>
                          <span>£{Number(order?.total || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </TabsContent>

                    {/* ── TAB 4: DOCUMENTS ─────────────────────────────────────── */}
                    <TabsContent value="documents" className="m-0 space-y-4 outline-none">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-foreground">Order Documents</h4>
                          <p className="text-xs text-muted-foreground">
                            Identity, proof of address, and generated filings.
                          </p>
                        </div>
                        <div>
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.zip,.txt"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-xs h-8 gap-1.5"
                            disabled={isUploadingDoc}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            {isUploadingDoc ? (
                              <>
                                <IconLoader2 className="w-3.5 h-3.5 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <IconUpload className="w-3.5 h-3.5" />
                                Upload Document
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      {order?.documents && order.documents.length > 0 ? (
                        <div className="space-y-2">
                          {order.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/20 transition-colors gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <IconFileText className="w-4 h-4 text-primary shrink-0" />
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-semibold text-foreground truncate">
                                    {doc.name || doc.file_name || 'Document'}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {doc.status || 'Approved'} · {doc.file_type || 'PDF Document'}
                                    {doc.file_size ? ` · ${doc.file_size}` : ''}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2.5 gap-1"
                                  onClick={() => handleViewDoc(doc)}
                                  title="View document preview"
                                >
                                  <IconEye className="w-3.5 h-3.5" />
                                  View
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs px-2.5 gap-1"
                                  onClick={() => handleDownloadDoc(doc)}
                                  title="Download document"
                                >
                                  <IconDownload className="w-3.5 h-3.5" />
                                  Download
                                </Button>
                                {doc.drive_web_link && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    asChild
                                    title="Open directly in Google Drive"
                                  >
                                    <a href={doc.drive_web_link} target="_blank" rel="noopener noreferrer">
                                      <IconExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-xs text-muted-foreground border rounded-lg border-dashed">
                          No documents attached to this order.
                        </div>
                      )}
                    </TabsContent>
                  </>
                )}
              </div>
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* In-Page Document Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="sm:max-w-4xl lg:max-w-5xl w-[94vw] max-h-[92vh] flex flex-col p-0 overflow-hidden border bg-background shadow-2xl z-[60]">
          <DialogHeader className="p-4 border-b bg-muted/20 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2.5 min-w-0 pr-4">
              <IconFileText className="w-5 h-5 text-primary shrink-0" />
              <div className="flex flex-col min-w-0">
                <DialogTitle className="text-base font-bold truncate">
                  {previewDoc?.name || previewDoc?.file_name || 'Document Preview'}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {previewDoc?.category || 'Order Document'} {previewDoc?.file_size ? `· ${previewDoc?.file_size}` : ''}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => previewDoc && handleDownloadDoc(previewDoc)}
              >
                <IconDownload className="w-3.5 h-3.5" />
                Download
              </Button>
              {previewDoc?.drive_web_link && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  asChild
                >
                  <a href={previewDoc.drive_web_link} target="_blank" rel="noopener noreferrer">
                    <IconExternalLink className="w-3.5 h-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="p-4 bg-muted/10 flex items-center justify-center min-h-[500px] max-h-[80vh] overflow-auto">
            {previewDoc && <DocumentPreview doc={previewDoc} className="w-full" />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Unsaved Changes Toast */}
      <ToastSave
        open={isOpen && showUnsavedToast}
        initialText="You have unsaved changes in this order."
        discardText="Discard & Close"
        saveText="Save & Close"
        cancelText="Keep Editing"
        onDiscard={handleDiscardAndClose}
        onSave={handleSaveAndClose}
        onCancel={() => setShowUnsavedToast(false)}
      />
    </>
  )
}
