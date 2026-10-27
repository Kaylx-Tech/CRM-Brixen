import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { IconId, IconSearch } from '@tabler/icons-react'
import { toast } from 'sonner'
import { apiRequest } from '@/lib/api'
import { useRefreshOnReturn } from '@/lib/useRefreshOnReturn'

// Same colours as the Orders board
function statusTone(status) {
  const s = String(status || 'Pending')
  if (s === 'Completed') return 'badge-green'
  if (s === 'Cancelled' || s === 'Refunded') return 'bg-destructive/15 text-destructive'
  if (s === 'In Progress' || s === 'Processing') return 'badge-sky'
  return 'badge-amber'
}

function shortDate(value) {
  if (!value) return '—'
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// The KYC product(s) of an order: its KYC line items, or the service name for a one-product order
const kycProduct = (o) => o.kyc_products || o.service_name

// ID Verification: every order with a KYC product, so the team can verify the client's identity
export default function IdVerification() {
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiRequest('/admin/smart-links/id-verification', { label: 'ID Verification', silent: true })
      if (!res.ok) {
        toast.error(res.reason || 'KYC orders failed to load')
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

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((o) =>
      [o.order_number, o.customer_name, o.customer_email, o.owner_name, o.company_name, o.company_number,
        kycProduct(o), o.status].some((v) => String(v || '').toLowerCase().includes(q)),
    )
  }, [orders, search])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search customer, company or order…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {!isLoading && (
          <p className="text-sm text-muted-foreground">
            {shown.length === orders.length ? `${orders.length} KYC order${orders.length === 1 ? '' : 's'}` : `${shown.length} of ${orders.length}`}
          </p>
        )}
      </div>

      {isLoading && orders.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-4 py-16 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconId className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">{search.trim() ? 'No KYC orders found' : 'No KYC orders yet'}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {search.trim()
              ? 'Try another name, company or order number.'
              : 'Orders with a KYC product show up here, ready for identity verification.'}
          </p>
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          {/* Phones: one card per order */}
          <div className="divide-y md:hidden">
            {shown.map((o) => (
              <Link key={o.id} to={`/admin/orders?open=${o.id}`} className="block p-3 transition-colors hover:bg-muted/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-primary">{o.order_number}</span>
                  <Badge className={`${statusTone(o.status)} whitespace-nowrap`}>{o.status || 'Pending'}</Badge>
                </div>
                <p className="mt-1 truncate text-sm font-medium">{o.customer_name || '—'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {o.company_name || 'No company'} · {shortDate(o.created_at)}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{kycProduct(o)}</p>
              </Link>
            ))}
          </div>

          {/* Wider screens: a table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((o) => (
                  <tr key={o.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link to={`/admin/orders?open=${o.id}`} className="font-semibold text-primary hover:underline">
                        {o.order_number}
                      </Link>
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <p className="truncate font-medium" title={o.customer_name}>{o.customer_name || '—'}</p>
                      {o.customer_email ? <p className="truncate text-xs text-muted-foreground" title={o.customer_email}>{o.customer_email}</p> : null}
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <p className="truncate" title={o.company_name}>{o.company_name || '—'}</p>
                      {o.company_number ? <p className="text-xs text-muted-foreground tabular-nums">{o.company_number}</p> : null}
                    </td>
                    <td className="max-w-[240px] px-4 py-3">
                      <p className="truncate text-muted-foreground" title={kycProduct(o)}>{kycProduct(o)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${statusTone(o.status)} whitespace-nowrap`}>{o.status || 'Pending'}</Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">{shortDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
