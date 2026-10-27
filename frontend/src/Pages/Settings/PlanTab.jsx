import { useEffect, useState } from 'react'
import { IconCheck, IconMail } from '@tabler/icons-react'
import { PlanUsage } from '@/components/plan-usage'
import { apiRequest } from '@/lib/api'
import { cn } from 'cn'

const money = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(v)

function date(value) {
  if (!value) return ''
  const d = new Date(String(value).replace(' ', 'T') + (String(value).length > 10 ? 'Z' : ''))
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Settings → Plan & usage (Finstap): the workspace's plan, what it uses, and the other plans. */
export default function PlanTab() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest('/admin/plan', { label: 'Plan', silent: true }).then((res) =>
      res.ok ? setData(res.data.data) : setError(res.reason),
    )
  }, [])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>

  const { plan, usage, plans } = data
  const current = plan.key === 'trial' ? plans.trial_plan : plan.key
  const trialText = plan.key === 'trial'
    ? (data.trial_active
      ? `Your free trial includes everything in ${plans.plans[plans.trial_plan].name} and ends on ${date(data.trial_ends_at)}.`
      : `Your free trial ended on ${date(data.trial_ends_at)}. Choose a plan to keep growing; everything you saved is still here.`)
    : data.current_period_end ? `Paid until ${date(data.current_period_end)}.` : ''

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current plan</p>
            <h3 className="text-xl font-semibold">{plan.name}</h3>
          </div>
          {trialText && <p className="text-sm text-muted-foreground sm:max-w-md sm:text-right">{trialText}</p>}
        </div>
        <PlanUsage usage={usage} limits={plan.limits} className="mt-5" />
        <p className="mt-4 text-xs text-muted-foreground">
          Limits only stop new records. Nothing is deleted, and your clients can always use their portal.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {plans.order.map((key) => {
          const p = plans.plans[key]
          const here = key === current
          return (
            <div key={key} className={cn('flex flex-col rounded-xl border bg-card p-4', here && 'border-primary ring-2 ring-primary/20')}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{p.name}</span>
                {here && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{plan.key === 'trial' ? 'Trial' : 'Current'}</span>}
              </div>
              <div className="mt-1 text-lg font-bold">
                {p.custom ? 'Custom' : <>{money(p.price_month)}<span className="text-sm font-normal text-muted-foreground">/month</span></>}
              </div>
              <ul className="mt-3 flex-1 space-y-1.5 text-sm text-muted-foreground">
                {['users', 'customers', 'companies', 'storage_gb'].map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <IconCheck className="size-3.5 text-emerald-600" />
                    {p.limits[k] === null ? 'Unlimited' : k === 'storage_gb' ? `${p.limits[k]} GB` : p.limits[k].toLocaleString('en-GB')}{' '}
                    {k === 'storage_gb' ? 'storage' : plans.limits[k].toLowerCase()}
                  </li>
                ))}
              </ul>
              {!here && (
                <a
                  href={`mailto:contact@finstap.com?subject=${encodeURIComponent(`Finstap ${p.name} plan`)}`}
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  <IconMail className="size-4" /> {p.custom ? 'Talk to us' : `Switch to ${p.name}`}
                </a>
              )}
            </div>
          )
        })}
      </section>
      <p className="text-xs text-muted-foreground">
        Online payment is coming soon. Until then, email contact@finstap.com to change your plan.
      </p>
    </div>
  )
}
