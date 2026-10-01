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
import { IconLoader2 } from '@tabler/icons-react'
import ToastSave from '@/components/ToastSave'

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
    duration: '12 Months'
  })

  const resetForm = () => {
    setFormData({
      name: '',
      category: 'Corporate',
      description: '',
      sellPrice: '',
      originalPrice: '0',
      duration: '12 Months'
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

    setIsSubmitting(true)
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
        toast.success(data.message || "Service added successfully")
        resetForm()
        if (onSuccess) onSuccess()
        onClose()
      } else {
        toast.error(data.message || data.error || "Failed to add service")
      }
    } catch (error) {
      toast.error("Network error: " + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleAttemptClose() }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Service</DialogTitle>
            <DialogDescription>
              Add a new service to the database.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
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

            <div className="grid gap-2">
              <Label htmlFor="duration">Duration</Label>
              <Select 
                value={formData.duration}
                onValueChange={(val) => handleSelectChange('duration', val)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="duration" className="w-full">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="One Time">One Time</SelectItem>
                    <SelectItem value="1 Month">1 Month</SelectItem>
                    <SelectItem value="3 Months">3 Months</SelectItem>
                    <SelectItem value="6 Months">6 Months</SelectItem>
                    <SelectItem value="12 Months">12 Months</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
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
