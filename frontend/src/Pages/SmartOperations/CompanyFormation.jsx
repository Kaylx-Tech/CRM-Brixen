import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IconBuildingPlus, IconCheck, IconClock, IconLoader2, IconSearch } from '@tabler/icons-react'
import { toast } from 'sonner'
import { apiRequest } from '@/lib/api'
import { useRefreshOnReturn } from '@/lib/useRefreshOnReturn'
import { useFormErrors, formatCompanyNumber } from '@/lib/validation'
import { FieldMessage, RequiredMark, invalidProps } from '@/components/FormField'
import { shortDate } from './idvStatus'

const REGISTER_SCHEMA = { company_number: { label: 'Company number', required: true, type: 'company_number' } }
const FILTERS = ['Pending', 'Registered', 'All']

// Same colours as the Orders board
function statusTone(status) {
  const s = String(status || 'Pending')
  if (s === 'Completed') return 'badge-green'
  if (s === 'Cancelled' || s === 'Refunded') return 'bg-destructive/15 text-destructive'
  if (s === 'In Progress' || s === 'Processing') return 'badge-sky'
  return 'badge-amber'
}

// Company Formation: every order with an incorporation / formation product and the company being formed.
// A Pending company (REG- placeholder) is registered automatically once Companies House has it, or by hand
// here with "Mark as registered".
export default function CompanyFormation() {
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Pending')
  const [registering, setRegistering] = useState(null) // {order, company}
  const [regNumber, setRegNumber] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const regErrors = useFormErrors(REGISTER_SCHEMA, { prefix: 'cf-' })

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiRequest('/admin/smart-links/company-formation', { label: 'Company Formation', silent: true })
      if (!res.ok) {
        toast.error(res.reason || 'Formation orders failed to load')
        return
      }
      setOrders(res.data?.data?.orders || [])
    } finally {
      setIsLoading(false)
    }
  }, [])
  useRefreshOnReturn(load)
  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => ({
    Pending: orders.filter((o) => o.formation_status !== 'Registered').length,
    Registered: orders.filter((o) => o.formation_status === 'Registered').length,
    All: orders.length,
  }), [orders])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (filter === 'Pending' && o.formation_status === 'Registered') return false
      if (filter === 'Registered' && o.formation_status !== 'Registered') return false
      if (!q) return true
      return [o.order_number, o.applicant_name, o.applicant_email, o.customer_name, o.customer_email, o.service_name,
        o.products, o.proposed_name, o.status, ...(o.companies || []).flatMap((c) => [c.name, c.company_number])]
        .some((v) => String(v || '').toLowerCase().includes(q))
    })
  }, [orders, search, filter])

  const openRegister = (order, company) => {
    setRegNumber('')
    regErrors.clear()
    setRegistering({ order, company })
  }

  const saveRegister = async () => {
    if (!regErrors.check({ company_number: regNumber })) return
    setIsSaving(true)
    try {
      const res = await apiRequest(`/admin/companies/${registering.company.id}/register`, {
        method: 'POST',
        body: { company_number: formatCompanyNumber(regNumber) },
        label: 'Mark as registered',
        silent: true,
      })
      if (!res.ok) {
        if (regErrors.fromResponse(res)) return
        toast.error(res.reason || 'Could not register this company')
        return
      }
      toast.success(res.data?.message || 'Company registered')
      setRegistering(null)
      load()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search company, customer or order…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <Button key={f} size="xs" variant={filter === f ? 'default' : 'outline'} className="h-7" onClick={() => setFilter(f)}>
                {f} <span className="opacity-70">{counts[f]}</span>
              </Button>
            ))}
          </div>
        </div>
        {!isLoading && (
          <p className="text-sm text-muted-foreground">
            {shown.length} formation order{shown.length === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {isLoading && orders.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-4 py-16 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconBuildingPlus className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">
            {search.trim() ? 'No formation orders found' : filter === 'Pending' ? 'No companies waiting to be formed' : 'No formation orders yet'}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {search.trim()
              ? 'Try another name, company or order number.'
              : 'Orders with an incorporation or formation product show up here with the company being formed.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {shown.map((o) => (
            <Card key={o.id} size="sm" className="gap-3 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Link to={`/admin/orders?open=${o.id}`} className="text-sm font-semibold text-primary hover:underline">
                      {o.order_number}
                    </Link>
                    <span className="text-xs text-muted-foreground">{shortDate(o.created_at)}</span>
                  </div>
                  <p className="truncate text-sm font-medium" title={o.applicant_email || o.customer_email}>
                    {o.applicant_name || o.customer_name || '—'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{o.products || o.service_name}</p>
                </div>
                <Badge className={`${statusTone(o.status)} shrink-0 whitespace-nowrap`}>{o.status || 'Pending'}</Badge>
              </div>

              <div className="space-y-1.5">
                {(o.companies || []).length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    {o.proposed_name ? `${o.proposed_name}: ` : ''}no company card yet (the 5-minute check adds it).
                  </div>
                ) : (
                  o.companies.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.registered
                            ? `${c.company_number}${c.inc_date ? ` · incorporated ${shortDate(c.inc_date)}` : ''}`
                            : 'Not registered at Companies House yet'}
                        </p>
                      </div>
                      {c.registered ? (
                        <Badge className="badge-green shrink-0 gap-1"><IconCheck className="size-3" />Registered</Badge>
                      ) : (
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge className="badge-amber gap-1"><IconClock className="size-3" />Pending</Badge>
                          <Button variant="outline" size="xs" className="h-7" onClick={() => openRegister(o, c)}>
                            Mark as registered
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!registering} onOpenChange={(open) => !open && setRegistering(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Mark as registered</DialogTitle>
            <DialogDescription>
              {registering?.company?.name} ({registering?.order?.order_number}): the card takes the official details
              from Companies House and goes live.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cf-company_number">Company number <RequiredMark /></Label>
            <Input
              id="cf-company_number"
              {...invalidProps(regErrors.errors, 'company_number', 'cf-')}
              placeholder="e.g. 12345678"
              value={regNumber}
              onChange={(e) => { setRegNumber(e.target.value); regErrors.recheck('company_number', e.target.value) }}
              onKeyDown={(e) => e.key === 'Enter' && saveRegister()}
            />
            <FieldMessage id="cf-company_number-error" message={regErrors.errors.company_number} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegistering(null)} disabled={isSaving}>Cancel</Button>
            <Button onClick={saveRegister} disabled={isSaving}>
              {isSaving ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconCheck className="h-4 w-4" />}
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
