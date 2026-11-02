import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
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

const KYC_MONTH_STATUS = {
  running: ['This month so far', 'bg-sky-500/10 text-sky-700 dark:text-sky-300'],
  not_billed: ['To be invoiced', 'bg-muted text-muted-foreground'],
  invoiced: ['Due', 'bg-amber-500/15 text-amber-800 dark:text-amber-300'],
  paid: ['Paid', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'],
}

function monthName(period) {
  const d = new Date(`${period}-01T00:00:00`)
  return Number.isNaN(d.getTime()) ? period : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

/** The paid KYC service: switch it on (after seeing the price), and how many checks it ran and cost, by month. */
function KycService({ kyc, busy, onSwitch, onNewLink }) {
  const [confirming, setConfirming] = useState(false)
  const price = kyc.price ? `${gbp(kyc.price, 2)} a check` : 'price set by Finstap'
  return (
    <Section
      title="KYC service"
      description={`Identity checks for your clients: they upload their ID, a live selfie and a proof of address on a secure link, and Finstap's KYC team checks them. ${kyc.price ? `${gbp(kyc.price, 2)} (excl. VAT) for each check started.` : ''}`}
      action={
        kyc.enabled ? (
          <span className={cn(PILL, 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}>
            <IconCheck className="size-3.5" /> On{kyc.enabled_at ? ` since ${date(kyc.enabled_at)}` : ''}
          </span>
        ) : (
          <span className={cn(PILL, 'bg-muted text-muted-foreground')}>Off</span>
        )
      }
    >
      {!kyc.enabled ? (
        confirming ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p>
              Turn on the KYC service? Each identity check you start is charged at <strong>{price}</strong>, invoiced
              monthly. You can turn it off at any time.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={!!busy} onClick={() => onSwitch(true)}>
                {busy === 'kyc' ? <IconLoader2 className="size-4 animate-spin" /> : <IconCheck className="size-4" />}
                Yes, turn it on
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setConfirming(true)}>Turn on KYC service</Button>
        )
      ) : (
        <>
          {kyc.link && (
            <div className="mb-4 rounded-lg border bg-muted/30 p-3">
              <div className="text-sm font-medium">Your KYC link</div>
              <p className="text-xs text-muted-foreground">
                Send it to any client to verify their identity, no order needed. Each check they send is counted here.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs" title={kyc.link}>{kyc.link}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard.writeText(kyc.link).then(
                      () => toast.success('KYC link copied'),
                      () => toast.error('Could not copy'),
                    )
                  }
                >
                  <IconCopy className="size-4" /> Copy
                </Button>
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={onNewLink} title="The old link stops working">
                  New link
                </Button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Checks this month</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{kyc.this_month.checks}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">This month so far</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{gbp(kyc.this_month.amount, 2)}</div>
            </div>
            <div className="col-span-2 rounded-lg border p-3 sm:col-span-1">
              <div className="text-xs text-muted-foreground">Price per check</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{kyc.price ? gbp(kyc.price, 2) : '—'}</div>
            </div>
          </div>
          {kyc.months.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Month</th>
                    <th className="px-3 py-2 font-semibold">Checks</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                    <th className="py-2 pl-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {kyc.months.map((m) => {
                    const [label, tone] = KYC_MONTH_STATUS[m.status] || ['—', 'bg-muted text-muted-foreground']
                    return (
                      <tr key={m.period} className="border-b last:border-0">
                        <td className="py-2 pr-3">{monthName(m.period)}</td>
                        <td className="px-3 py-2 tabular-nums">{m.checks}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{gbp(m.amount, 2)}</td>
                        <td className="py-2 pl-3">
                          <span className={cn(PILL, tone)}>{label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {kyc.credits?.limit != null
                ? `${kyc.credits.available} of ${kyc.credits.limit} unpaid checks left before you need to pay. `
                : ''}
              Due months appear under Services below.
            </span>
            <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => onSwitch(false)}>
              Turn off
            </Button>
          </div>
        </>
      )}
    </Section>
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

      {data.kyc && (
        <KycService
          kyc={data.kyc}
          busy={busy}
          onSwitch={(on) => go('kyc', '/admin/billing/kyc', { enabled: on })}
          onNewLink={() => go('kyc', '/admin/billing/kyc/new-link')}
        />
      )}

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
