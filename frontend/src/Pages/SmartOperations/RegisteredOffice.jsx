import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconBolt, IconBuilding, IconCopy, IconLoader2, IconMapPin, IconSearch, IconSend } from '@tabler/icons-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toastDone, toastFail, toastProcessing } from '@/lib/toastActions'
import { apiRequest } from '@/lib/api'

const money = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(v || 0))

const STATUS = {
  Pending: ['Waiting for Finstap', 'badge-amber'],
  Verifying: ['Waiting for ID check', 'badge-amber'],
  Active: ['Active', 'badge-green'],
  Rejected: ['Rejected', 'bg-destructive/15 text-destructive'],
  'Verification failed': ['ID check failed', 'bg-destructive/15 text-destructive'],
  Expired: ['Booking expired', 'bg-muted text-muted-foreground'],
  Cancelled: ['Cancelled', 'bg-muted text-muted-foreground'],
}

/**
 * AutoAllot: enter the client's order number, the client verifies their identity (Didit link by email), and the
 * next Office number is given out by itself. The workspace's plan sets how many unpaid addresses it may hold.
 */
function AutoAllotCard({ credits, price, onDone }) {
  const [orderNumber, setOrderNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState('')
  const blocked = credits && credits.available < 1

  const start = async (e) => {
    e.preventDefault()
    if (!orderNumber.trim()) return
    setBusy(true)
    setLink('')
    const id = toastProcessing('Starting identity check…')
    const res = await apiRequest('/admin/registered-office/autoallot', {
      method: 'POST',
      body: { order_number: orderNumber.trim() },
      silent: true,
    })
    setBusy(false)
    if (!res.ok) {
      toastFail(id, res.reason)
      return
    }
    toastDone(id, res.data?.message || 'Started')
    setLink(res.data?.data?.verification_link || '')
    setOrderNumber('')
    onDone()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toastDone(undefined, 'Link copied')
    } catch {
      toastFail(undefined, 'Could not copy the link')
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <IconBolt className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">AutoAllot registered address</h3>
            {credits && (
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', blocked ? 'bg-destructive/15 text-destructive' : 'badge-green')}>
                {credits.available} of {credits.limit} credits left
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Client verifies ID, then gets the next Office address automatically.{price ? ` ${money(price)}/year.` : ''}
          </p>
        </div>
      </div>
      <form onSubmit={start} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Order number, e.g. FIN-1001-OCT26"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          disabled={blocked}
        />
        <Button type="submit" disabled={busy || blocked || !orderNumber.trim()} className="shrink-0">
          {busy ? <IconLoader2 className="size-4 animate-spin" /> : <IconBolt className="size-4" />}
          Verify & allot
        </Button>
      </form>
      {blocked && (
        <p className="mt-2 text-xs text-destructive">
          No credits left. Pay the open registered office addresses in Billing to free a credit, or upgrade your plan.
        </p>
      )}
      {link && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border bg-muted/40 p-2 text-xs">
          <span className="min-w-0 flex-1 truncate">{link}</span>
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            <IconCopy className="size-3.5" /> Copy link
          </Button>
        </div>
      )}
    </Card>
  )
}

function shortDate(value) {
  if (!value) return ''
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Smart Operations > Registered Office (Finstap): ask Finstap for its office address for a client's
 * company. Finstap confirms it, charges it yearly, and the address appears in the client's portal.
 */
export default function RegisteredOffice() {
  const [data, setData] = useState(null)
  const [companies, setCompanies] = useState([])
  const [search, setSearch] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiRequest('/admin/finstap-services', { label: 'Registered office', silent: true }).then((res) => res.ok && setData(res.data.data))
  }, [])

  useEffect(() => {
    load()
    apiRequest('/admin/companies?limit=1000', { label: 'Companies', silent: true }).then(
      (res) => res.ok && setCompanies(res.data?.companies || res.data?.data?.companies || []),
    )
  }, [load])

  const open = useMemo(
    () => new Set((data?.requests || []).filter((r) => ['Pending', 'Verifying', 'Active'].includes(r.status)).map((r) => r.company_id)),
    [data],
  )
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    return companies
      .filter((c) => !open.has(c.id))
      .filter((c) => !q || `${c.name} ${c.company_number}`.toLowerCase().includes(q))
      .slice(0, 50)
  }, [companies, search, open])

  const send = async (e) => {
    e.preventDefault()
    if (!companyId) return
    setBusy(true)
    const id = toastProcessing('Sending request…')
    const res = await apiRequest('/admin/registered-office', {
      method: 'POST',
      body: { company_id: Number(companyId), notes },
      silent: true,
    })
    setBusy(false)
    if (res.ok) {
      toastDone(id, res.data?.message || 'Request sent')
      setCompanyId('')
      setNotes('')
      setSearch('')
      load()
    } else {
      toastFail(id, res.reason)
    }
  }

  const cancel = async (request) => {
    const res = await apiRequest(`/admin/registered-office/${request.id}/cancel`, { method: 'POST', silent: true })
    if (res.ok) {
      toastDone(undefined, 'Request cancelled')
      load()
    } else {
      toastFail(undefined, res.reason)
    }
  }

  if (!data) return <Skeleton className="h-64 w-full rounded-xl" />

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
      <AutoAllotCard credits={data.autoallot} price={data.ro_price_year} onDone={load} />
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IconMapPin className="size-5" />
          </span>
          <div>
            <h3 className="font-semibold">Finstap registered office</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a company; Finstap reviews and confirms it.
              {data.ro_price_year ? ` ${money(data.ro_price_year)}/year.` : ''}
            </p>
          </div>
        </div>
        {data.ro_available ? (
          <form onSubmit={send} className="mt-5 space-y-3">
            <div className="relative">
              <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search your companies…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-xl border">
              {matches.length ? (
                matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCompanyId(String(c.id))}
                    className={cn(
                      'flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/60',
                      String(c.id) === companyId && 'bg-primary/10',
                    )}
                  >
                    <IconBuilding className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{c.company_number}</span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-muted-foreground">No companies to choose. Add the company under Companies first.</p>
              )}
            </div>
            <Input placeholder="Note for Finstap (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button type="submit" disabled={busy || !companyId} className="w-full">
              {busy ? <IconLoader2 className="size-4 animate-spin" /> : <IconSend className="size-4" />}
              Ask Finstap
            </Button>
            <p className="text-xs text-muted-foreground">
              Then file AD01 at Companies House.
            </p>
          </form>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Finstap's registered office service is not open yet.
          </p>
        )}
      </Card>
      </div>

      <div className="space-y-3 lg:col-span-3">
        {data.requests.length ? (
          data.requests.map((r) => {
            const [label, tone] = STATUS[r.status] || [r.status, 'bg-muted']
            return (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.company_name}</span>
                      <span className="text-sm text-muted-foreground">{r.company_number}</span>
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', tone)}>{label}</span>
                      {r.office_number ? (
                        <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          Office {r.office_number}
                          {r.status === 'Verifying' ? ' · booked' : ''}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.source === 'autoallot' ? `AutoAllot · order ${r.order_number} · ` : 'Asked '}
                      {shortDate(r.created_at)}
                      {r.requested_by ? ` by ${r.requested_by}` : ''}
                    </p>
                  </div>
                  {r.status === 'Pending' && (
                    <Button variant="ghost" size="sm" onClick={() => cancel(r)}>
                      Cancel
                    </Button>
                  )}
                </div>
                {r.address && (
                  <p className="mt-2 text-sm">
                    <IconMapPin className="mr-1 inline size-4 text-muted-foreground" />
                    {[r.address.line1, r.address.line2, r.address.city, r.address.postal_code].filter(Boolean).join(', ')}
                  </p>
                )}
                {r.status === 'Active' && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {shortDate(r.start_date)} – {shortDate(r.expiry_date)}
                    {r.price != null ? ` · ${money(r.price)}` : ''}
                  </p>
                )}
                {r.reason && r.status !== 'Active' && <p className="mt-2 text-sm text-muted-foreground">{r.reason}</p>}
              </Card>
            )
          })
        ) : (
          <Card className="flex flex-col items-center justify-center p-10 text-center text-sm text-muted-foreground">
            <IconMapPin className="mb-2 size-8 text-muted-foreground/60" />
            No registered office requests yet.
          </Card>
        )}
      </div>
    </div>
  )
}
