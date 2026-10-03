import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { IconUpload, IconCheck, IconAlertCircle, IconLoader2, IconBuilding, IconInfoCircle } from '@tabler/icons-react'
import { toast } from 'sonner'
import { toastProcessing, toastDone, toastFail } from '@/lib/toastActions'
import ToastSave from '@/components/ToastSave'

export function ImportWebfilingModal({ isOpen, onClose, onImportSuccess }) {
  const [companyNumbers, setCompanyNumbers] = useState('')
  const [clientMode, setClientMode] = useState('existing')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [updateExisting, setUpdateExisting] = useState(false)

  const [clients, setClients] = useState([])
  const [isLoadingClients, setIsLoadingClients] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [importResults, setImportResults] = useState(null)
  const [showUnsavedToast, setShowUnsavedToast] = useState(false)
  const [toastSaveState, setToastSaveState] = useState('initial')

  const isDirty = Boolean(companyNumbers.trim() || newClientName.trim() || newClientEmail.trim())

  const handleAttemptClose = () => {
    if (isSubmitting) return
    if (isDirty && !importResults) {
      setShowUnsavedToast(true)
    } else {
      onClose()
    }
  }

  // Load clients for dropdown
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('')
      setImportResults(null)
      loadClients()
    }
  }, [isOpen])

  const loadClients = async () => {
    setIsLoadingClients(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')
      const res = await fetch(`${apiUrl}/admin/customers`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
      if (res.ok) {
        const json = await res.json()
        const list = json.customers || json.data?.customers || json.data?.clients || (Array.isArray(json.data) ? json.data : [])
        if (Array.isArray(list)) {
          setClients(list)
          if (list.length > 0 && !selectedClientId) {
            setSelectedClientId(String(list[0].id))
          }
        }
      }
    } catch (err) {
      console.error('Failed to load clients for WebFiling import:', err)
    } finally {
      setIsLoadingClients(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')

    const cleanNumbers = companyNumbers.trim()
    if (!cleanNumbers) {
      setErrorMsg('Please paste at least one Companies House number.')
      return
    }

    if (clientMode === 'existing' && !selectedClientId) {
      setErrorMsg('Please select a client to assign these companies to.')
      return
    }

    if (clientMode === 'new') {
      if (!newClientName.trim() || !newClientEmail.trim()) {
        setErrorMsg('Please enter both name and email for the new client.')
        return
      }
    }

    setIsSubmitting(true)
    const toastId = toastProcessing('Importing from WebFiling…')
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')
      const payload = {
        company_numbers: cleanNumbers,
        client_mode: clientMode,
        update_existing: updateExisting,
        ...(clientMode === 'existing' ? { client_id: Number(selectedClientId) } : {
          new_client_full_name: newClientName.trim(),
          new_client_email: newClientEmail.trim()
        })
      }

      const res = await fetch(`${apiUrl}/admin/companies/import-webfiling`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      })

      const json = await res.json()
      const data = json.data || json

      if (res.ok && (json.status === 'success' || json.success)) {
        setImportResults(data)
        toastDone(toastId, json.message || 'Successfully processed WebFiling import.')
        if (onImportSuccess) {
          onImportSuccess()
        }
      } else {
        const msg = json.message || json.error || 'Failed to import companies from WebFiling.'
        setErrorMsg(msg)
        toastFail(toastId, msg)
      }
    } catch (err) {
      const msg = 'Network error during WebFiling import: ' + err.message
      setErrorMsg(msg)
      toastFail(toastId, msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setCompanyNumbers('')
    setImportResults(null)
    setErrorMsg('')
    setNewClientName('')
    setNewClientEmail('')
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleAttemptClose() }}>
        <DialogContent className="sm:max-w-140  p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2">
            <div className="flex items-center gap-2">
              <div>
                <DialogTitle className="text-xl">Import WebFiling Companies</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Bulk import official company records from your Companies House WebFiling list.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[75vh]">
            <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-5">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <IconAlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Results Summary if completed */}
              {importResults && (
                <div className="p-4 rounded-xl bg-card border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Import Results</span>
                    <div className="flex items-center gap-2">
                      <Badge className="badge-green">{importResults.imported ?? 0} Added</Badge>
                      <Badge className="badge-blue">{importResults.updated ?? 0} Updated</Badge>
                      <Badge className="badge-amber">{importResults.skipped ?? 0} Skipped</Badge>
                    </div>
                  </div>

                  {Array.isArray(importResults.results) && importResults.results.length > 0 && (
                    <div className="max-h-48 overflow-y-auto divide-y divide-border/40 text-xs rounded-lg border bg-muted/30">
                      {importResults.results.map((r, i) => (
                        <div key={i} className="p-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <IconBuilding className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="truncate">
                              <p className="font-medium truncate">{r.name || r.company_number}</p>
                              <p className="text-muted-foreground text-[10px]">{r.company_number} {r.message ? `• ${r.message}` : ''}</p>
                            </div>
                          </div>
                          <Badge className={
                            r.status === 'imported' ? 'badge-green' :
                              r.status === 'updated' ? 'badge-blue' :
                                r.status === 'skipped' ? 'badge-amber' : 'badge-red'
                          }>
                            {r.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 1: Numbers Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="webfiling-numbers" className="text-sm font-semibold">
                    Company Numbers <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-[11px] text-muted-foreground">Up to 100 numbers</span>
                </div>
                <Input
                  id="webfiling-numbers"
                  placeholder="Paste company numbers here (separated by spaces, commas or new lines)&#10;e.g.&#10;17361321&#10;17379440&#10;17208527"
                  rows={3}
                  className="text-xs font-mono"
                  value={companyNumbers}
                  onChange={(e) => setCompanyNumbers(e.target.value)}
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <IconInfoCircle className="h-3.5 w-3.5" />
                  Live official name, incorporation date, directors and address will be fetched automatically.
                </p>
              </div>

              {/* Step 2: Client Assignment Mode */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Client Account <span className="text-destructive">*</span>
                </Label>

                <div className="flex items-center gap-4 flex-wrap">
                  <RadioGroup
                    value={clientMode}
                    onValueChange={setClientMode}
                    className="flex items-center gap-4 w-auto shrink-0"
                    disabled={isSubmitting}
                  >
                    <Label
                      htmlFor="client-existing"
                      className="flex items-center gap-1.5 cursor-pointer text-xs font-medium"
                    >
                      <RadioGroupItem value="existing" id="client-existing" />
                      <span>Existing Client</span>
                    </Label>

                    <Label
                      htmlFor="client-new"
                      className="flex items-center gap-1.5 cursor-pointer text-xs font-medium"
                    >
                      <RadioGroupItem value="new" id="client-new" />
                      <span>New Client</span>
                    </Label>
                  </RadioGroup>

                  {clientMode === 'existing' && (
                    <div className="w-64 sm:w-72">
                      {(() => {
                        const selectedClient = clients.find((c) => String(c.id) === String(selectedClientId))
                        return (
                          <Select
                            value={selectedClientId}
                            onValueChange={setSelectedClientId}
                            disabled={isSubmitting || isLoadingClients}
                          >
                            <SelectTrigger className="w-full h-8 text-xs">
                              <SelectValue placeholder={isLoadingClients ? "Loading clients..." : "Select client..."}>
                                {selectedClient ? (selectedClient.name || selectedClient.full_name || 'Customer') : undefined}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="max-h-68 w-(--anchor-width) overflow-hidden p-0">
                              <ScrollArea className="h-68 w-full p-1">
                                <SelectGroup>
                                  {clients.map((c) => (
                                    <SelectItem key={c.id} value={String(c.id)} className="text-xs py-1.5 cursor-pointer">
                                      {c.name || c.full_name || 'Customer'}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </ScrollArea>
                            </SelectContent>
                          </Select>
                        )
                      })()}
                    </div>
                  )}
                </div>

                {clientMode === 'new' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label htmlFor="new-client-name" className="text-xs font-normal">Full Name</Label>
                      <Input
                        id="new-client-name"
                        placeholder="e.g. John Doe"
                        className="text-xs"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-client-email" className="text-xs font-normal">Email Address</Label>
                      <Input
                        id="new-client-email"
                        type="email"
                        placeholder="e.g. john@example.com"
                        className="text-xs"
                        value={newClientEmail}
                        onChange={(e) => setNewClientEmail(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3: Options */}
              <div className="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="update-existing"
                  checked={updateExisting}
                  onCheckedChange={(checked) => setUpdateExisting(!!checked)}
                  disabled={isSubmitting}
                />
                <Label htmlFor="update-existing" className="text-xs text-muted-foreground font-normal cursor-pointer">
                  Refresh/Update details from Companies House if company is already in portal
                </Label>
              </div>

              {/* Footer Buttons inside Form */}
              <DialogFooter className="pt-3 gap-2">
                {importResults && (
                  <Button type="button" variant="outline" size="sm" onClick={handleReset} className="mr-auto">
                    Import More
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" onClick={handleAttemptClose} disabled={isSubmitting}>
                  {importResults ? 'Done' : 'Cancel'}
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                      Fetching & Importing...
                    </>
                  ) : (
                    <>
                      <IconUpload className="mr-2 h-4 w-4" />
                      Start Import
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <ToastSave
        open={isOpen && showUnsavedToast}
        state={toastSaveState}
        initialText="You have unsaved import details. Discard and close?"
        discardText="Discard & Close"
        saveText="Start Import"
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

export default ImportWebfilingModal
