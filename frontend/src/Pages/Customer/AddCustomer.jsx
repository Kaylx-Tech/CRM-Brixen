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

const AddCustomer = ({ isOpen, onClose, onCustomerCreated }) => {
  const [custType, setCustType] = useState('individual')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('United Kingdom')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 10) {
      setError('Password must be at least 10 characters.')
      return
    }

    setIsLoading(true)

    let typeMapped = 'Individual'
    if (custType === 'b2b') typeMapped = 'B2B'
    else if (custType === 'business') typeMapped = 'Business'

    const payload = {
      role: 'CLIENT',
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || undefined,
      country: country.trim() || 'United Kingdom',
      password: password,
      confirm_password: confirmPassword,
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
        if (onCustomerCreated) onCustomerCreated()
        onClose()
      } else {
        setError(data.message || data.error || 'Failed to create customer.')
      }
    } catch (err) {
      setError('Connection error: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Customer</DialogTitle>
          <DialogDescription>
            Create a new customer account (Individual, Business, or B2B Partner).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
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
                    <p className="text-xs text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground">
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
              <Label htmlFor="fullName">Full Name <span className="text-destructive">*</span></Label>
              <Input
                id="fullName"
                placeholder="e.g. Muhammad Ahmed"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="email">Email Address <span className="text-destructive">*</span></Label>
              <Input
                id="email"
                type="email"
                placeholder="customer@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                placeholder="+44 7911 123456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
              <Input
                id="password"
                type="password"
                placeholder="Minimum 10 chars"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm Password <span className="text-destructive">*</span></Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat password"
                required
                minLength={10}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
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
  )
}

export default AddCustomer
