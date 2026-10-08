import React, { useEffect, useMemo, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconLoader2, IconUpload } from "@tabler/icons-react"
import { toast } from "sonner"
import { toastProcessing, toastDone, toastFail } from "@/lib/toastActions"
import { apiRequest } from "@/lib/api"
import ToastSave from "@/components/ToastSave"

export const DOCUMENT_CATEGORIES = [
  'Order Documents',
  'Certificate of Incorporation',
  'Company Documents',
  'Proof of Address',
  'ID Document',
  'Bank statement',
  'Compliance',
  'Legal',
]

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.onerror = () => reject(new Error('Unable to read the selected file.'))
    reader.readAsDataURL(file)
  })
}

function normalizeCustomers(payload) {
  const data = payload || {}
  const list =
    data.customers ||
    data.data?.customers ||
    data.data?.clients ||
    (Array.isArray(data.data) ? data.data : null) ||
    (Array.isArray(data) ? data : [])
  return Array.isArray(list) ? list : []
}

/**
 * Legacy modal-deliver-document parity (Documents Review → Upload Document).
 */
export default function UploadDocumentModal({
  open,
  onOpenChange,
  onUploaded,
}) {
  const [customers, setCustomers] = useState([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [loadingAssoc, setLoadingAssoc] = useState(false)
  const [companies, setCompanies] = useState([])
  const [orders, setOrders] = useState([])
  const [formError, setFormError] = useState('')
  const [uploading, setUploading] = useState(false)

  const [clientId, setClientId] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Order Documents')
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [clientVisible, setClientVisible] = useState(true)
  const [companyId, setCompanyId] = useState('')
  const [orderId, setOrderId] = useState('')
  const [showUnsavedToast, setShowUnsavedToast] = useState(false)
  const [toastSaveState, setToastSaveState] = useState('initial')

  const isDirty = Boolean(clientId || name.trim() || file || message.trim())

  const handleAttemptClose = () => {
    if (uploading) return
    if (isDirty) {
      setShowUnsavedToast(true)
    } else {
      onOpenChange?.(false)
    }
  }

  const resetForm = () => {
    setClientId('')
    setName('')
    setCategory('Order Documents')
    setFile(null)
    setMessage('')
    setClientVisible(true)
    setCompanyId('')
    setOrderId('')
    setCompanies([])
    setOrders([])
    setFormError('')
    setShowUnsavedToast(false)
  }

  useEffect(() => {
    if (!open) return
    resetForm()
    let cancelled = false
    ;(async () => {
      setLoadingCustomers(true)
      const res = await apiRequest('/admin/customers?limit=500', {
        label: 'Customers',
        silent: true,
      })
      if (cancelled) return
      if (!res.ok) {
        setFormError(res.reason || 'Unable to load customers.')
        setCustomers([])
      } else {
        setCustomers(normalizeCustomers(res.data))
      }
      setLoadingCustomers(false)
    })()
    return () => { cancelled = true }
  }, [open])

  const loadAssociations = async (id) => {
    if (!id) {
      setCompanies([])
      setOrders([])
      setCompanyId('')
      setOrderId('')
      return
    }
    setLoadingAssoc(true)
    setFormError('')
    try {
      const res = await apiRequest(`/admin/clients/${id}/full`, {
        label: 'Customer details',
        silent: true,
      })
      if (!res.ok) {
        // Fallback to customers/:id detail
        const alt = await apiRequest(`/admin/customers/${id}`, {
          label: 'Customer details',
          silent: true,
        })
        if (!alt.ok) {
          setFormError(res.reason || alt.reason || 'Unable to load this customer.')
          setCompanies([])
          setOrders([])
          return
        }
        const d = alt.data?.data || alt.data || {}
        const cos = (d.companies || []).map((c) => ({
          id: c.id,
          name: c.name || c.company_name,
        }))
        const ords = (d.orders || []).map((o) => ({
          id: o.id,
          order_number: o.order_number,
          service_name: o.service_name,
          company_id: o.company_id,
        }))
        setCompanies(cos)
        setOrders(ords)
      } else {
        const payload = res.data || {}
        const nested = payload.data || {}
        setCompanies(payload.companies || nested.companies || [])
        setOrders(payload.orders || nested.orders || [])
      }
      setCompanyId('')
      setOrderId('')
    } finally {
      setLoadingAssoc(false)
    }
  }

  const onClientChange = (value) => {
    const next = value === 'none' ? '' : value
    setClientId(next)
    loadAssociations(next)
  }

  const filteredOrders = useMemo(() => {
    if (!companyId) return orders
    return orders.filter(
      (o) => !o.company_id || String(o.company_id) === String(companyId),
    )
  }, [orders, companyId])

  const onFileChange = (e) => {
    const next = e.target.files?.[0] || null
    setFile(next)
    if (next && !String(name || '').trim()) {
      setName(next.name.replace(/\.[^.]+$/, '') || next.name)
    }
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    setFormError('')
    if (!clientId) {
      setFormError('Select a customer first.')
      return
    }
    if (!String(name || '').trim()) {
      setFormError('Document name is required.')
      return
    }
    if (!file) {
      setFormError('Choose a file to upload.')
      return
    }

    setUploading(true)
    const toastId = toastProcessing('Uploading document…')
    try {
      const b64 = await fileToBase64(file)
      const payload = {
        client_id: Number(clientId),
        name: String(name).trim(),
        file_name: file.name,
        category: category || 'Order Documents',
        client_message: message || '',
        file_content_base64: b64,
        mime_type: file.type || 'application/pdf',
        client_visible: clientVisible ? 1 : 0,
      }
      if (companyId) payload.company_id = Number(companyId)
      if (orderId) payload.order_id = Number(orderId)

      const res = await apiRequest('/admin/documents', {
        method: 'POST',
        body: JSON.stringify(payload),
        label: 'Upload document',
        silent: true,
      })
      if (!res.ok) {
        const msg = res.reason || res.data?.message || res.data?.error || 'Upload failed.'
        setFormError(msg)
        toastFail(toastId, msg)
        return
      }

      const lines = ['Document uploaded successfully']
      if (res.data?.notification_created) lines.push('Client notified')
      if (res.data?.email_sent || res.data?.email_status === 'queued' || res.data?.email_status) {
        lines.push('Email queued')
      }
      toastDone(toastId, lines[0], { description: lines.slice(1).join(' · ') || undefined })
      onOpenChange?.(false)
      onUploaded?.(res.data)
    } catch (err) {
      setFormError(err.message || 'Upload failed.')
      toastFail(toastId, err.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleAttemptClose() }}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            This saves the file in the CRM, shows it in Documents Review, and can notify the customer.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-3.5">
          {formError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive" role="alert">
              {formError}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>
              Customer <span className="text-destructive">*</span>
            </Label>
            <Select
              value={clientId || null}
              onValueChange={onClientChange}
              disabled={loadingCustomers || uploading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={loadingCustomers ? 'Loading customers…' : 'Select a customer'} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.full_name || 'Customer'}
                      {c.email ? ` (${c.email})` : ''}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>
              Document name <span className="text-destructive">*</span>
            </Label>
            <Input
              className="w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Certificate of Incorporation"
              required
              disabled={uploading}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>
              Document type / category <span className="text-destructive">*</span>
            </Label>
            <Select
              value={category}
              onValueChange={setCategory}
              disabled={uploading}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>
              File <span className="text-destructive">*</span>
            </Label>
            <Input
              className="w-full text-xs"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.zip"
              onChange={onFileChange}
              required
              disabled={uploading}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Description / message to client</Label>
            <Textarea
              className="min-h-[80px] w-full"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional short message shown in the client notification and email. Internal notes are never sent."
              disabled={uploading}
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <Checkbox
              checked={clientVisible}
              onCheckedChange={(v) => setClientVisible(!!v)}
              disabled={uploading}
            />
            <span>Visible to client (client can view and download in portal)</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Related company</Label>
              <Select
                value={companyId || 'none'}
                onValueChange={(v) => {
                  const next = v === 'none' ? '' : v
                  setCompanyId(next)
                  setOrderId('')
                }}
                disabled={!clientId || loadingAssoc || uploading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">No company</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name || c.company_name || `Company #${c.id}`}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Related order</Label>
              <Select
                value={orderId || 'none'}
                onValueChange={(v) => setOrderId(v === 'none' ? '' : v)}
                disabled={!clientId || loadingAssoc || uploading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">No order</SelectItem>
                    {filteredOrders.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.order_number}
                        {o.service_name ? ` — ${o.service_name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 mt-1">
            <Button
              type="button"
              variant="outline"
              onClick={handleAttemptClose}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={uploading || loadingCustomers}>
              {uploading ? (
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <IconUpload className="mr-2 h-4 w-4" />
              )}
              Upload Document
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <ToastSave
      open={open && showUnsavedToast}
      state={toastSaveState}
      initialText="You have unuploaded document details. Discard and close?"
      discardText="Discard & Close"
      saveText="Upload Now"
      cancelText="Keep Editing"
      onCancel={() => setShowUnsavedToast(false)}
      onDiscard={() => {
        resetForm()
        onOpenChange?.(false)
      }}
      onSave={async (e) => {
        setToastSaveState('loading')
        try {
          await handleSubmit(e)
          setToastSaveState('success')
          setTimeout(() => {
            setShowUnsavedToast(false)
            setToastSaveState('initial')
          }, 700)
        } catch (err) {
          setToastSaveState('initial')
        }
      }}
    />
  </>
  )
}
