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
import { toast } from 'sonner'
import { toastProcessing, toastDone, toastFail } from '@/lib/toastActions'
import { IconLoader2 } from '@tabler/icons-react'
import ToastSave from '@/components/ToastSave'
import FormFieldsBuilder, { formFieldsError } from './FormFieldsBuilder'
import { ScrollArea } from '@/components/ui/scroll-area'

const AddService = ({ isOpen, onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showUnsavedToast, setShowUnsavedToast] = useState(false)
  const [toastSaveState, setToastSaveState] = useState('initial')
  
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
  }

  const handleSelectChange = (id, value) => {
    setFormData(prev => ({ ...prev, [id]: value }))
  }

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.sellPrice.trim()) {
      toast.error("Name and Sell price are required fields.")
      return
    }
    const formError = formFieldsError(formData.form_fields)
    if (formError) {
      toast.error(formError)
      return
    }

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
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Add Service</DialogTitle>
            <DialogDescription>
              Add a new service to the database.
            </DialogDescription>
          </DialogHeader>
          {/* Header and buttons stay put; only the form scrolls */}
          <ScrollArea className="-mx-6" viewportClassName="max-h-[60vh]">
          <div className="grid gap-4 px-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input 
                id="name" 
                placeholder="Enter service name" 
                value={formData.name}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="category">Category *</Label>
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
                placeholder="Optional service description" 
                className="min-h-[80px]" 
                value={formData.description}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="sellPrice">Sell price (£) *</Label>
                <Input 
                  id="sellPrice" 
                  type="number" 
                  placeholder="0" 
                  value={formData.sellPrice}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="originalPrice">Original / cost price (£)</Label>
                <Input 
                  id="originalPrice" 
                  type="number" 
                  value={formData.originalPrice}
                  onChange={handleChange}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <FormFieldsBuilder
              value={formData.form_fields}
              onChange={(form_fields) => setFormData((prev) => ({ ...prev, form_fields }))}
              disabled={isSubmitting}
            />
          </div>
          </ScrollArea>
          <DialogFooter className="gap-3">
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
