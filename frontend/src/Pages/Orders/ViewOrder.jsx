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
  IconBan,
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
import DeleteConfirmation from '@/components/DeleteConfirmation'
import PromptDialog from '@/components/PromptDialog'
import DocumentPreview from '@/components/DocumentPreview'
import { downloadDocument } from '@/lib/documents'
import { openInvoice, downloadInvoice } from '@/lib/invoices'
import { isManagerOrAbove, canViewPrices } from '@/lib/permissions'
import { formatGBP, plainAmount } from '@/lib/money'
import { canCancelOrder, cancelOrder, cancelOrderMessage } from '@/lib/orders'
import OrderIdVerification from '@/Pages/SmartOperations/OrderIdVerification'

const PAYMENT_MODES = [
  { value: 'PKR(Bank Transfer)', label: 'PKR (Bank Transfer)' },
  { value: 'GBP(Bank Transfer)', label: 'GBP (Bank Transfer)' },
  { value: 'Website Charge', label: 'Website Charge' },
]

// The statuses the team picks from (older orders may still carry Processing / Pending Verification / Refunded)
const STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed', 'Cancelled']

function formatOrderNumberDisplay(raw) {
  const s = String(raw ?? '').trim()
  if (!s || s === '—') return '—'
  const tail = s.match(/(\d+)\s*$/)
  const digits = tail ? tail[1] : s.replace(/\D/g, '')
  if (!digits) return s
  // Only bare website numbers (#15312) get the #GB letters; GB-OCT-2326001 and #GB15353 show as stored
  if (!/^#?\d+$/.test(s)) return s
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

function formatUkDate(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value || '')
}

/** A company picked on the service form: Companies House details as captured when the order was placed. */
function CompanyAnswer({ company }) {
  if (!company.registered) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
        <p className="font-semibold">{company.name}</p>
        <p className="text-xs text-muted-foreground">Not registered yet (proposed company name)</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm space-y-1.5">
      <p className="font-semibold">
        {company.name} · {company.number}
        {company.status ? <span className="font-normal text-muted-foreground"> · {company.status}</span> : null}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
        <dt className="text-muted-foreground">Incorporated</dt>
        <dd>{company.incorporated ? formatUkDate(company.incorporated) : '—'}</dd>
        <dt className="text-muted-foreground">Registered office</dt>
        <dd className="break-words">{company.address || '—'}</dd>
        <dt className="text-muted-foreground">Directors</dt>
        <dd>
          {(company.directors || []).length ? (
            <ul className="space-y-0.5">
              {company.directors.map((d) => (
                <li key={`${d.name}-${d.appointed}`}>
                  <span className="font-medium">{d.name}</span>
                  {d.dob ? ` · born ${d.dob}` : ''}
                  {d.nationality ? ` · ${d.nationality}` : ''}
                  {d.appointed ? ` · appointed ${formatUkDate(d.appointed)}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            '—'
          )}
        </dd>
      </dl>
    </div>
  )
}

/** Answers to the services' own order form (Create Order wizard), read-only. */
function ServiceFormAnswers({ answers, linked, uploads }) {
  if (!answers.length && !linked.length && !uploads.length) return null
  return (
    <div className="space-y-3">
      <h4 className="text-sm uppercase tracking-wider font-semibold text-muted-foreground">Service Form</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
        {answers.map((f, idx) => {
          const wide = f.company || isWideField(f.label) || String(f.value || '').length > 60
          return (
            <div key={`${f.label}-${idx}`} className={`flex flex-col gap-1 ${wide ? 'md:col-span-2' : ''}`}>
              <span className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">{f.label}</span>
              {f.company ? (
                <CompanyAnswer company={f.company} />
              ) : (
                <span className="font-semibold text-foreground text-sm break-words whitespace-pre-line">
                  {String(f.value || '').trim() || '—'}
                </span>
              )}
              {(f.services || []).length > 1 ? (
                <span className="text-[11px] text-muted-foreground">For {f.services.join(', ')}</span>
              ) : null}
            </div>
          )
        })}
        {uploads.length ? (
          <div className="flex flex-col gap-1 md:col-span-2">
            <span className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">Form uploads</span>
            <ul className="text-sm space-y-0.5">
              {uploads.map(([label, done]) => (
                <li key={label} className="flex items-center gap-2">
                  {done ? <IconCheck className="w-4 h-4 text-emerald-600" /> : <IconX className="w-4 h-4 text-muted-foreground" />}
                  <span className="font-semibold">{label}</span>
                  <span className="text-muted-foreground">{done ? 'uploaded (see Documents)' : 'not uploaded'}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {linked.length ? (
          <div className="flex flex-col gap-1 md:col-span-2">
            <span className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">Linked companies</span>
            <ul className="text-sm space-y-0.5">
              {linked.map((c) => (
                <li key={c.company_id} className="flex items-center gap-2">
                  <IconBuilding className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-muted-foreground">
                    {c.number || 'not registered'}{c.created ? ' · added to CRM' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function ViewOrder({ orderId, isOpen, onClose, onOrderUpdated }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [order, setOrder] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Edit details mode
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [formFields, setFormFields] = useState([])
  const [serviceForm, setServiceForm] = useState({ answers: [], linked: [], uploads: [] })
  const [isSavingDetails, setIsSavingDetails] = useState(false)
  // Everything else Edit Details can change: the order's own details and the service form answers
  const [orderInfo, setOrderInfo] = useState({ owner_name: '', owner_form_email: '', service_name: '', order_date: '', company_id: '' })
  const [editableAnswers, setEditableAnswers] = useState([])
  const [answerEdits, setAnswerEdits] = useState({})
  const [companyOptions, setCompanyOptions] = useState([])

  // Edit credentials mode
  const [isEditingCreds, setIsEditingCreds] = useState(false)
  const [accessEmail, setAccessEmail] = useState('')
  const [accessPassword, setAccessPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSavingCreds, setIsSavingCreds] = useState(false)

  // Add product catalog picker
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [removeTarget, setRemoveTarget] = useState(null)
  // "Cancel order": the order and its invoice in one step
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [isRemovingItem, setIsRemovingItem] = useState(false)
  const [addFieldOpen, setAddFieldOpen] = useState(false)
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

  // Assigned to: the team member who works on the order (Performance counts it for them)
  const canAssign = isManagerOrAbove()
  // Staff Operations work on orders without any money: no prices, totals or invoice
  const showPrices = canViewPrices()
  const [team, setTeam] = useState([])
  useEffect(() => {
    if (!isOpen || !canAssign || team.length) return
    apiRequest('/admin/staff', { label: 'Team', silent: true }).then((res) => {
      if (res.ok) setTeam((res.data?.data?.staff || []).filter((s) => s.status !== 'Inactive'))
    })
  }, [isOpen, canAssign, team.length])

  const handleAssign = async (value) => {
    const assigned = value === 'none' ? null : Number(value)
    if ((order?.assigned_staff_id || null) === assigned) return
    const res = await apiRequest(`/admin/orders/${orderId}`, {
      method: 'PATCH',
      body: { assigned_staff_id: assigned },
      label: 'Assign order',
      silent: true,
    })
    if (res.ok) {
      const member = team.find((s) => s.id === assigned)
      setOrder((prev) => ({ ...prev, assigned_staff_id: assigned, assigned_staff_name: member?.full_name || null }))
      toast.success(member ? `Assigned to ${member.full_name}` : 'Order unassigned')
    } else {
      toast.error(res.reason || 'Could not assign the order')
    }
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
    // Wizard orders store a dict; fields edited with "Edit Details" are kept under checkout_form.fields
    const savedList = Array.isArray(o.checkout_form) ? o.checkout_form : o.checkout_form?.fields
    if (Array.isArray(savedList) && savedList.length > 0) {
      fields = savedList.map((f) => ({
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

    // The services' own order form (Create Order wizard), shown read-only in its own section
    const ofv = o.order_form_values || {}
    const checkout = o.checkout_form && !Array.isArray(o.checkout_form) ? o.checkout_form : {}
    // _index = the answer's place in service_fields (used when saving an edited answer)
    const allAnswers = Array.isArray(ofv.service_fields)
      ? ofv.service_fields.map((f, i) => (f && typeof f === 'object' ? { ...f, _index: i } : null)).filter((f) => f && f.label)
      : []
    const answers = allAnswers.filter((f) => f.company || String(f.value || '').trim())
    setAnswerEdits(Object.fromEntries(allAnswers.filter((f) => !f.company).map((f) => [f._index, String(f.value ?? '')])))
    setEditableAnswers(allAnswers.filter((f) => !f.company))
    setOrderInfo({
      owner_name: o.owner_name || '',
      owner_form_email: o.owner_form_email || '',
      service_name: o.service_name || '',
      order_date: o.created_at ? String(o.created_at).slice(0, 10) : '',
      company_id: o.company_id ? String(o.company_id) : '',
    })
    const uploaded = checkout.uploaded_docs && typeof checkout.uploaded_docs === 'object' ? checkout.uploaded_docs : {}
    setServiceForm({
      answers,
      linked: Array.isArray(ofv.linked_companies) ? ofv.linked_companies.filter((c) => c && c.company_id) : [],
      // Only the form's own upload fields, not the wizard's standard document checklist
      uploads: Object.entries(uploaded).filter(([label]) => !['passport', 'proof_of_address', 'other'].includes(label)),
    })
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

  // Companies to link the order to (the customer's own first), loaded when Edit Details opens
  useEffect(() => {
    if (!isEditingDetails || companyOptions.length) return
    apiRequest('/admin/companies?limit=500', { label: 'Companies', silent: true }).then((res) => {
      if (!res.ok) return
      const list = res.data?.companies || res.data?.data?.companies || (Array.isArray(res.data?.data) ? res.data.data : [])
      const owner = Number(order?.user_id || 0)
      const mine = list.filter((c) => Number(c.user_id || c.client_id || 0) === owner)
      setCompanyOptions((mine.length ? mine : list).map((c) => ({
        id: String(c.id),
        label: `${c.company_name || c.name || 'Company'}${c.company_number && !/^REG-|^PENDING/i.test(c.company_number) ? ` · ${c.company_number}` : ' · not registered'}`,
      })))
    })
  }, [isEditingDetails, companyOptions.length, order?.user_id])

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
          owner_name: orderInfo.owner_name,
          owner_form_email: orderInfo.owner_form_email,
          service_name: orderInfo.service_name,
          ...(orderInfo.order_date ? { order_date: orderInfo.order_date } : {}),
          company_id: orderInfo.company_id || null,
          service_fields: editableAnswers.map((f) => ({ index: f._index, value: answerEdits[f._index] ?? '' })),
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

  const handleSaveItemStatus = async (item, status) => {
    if (!status || status === (item.fulfillment_status || 'Pending')) return
    const res = await apiRequest(`/orders/${orderId}/line-items/${item.id}`, {
      method: 'PATCH',
      body: { fulfillment_status: status },
      label: 'Update product status',
      silent: true,
    })
    if (res.ok) {
      toast.success(`${item.product_name} marked ${status}`)
      applyLineItemResult(res)
    } else {
      toast.error(res.reason || 'Could not update product status')
    }
  }

  const handleRemoveItem = async (item) => {
    setIsRemovingItem(true)
    const res = await apiRequest(`/orders/${orderId}/line-items/${item.id}`, {
      method: 'DELETE',
      label: 'Remove product',
      silent: true,
    })
    setIsRemovingItem(false)
    setRemoveTarget(null)
    if (res.ok) {
      toast.success('Product removed')
      applyLineItemResult(res)
    } else {
      toast.error(res.reason || 'Could not remove product')
    }
  }

  // Add custom field
  const handleAddField = (label) => {
    if (!label || !label.trim()) return
    setFormFields((prev) => [...prev, { label: label.trim(), value: '' }])
    setAddFieldOpen(false)
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
              <Avatar className="hidden sm:flex w-13 h-13 bg-primary text-primary-foreground items-center justify-center text-lg font-bold">
                <AvatarFallback>
                  <IconPackage className="w-6 h-6" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <DialogTitle className="text-xl font-bold tracking-tight">
                    {formatOrderNumberDisplay(order?.order_number || orderId)}
                  </DialogTitle>
                  <Badge className={`${statusBadgeColor(order?.status)} text-sm`}>
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
                  {canCancelOrder(order) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto mr-8 h-7 gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => setConfirmCancel(true)}
                    >
                      <IconBan className="w-3.5 h-3.5" />
                      Cancel order
                    </Button>
                  ) : null}
                </div>
                <DialogDescription className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                  <span>{formatDateDisplay(order?.created_at)}</span>
                  {order?.company_name && (
                    <>
                      <span>•</span>
                      <span className="font-medium text-foreground">{order.company_name}</span>
                    </>
                  )}
                  {showPrices ? (
                    <>
                      <span>•</span>
                      <span className="font-semibold text-primary">{formatGBP(order?.total)}</span>
                    </>
                  ) : null}
                  {order?.created_by_name ? (
                    <>
                      <span>•</span>
                      <span>Added by <span className="font-medium text-foreground">{order.created_by_name}</span></span>
                    </>
                  ) : order && !order.woocommerce_order_id && (Number(order.client_is_b2b) === 1 || order.client_type === 'B2B') ? (
                    <>
                      <span>•</span>
                      <span>Added by <span className="font-medium text-foreground">B2B</span></span>
                    </>
                  ) : null}
                  {canAssign && order ? (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1.5">
                        Assigned to
                        <Select value={order.assigned_staff_id ? String(order.assigned_staff_id) : 'none'} onValueChange={handleAssign}>
                          <SelectTrigger className="w-auto gap-1 text-foreground" aria-label="Assigned to">
                            <SelectValue>{order.assigned_staff_name || 'Nobody'}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nobody</SelectItem>
                            {team.map((s) => (
                              <SelectItem key={s.id} value={String(s.id)}>{s.full_name || s.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </span>
                    </>
                  ) : order?.assigned_staff_name ? (
                    <>
                      <span>•</span>
                      <span>Assigned to <span className="font-medium text-foreground">{order.assigned_staff_name}</span></span>
                    </>
                  ) : null}
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
                <TabsTrigger value="products">{showPrices ? 'Products & Pricing' : 'Products'}</TabsTrigger>
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
                      {/* KYC orders: each director / PSC's identity verification (Didit) */}
                      <OrderIdVerification orderId={orderId} />
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-foreground">Formation & Checkout Data</h4>
                          <p className="text-sm text-muted-foreground">
                            Fields collected when this order was placed.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isEditingDetails ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-[13px] h-[26px] gap-1.5"
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
                                className="text-[13px] h-[26px] gap-1"
                                onClick={() => setAddFieldOpen(true)}
                              >
                                <IconPlus className="w-3.5 h-3.5" />
                                Add Field
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="text-[13px] h-[26px] gap-1"
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
                                className="text-[13px] h-[26px]"
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
                            <p className="text-sm text-muted-foreground col-span-2">
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
                                  <span className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">
                                    {field.label}
                                  </span>
                                  <span className="font-semibold text-foreground text-sm break-words whitespace-pre-line">
                                    {field.value || '—'}
                                  </span>
                                </div>
                              )
                            })
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* The order itself */}
                          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                            <p className="text-sm font-semibold">Order</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Service</Label>
                                <Input
                                  value={orderInfo.service_name}
                                  onChange={(e) => setOrderInfo((p) => ({ ...p, service_name: e.target.value }))}
                                  className="text-sm bg-background"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Order date</Label>
                                <Input
                                  type="date"
                                  value={orderInfo.order_date}
                                  onChange={(e) => setOrderInfo((p) => ({ ...p, order_date: e.target.value }))}
                                  className="text-sm bg-background"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Owner name (on the form)</Label>
                                <Input
                                  value={orderInfo.owner_name}
                                  onChange={(e) => setOrderInfo((p) => ({ ...p, owner_name: e.target.value }))}
                                  className="text-sm bg-background"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Owner email (order emails)</Label>
                                <Input
                                  type="email"
                                  value={orderInfo.owner_form_email}
                                  onChange={(e) => setOrderInfo((p) => ({ ...p, owner_form_email: e.target.value }))}
                                  className="text-sm bg-background"
                                />
                              </div>
                              <div className="space-y-1.5 md:col-span-2">
                                <Label className="text-xs text-muted-foreground">Company</Label>
                                <Select
                                  value={orderInfo.company_id || 'none'}
                                  onValueChange={(v) => setOrderInfo((p) => ({ ...p, company_id: v === 'none' ? '' : v }))}
                                >
                                  <SelectTrigger className="text-sm w-full bg-background">
                                    <SelectValue placeholder="Company">
                                      {orderInfo.company_id
                                        ? companyOptions.find((c) => c.id === orderInfo.company_id)?.label || order?.company_name || `Company #${orderInfo.company_id}`
                                        : 'No company'}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      <SelectItem value="none" className="text-sm">No company</SelectItem>
                                      {companyOptions.map((c) => (
                                        <SelectItem key={c.id} value={c.id} className="text-sm">{c.label}</SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>

                          {formFields.length > 0 && <p className="text-sm font-semibold pt-1">Checkout fields</p>}
                          {formFields.map((field, idx) => {
                            const wide = isWideField(field.label)
                            return (
                              <div key={idx} className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
                                <div className="flex items-center justify-between">
                                  <Label className="text-sm font-semibold text-foreground">
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
                                    className="text-sm bg-background resize-none"
                                  />
                                ) : (
                                  <Input
                                    value={field.value}
                                    onChange={(e) => handleFieldValueChange(idx, e.target.value)}
                                    className="text-sm bg-background"
                                  />
                                )}
                              </div>
                            )
                          })}

                          {/* The services' own form answers (company lookups stay as picked) */}
                          {editableAnswers.length > 0 && (
                            <>
                              <p className="text-sm font-semibold pt-1">Service form</p>
                              {editableAnswers.map((f) => {
                                const long = isWideField(f.label) || String(answerEdits[f._index] || '').length > 60
                                const setValue = (v) => setAnswerEdits((p) => ({ ...p, [f._index]: v }))
                                return (
                                  <div key={f._index} className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
                                    <Label className="text-sm font-semibold text-foreground">{f.label}</Label>
                                    {long ? (
                                      <Textarea
                                        rows={2}
                                        value={answerEdits[f._index] ?? ''}
                                        onChange={(e) => setValue(e.target.value)}
                                        className="text-sm bg-background resize-none"
                                      />
                                    ) : (
                                      <Input
                                        value={answerEdits[f._index] ?? ''}
                                        onChange={(e) => setValue(e.target.value)}
                                        className="text-sm bg-background"
                                      />
                                    )}
                                  </div>
                                )
                              })}
                            </>
                          )}
                        </div>
                      )}

                      {!isEditingDetails && (serviceForm.answers.length || serviceForm.linked.length || serviceForm.uploads.length) ? (
                        <>
                          <Separator />
                          <ServiceFormAnswers {...serviceForm} />
                        </>
                      ) : null}

                      <Separator />

                      {/* Status & Payment Settings */}
                      <div className="space-y-3">
                        <h4 className="text-sm uppercase tracking-wider font-semibold text-muted-foreground">
                          Order Status & Payment
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Order Status</Label>
                            <Select
                              value={status}
                              onValueChange={(val) => {
                                setStatus(val)
                                handleUpdateMeta({ status: val })
                              }}
                              disabled={isSavingMeta}
                            >
                              <SelectTrigger className="text-sm w-full">
                                <SelectValue placeholder="Status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {/* An older status (e.g. Processing) stays visible on its order until changed */}
                                  {(STATUS_OPTIONS.includes(status) || !status ? STATUS_OPTIONS : [status, ...STATUS_OPTIONS]).map((st) => (
                                    <SelectItem key={st} value={st} className="text-sm">
                                      {st}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Payment Mode</Label>
                            <Select
                              value={paymentMode}
                              onValueChange={(val) => {
                                const next = val === 'none' ? null : val
                                setPaymentMode(val)
                                handleUpdateMeta({ payment_mode: next })
                              }}
                              disabled={isSavingMeta}
                            >
                              <SelectTrigger className="text-sm w-full">
                                <SelectValue placeholder="Payment Mode" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="none" className="text-sm">None</SelectItem>
                                  {PAYMENT_MODES.map((pm) => (
                                    <SelectItem key={pm.value} value={pm.value} className="text-sm">
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
                          <Label className="text-sm uppercase tracking-wider font-semibold text-muted-foreground">
                            Internal Order Notes
                          </Label>
                          {notes !== (order?.notes || '') && (
                            <Button
                              size="sm"
                              className="h-6 text-sm px-2.5"
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
                          className="text-sm resize-none"
                        />
                      </div>
                    </TabsContent>

                    {/* ── TAB 2: SERVICE CREDENTIALS ───────────────────────────── */}
                    <TabsContent value="credentials" className="m-0 space-y-6 outline-none">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-foreground">Service Access Credentials</h4>
                          <p className="text-sm text-muted-foreground">
                            Client mailbox and service login credentials.
                          </p>
                        </div>
                        <div>
                          {!isEditingCreds ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-[13px] h-[26px] gap-1.5"
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
                                className="text-[13px] h-[26px] gap-1"
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
                                className="text-[13px] h-[26px]"
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
                            <span className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">
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
                            <span className="text-muted-foreground text-sm uppercase tracking-wider font-semibold">
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
                            <Label className="text-sm font-semibold">Service Email</Label>
                            <Input
                              type="email"
                              placeholder="e.g. info@clientcompany.co.uk"
                              value={accessEmail}
                              onChange={(e) => setAccessEmail(e.target.value)}
                              className="text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-sm font-semibold">Email Password / Access Code</Label>
                            <Input
                              type="text"
                              placeholder="Enter access code"
                              value={accessPassword}
                              onChange={(e) => setAccessPassword(e.target.value)}
                              className="text-sm font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </TabsContent>

                    {/* ── TAB 3: PRODUCTS & PRICING ─────────────────────────────── */}
                    <TabsContent value="products" className="m-0 space-y-6 outline-none">
                      {showPrices && order?.invoice ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
                          <div className="flex items-center gap-3">
                            <IconFileText className="w-5 h-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-semibold">
                                Invoice {order.invoice.invoice_number}
                                <Badge className={`ml-2 text-[11px] ${
                                  order.invoice.display_status === 'Paid' ? 'badge-green'
                                    : order.invoice.display_status === 'Cancelled' ? 'bg-muted text-muted-foreground'
                                    : order.invoice.display_status === 'Overdue' ? 'badge-red' : 'badge-amber'
                                }`}>
                                  {order.invoice.display_status || order.invoice.status}
                                </Badge>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Total {formatGBP(order.invoice.total)}
                                {' · '}Paid {formatGBP(order.invoice.amount_paid)}
                                {' · '}Due {formatGBP(order.invoice.amount_due)}
                                {order.invoice.payment_timing ? ` · ${order.invoice.payment_timing}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5"
                              onClick={() => openInvoice(order.invoice.id)}>
                              <IconEye className="w-3.5 h-3.5" /> View invoice
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5"
                              onClick={() => downloadInvoice(order.invoice.id, order.invoice.invoice_number)}>
                              <IconDownload className="w-3.5 h-3.5" /> PDF
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-foreground">Products on this Order</h4>
                          <p className="text-sm text-muted-foreground">
                            Purchased service package and add-ons.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-[13px] h-[26px] gap-1.5"
                          onClick={() => setShowProductPicker((v) => !v)}
                        >
                          <IconPlus className="w-3.5 h-3.5" />
                          Add Product
                        </Button>
                      </div>

                      {showProductPicker && (
                        <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-foreground">
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
                              className="pl-9 text-sm"
                            />
                          </div>
                          <div className="max-h-40 overflow-y-auto space-y-1 rounded border bg-background p-1">
                            {filteredServices.map((svc) => (
                              <div
                                key={svc.id}
                                className="flex items-center justify-between p-2 rounded hover:bg-muted text-sm cursor-pointer"
                                onClick={() => handleAddProduct(svc)}
                              >
                                <div>
                                  <span className="font-semibold">{svc.name}</span>
                                  <span className="text-[10px] text-muted-foreground ml-2">({svc.category || svc.category_name})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {showPrices ? <span className="font-bold">{formatGBP(svc.price)}</span> : null}
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
                        <div className="p-3 bg-muted/30 border-b flex items-center justify-between text-sm font-semibold text-muted-foreground">
                          <span>Product / Service</span>
                          <span>{showPrices ? 'Status / Price' : 'Status'}</span>
                        </div>
                        {orderItems.map((item) => (
                          <div key={item.id} className="p-4 flex items-center justify-between gap-3 text-sm border-b last:border-b-0">
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-foreground truncate">{item.product_name}</span>
                              <span className="text-sm text-muted-foreground">
                                {item.category_name || order?.delivery_label || 'Standard Processing'}
                                {Number(item.quantity || 1) > 1 ? ` · Qty ${item.quantity}` : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Select
                                value={item.fulfillment_status || 'Pending'}
                                onValueChange={(status) => handleSaveItemStatus(item, status)}
                              >
                                <SelectTrigger className="w-32 text-sm" aria-label={`Status for ${item.product_name}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {(STATUS_OPTIONS.includes(item.fulfillment_status || 'Pending')
                                      ? STATUS_OPTIONS : [item.fulfillment_status, ...STATUS_OPTIONS]).map((status) => (
                                      <SelectItem key={status} value={status}>{status}</SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                              {showPrices ? (
                                <>
                                  <span className="text-sm text-muted-foreground">£</span>
                                  <Input
                                    key={`${item.id}-${item.unit_price}`}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    defaultValue={plainAmount(item.unit_price)}
                                    className="w-28 text-right font-bold"
                                    aria-label={`Price for ${item.product_name}`}
                                    onBlur={(e) => handleSaveItemPrice(item, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                  />
                                </>
                              ) : null}
                              {orderItems.length > 1 && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  title="Remove product"
                                  onClick={() => setRemoveTarget(item)}
                                >
                                  <IconTrash className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        {showPrices ? (
                          <div className="p-3 bg-muted/30 border-t flex items-center justify-between text-sm font-semibold">
                            <span>Total</span>
                            <span>{formatGBP(order?.total)}</span>
                          </div>
                        ) : null}
                      </div>
                    </TabsContent>

                    {/* ── TAB 4: DOCUMENTS ─────────────────────────────────────── */}
                    <TabsContent value="documents" className="m-0 space-y-4 outline-none">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-foreground">Order Documents</h4>
                          <p className="text-sm text-muted-foreground">
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
                            className="text-[13px] h-[26px] gap-1.5"
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
                                  <span className="text-sm font-semibold text-foreground truncate">
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
                                  className="h-7 text-sm px-2.5 gap-1"
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
                                  className="h-7 text-sm px-2.5 gap-1"
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
                        <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg border-dashed">
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
                <DialogDescription className="text-sm text-muted-foreground">
                  {previewDoc?.category || 'Order Document'} {previewDoc?.file_size ? `· ${previewDoc?.file_size}` : ''}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-[26px] text-[13px] gap-1.5"
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
                  className="h-[26px] text-[13px] gap-1.5"
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

      <DeleteConfirmation
        isOpen={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && handleRemoveItem(removeTarget)}
        title="Remove product"
        description={`Remove "${removeTarget?.product_name || 'this product'}" from this order? The order total will be recalculated.`}
        confirmText="Remove"
        isLoading={isRemovingItem}
      />

      <DeleteConfirmation
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={async () => {
          setConfirmCancel(false)
          if (order && (await cancelOrder(order))) {
            fetchOrderDetails()
            if (onOrderUpdated) onOrderUpdated()
          }
        }}
        title="Cancel order"
        description={cancelOrderMessage(order)}
        confirmText="Yes, cancel"
        cancelText="Keep order"
      />

      <PromptDialog
        isOpen={addFieldOpen}
        onClose={() => setAddFieldOpen(false)}
        onSubmit={handleAddField}
        title="Add field"
        label="Field name"
        placeholder="e.g. SIC Code, VAT Number"
        confirmText="Add field"
        required
      />

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
