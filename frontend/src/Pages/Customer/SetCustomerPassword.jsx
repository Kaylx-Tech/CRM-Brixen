import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldMessage, RequiredMark, invalidProps } from '@/components/FormField'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { toastProcessing, toastDone, toastFail } from '@/lib/toastActions'
import { IconAlertCircle, IconEye, IconEyeOff } from '@tabler/icons-react'
import ToastSave from '@/components/ToastSave'

const SetCustomerPassword = ({ customer, isOpen, onClose, onPasswordSet }) => {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showUnsavedToast, setShowUnsavedToast] = useState(false)
  const [toastSaveState, setToastSaveState] = useState('initial')

  const isDirty = Boolean(password)

  const handleAttemptClose = () => {
    if (isLoading) return
    if (isDirty) {
      setShowUnsavedToast(true)
    } else {
      handleClose()
    }
  }

  const handleClose = () => {
    setPassword('')
    setError('')
    setFieldError('')
    setShowPassword(false)
    setShowUnsavedToast(false)
    onClose()
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    setError('')

    // Same minimum as the server (STAFF_MIN_PASSWORD_LEN in client_routes.py)
    if (!password || password.length < 10) {
      setFieldError(password ? 'Password must be at least 10 characters.' : 'Password is required.')
      document.getElementById('password')?.focus()
      return
    }
    setFieldError('')

    setIsLoading(true)
    const toastId = toastProcessing('Updating password…')
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem("token")
      const res = await fetch(`${apiUrl}/admin/customers/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify({
          customer_id: customer?.id,
          password: password,
          confirm_password: password,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok && (data.status === 'success' || data.success === true)) {
        toastDone(
          toastId,
          data.message || `Password for ${customer?.name || 'customer'} updated successfully!`,
        )
        if (onPasswordSet) onPasswordSet()
        handleClose()
      } else {
        const msg = data.message || data.error || 'Failed to update customer password.'
        if (data.fields?.password) setFieldError(data.fields.password)
        else setError(msg)
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

  if (!customer) return null

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleAttemptClose() }}>
        <DialogContent className="sm:max-w-100">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Set Customer Password</DialogTitle>
            <DialogDescription className="text-sm mt-0.5">
              Set password for <strong>{customer.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} noValidate className="space-y-4 pt-2">
            {error && (
              <Alert variant="destructive">
                <IconAlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">New Password <RequiredMark /></Label>
              <div className="relative">
                <Input
                  id="password"
                  {...invalidProps({ password: fieldError }, 'password')}
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 10 characters"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (fieldError && e.target.value.length >= 10) setFieldError('') }}
                  disabled={isLoading}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
                </button>
              </div>
              <FieldMessage id="password-error" message={fieldError} />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleAttemptClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Setting password..." : "Set Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ToastSave
        open={isOpen && showUnsavedToast}
        state={toastSaveState}
        initialText="You have an unsaved password entered. Discard?"
        discardText="Discard & Close"
        saveText="Save Password"
        cancelText="Keep Editing"
        onCancel={() => setShowUnsavedToast(false)}
        onDiscard={handleClose}
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

export default SetCustomerPassword
