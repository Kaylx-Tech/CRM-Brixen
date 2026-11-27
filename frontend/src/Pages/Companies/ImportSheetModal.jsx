import { useMemo, useRef, useState } from 'react'
import { IconCheck, IconDownload, IconFileSpreadsheet, IconLoader2, IconUpload } from '@tabler/icons-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiRequest } from '@/lib/api'

// Which spreadsheet column is which (first match wins), from the header row
const COLUMNS = {
  company_number: /^(company\s*)?(no|number|reg(istration)?\s*(no|number)?|crn)$/i,
  company_name: /^(company(\s*name)?|name|company\s*name\s*\/?\s*client.*)$/i,
  email: /e-?mail/i,
  client_name: /^(client|client\s*name|director|director\s*name|owner|contact)$/i,
  auth_code: /auth/i,
}
const TEMPLATE = 'Company Number,Company Name,Email,Client Name,Authentication Code\n,EXAMPLE LTD,client@example.com,Jane Smith,AB12CD\n'
const BATCH = 10
const PILL = 'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold'

/** A CSV (Excel: File › Save As › CSV) into rows of cells; quotes and commas inside quotes are kept. */
function parseCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',' || ch === '\t') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => String(c).trim()))
}

function toRows(text) {
  const cells = parseCsv(text)
  if (cells.length < 2) return { rows: [], error: 'The file needs a header row and at least one company.' }
  const header = cells[0].map((h) => String(h).trim())
  const index = {}
  Object.entries(COLUMNS).forEach(([key, re]) => {
    const at = header.findIndex((h, i) => re.test(h) && !Object.values(index).includes(i))
    if (at >= 0) index[key] = at
  })
  if (index.company_name == null && index.company_number == null) {
    return { rows: [], error: 'No "Company Name" or "Company Number" column found. Use the template.' }
  }
  const rows = cells.slice(1).map((r, i) => {
    const pick = (key) => (index[key] != null ? String(r[index[key]] || '').trim() : '')
    return { key: i, company_number: pick('company_number'), company_name: pick('company_name'), email: pick('email'), client_name: pick('client_name'), auth_code: pick('auth_code') }
  }).filter((r) => r.company_name || r.company_number)
  return { rows, error: '' }
}

