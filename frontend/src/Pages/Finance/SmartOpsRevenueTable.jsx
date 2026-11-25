import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconArrowUpRight, IconBuildingPlus, IconFileText, IconId, IconMapPin, IconSparkles } from '@tabler/icons-react'
import { Skeleton } from '@/components/ui/skeleton'
import { apiRequest } from '@/lib/api'
import { formatGBP } from '@/lib/money'

const AREA_ICON = {
  'id-verification': IconId,
  'company-formation': IconBuildingPlus,
  'registered-address': IconMapPin,
  'uk-gov-checks': IconFileText,
}
const AREA_TAB = {
  'id-verification': '/admin/smart-operations',
  'company-formation': '/admin/smart-operations?tab=company-formation',
  'registered-address': '/admin/smart-operations?tab=registered-address',
  'uk-gov-checks': '/admin/smart-operations?tab=uk-gov-checks',
}

/**
 * Finance › Revenue › Smart Operations: what each Smart Operations area brought in for the chosen month
 * (or all months): orders, revenue, cost, profit and margin, with the total. Costs are the ones set below
 * (Order cost), else the catalogue cost; an order with several products is split by each product's share.
 * `version` changes when an order cost is saved, so the figures follow it. Admins only (the API refuses others).
 */
export default function SmartOpsRevenueTable({ month, version }) {
  const [data, setData] = useState(null)
  const [hidden, setHidden] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let live = true
    setIsLoading(true)
    const period = month && month !== 'all' ? month : ''
    apiRequest(`/admin/smart-links/revenue?period=${period}`, { label: 'Smart Operations revenue', silent: true })
      .then((res) => {
        if (!live) return
        if (res.ok) setData(res.data?.data || null)
        else setHidden(true)
      })
      .finally(() => { if (live) setIsLoading(false) })
    return () => { live = false }
  }, [month, version])

  if (hidden) return null
  const areas = data?.areas || []
  const total = data?.total
  const best = Math.max(1, ...areas.map((a) => a.revenue || 0))

  return (
    <section className="rounded-2xl border bg-linear-to-br from-primary/[0.05] via-card to-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <IconSparkles className="size-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold leading-tight">Smart Operations</h3>
            <p className="text-xs text-muted-foreground">Revenue and cost of each Smart Operations area</p>
          </div>
        </div>
        {total && (
          <p className="text-sm">
            <span className="text-muted-foreground">Total </span>
            <span className="font-semibold tabular-nums">{formatGBP(total.revenue)}</span>
            <span className="text-muted-foreground"> · profit </span>
            <span className={`font-semibold tabular-nums ${total.profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{formatGBP(total.profit)}</span>
          </p>
        )}
      </div>

      {isLoading && !data ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
      ) : (
        <div className="overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-xl border bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Area</th>
                <th className="px-3 py-2 text-right font-medium">Orders</th>
                <th className="px-3 py-2 text-right font-medium">Revenue</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <th className="px-3 py-2 text-right font-medium">Profit</th>
                <th className="px-3 py-2 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => {
                const Icon = AREA_ICON[a.key] || IconSparkles
                return (
                  <tr key={a.key} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2.5">
                      <Link to={AREA_TAB[a.key] || '/admin/smart-operations'} className="group flex items-center gap-2 font-medium">
                        <Icon className="size-4 text-muted-foreground" />
                        <span className="group-hover:underline">{a.label}</span>
                        <IconArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                      <div className="mt-1.5 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.round(((a.revenue || 0) / best) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{a.orders}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatGBP(a.revenue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatGBP(a.cost)}</td>
                    <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${a.profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{formatGBP(a.profit)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{a.margin != null ? `${a.margin}%` : '—'}</td>
                  </tr>
                )
              })}
              {total && (
                <tr className="bg-muted/40 font-semibold">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{total.orders}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatGBP(total.revenue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatGBP(total.cost)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${total.profit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>{formatGBP(total.profit)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{total.margin != null ? `${total.margin}%` : '—'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Costs come from Order cost below (else the service's catalogue cost). An order with several products is split by
        each product's share of the order.
      </p>
    </section>
  )
}
