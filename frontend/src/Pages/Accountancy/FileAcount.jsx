import React, { useState, useEffect } from 'react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format } from 'date-fns'
import { IconCalendar } from '@tabler/icons-react'

// Helper to convert DD/MM/YYYY or ISO date string to YYYY-MM-DD for standard date input
const toDateInputValue = (dateStr) => {
  if (!dateStr) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split('/')
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0]
    }
  } catch {
    return ''
  }
  return ''
}

const InlineDatePicker = ({ dateString, onChange }) => {
  const date = dateString ? new Date(dateString) : null;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            data-empty={!date}
            className={`w-full justify-start text-left font-normal text-sm ${!date ? 'text-muted-foreground' : ''}`}
          />
        }
      >
        <IconCalendar className="mr-2 h-4 w-4" />
        {date ? format(date, "PPP") : <span>Pick a date</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              const adjusted = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
              onChange(adjusted.toISOString().split('T')[0]);
            } else {
              onChange('');
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
};

const FileAccount = ({ isOpen, onClose, company, companies = [], onFileSubmitted }) => {
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [accountsType, setAccountsType] = useState('Micro-entity')
  const [status, setStatus] = useState('In progress')
  const [periodStart, setPeriodStart] = useState('2024-06-01')
  const [periodEnd, setPeriodEnd] = useState('2025-05-31')
  const [dueDate, setDueDate] = useState('2026-02-28')
  const [confirmationNumber, setConfirmationNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const applyCompanyData = (comp) => {
    if (!comp) return
    setSelectedCompanyId(String(comp.id || comp.company_id || ''))
    setAccountsType(comp.type || 'Micro-entity')
    setStatus(comp.status === 'Overdue' ? 'In progress' : comp.status || 'In progress')

    if (comp.due_date) {
      setDueDate(toDateInputValue(comp.due_date) || '2026-02-28')
    }
    if (comp.year_end) {
      setPeriodEnd(toDateInputValue(comp.year_end) || '2025-05-31')
    }
    if (comp.period_start) {
      setPeriodStart(toDateInputValue(comp.period_start) || '2024-06-01')
    }
    setConfirmationNumber(comp.confirmation_number || '')
    setNotes(comp.notes || '')
  }

  useEffect(() => {
    if (company) {
      applyCompanyData(company)
    } else if (companies.length > 0) {
      applyCompanyData(companies[0])
    }
  }, [company, companies, isOpen])

  const handleCompanySelect = (compId) => {
    setSelectedCompanyId(compId)
    const found = companies.find((c) => String(c.id || c.company_id) === String(compId))
    if (found) {
      applyCompanyData(found)
    }
  }

  const currentCompany =
    companies.find((c) => String(c.id || c.company_id) === String(selectedCompanyId)) || company

  const handleSubmit = async (e) => {
    e.preventDefault()
    const targetId = selectedCompanyId || company?.id
    if (!targetId) {
      toast.error('Please select a company to file accounts.')
      return
    }

    setIsSubmitting(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')
      const res = await fetch(`${apiUrl}/admin/accountancy/${targetId}/file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          company_id: targetId,
          accounts_type: accountsType,
          status: status,
          period_start: periodStart,
          period_end: periodEnd,
          due_date: dueDate,
          confirmation_number: confirmationNumber,
          notes: notes,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok && (data.success || data.status === 'success')) {
        toast.success(
          data.message ||
            `Accounts for ${currentCompany?.company_name || 'company'} filed successfully!`
        )
        if (onFileSubmitted) onFileSubmitted()
        onClose()
      } else {
        // Failed: surface the error and keep the dialog open so the user can retry
        toast.error(data.message || data.error || 'Failed to file accounts.')
      }
    } catch (err) {
      console.error('Filing submission error:', err)
      toast.error('Network error: could not file accounts. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-150 p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>File yearly accounts</DialogTitle>
          <DialogDescription>
            Complete UK filing checks, then record the Companies House annual accounts for this
            company.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh]">
          <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-4">
            {/* Company * */}
            <div className="space-y-2">
              <Label htmlFor="company-select">Company *</Label>
              <Select
                value={String(selectedCompanyId || '')}
                onValueChange={handleCompanySelect}
              >
                <SelectTrigger id="company-select" className="w-full">
                  <SelectValue placeholder="Select company">
                    {currentCompany
                      ? `${currentCompany.company_name} ${currentCompany.company_number ? `(${currentCompany.company_number})` : ''}`
                      : 'Select company'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-60 w-(--anchor-width) overflow-hidden p-0">
                  <ScrollArea className="h-60 w-full p-1">
                    <SelectGroup>
                      {companies.map((c) => (
                        <SelectItem key={c.id || c.company_id} value={String(c.id || c.company_id)}>
                          {c.company_name} {c.company_number ? `(${c.company_number})` : ''}
                        </SelectItem>
                      ))}
                      {companies.length === 0 && company && (
                        <SelectItem value={String(company.id || company.company_id)}>
                          {company.company_name} {company.company_number ? `(${company.company_number})` : ''}
                        </SelectItem>
                      )}
                    </SelectGroup>
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>

            {/* Row 1: Period start & Year end */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="period-start">Period start</Label>
                <InlineDatePicker
                  dateString={periodStart}
                  onChange={setPeriodStart}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="year-end">Year end</Label>
                <InlineDatePicker
                  dateString={periodEnd}
                  onChange={setPeriodEnd}
                />
              </div>
            </div>

            {/* Row 2: Due date & Accounts type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="due-date">Due date</Label>
                <InlineDatePicker
                  dateString={dueDate}
                  onChange={setDueDate}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accounts-type">Accounts type</Label>
                <Select value={accountsType} onValueChange={setAccountsType}>
                  <SelectTrigger id="accounts-type" className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="Micro-entity">Micro-entity</SelectItem>
                      <SelectItem value="Dormant">Dormant</SelectItem>
                      <SelectItem value="Full accounts">Full accounts</SelectItem>
                      <SelectItem value="Small company accounts">Small company accounts</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Status & Confirmation number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="filing-status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="filing-status" className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="In progress">In progress</SelectItem>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Ready to file">Ready to file</SelectItem>
                      <SelectItem value="Filed">Filed</SelectItem>
                      <SelectItem value="Overdue">Overdue</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmation-no">Confirmation number</Label>
                <Input
                  id="confirmation-no"
                  type="text"
                  placeholder="Companies House receipt"
                  value={confirmationNumber}
                  onChange={(e) => setConfirmationNumber(e.target.value)}
                />
              </div>
            </div>

            {/* Row 4: Internal notes */}
            <div className="space-y-2">
              <Label htmlFor="internal-notes">Internal notes</Label>
              <Textarea
                id="internal-notes"
                placeholder="Staff notes for this filing."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save filing'}
              </Button>
            </DialogFooter>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default FileAccount
