import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toastProcessing, toastDone, toastFail } from '@/lib/toastActions'
import { IconLoader2 } from '@tabler/icons-react'
import ToastSave from '@/components/ToastSave'
import { useFormErrors } from '@/lib/validation'
import { FieldMessage, RequiredMark, invalidProps } from '@/components/FormField'

/** Same rules as SERVICE_RULES in backend/routes/catalog_routes.py (also used by the Edit Service dialog) */
export const SERVICE_SCHEMA = {
  name: { label: 'Service name', required: true, maxLength: 160 },
  description: { label: 'Description', maxLength: 4000 },
  sellPrice: { label: 'Sell price', required: true, type: 'amount' },
  originalPrice: { label: 'Original price', type: 'amount' },
}
import FormFieldsBuilder, { formFieldsError } from './FormFieldsBuilder'

const AddService = ({ isOpen, onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showUnsavedToast, setShowUnsavedToast] = useState(false)
  const [toastSaveState, setToastSaveState] = useState('initial')
  const { errors, setErrors, check, recheck, fromResponse, clear } = useFormErrors(SERVICE_SCHEMA)
  
  const [formData, setFormData] = useState({
    name: '',
    category: 'Corporate',
    description: '',
    sellPrice: '',
    originalPrice: '0',
    duration: '12 Months',
    form_fields: [],
  })

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'Corporate',
      description: '',
      sellPrice: '',
      originalPrice: '0',
      duration: '12 Months',
      form_fields: [],
    })
    clear()
    setShowUnsavedToast(false)
  }

  const isDirty = Boolean(
    formData.name.trim() ||
    formData.description.trim() ||
    formData.sellPrice.trim()
  )

  const handleAttemptClose = () => {
    if (isSubmitting) return
    if (isDirty) {
      setShowUnsavedToast(true)
    } else {
      onClose()
    }
  }

  const handleChange = (e) => {
    const { id, value } = e.target
    setFormData(prev => ({ ...prev, [id]: value }))
    recheck(id, value)
  }

  const handleSelectChange = (id, value) => {
    setFormData(prev => ({ ...prev, [id]: value }))
  }

  const handleSubmit = async () => {
    const formError = formFieldsError(formData.form_fields)
    const ok = check(formData)
    if (formError) setErrors((prev) => ({ ...prev, form_fields: formError }))
    if (!ok || formError) return

    setIsSubmitting(true)
    const toastId = toastProcessing('Adding service…')
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')
      const res = await fetch(`${apiUrl}/catalog/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(formData)
      })

      const data = await res.json()
      if (res.ok) {
        toastDone(toastId, data.message || "Service added successfully")
        resetForm()
        if (onSuccess) onSuccess()
        onClose()
      } else {
        fromResponse({ data })
        toastFail(toastId, data.message || data.error || "Failed to add service")
      }
    } catch (error) {
      toastFail(toastId, "Network error: " + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleAttemptClose() }}>
        <DialogContent className="sm:max-w-140 max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Add Service</DialogTitle>
            <DialogDescription>
              Add a new service to the database.
            </DialogDescription>
          </DialogHeader>
          {/* Header and buttons stay put; only the form scrolls */}
          <div className="-mx-6 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid gap-4 px-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name <RequiredMark /></Label>
              <Input 
                id="name"
                {...invalidProps(errors, 'name', '')} 
                placeholder="Enter service name" 
                value={formData.name}
                onChange={handleChange}
                disabled={isSubmitting}
              />
              <FieldMessage id="name-error" message={errors.name} />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="category">Category <RequiredMark /></Label>
              <Select 
                value={formData.category} 
                onValueChange={(val) => handleSelectChange('category', val)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="category" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="Solutions">Solutions</SelectItem>
                    <SelectItem value="Professional">Professional</SelectItem>
                    <SelectItem value="Forms">Forms</SelectItem>
                    <SelectItem value="Digital">Digital</SelectItem>
                    <SelectItem value="Corporate">Corporate</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea 
                id="description"
                {...invalidProps(errors, 'description', '')} 
                placeholder="Optional service description" 
                className="min-h-20" 
                value={formData.description}
                onChange={handleChange}
                disabled={isSubmitting}
              />
              <FieldMessage id="description-error" message={errors.description} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sellPrice">Sell price (£) <RequiredMark /></Label>
                <Input 
                  id="sellPrice"
                  {...invalidProps(errors, 'sellPrice', '')} 
                  type="number" 
                  placeholder="0" 
                  value={formData.sellPrice}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
                <FieldMessage id="sellPrice-error" message={errors.sellPrice} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="originalPrice">Original / cost price (£)</Label>
                <Input 
                  id="originalPrice"
                  {...invalidProps(errors, 'originalPrice', '')} 
                  type="number" 
                  value={formData.originalPrice}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
                <FieldMessage id="originalPrice-error" message={errors.originalPrice} />
              </div>
            </div>

            <FormFieldsBuilder
              value={formData.form_fields}
              onChange={(form_fields) => setFormData((prev) => ({ ...prev, form_fields }))}
              disabled={isSubmitting}
            />
            <FieldMessage message={errors.form_fields} />
          </div>
          </div>
          <DialogFooter className="gap-3 shrink-0">
            <Button variant="outline" onClick={handleAttemptClose} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastSave
        open={isOpen && showUnsavedToast}
        state={toastSaveState}
        initialText="You have unsaved service details. Discard and close?"
        discardText="Discard & Close"
        saveText="Save Service"
        cancelText="Keep Editing"
        onCancel={() => setShowUnsavedToast(false)}
        onDiscard={() => {
          resetForm()
          onClose()
        }}
        onSave={async () => {
          setToastSaveState('loading')
          try {
            await handleSubmit()
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

export default AddService
