import { useEffect, useState } from 'react'
import { IconCircleCheck, IconLoader2, IconSearch } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiRequest } from '@/lib/api'

const ukDate = (v) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

const LABEL = {
  registered: 'Registered',
  in_crm: 'Already in the CRM',
  possible: 'Possible match',
  not_found: 'Not on Companies House yet',
  no_name: 'No proposed name',
  error: 'Could not check',
}

/**
 * Draft / Pending › Check All With Companies House: every pending company is looked up now. Exact name matches
 * are registered straight away; for the others it says why, and close names registered after the order can be
 * picked with one click (backend services/order_companies.check_pending_now).
 */
export default function PendingCheckDialog({ onClose, onChanged }) {
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    let alive = true
    apiRequest('/admin/companies/pending-check', { method: 'POST', label: 'Companies House', silent: true }).then((res) => {
      if (!alive) return
      if (!res.ok) return setError(res.data?.error || res.reason || 'Companies House did not answer.')
      setResults(res.data.data.results)
      if (res.data.data.results.some((r) => r.outcome === 'registered')) onChanged?.()
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pickMatch = async (row, candidate) => {
    setBusy(`${row.id}-${candidate.number}`)
    const res = await apiRequest(`/admin/companies/${row.id}/register`, {
      method: 'POST',
      body: { company_number: candidate.number },
      label: 'Mark as registered',
      silent: true,
    })
    setBusy('')
    if (!res.ok) return toast.error(res.data?.error || res.reason || 'Could not register this company')
    toast.success(res.data?.message || 'Company registered')
    setResults((list) => list.map((r) => (r.id === row.id ? { ...r, outcome: 'registered', name: candidate.name, number: candidate.number } : r)))
    onChanged?.()
  }

  const done = results?.filter((r) => r.outcome === 'registered').length || 0
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Check Pending Companies</DialogTitle>
          <DialogDescription>
            Every pending company looked up at Companies House now. Exact names are registered straight away; close names
            registered after the order can be picked.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !results ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" /> Checking with Companies House… this can take up to a minute.
          </p>
        ) : !results.length ? (
          <p className="py-6 text-sm text-muted-foreground">There are no pending companies.</p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            <p className="text-sm font-medium">
              {done} of {results.length} registered
            </p>
            {results.map((r) => (
              <div key={r.id} className="rounded-xl border px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">{r.name || 'No name'}</span>
                  <span
                    className={
                      r.outcome === 'registered'
                        ? 'inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400'
                        : r.outcome === 'possible'
                          ? 'text-xs font-semibold text-amber-600 dark:text-amber-400'
                          : 'text-xs text-muted-foreground'
                    }
                  >
                    {r.outcome === 'registered' && <IconCircleCheck className="size-3.5" />}
                    {LABEL[r.outcome] || r.outcome}
                    {r.outcome === 'registered' && r.number ? ` · ${r.number}` : ''}
                  </span>
                </div>
                {r.outcome === 'in_crm' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.number} is already a card: {r.detail}. Open both and keep one.
                  </p>
                )}
                {r.outcome === 'error' && r.detail && <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>}
                {r.outcome === 'possible' &&
                  r.candidates.map((c) => (
                    <div key={c.number} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
                      <span className="min-w-0 text-xs">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {c.number} · {c.status}
                          {c.incorporated ? ` · incorporated ${ukDate(c.incorporated)}` : ''}
                        </span>
                      </span>
                      <Button size="sm" className="h-7 px-2.5 text-xs" disabled={Boolean(busy)} onClick={() => pickMatch(r, c)}>
                        {busy === `${r.id}-${c.number}` ? <IconLoader2 className="size-3.5 animate-spin" /> : 'Use This'}
                      </Button>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
        {!results && !error && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconSearch className="size-3.5" /> Names are compared the way Companies House does (Ltd / Limited, &amp; / and).
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
