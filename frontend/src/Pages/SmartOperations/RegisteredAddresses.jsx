import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { IconMapPin, IconRefresh, IconSearch } from '@tabler/icons-react'
import { toast } from 'sonner'
import { apiRequest } from '@/lib/api'
import { useRefreshOnReturn } from '@/lib/useRefreshOnReturn'
import { shortDate } from './idvStatus'

// What needs the team: the year runs out soon, has run out, or a card payment failed
const NEEDS_ACTION = ['Renews soon', 'Renewal due', 'Expired', 'Payment failed', 'Pending Renewal']
const FILTERS = ['Needs action', 'Paid', 'All']

function statusTone(status) {
  if (status === 'Expired' || status === 'Payment failed') return 'bg-destructive/15 text-destructive'
  if (status === 'Renewal due' || status === 'Pending Renewal') return 'badge-amber'
  if (status === 'Renews soon') return 'badge-sky'
  return 'badge-green'
}

function daysLeft(date) {
  if (!date) return null
  const end = new Date(`${String(date).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(end.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((end - today) / 86400000)
}

// Registered Address: every company whose registered office is one of Brixen's addresses, as the yearly address
// service (the same status the client sees on the portal Addresses page), soonest renewal first.
export default function RegisteredAddresses() {
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Needs action')

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiRequest('/admin/smart-links/registered-addresses', { label: 'Registered Address', silent: true })
      if (!res.ok) {
        toast.error(res.reason || 'Registered addresses failed to load')
        return
      }
      setRows(res.data?.data?.addresses || [])
    } finally {
      setIsLoading(false)
    }
  }, [])
  useRefreshOnReturn(load)
  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => ({
    'Needs action': rows.filter((r) => NEEDS_ACTION.includes(r.status)).length,
    Paid: rows.filter((r) => !NEEDS_ACTION.includes(r.status)).length,
    All: rows.length,
  }), [rows])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === 'Needs action' && !NEEDS_ACTION.includes(r.status)) return false
      if (filter === 'Paid' && NEEDS_ACTION.includes(r.status)) return false
      if (!q) return true
      return [r.company_name, r.company_number, r.customer_name, r.customer_email, r.address, r.status]
        .some((v) => String(v || '').toLowerCase().includes(q))
    })
  }, [rows, search, filter])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search company, customer or address…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <Button key={f} size="xs" variant={filter === f ? 'default' : 'outline'} className="h-7" onClick={() => setFilter(f)}>
                {f} <span className="opacity-70">{counts[f]}</span>
              </Button>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
          <IconRefresh className={`size-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-4 py-16 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconMapPin className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">
            {search.trim() ? 'No addresses found' : filter === 'Needs action' ? 'Nothing needs a renewal right now' : 'No registered addresses yet'}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Companies whose registered office is one of Brixen's addresses show up here with their renewal date.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {shown.map((r) => {
            const left = daysLeft(r.expiry_date)
            return (
              <Card key={r.id} size="sm" className="gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.company_name || '—'}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[r.company_number, r.customer_name, r.customer_email].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Badge className={`${statusTone(r.status)} shrink-0 whitespace-nowrap`}>{r.status}</Badge>
                </div>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <IconMapPin className="mt-px size-3.5 shrink-0" />
                  <span className="min-w-0 break-words">{r.address || '—'}</span>
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Since {shortDate(r.start_date) || '—'}</span>
                  <span className={left !== null && left < 0 ? 'font-medium text-destructive' : left !== null && left <= 30 ? 'font-medium text-sky-700 dark:text-sky-400' : 'text-muted-foreground'}>
                    {r.status === 'Auto-renew' ? 'Card charged on ' : 'Renews '}{shortDate(r.expiry_date) || '—'}
                    {left !== null ? (left < 0 ? ` (${-left} days ago)` : ` (in ${left} days)`) : ''}
                  </span>
                  {r.renewal_invoice && (
                    <span className="text-muted-foreground">Renewal invoice {r.renewal_invoice.invoice_number} · {r.renewal_invoice.status}</span>
                  )}
                  {r.source === 'Added by hand' && <span className="text-muted-foreground">Added by hand</span>}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
