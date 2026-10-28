import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  IconAlertTriangle,
  IconCheck,
  IconCreditCard,
  IconExternalLink,
  IconLoader2,
  IconLogout,
  IconMail,
  IconReceipt,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/api'
import finstapLogo from '@/assets/finstap-logo.svg'
import finstapLogoLight from '@/assets/finstap-logo-light.svg'

const gbp = (v, digits = 0) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(v || 0))

function date(value) {
  if (!value) return ''
  const d = new Date(String(value).replace(' ', 'T') + (String(value).length > 10 ? 'Z' : ''))
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

const PILL = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold'

function statusPill(data) {
  if (data.locked) return ['Locked', 'bg-destructive/10 text-destructive']
  if (data.plan.key === 'trial') return ['Free trial', 'bg-sky-500/10 text-sky-700 dark:text-sky-300']
  if (data.cancel_at) return [`Ends ${date(data.cancel_at)}`, 'bg-amber-500/15 text-amber-800 dark:text-amber-300']
  const s = data.subscription_status
  if (s === 'past_due') return ['Payment due', 'bg-amber-500/15 text-amber-800 dark:text-amber-300']
  if (s === 'cancelled') return ['Cancelled', 'bg-destructive/10 text-destructive']
  if (s === 'trialing') return ['Trial, card added', 'bg-sky-500/10 text-sky-700 dark:text-sky-300']
  return ['Active', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300']
}

function Section({ title, description, action, children, className }) {
  return (
    <section className={cn('rounded-xl border bg-card p-5', className)}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h3 className="font-semibold">{title}</h3>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Billing (Finstap): the workspace's plan, card payments through Stripe, services and receipts. */
export default function Billing() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [cycle, setCycle] = useState('monthly')
  const [busy, setBusy] = useState('')
  const [params, setParams] = useSearchParams()

  const load = useCallback(() => {
    apiRequest('/admin/billing', { label: 'Billing', silent: true }).then((res) => {
      if (res.ok) {
        setData(res.data.data)
        if (res.data.data.billing_cycle === 'yearly') setCycle('yearly')
      } else setError(res.reason)
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Back from Stripe: the payment is confirmed by Stripe's webhook a moment later
  useEffect(() => {
    if (params.get('paid') !== '1') return undefined
    toast.success('Thank you! Your payment is being confirmed.')
    setParams({}, { replace: true })
    const timers = [3000, 8000].map((ms) => setTimeout(() => {
      load()
      window.dispatchEvent(new Event('finstap-billing-changed'))
    }, ms))
    return () => timers.forEach(clearTimeout)
  }, [params, setParams, load])

  const go = async (key, path, body) => {
    setBusy(key)
    const res = await apiRequest(path, { method: 'POST', body, label: 'Billing' })
    if (res.ok && res.data.data?.url) {
      window.location.href = res.data.data.url
      return
    }
    setBusy('')
    if (res.ok) {
      toast.success(res.data.message || 'Done')
      load()
      window.dispatchEvent(new Event('finstap-billing-changed'))
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>

  const { plan, plans } = data
  const [status, tone] = statusPill(data)
  const onPaidPlan = plan.key !== 'trial' && data.pays_by_card
  const sameCycle = (data.billing_cycle || 'monthly') === cycle
  const dateLine = plan.key === 'trial'
    ? (data.trial_active ? `Free trial until ${date(data.trial_ends_at)}` : `Free trial ended on ${date(data.trial_ends_at)}`)
    : data.cancel_at ? `Paid until ${date(data.cancel_at)}, then it ends`
      : data.current_period_end ? `${data.subscription_status === 'trialing' ? 'First payment on' : 'Paid until'} ${date(data.current_period_end)}` : ''

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Billing</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your Finstap plan, card payments, services and receipts.</p>
      </div>

      {data.locked && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <IconAlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <p>{data.message}</p>
        </div>
      )}

      <Section
        title="Current plan"
        action={
          data.card_on_file && (
            <Button variant="outline" disabled={!!busy} onClick={() => go('portal', '/admin/billing/portal')}>
              {busy === 'portal' ? <IconLoader2 className="size-4 animate-spin" /> : <IconCreditCard className="size-4" />}
              Card, invoices &amp; cancel
            </Button>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl font-bold">{plan.name}</span>
          <span className={cn(PILL, tone)}>{status}</span>
        </div>
        {dateLine && <p className="mt-1 text-sm text-muted-foreground">{dateLine}</p>}
        {!data.stripe_ready && (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
            Card payments are not switched on yet. Email contact@finstap.com to choose or renew a plan.
          </p>
        )}
      </Section>

      <Section
        title={plan.key === 'trial' || data.locked ? 'Choose your plan' : 'Change plan'}
        description={plan.key === 'trial' && data.trial_active
          ? 'Add your card now and you are only charged when the free trial ends.'
          : 'Prices in GBP. You can change or cancel any time.'}
        action={
          <div className="inline-flex rounded-full border bg-muted/50 p-0.5 text-sm">
            {[['monthly', 'Monthly'], ['yearly', 'Yearly (2 months free)']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCycle(value)}
                className={cn('rounded-full px-3 py-1 font-medium transition', cycle === value ? 'bg-background shadow-sm' : 'text-muted-foreground')}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {plans.order.map((key) => {
            const p = plans.plans[key]
            const here = onPaidPlan && key === plan.key && sameCycle
            const price = cycle === 'yearly' ? p.price_year : p.price_month
            return (
              <div key={key} className={cn('flex flex-col rounded-xl border p-4', here && 'border-primary ring-2 ring-primary/20', p.popular && !here && 'border-primary/40')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  {here ? <span className={cn(PILL, 'bg-primary/10 text-primary')}>Current</span>
                    : p.popular ? <span className={cn(PILL, 'bg-primary/10 text-primary')}>Popular</span> : null}
                </div>
                <div className="mt-1 text-xl font-bold">
                  {p.custom ? 'Custom' : <>{gbp(price)}<span className="text-sm font-normal text-muted-foreground">/{cycle === 'yearly' ? 'year' : 'month'}</span></>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-muted-foreground">
                  {['users', 'customers', 'companies', 'storage_gb'].map((k) => (
                    <li key={k} className="flex items-center gap-2">
                      <IconCheck className="size-3.5 text-emerald-600" />
                      {p.limits[k] === null ? 'Unlimited' : k === 'storage_gb' ? `${p.limits[k]} GB` : p.limits[k].toLocaleString('en-GB')}{' '}
                      {k === 'storage_gb' ? 'storage' : plans.limits[k].toLowerCase()}
                    </li>
                  ))}
                </ul>
                {p.custom ? (
                  <Button variant="outline" className="mt-4" nativeButton={false}
                    render={<a href={`mailto:contact@finstap.com?subject=${encodeURIComponent('Finstap Enterprise plan')}`} />}>
                    <IconMail className="size-4" /> Talk to us
                  </Button>
                ) : (
                  <Button
                    className="mt-4"
                    variant={here ? 'outline' : 'default'}
                    disabled={here || !!busy || !data.stripe_ready}
                    onClick={() => {
                      if (onPaidPlan && !window.confirm(`Move to ${p.name} (${cycle})? Stripe charges or credits the difference for the rest of this period.`)) return
                      go(key, '/admin/billing/subscribe', { plan: key, cycle })
                    }}
                  >
                    {busy === key && <IconLoader2 className="size-4 animate-spin" />}
                    {here ? 'Your plan' : onPaidPlan ? `Switch to ${p.name}` : `Choose ${p.name}`}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Card details are entered on Stripe's secure page; Finstap never sees them.
        </p>
      </Section>

      <Section
        title="Services"
        description="Registered office addresses and KYC checks Finstap provides to your workspace."
        action={data.services.items.length > 0 && (
          <Button disabled={!!busy || !data.stripe_ready} onClick={() => go('services', '/admin/billing/services')}>
            {busy === 'services' ? <IconLoader2 className="size-4 animate-spin" /> : <IconCreditCard className="size-4" />}
            Pay {gbp(data.services.total, 2)}
          </Button>
        )}
      >
        {data.services.items.length ? (
          <ul className="divide-y text-sm">
            {data.services.items.map((i) => (
              <li key={i.ref} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <div className="font-medium">{i.label}</div>
                  {i.detail && <div className="text-xs text-muted-foreground">{i.detail}</div>}
                </div>
                <span className="tabular-nums font-medium">{gbp(i.amount, 2)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing to pay for services.</p>
        )}
      </Section>

      <Section title="Payments">
        {data.payments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2.5 pr-4 font-semibold">Date</th>
                  <th className="px-3 py-2.5 font-semibold">For</th>
                  <th className="px-3 py-2.5 font-semibold">Method</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                  <th className="py-2.5 pl-3 font-semibold">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">{date(p.created_at)}</td>
                    <td className="px-3 py-2.5">
                      {p.kind === 'services' ? 'Services'
                        : `${p.plan ? plans.plans[p.plan]?.name || p.plan : 'Plan'}${p.period_start ? ` · ${date(p.period_start)} – ${date(p.period_end)}` : ''}`}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.method}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">{gbp(p.amount, 2)}</td>
                    <td className="py-2.5 pl-3">
                      {p.receipt_url ? (
                        <a href={p.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <IconReceipt className="size-4" /> View <IconExternalLink className="size-3" />
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        )}
      </Section>
    </div>
  )
}

/**
 * Shown instead of the whole CRM while the workspace is locked (trial ended, subscription ended or not
 * paid): admins get Billing to renew, everyone else is told to ask an admin.
 */
export function LockedScreen({ status, onSignOut }) {
  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <img src={finstapLogo} alt="Finstap" className="h-7 w-auto dark:hidden" />
          <img src={finstapLogoLight} alt="Finstap" className="hidden h-7 w-auto dark:block" />
          <Button variant="outline" onClick={onSignOut}>
            <IconLogout className="size-4" /> Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        {status.can_pay ? (
          <Billing />
        ) : (
          <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-6 text-center">
            <IconAlertTriangle className="mx-auto size-8 text-amber-600" />
            <h2 className="mt-3 text-lg font-semibold">This workspace is paused</h2>
            <p className="mt-2 text-sm text-muted-foreground">{status.message}</p>
            <p className="mt-2 text-sm text-muted-foreground">Please ask your workspace admin to renew it in Billing.</p>
          </div>
        )}
      </main>
    </div>
  )
}
