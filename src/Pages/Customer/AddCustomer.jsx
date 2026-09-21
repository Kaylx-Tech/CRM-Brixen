import React from 'react'
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
import { IconUserPlus } from '@tabler/icons-react'

const AddCustomer = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Customer</DialogTitle>
          <DialogDescription>
            Create a new customer account (Normal Customer or B2B Account).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          
          <div className="space-y-3">
            <Label className="font-semibold">Customer Type <span className="text-destructive">*</span></Label>
            <RadioGroup defaultValue="normal" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Label
                htmlFor="normal"
                className="flex items-start gap-3 rounded-md border border-input p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary cursor-pointer font-normal"
              >
                <RadioGroupItem value="normal" id="normal" className="mt-0.5" />
                <div className="grid gap-1">
                  <span className="font-semibold text-sm">Normal Customer</span>
                  <span className="text-xs text-muted-foreground">
                    Retail/individual client. Signs in on the Brixen website only — not this CRM portal.
                  </span>
                </div>
              </Label>

              <Label
                htmlFor="b2b"
                className="flex items-start gap-3 rounded-md border border-input p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary cursor-pointer font-normal"
              >
                <RadioGroupItem value="b2b" id="b2b" className="mt-0.5" />
                <div className="grid gap-1">
                  <span className="font-semibold text-sm">B2B Customer</span>
                  <span className="text-xs text-muted-foreground">
                    Corporate client. Signs in to this CRM portal with email and password. Unique B2B-XXXXXX ID.
                  </span>
                </div>
              </Label>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="fullName">Full Name <span className="text-destructive">*</span></Label>
              <Input id="fullName" placeholder="e.g. Muhammad Ahmed" />
            </div>
            
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="email">Email Address <span className="text-destructive">*</span></Label>
              <Input id="email" type="email" placeholder="customer@example.com" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" placeholder="+44 7911 123456" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" defaultValue="United Kingdom" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
              <Input id="password" type="password" placeholder="Minimum 10 chars" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm Password <span className="text-destructive">*</span></Label>
              <Input id="confirmPassword" type="password" placeholder="Repeat password" />
            </div>
          </div>
          
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button>
            <IconUserPlus className="mr-2 h-4 w-4" />
            Create Customer
          </Button>
        </DialogFooter>
       
      </DialogContent>
    </Dialog>
  )
}

export default AddCustomer
