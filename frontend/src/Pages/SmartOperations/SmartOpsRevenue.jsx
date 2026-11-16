import { IconCash, IconChartPie, IconReceipt2, IconTrendingUp } from '@tabler/icons-react'
import { formatGBP } from '@/lib/money'
import { SectionCards } from '../../Layout/StatsCard'
import { REVENUE_PERIODS } from './revenuePeriods'

/** The money this Smart Operations area brings in (admins only): revenue, cost, profit and orders for the period,
 * in the same stat boxes as the rest of the CRM. */
export default function SmartOpsRevenue({ area, data, isLoading, period, onPeriod }) {
  const a = data?.areas?.find((x) => x.key === area)
  const profit = a?.profit || 0
  const stats = [
    { title: 'Revenue', value: formatGBP(a?.revenue || 0), icon: IconCash, tone: 'sky' },
    { title: 'Cost', value: formatGBP(a?.cost || 0), icon: IconReceipt2, tone: 'orange' },
    {
      title: 'Profit',
      value: formatGBP(profit),
      icon: IconTrendingUp,
      tone: profit >= 0 ? 'emerald' : 'rose',
      trendValue: a?.margin != null ? `${a.margin}%` : undefined,
      trendDirection: profit >= 0 ? 'up' : 'down',
    },
    { title: 'Orders', value: String(a?.orders || 0), icon: IconChartPie, tone: 'violet' },
  ]
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p className="text-sm font-semibold">{a?.label || 'This area'}: revenue</p>
        <div className="flex gap-1 rounded-full border bg-background p-0.5">
          {REVENUE_PERIODS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onPeriod(value)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${period === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <SectionCards stats={stats} isLoading={isLoading && !a} compact />
    </div>
  )
}