const MATCH = {
  number: ['By number', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'],
  exact: ['Found', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'],
  guess: ['Check this', 'bg-amber-500/15 text-amber-800 dark:text-amber-300'],
  none: ['Not found', 'bg-destructive/10 text-destructive'],
}

/**
 * Companies › Import Spreadsheet: many companies at once, each under its own client (by its email). The sheet's
 * companies are found at Companies House (by number, else by name), checked here, then added with Companies House's
 * data; an authentication code goes on its company (backend services/sheet_import.py).
 */
export default function ImportSheetModal({ isOpen, onClose, onDone }) {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(0) // rows checked so far while checking
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [skip, setSkip] = useState(() => new Set())
  const [fallback, setFallback] = useState({ name: '', email: '' })
  const fileRef = useRef(null)

  const reset = () => {
    setRows([]); setError(''); setChecking(0); setImporting(false); setResult(null); setSkip(new Set()); setFallback({ name: '', email: '' })
  }
  const close = () => {
    reset()
    onClose()
  }

  const readFile = async (file) => {
    if (!file) return
    setError('')
    setResult(null)
    const text = await file.text()
    const parsed = toRows(text)
    if (parsed.error) return setError(parsed.error)
    // Check every row at Companies House, a few at a time
    setRows(parsed.rows.map((r) => ({ ...r, checking: true })))
    setChecking(0)
    for (let i = 0; i < parsed.rows.length; i += BATCH) {
      const part = parsed.rows.slice(i, i + BATCH)
      const res = await apiRequest('/admin/companies/sheet-preview', { method: 'POST', body: { rows: part }, silent: true, label: 'Import' })
      const checked = res.ok ? res.data.data.rows : part.map((r) => ({ ...r, error: res.reason || 'Could not check' }))
      setRows((prev) => prev.map((r) => {
        const at = part.findIndex((p) => p.key === r.key)
        return at >= 0 ? { ...r, ...checked[at], key: r.key, checking: false } : r
      }))
      setChecking(Math.min(i + BATCH, parsed.rows.length))
    }
  }

  const chosen = rows.filter((r) => !skip.has(r.key) && r.found_number && !r.checking)
  const needFallback = chosen.some((r) => !r.email || r.email_problem)
  const ready = chosen.length > 0 && (!needFallback || (fallback.name.trim() && fallback.email.trim()))
  const stillChecking = rows.some((r) => r.checking)

  const setNumber = (key, value) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, found_number: value.trim().toUpperCase(), match: value.trim() ? 'number' : 'none', ch_name: '' } : r)))

  const runImport = async () => {
    setImporting(true)
    const total = { imported: 0, updated: 0, skipped: 0, failed: 0, results: [] }
    for (let i = 0; i < chosen.length; i += BATCH) {
      const res = await apiRequest('/admin/companies/sheet-import', {
        method: 'POST',
        body: { rows: chosen.slice(i, i + BATCH), fallback: needFallback ? fallback : null },
        silent: true,
        label: 'Import',
      })
      if (!res.ok) {
        total.failed += chosen.slice(i, i + BATCH).length
        total.results.push({ name: `Rows ${i + 1}–${i + BATCH}`, status: 'failed', message: res.reason })
        continue
      }
      const d = res.data.data
      ;['imported', 'updated', 'skipped', 'failed'].forEach((k) => { total[k] += d[k] || 0 })
      total.results.push(...d.results)
    }
    setImporting(false)
    setResult(total)
    onDone?.()
  }

  const counts = useMemo(() => ({
    found: rows.filter((r) => r.match === 'exact' || r.match === 'number').length,
    check: rows.filter((r) => r.match === 'guess').length,
    missing: rows.filter((r) => !r.checking && !r.found_number).length,
  }), [rows])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><IconFileSpreadsheet className="size-5 text-primary" /> Import Companies from a Spreadsheet</DialogTitle>
          <DialogDescription>
            One company per line, each added under its own client (by email). Companies House fills in the rest.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm">
              <b>{result.imported}</b> added · <b>{result.updated}</b> updated · <b>{result.skipped}</b> already in the CRM · <b className={result.failed ? 'text-destructive' : ''}>{result.failed}</b> not added
            </p>
            <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-xl border text-sm">
              {result.results.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate">{r.name}{r.company_number ? <span className="text-muted-foreground"> · {r.company_number}</span> : null}</span>
                  <span className={cn(PILL, r.status === 'failed' ? 'bg-destructive/10 text-destructive' : r.status === 'skipped' ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')} title={r.message || undefined}>
                    {{ imported: 'Added', updated: 'Updated', skipped: 'Already there', failed: r.message || 'Not added' }[r.status]}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Import Another</Button>
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        ) : !rows.length ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-10 text-sm text-muted-foreground hover:bg-muted/40"
            >
              <IconUpload className="size-8 text-primary" />
              <span className="font-medium text-foreground">Choose the spreadsheet (CSV)</span>
              <span>Columns: Company Number or Company Name, Email, Client Name, Authentication Code</span>
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              From Excel or Google Sheets: File › Download / Save As › CSV.{' '}
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
                download="companies-import-template.csv"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                <IconDownload className="size-3.5" /> Download the template
              </a>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {stillChecking ? (
                <span className="inline-flex items-center gap-2"><IconLoader2 className="size-4 animate-spin" /> Checking at Companies House… {checking} of {rows.length}</span>
              ) : (
                <>{rows.length} lines · <span className="text-emerald-600">{counts.found} found</span>{counts.check ? <span className="text-amber-600"> · {counts.check} to check</span> : null}{counts.missing ? <span className="text-destructive"> · {counts.missing} not found (type the number)</span> : null}</>
              )}
            </p>
            <div className="max-h-[48vh] overflow-auto rounded-xl border">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b bg-card text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-8 px-3 py-2" />
                    <th className="px-3 py-2 font-semibold">In the sheet</th>
                    <th className="px-3 py-2 font-semibold">Companies House</th>
                    <th className="px-3 py-2 font-semibold">Number</th>
                    <th className="px-3 py-2 font-semibold">Client</th>
                    <th className="px-3 py-2 font-semibold">Auth Code</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const [label, tone] = MATCH[r.match] || (r.checking ? ['Checking…', 'bg-muted text-muted-foreground'] : MATCH.none)
                    return (
                      <tr key={r.key} className={cn('border-b last:border-0', skip.has(r.key) && 'opacity-50')}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!skip.has(r.key) && !!r.found_number}
                            disabled={!r.found_number}
                            onChange={(e) => setSkip((prev) => { const n = new Set(prev); e.target.checked ? n.delete(r.key) : n.add(r.key); return n })}
                          />
                        </td>
                        <td className="max-w-52 px-3 py-2"><div className="truncate font-medium" title={r.company_name}>{r.company_name || '—'}</div></td>
                        <td className="max-w-60 px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className={cn(PILL, tone)}>{label}</span>
                            {r.in_crm && <span className={cn(PILL, 'bg-muted text-muted-foreground')}>In CRM</span>}
                          </div>
                          {r.ch_name && <div className="mt-0.5 truncate text-xs text-muted-foreground" title={r.ch_name}>{r.ch_name}{r.status ? ` · ${r.status}` : ''}</div>}
                          {r.error && !r.found_number && <div className="mt-0.5 text-xs text-destructive">{r.error}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <Input className="h-8 w-28 font-mono text-xs" value={r.found_number || ''} placeholder="Number" onChange={(e) => setNumber(r.key, e.target.value)} disabled={r.checking} />
                        </td>
                        <td className="max-w-56 px-3 py-2 text-xs">
                          {r.email && !r.email_problem ? (
                            <>
                              <div className="truncate" title={r.email}>{r.email}</div>
                              <div className="text-muted-foreground">{r.client_exists ? 'Existing client' : `New client${r.client_name ? `: ${r.client_name}` : ''}`}</div>
                            </>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-300">{r.email_problem || 'No email: goes to the client below'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{r.auth_code || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {needFallback && !stillChecking && (
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-sm font-medium">Client for companies without an email</p>
                <p className="mb-2 text-xs text-muted-foreground">They all go under this client (an existing client with this email is used). Move them to their own client later.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input placeholder="Client name" value={fallback.name} onChange={(e) => setFallback((f) => ({ ...f, name: e.target.value }))} />
                  <Input type="email" placeholder="Client email" value={fallback.email} onChange={(e) => setFallback((f) => ({ ...f, email: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" onClick={reset} disabled={importing}>Choose Another File</Button>
              <Button onClick={runImport} disabled={!ready || importing || stillChecking}>
                {importing ? <IconLoader2 className="size-4 animate-spin" /> : <IconCheck className="size-4" />}
                Import {chosen.length} Compan{chosen.length === 1 ? 'y' : 'ies'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
