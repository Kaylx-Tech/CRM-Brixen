import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { IconUserPlus, IconAlertCircle } from '@tabler/icons-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ToastSave from '@/components/ToastSave'
import { toast } from 'sonner'
import { toastProcessing, toastDone, toastFail } from '@/lib/toastActions'
import { useFormErrors } from '@/lib/validation'
import { FieldMessage, RequiredMark, invalidProps } from '@/components/FormField'

const CUSTOMER_SCHEMA = {
  full_name: { label: 'Full name', required: true, maxLength: 120 },
  email: { label: 'Email', required: true, type: 'email' },
  phone: { label: 'Phone', type: 'phone' },
  city: { label: 'City', maxLength: 80 },
}

const AddCustomer = ({ isOpen, onClose, onCustomerCreated }) => {
  const [custType, setCustType] = useState('individual')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showUnsavedToast, setShowUnsavedToast] = useState(false)
  const [toastSaveState, setToastSaveState] = useState('initial')
  const { errors, check, recheck, fromResponse, clear } = useFormErrors(CUSTOMER_SCHEMA, { prefix: 'cust-' })

  const isDirty = Boolean(
    fullName.trim() ||
    email.trim() ||
    phone.trim() ||
    city.trim()
  )

  const handleReset = () => {
    setFullName('')
    setEmail('')
    setPhone('')
    setCity('')
    setError('')
    clear()
    setShowUnsavedToast(false)
  }

  const handleAttemptClose = () => {
    if (isLoading) return
    if (isDirty) {
      setShowUnsavedToast(true)
    } else {
      onClose()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!check({ full_name: fullName, email, phone, city })) return

    setIsLoading(true)
    const toastId = toastProcessing('Creating customer…')

    let typeMapped = 'Individual'
    if (custType === 'b2b') typeMapped = 'B2B'
    else if (custType === 'business') typeMapped = 'Business'

    const payload = {
      role: 'CLIENT',
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || undefined,
      city: city.trim() || undefined,
      // No password is sent: the server sets the default password and the login email is also the notification email.
      client_type: typeMapped,
      is_b2b: custType === 'b2b' ? 1 : 0,
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem("token")
      const res = await fetch(`${apiUrl}/admin/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok && (data.status === 'success' || data.success === true)) {
        toastDone(
          toastId,
          data.message || `Customer "${fullName.trim()}" created successfully.`,
        )
        if (onCustomerCreated) onCustomerCreated()
        onClose()
      } else {
        const msg = data.message || data.error || 'Failed to create customer.'
        if (!fromResponse({ data })) setError(msg)
        toastFail(toastId, msg)
      }
    } catch (err) {
      const msg = 'Connection error: ' + err.message
      setError(msg)
      toastFail(toastId, msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleAttemptClose() }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create Customer</DialogTitle>
            <DialogDescription>
              Create a new customer account (Individual, Business, or B2B Partner).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <IconAlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <Label className="font-semibold">Customer Type <span className="text-destructive">*</span></Label>
              <RadioGroup value={custType} onValueChange={setCustType} className="flex flex-col gap-2.5">
                <Label
                  htmlFor="individual"
                  className="flex items-center justify-between gap-4 rounded-lg border border-input p-3 hover:bg-accent/50 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5 cursor-pointer font-normal transition-all"
                >
                  <div className="flex items-center gap-3">
                    <RadioGroupItem value="individual" id="individual" />
                    <div>
                      <span className="font-semibold text-sm">Individual</span>
                      <p className="text-sm text-muted-foreground">
                        Has only one company. Single / personal company owner.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0 hidden sm:inline-block">
                    1 Company Limit
                  </span>
                </Label>

                <Label
                  htmlFor="business"
                  className="flex items-center justify-between gap-4 rounded-lg border border-input p-3 hover:bg-accent/50 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5 cursor-pointer font-normal transition-all"
                >
                  <div className="flex items-center gap-3">
                    <RadioGroupItem value="business" id="business" />
                    <div>
                      <span className="font-semibold text-sm">Business</span>
                      <p className="text-sm text-muted-foreground">
                        Multiple companies. Direct multi-company corporate account.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0 hidden sm:inline-block">
                    Multi-Company
                  </span>
                </Label>

                <Label
                  htmlFor="b2b"
                  className="flex items-center justify-between gap-4 rounded-lg border border-input p-3 hover:bg-accent/50 [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5 cursor-pointer font-normal transition-all"
                >
                  <div className="flex items-center gap-3">
                    <RadioGroupItem value="b2b" id="b2b" />
                    <div>
                      <span className="font-semibold text-sm">B2B Account</span>
                      <p className="text-sm text-muted-foreground">
                        Deals on behalf of others. Intermediary/agent managing client portfolios.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0 hidden sm:inline-block">
                    Partner / Agent
                  </span>
                </Label>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="cust-full_name">Full Name <RequiredMark /></Label>
                <Input
                  id="cust-full_name"
                  {...invalidProps(errors, 'full_name', 'cust-')}
                  placeholder="e.g. Muhammad Ahmed"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); recheck('full_name', e.target.value) }}
                  disabled={isLoading}
                />
                <FieldMessage id="cust-full_name-error" message={errors.full_name} />
              </div>
              
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="cust-email">Email Address <RequiredMark /></Label>
                <Input
                  id="cust-email"
                  {...invalidProps(errors, 'email', 'cust-')}
                  type="email"
                  placeholder="customer@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); recheck('email', e.target.value) }}
                  disabled={isLoading}
                />
                <FieldMessage id="cust-email-error" message={errors.email} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cust-phone">Phone Number</Label>
                <Input
                  id="cust-phone"
                  {...invalidProps(errors, 'phone', 'cust-')}
                  placeholder="+44 7911 123456"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); recheck('phone', e.target.value) }}
                  disabled={isLoading}
                />
                <FieldMessage id="cust-phone-error" message={errors.phone} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cust-city">City</Label>
                <Input
                  id="cust-city"
                  {...invalidProps(errors, 'city', 'cust-')}
                  placeholder="e.g. London"
                  value={city}
                  onChange={(e) => { setCity(e.target.value); recheck('city', e.target.value) }}
                  disabled={isLoading}
                />
                <FieldMessage id="cust-city-error" message={errors.city} />
              </div>

              <p className="md:col-span-2 text-sm text-muted-foreground">
                The login password is set automatically to the default password, and notification emails go to the
                email above. Both can be changed later from the customer profile.
              </p>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleAttemptClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                <IconUserPlus className="mr-2 h-4 w-4" />
                {isLoading ? 'Creating...' : 'Create Customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ToastSave
        open={isOpen && showUnsavedToast}
        state={toastSaveState}
        initialText="You have unsaved customer details. Discard and close?"
        discardText="Discard & Close"
        saveText="Create Customer"
        cancelText="Keep Editing"
        onCancel={() => setShowUnsavedToast(false)}
        onDiscard={() => {
          handleReset()
          onClose()
        }}
        onSave={async (e) => {
          setToastSaveState('loading')
          try {
            await handleSubmit(e || { preventDefault: () => {} })
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

export default AddCustomer
