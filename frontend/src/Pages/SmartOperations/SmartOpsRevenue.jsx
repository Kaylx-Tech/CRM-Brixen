import { IconCash, IconChartPie, IconReceipt2, IconTrendingUp } from '@tabler/icons-react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatGBP } from '@/lib/money'
import { REVENUE_PERIODS } from './revenuePeriods'

function Tile({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={`flex size-7 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** The money this Smart Operations area brings in (admins only): revenue, cost, profit and orders for the period. */
export default function SmartOpsRevenue({ area, data, isLoading, period, onPeriod }) {
  const a = data?.areas?.find((x) => x.key === area)
  return (
    <div className="rounded-2xl border bg-linear-to-br from-primary/[0.06] via-card to-card p-3">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 px-0.5">
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
      {isLoading && !a ? (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[86px] rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Tile icon={IconCash} label="Revenue" value={formatGBP(a?.revenue || 0)} tone="bg-primary/10 text-primary" />
          <Tile icon={IconReceipt2} label="Cost" value={formatGBP(a?.cost || 0)} tone="bg-amber-500/15 text-amber-600" />
          <Tile
            icon={IconTrendingUp}
            label="Profit"
            value={formatGBP(a?.profit || 0)}
            hint={a?.margin != null ? `${a.margin}% margin` : null}
            tone={(a?.profit || 0) >= 0 ? 'bg-emerald-500/15 text-emerald-600' : 'bg-destructive/10 text-destructive'}
          />
          <Tile icon={IconChartPie} label="Orders" value={String(a?.orders || 0)} tone="bg-violet-500/15 text-violet-600" />
        </div>
      )}
    </div>
  )
}
