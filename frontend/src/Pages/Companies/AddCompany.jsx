import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IconBuildingPlus } from '@tabler/icons-react'

const AddCompany = ({ isOpen, onClose }) => {
  const [clientType, setClientType] = useState('existing');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl">Add company</DialogTitle>
          <DialogDescription>
            For companies registered before the CRM. This creates a company card only — no order. Companies House fills official details, so you can delete any dummy orders afterwards.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="p-6 pt-2 space-y-6">
            
            <div className="space-y-3">
              <Label className="text-base font-semibold">Search Companies House</Label>
              <Input placeholder="Type name or number" />
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">Client account <span className="text-destructive">*</span></Label>
              <RadioGroup value={clientType} onValueChange={setClientType} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Label
                  htmlFor="existing"
                  className="flex items-start gap-3 rounded-md border border-input p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary cursor-pointer font-normal"
                >
                  <RadioGroupItem value="existing" id="existing" className="mt-0.5" />
                  <span className="font-semibold text-sm">Existing client</span>
                </Label>
                
                <Label
                  htmlFor="new"
                  className="flex items-start gap-3 rounded-md border border-input p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary cursor-pointer font-normal"
                >
                  <RadioGroupItem value="new" id="new" className="mt-0.5" />
                  <span className="font-semibold text-sm">New client (no portal account yet)</span>
                </Label>
              </RadioGroup>
            </div>

            {clientType === 'existing' ? (
              <div className="space-y-3">
                <Label>Select client</Label>
                <Select>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an existing client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="c1">Muhammad Waqas Aslam</SelectItem>
                      <SelectItem value="c2">Jane Doe</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label>Full name <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. John Smith" />
                </div>
                <div className="space-y-2">
                  <Label>Email <span className="text-destructive">*</span></Label>
                  <Input type="email" placeholder="email@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Phone <span className="text-muted-foreground font-normal ml-1">Optional</span></Label>
                  <Input placeholder="+44..." />
                </div>
              </div>
            )}

            <div className="space-y-4 pt-2">
              <Label className="text-base font-semibold">Company Details</Label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label>Company name <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. Acme Corp" />
                </div>
                
                <div className="space-y-2">
                  <Label>Company number <span className="text-muted-foreground font-normal ml-1">Optional</span></Label>
                  <Input placeholder="e.g. 12345678" />
                </div>
                
                <div className="space-y-2">
                  <Label>Incorporation date</Label>
                  <Input type="date" />
                </div>
                
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select defaultValue="active">
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="dissolved">Dissolved</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Director</Label>
                  <Input placeholder="Director name" />
                </div>
                
                <div className="space-y-2">
                  <Label>Package</Label>
                  <Select defaultValue="historical">
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Package" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="historical">Historical Registration</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Registered office</Label>
                  <Input defaultValue="United Kingdom" />
                </div>
              </div>
            </div>

          </div>
        </ScrollArea>
        
        <div className="p-6 pt-4 border-t bg-muted/20">
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button>
              <IconBuildingPlus className="mr-2 h-4 w-4" />
              Add company
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default AddCompany
