import React, { useState, useEffect, useRef } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IconBuildingPlus, IconAlertCircle, IconLoader2, IconSearch, IconCheck, IconBuilding } from '@tabler/icons-react'
import { toast } from 'sonner'
import { toastProcessing, toastDone, toastFail } from '@/lib/toastActions'
import ToastSave from '@/components/ToastSave'

const AddCompany = ({ isOpen, onClose }) => {
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [isAutoFilling, setIsAutoFilling] = useState(false)
  const [isAutoFilled, setIsAutoFilled] = useState(false)
  const [showUnsavedToast, setShowUnsavedToast] = useState(false)
  const [toastSaveState, setToastSaveState] = useState('initial')
  const searchTimeoutRef = useRef(null)
  const dropdownRef = useRef(null)

  // Form fields
  const [companyName, setCompanyName] = useState('')
  const [companyNumber, setCompanyNumber] = useState('')
  const [incorporationDate, setIncorporationDate] = useState('')
  const [director, setDirector] = useState('')
  const [status, setStatus] = useState('Active')
  const [regOffice, setRegOffice] = useState('71-75 Shelton Street, Covent Garden, London, WC2H 9JQ')

  // Client Assignment
  const [clientType, setClientType] = useState('existing')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')

  const [clients, setClients] = useState([])
  const [isLoadingClients, setIsLoadingClients] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Load clients on modal open
  useEffect(() => {
    if (isOpen) {
      handleReset()
      loadClients()
    }
  }, [isOpen])

  // Click outside to close search dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadClients = async () => {
    setIsLoadingClients(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')
      const res = await fetch(`${apiUrl}/admin/customers`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (res.ok) {
        const data = await res.json()
        const raw = data.customers || data.data?.customers || (Array.isArray(data.data) ? data.data : [])
        setClients(Array.isArray(raw) ? raw : [])
        if (Array.isArray(raw) && raw.length > 0 && !selectedClientId) {
          setSelectedClientId(String(raw[0].id))
        }
      }
    } catch (err) {
      console.error('Failed to load customers in AddCompany:', err)
    } finally {
      setIsLoadingClients(false)
    }
  }

  // Companies House Live Search
  const handleSearchChange = (val) => {
    setSearchQuery(val)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    const trimmed = val.trim()
    if (!trimmed || trimmed.length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const apiUrl = import.meta.env.VITE_API_URL || '/api'
        const token = localStorage.getItem('token')
        const res = await fetch(`${apiUrl}/admin/companies/lookup-ch?query=${encodeURIComponent(trimmed)}`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (res.ok) {
          const data = await res.json()
          const items = data.data?.results || []
          setSearchResults(items)
          setShowDropdown(items.length > 0)
        }
      } catch (err) {
        console.error('Live search error:', err)
      } finally {
        setIsSearching(false)
      }
    }, 350)
  }

  // Auto-fill company details from selected Companies House result
  const handleSelectCompany = async (comp) => {
    setShowDropdown(false)
    setIsAutoFilling(true)
    setErrorMsg('')
    const toastId = toastProcessing('Loading company details…')
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')
      const res = await fetch(`${apiUrl}/admin/companies/lookup-ch?number=${encodeURIComponent(comp.company_number)}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (res.ok) {
        const data = await res.json()
        const d = data.data || {}
        setCompanyName(d.company_name || comp.company_name || '')
        setCompanyNumber(d.company_number || comp.company_number || '')
        setIncorporationDate(d.incorporation_date || '')
        if (d.director) setDirector(d.director)
        if (d.reg_office) setRegOffice(d.reg_office)
        if (d.status) setStatus(d.status)
        setIsAutoFilled(true)
        setSearchQuery(`${d.company_name || comp.company_name} (${d.company_number || comp.company_number})`)
        toastDone(toastId, `Loaded official details for ${d.company_name || 'company'}!`)
      } else {
        // Fallback to basic search result
        setCompanyName(comp.company_name || '')
        setCompanyNumber(comp.company_number || '')
        if (comp.incorporation_date) setIncorporationDate(comp.incorporation_date)
        if (comp.status) setStatus(comp.status)
        setIsAutoFilled(true)
        toastDone(toastId, `Loaded details for ${comp.company_name}`)
      }
    } catch (err) {
      toastFail(toastId, 'Failed to fetch full company details: ' + err.message)
    } finally {
      setIsAutoFilling(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')

    if (!companyName.trim()) {
      setErrorMsg('Company name is required')
      return
    }

    if (clientType === 'new' && (!newClientName.trim() || !newClientEmail.trim())) {
      setErrorMsg('Please enter the new client name and email')
      return
    }

    setIsSubmitting(true)
    const toastId = toastProcessing('Creating company…')
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const token = localStorage.getItem('token')
      const payload = {
        company_name: companyName.trim(),
        company_number: companyNumber.trim(),
        incorporation_date: incorporationDate,
        director: director.trim(),
        status,
        reg_office: regOffice.trim(),
        client_mode: clientType,
        client_id: clientType === 'existing' ? selectedClientId : undefined,
        new_client_full_name: clientType === 'new' ? newClientName.trim() : undefined,
        new_client_email: clientType === 'new' ? newClientEmail.trim() : undefined,
      }

      const res = await fetch(`${apiUrl}/admin/companies`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || data.success === false) {
        throw new Error(data.message || 'Failed to create company')
      }

      toastDone(toastId, data.message || 'Company created successfully!')
      handleReset()
      onClose()
    } catch (err) {
      const msg = err.message || 'An error occurred while creating company'
      setErrorMsg(msg)
      toastFail(toastId, msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isDirty = Boolean(
    companyName.trim() ||
    companyNumber.trim() ||
    director.trim() ||
    newClientName.trim() ||
    newClientEmail.trim() ||
    isAutoFilled
  )

  const handleAttemptClose = () => {
    if (isSubmitting) return
    if (isDirty) {
      setShowUnsavedToast(true)
    } else {
      onClose()
    }
  }

  const handleReset = () => {
    setSearchQuery('')
    setSearchResults([])
    setShowDropdown(false)
    setCompanyName('')
    setCompanyNumber('')
    setIncorporationDate('')
    setDirector('')
    setStatus('Active')
    setRegOffice('71-75 Shelton Street, Covent Garden, London, WC2H 9JQ')
    setNewClientName('')
    setNewClientEmail('')
    setIsAutoFilled(false)
    setErrorMsg('')
    setShowUnsavedToast(false)
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleAttemptClose() }}>
        <DialogContent className="sm:max-w-140 p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-xl">Add Company</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Search UK Companies House to auto-fill official records or enter details manually.
            </DialogDescription>
          </DialogHeader>

        <ScrollArea className="max-h-[75vh]">
          <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                <IconAlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Step 1: Companies House Live Search & Auto-Fill */}
            <div className="space-y-1.5 relative" ref={dropdownRef}>
              <div className="flex items-center justify-between">
                <Label htmlFor="ch-search" className="text-sm font-semibold">
                  Search Companies House
                </Label>
                <span className="text-[10px] text-muted-foreground">Type name or 8-digit number to auto-fill</span>
              </div>
              <div className="relative">
                <IconSearch className="absolute left-2.5 top-1.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="ch-search"
                  placeholder="Number or Name"
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                  disabled={isSubmitting || isAutoFilling}
                />
                {(isSearching || isAutoFilling) && (
                  <IconLoader2 className="absolute right-2.5 top-1.5 h-4 w-4 text-primary animate-spin" />
                )}
              </div>

              {/* Suggestions dropdown */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-xl z-50 overflow-hidden">
                  <ScrollArea className="max-h-56 w-full">
                    <div className="divide-y divide-border/40 p-1">
                      {searchResults.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSelectCompany(item)}
                          className="p-2.5 rounded-md hover:bg-accent cursor-pointer flex items-center justify-between gap-2 text-xs transition-colors"
                        >
                          <div className="overflow-hidden">
                            <p className="font-semibold truncate text-foreground flex items-center gap-1.5">
                              <IconBuilding className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{item.company_name}</span>
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                              {item.company_number} • {item.address_snippet || 'UK'}
                            </p>
                          </div>
                          <Badge className={item.status === 'Active' ? 'badge-green shrink-0 text-[10px]' : 'badge-amber shrink-0 text-[10px]'}>
                            {item.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>

            {/* Step 2: Client Assignment Mode */}
            <div className="space-y-2 pt-1">
              <Label className="text-sm font-semibold">
                Client Account <span className="text-destructive">*</span>
              </Label>

              <div className="flex items-center gap-4 flex-wrap">
                <RadioGroup
                  value={clientType}
                  onValueChange={setClientType}
                  className="flex items-center gap-4 w-auto shrink-0"
                  disabled={isSubmitting}
                >
                  <Label
                    htmlFor="add-comp-client-existing"
                    className="flex items-center gap-1.5 cursor-pointer text-xs font-medium"
                  >
                    <RadioGroupItem value="existing" id="add-comp-client-existing" />
                    <span>Existing Client</span>
                  </Label>

                  <Label
                    htmlFor="add-comp-client-new"
                    className="flex items-center gap-1.5 cursor-pointer text-xs font-medium"
                  >
                    <RadioGroupItem value="new" id="add-comp-client-new" />
                    <span>New Client</span>
                  </Label>
                </RadioGroup>

                {clientType === 'existing' && (
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
                            <SelectValue placeholder={isLoadingClients ? 'Loading clients...' : 'Select client...'}>
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

              {clientType === 'new' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor="add-new-client-name" className="text-xs font-normal">Full Name</Label>
                    <Input
                      id="add-new-client-name"
                      placeholder="e.g. John Doe"
                      className="text-xs"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="add-new-client-email" className="text-xs font-normal">Email Address</Label>
                    <Input
                      id="add-new-client-email"
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

            {/* Step 3: Company Details (Auto-filled / Editable) */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Company Details</Label>
                {isAutoFilled && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <IconCheck className="h-3.5 w-3.5" /> Details populated
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="add-comp-name" className="text-xs font-normal">
                    Company Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="add-comp-name"
                    placeholder="e.g. Acme Innovations Ltd"
                    className="text-xs"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="add-comp-num" className="text-xs font-normal">
                    Company Number <span className="text-muted-foreground text-[10px]">(Optional)</span>
                  </Label>
                  <Input
                    id="add-comp-num"
                    placeholder="e.g. 12345678"
                    className="text-xs"
                    value={companyNumber}
                    onChange={(e) => setCompanyNumber(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="add-comp-date" className="text-xs font-normal">
                    Incorporation Date
                  </Label>
                  <Input
                    id="add-comp-date"
                    type="date"
                    className="text-xs"
                    value={incorporationDate}
                    onChange={(e) => setIncorporationDate(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="add-comp-director" className="text-xs font-normal">
                    Director Name
                  </Label>
                  <Input
                    id="add-comp-director"
                    placeholder="e.g. John Smith"
                    className="text-xs"
                    value={director}
                    onChange={(e) => setDirector(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-normal">Status</Label>
                  <Select value={status} onValueChange={setStatus} disabled={isSubmitting}>
                    <SelectTrigger className="w-full h-8 text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="Active" className="text-xs">Active</SelectItem>
                        <SelectItem value="Inactive" className="text-xs">Inactive</SelectItem>
                        <SelectItem value="Dissolved" className="text-xs">Dissolved</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="add-comp-office" className="text-xs font-normal">
                    Registered Office Address
                  </Label>
                  <Input
                    id="add-comp-office"
                    placeholder="Registered address"
                    className="text-xs"
                    value={regOffice}
                    onChange={(e) => setRegOffice(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <DialogFooter className="pt-3 gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={handleAttemptClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <IconBuildingPlus className="mr-2 h-4 w-4" />
                    Add Company
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
      initialText="You have unsaved company details. Discard and close?"
      discardText="Discard & Close"
      saveText="Add Company"
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

export default AddCompany
