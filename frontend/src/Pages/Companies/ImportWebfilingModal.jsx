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
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { IconUpload, IconCheck, IconAlertCircle, IconLoader2, IconBuilding, IconInfoCircle, IconSearch, IconPlus, IconX } from '@tabler/icons-react'
import { toast } from 'sonner'
import { toastProcessing, toastDone, toastFail } from '@/lib/toastActions'
import ToastSave from '@/components/ToastSave'
import { apiRequest } from '@/lib/api'

/** Same rules as the backend: strip punctuation, drop a leading "NO", pad all-digit numbers to 8. */
function parseCompanyNumbers(text) {
  const seen = new Set()
  const out = []
  for (const part of String(text || '').split(/[\s,;]+/)) {
    let n = part.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (n.startsWith('NO')) n = n.slice(2)
    if (/^\d+$/.test(n) && n.length < 8) n = n.padStart(8, '0')
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export function ImportWebfilingModal({ isOpen, onClose, onImportSuccess }) {
  const [companyNumbers, setCompanyNumbers] = useState('')
  const [clientMode, setClientMode] = useState('existing')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [clientQuery, setClientQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [suggestOpen, setSuggestOpen] = useState(false)
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

  // Companies House preview: number -> { loading } | preview item from /webfiling-preview
  const [lookups, setLookups] = useState({})
  const [excluded, setExcluded] = useState(() => new Set())
  const [lookupError, setLookupError] = useState('')
  const parsedNumbers = React.useMemo(() => parseCompanyNumbers(companyNumbers), [companyNumbers])

  // Companies House search by name or number; picking a result adds its number to the list
  const [chQuery, setChQuery] = useState('')
  const [chResults, setChResults] = useState([])
  const [chSearching, setChSearching] = useState(false)
  const [chError, setChError] = useState('')
  const [chOpen, setChOpen] = useState(false)
  const [chActive, setChActive] = useState(0)

  useEffect(() => {
    const q = chQuery.trim()
    if (q.length < 2) {
      setChResults([])
      setChError('')
      setChSearching(false)
      return
    }
    let cancelled = false
    setChSearching(true)
    const timer = setTimeout(async () => {
      const res = await apiRequest(`/admin/companies/lookup-ch?query=${encodeURIComponent(q)}`, {
        silent: true,
        label: 'Companies House search',
      })
      if (cancelled) return
      const data = res.data?.data || {}
      // A company number returns one profile; a name returns a list of results
      const items = Array.isArray(data.results) ? data.results : (data.company_number ? [data] : [])
      setChResults(items.filter((it) => it.company_number).slice(0, 8))
      setChError(res.ok ? '' : (res.reason || 'Companies House search failed'))
      setChActive(0)
      setChSearching(false)
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [chQuery])

  const addNumber = (raw) => {
    const nums = parseCompanyNumbers(raw)
    if (!nums.length) return
    const fresh = nums.filter((n) => !parsedNumbers.includes(n))
    if (fresh.length) {
      setCompanyNumbers((prev) => [prev.trim(), ...fresh].filter(Boolean).join('\n'))
    }
    setExcluded((prev) => {
      if (!nums.some((n) => prev.has(n))) return prev
      const next = new Set(prev)
      nums.forEach((n) => next.delete(n))
      return next
    })
    setChQuery('')
    setChResults([])
    setChOpen(false)
  }

  // Several company numbers pasted at once (spaces, commas or new lines) are all added instead of searched
  const isNumberList = (text) => {
    const parts = String(text || '').split(/[\s,;]+/).filter(Boolean)
    return parts.length > 1 && parts.every((p) => /^(NO)?[A-Z]{0,2}\d{5,8}$/i.test(p.replace(/[^A-Za-z0-9]/g, '')))
  }

  const removeNumber = (n) => {
    setCompanyNumbers((prev) => parseCompanyNumbers(prev).filter((x) => x !== n).join('\n'))
  }

  const showChResults = chOpen && chQuery.trim().length >= 2

  const onChKeyDown = (e) => {
    if (e.key === 'ArrowDown' && chResults.length) {
      e.preventDefault()
      setChOpen(true)
      setChActive((i) => (i + 1) % chResults.length)
    } else if (e.key === 'ArrowUp' && chResults.length) {
      e.preventDefault()
      setChActive((i) => (i - 1 + chResults.length) % chResults.length)
    } else if (e.key === 'Enter') {
      // Enter adds the highlighted result (or a typed number) instead of submitting the form
      e.preventDefault()
      if (chResults[chActive]) addNumber(chResults[chActive].company_number)
      else if (/^[A-Za-z]{0,2}\d{5,8}$/.test(chQuery.trim().replace(/\s+/g, ''))) addNumber(chQuery)
    } else if (e.key === 'Escape' && showChResults) {
      e.preventDefault()
      e.stopPropagation()
      setChOpen(false)
    }
  }

  useEffect(() => {
    const pending = parsedNumbers.filter((n) => !lookups[n]).slice(0, 100)
    if (!pending.length) return
    const timer = setTimeout(async () => {
      setLookups((prev) => {
        const next = { ...prev }
        pending.forEach((n) => { next[n] = { loading: true } })
        return next
      })
      const res = await apiRequest('/admin/companies/webfiling-preview', {
        method: 'POST',
        body: { company_numbers: pending.join('\n') },
        silent: true,
        label: 'Companies House lookup',
      })
      const items = res.ok ? (res.data?.data?.items || []) : []
      setLookupError(res.ok ? '' : (res.reason || 'Companies House lookup failed'))
      setLookups((prev) => {
        const next = { ...prev }
        pending.forEach((n) => {
          const item = items.find((it) => it.company_number === n)
          if (item) next[n] = item
          else if (res.ok) next[n] = { company_number: n, found: false, message: 'Company not found at Companies House' }
          // Lookup failed (no key, network): keep it importable, the import itself re-checks Companies House
          else next[n] = { company_number: n, lookupFailed: true }
        })
        return next
      })
    }, 700)
    return () => clearTimeout(timer)
  }, [parsedNumbers, lookups])

  const toggleNumber = (n) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  const isSelectable = (n) => lookups[n]?.found !== false
  const selectedNumbers = parsedNumbers.filter((n) => isSelectable(n) && !excluded.has(n))

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

    if (!parsedNumbers.length) {
      setErrorMsg('Search or paste at least one company.')
      return
    }
    if (!selectedNumbers.length) {
      setErrorMsg('Select at least one company to import.')
      return
    }
    const cleanNumbers = selectedNumbers.join('\n')

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
    setSelectedClientId('')
    setClientQuery('')
    setExcluded(new Set())
    setChQuery('')
    setChResults([])
  }

  const clientLabel = (c) => c.name || c.full_name || c.email || 'Customer'
  const suggestions = React.useMemo(() => {
    const q = clientQuery.trim().toLowerCase()
    if (!q) return []
    return clients
      .filter((c) =>
        String(c.name || c.full_name || '').toLowerCase().includes(q) ||
        String(c.email || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [clients, clientQuery])

  const pickClient = (c) => {
    setSelectedClientId(String(c.id))
    setClientQuery(clientLabel(c))
    setSuggestOpen(false)
  }

  const showSuggestions = suggestOpen && clientQuery.trim() && !selectedClientId

  const onClientKeyDown = (e) => {
    if (!showSuggestions) return
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault()
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') {
      // Enter picks the highlighted customer instead of submitting the form
      e.preventDefault()
      if (suggestions[activeIdx]) pickClient(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setSuggestOpen(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleAttemptClose() }}>
        <DialogContent className="sm:max-w-140  p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-1">
            <div className="flex items-center gap-2">
              <div>
                <DialogTitle className="text-lg">Import WebFiling Companies</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Add companies from Companies House by name or number.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[75vh]">
            <form onSubmit={handleSubmit} className="px-5 pb-5 pt-2 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
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
                    <div className="max-h-48 overflow-y-auto divide-y divide-border/40 text-sm rounded-lg border bg-muted/30">
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
                  <Label htmlFor="webfiling-search" className="text-sm font-semibold">
                    Companies <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-[11px] text-muted-foreground">Up to 100</span>
                </div>
                <div className="relative">
                  <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="webfiling-search"
                    placeholder="Search by company name or number, or paste numbers…"
                    className="pl-9 text-sm"
                    value={chQuery}
                    disabled={isSubmitting}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={!!showChResults}
                    aria-controls="webfiling-ch-results"
                    onPaste={(e) => {
                      // A single-line input would flatten new lines, so a pasted list is read from the clipboard
                      const text = e.clipboardData?.getData('text') || ''
                      if (isNumberList(text)) {
                        e.preventDefault()
                        addNumber(text)
                      }
                    }}
                    onChange={(e) => {
                      if (isNumberList(e.target.value)) {
                        addNumber(e.target.value)
                        return
                      }
                      setChQuery(e.target.value)
                      setChOpen(true)
                    }}
                    onFocus={() => setChOpen(true)}
                    onBlur={() => setChOpen(false)}
                    onKeyDown={onChKeyDown}
                  />
                  {chSearching ? (
                    <IconLoader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  ) : null}
                </div>
                {/* Rendered in the flow (not absolute) so the dialog's scroll area never clips it */}
                {showChResults && !chSearching && (
                  <div
                    id="webfiling-ch-results"
                    role="listbox"
                    className="max-h-56 overflow-y-auto overscroll-contain rounded-3xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10 animate-in fade-in-0 zoom-in-95 duration-100"
                  >
                    {chResults.length ? (
                      chResults.map((c, i) => {
                        const added = parsedNumbers.includes(c.company_number)
                        return (
                          <button
                            key={c.company_number}
                            type="button"
                            role="option"
                            aria-selected={i === chActive}
                            className={`flex w-full cursor-pointer items-center gap-2 rounded-[18px] px-3 py-2 text-left text-sm outline-none ${i === chActive ? 'bg-accent text-accent-foreground' : ''}`}
                            // mousedown keeps focus in the input so onBlur doesn't close the list before the click lands
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setChActive(i)}
                            onClick={() => addNumber(c.company_number)}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{c.company_name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {c.company_number}{c.status ? ` · ${c.status}` : ''}{c.address_snippet ? ` · ${c.address_snippet}` : ''}
                              </span>
                            </span>
                            {added ? (
                              <IconCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                            ) : (
                              <IconPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                          </button>
                        )
                      })
                    ) : (
                      <p className="px-3 py-2 text-sm text-muted-foreground">{chError || 'No company found'}</p>
                    )}
                  </div>
                )}
                {parsedNumbers.length > 0 ? (
                  <div className="rounded-2xl border bg-muted/20">
                    <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground border-b">
                      <span>Companies House results</span>
                      <span>{selectedNumbers.length} of {parsedNumbers.length} selected</span>
                    </div>
                    <ul className="max-h-48 overflow-y-auto overscroll-contain divide-y divide-border/50">
                      {parsedNumbers.map((n) => {
                        const info = lookups[n]
                        const selectable = isSelectable(n)
                        const checked = selectable && !excluded.has(n)
                        return (
                          <li key={n}>
                            <div
                              className={`flex items-start gap-3 px-3 py-2 ${selectable ? 'cursor-pointer hover:bg-muted/40' : 'opacity-70'}`}
                              onClick={(e) => {
                                // The checkbox toggles itself; clicks anywhere else on the row toggle it too
                                if (!selectable || isSubmitting || e.target.closest('[data-slot="checkbox"]')) return
                                toggleNumber(n)
                              }}
                            >
                              <Checkbox
                                className="mt-0.5"
                                checked={checked}
                                disabled={!selectable || isSubmitting}
                                onCheckedChange={() => toggleNumber(n)}
                              />
                              <div className="min-w-0 flex-1">
                                {!info || info.loading ? (
                                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                                    Looking up {n}…
                                  </p>
                                ) : info.found ? (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <span className="truncate text-sm font-medium">{info.name}</span>
                                      <Badge className={info.status === 'Active' ? 'badge-green' : 'badge-amber'}>{info.status}</Badge>
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {info.company_number}
                                      {info.inc_date ? ` · Inc. ${info.inc_date}` : ''}
                                      {info.reg_office ? ` · ${info.reg_office}` : ''}
                                    </p>
                                    {info.existing ? (
                                      <p className="mt-0.5 text-xs text-amber-600">
                                        Already in portal{info.existing.owner_name ? ` (${info.existing.owner_name})` : ''}
                                        {updateExisting ? ' · will be refreshed' : ' · will be skipped'}
                                      </p>
                                    ) : null}
                                  </>
                                ) : info.lookupFailed ? (
                                  <p className="text-sm">
                                    <span className="font-mono">{n}</span>
                                    <span className="text-xs text-muted-foreground"> · could not check now, will be checked on import</span>
                                  </p>
                                ) : (
                                  <p className="text-sm text-destructive">
                                    <span className="font-mono">{n}</span>
                                    <span className="text-xs"> · {info.message || 'Not found at Companies House'}</span>
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                aria-label={`Remove ${n}`}
                                className="-mr-1 shrink-0 cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                                disabled={isSubmitting}
                                onClick={(e) => { e.stopPropagation(); removeNumber(n) }}
                              >
                                <IconX className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <IconInfoCircle className="h-3.5 w-3.5" />
                    Search by name or number, or paste a list of numbers. Each one is checked at Companies House so you can pick which to import.
                  </p>
                )}
                {lookupError ? <p className="text-xs text-destructive">{lookupError}</p> : null}
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
                      className="flex items-center gap-1.5 cursor-pointer text-sm font-medium"
                    >
                      <RadioGroupItem value="existing" id="client-existing" />
                      <span>Existing Client</span>
                    </Label>

                    <Label
                      htmlFor="client-new"
                      className="flex items-center gap-1.5 cursor-pointer text-sm font-medium"
                    >
                      <RadioGroupItem value="new" id="client-new" />
                      <span>New Client</span>
                    </Label>
                  </RadioGroup>

                </div>

                {clientMode === 'existing' && (
                  <div className="max-w-md">
                    <Input
                      placeholder={isLoadingClients ? 'Loading clients...' : 'Type the customer name or email...'}
                      className="text-sm"
                      value={clientQuery}
                      disabled={isSubmitting || isLoadingClients}
                      autoComplete="off"
                      role="combobox"
                      aria-expanded={!!showSuggestions}
                      aria-controls="webfiling-client-suggestions"
                      onChange={(e) => {
                        setClientQuery(e.target.value)
                        setSelectedClientId('')
                        setSuggestOpen(true)
                        setActiveIdx(0)
                      }}
                      onFocus={() => setSuggestOpen(true)}
                      onBlur={() => setSuggestOpen(false)}
                      onKeyDown={onClientKeyDown}
                    />
                    {/* Rendered in the flow (not absolute) so the dialog's scroll area never clips it */}
                    {showSuggestions && (
                      <div
                        id="webfiling-client-suggestions"
                        role="listbox"
                        className="mt-1.5 max-h-56 overflow-y-auto overscroll-contain rounded-3xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 dark:ring-foreground/10 animate-in fade-in-0 zoom-in-95 duration-100"
                      >
                        {suggestions.length ? (
                          suggestions.map((c, i) => (
                            <button
                              key={c.id}
                              type="button"
                              role="option"
                              aria-selected={i === activeIdx}
                              className={`w-full cursor-pointer rounded-[18px] px-3 py-2 text-left text-sm outline-none ${i === activeIdx ? 'bg-accent text-accent-foreground' : ''}`}
                              // mousedown keeps focus in the input so onBlur doesn't close the list before the click lands
                              onMouseDown={(e) => e.preventDefault()}
                              onMouseEnter={() => setActiveIdx(i)}
                              onClick={() => pickClient(c)}
                            >
                              <span className="block truncate font-medium">{clientLabel(c)}</span>
                              {c.email ? <span className="block truncate text-xs text-muted-foreground">{c.email}</span> : null}
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-2 text-sm text-muted-foreground">No customer found</p>
                        )}
                      </div>
                    )}
                    {selectedClientId && (
                      <p className="mt-1 text-[11px] text-emerald-600">Selected customer will receive these companies.</p>
                    )}
                  </div>
                )}

                {clientMode === 'new' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <Label htmlFor="new-client-name" className="text-sm font-normal">Full Name</Label>
                      <Input
                        id="new-client-name"
                        placeholder="e.g. John Doe"
                        className="text-sm"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-client-email" className="text-sm font-normal">Email Address</Label>
                      <Input
                        id="new-client-email"
                        type="email"
                        placeholder="e.g. john@example.com"
                        className="text-sm"
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
                <Label htmlFor="update-existing" className="text-sm text-muted-foreground font-normal cursor-pointer">
                  Refresh/Update details from Companies House if company is already in portal
                </Label>
              </div>

              {/* Footer Buttons inside Form */}
              <DialogFooter className="pt-1 gap-2">
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
