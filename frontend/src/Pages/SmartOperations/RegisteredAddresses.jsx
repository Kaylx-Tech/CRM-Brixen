import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  IconAlertTriangle,
  IconBell,
  IconCircleCheck,
  IconCreditCard,
  IconClockHour4,
  IconHourglassLow,
  IconLoader2,
  IconMapPin,
  IconRefresh,
  IconSearch,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { apiRequest } from '@/lib/api'
import { useRefreshOnReturn } from '@/lib/useRefreshOnReturn'
import { m, spring } from '@/lib/motion'
import { SectionCards } from '../../Layout/StatsCard'
import { shortDate } from './idvStatus'

// What needs the team: the year runs out soon, has run out, or a card payment failed
const NEEDS_ACTION = ['Renews soon', 'Renewal due', 'Expired', 'Payment failed', 'Pending Renewal']
const PAID = ['Paid', 'Auto-renew', 'Active']
// Companies House: not at our address any more, or the company is closed (shown under All only)
const CLOSED = ['Moved away', 'Dissolved', 'Liquidation', 'Administration', 'Receivership', 'Insolvency proceedings']

// Each status: a quiet pill with a coloured dot
const TONES = {
  // Companies House shows the company at another address now, or closed: nothing to renew, no reminders
  'Moved away': { badge: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60' },
  Dissolved: { badge: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60' },
  Expired: { badge: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  'Payment failed': { badge: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
  'Renewal due': { badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  'Pending Renewal': { badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  'Renews soon': { badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-400', dot: 'bg-sky-500' },
  default: { badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
}
const toneOf = (status) => TONES[status] || TONES.default

// The list's columns on wider screens (header and rows share them)
const COLS = '@3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_minmax(0,1.15fr)_minmax(0,1.25fr)]'

const SUMMARY = [
  // tone: a colour of the CRM's stat boxes (Layout/StatsCard)
  { key: 'Renews soon', label: 'Renews Soon', icon: IconClockHour4, match: (s) => s === 'Renews soon', tone: 'sky' },
  { key: 'Renewal due', label: 'Renewal Due', icon: IconHourglassLow, match: (s) => s === 'Renewal due' || s === 'Pending Renewal', tone: 'amber' },
  { key: 'Expired', label: 'Expired', icon: IconAlertTriangle, match: (s) => s === 'Expired' || s === 'Payment failed', tone: 'rose' },
  { key: 'Paid', label: 'Paid', icon: IconCircleCheck, match: (s) => PAID.includes(s) || !(NEEDS_ACTION.includes(s) || CLOSED.includes(s)), tone: 'emerald' },
]

function daysLeft(date) {
  if (!date) return null
  const end = new Date(`${String(date).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(end.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((end - today) / 86400000)
}

function initials(name) {
  const words = String(name || '').replace(/\b(ltd|limited|llp|plc)\b\.?/gi, '').trim().split(/\s+/).filter(Boolean)
  return (words.slice(0, 2).map((w) => w[0]).join('') || '•').toUpperCase()
}

// Registered Address: every company whose registered office is one of Brixen's addresses, as the yearly address
// service (the same status the client sees on the portal Addresses page), soonest renewal first.
export default function RegisteredAddresses() {
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Needs action') // a SUMMARY key, 'Needs action' or 'All'
  const [auto, setAuto] = useState({ on: false, days: 7, canManage: false })
  const [sending, setSending] = useState(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiRequest('/admin/smart-links/registered-addresses', { label: 'Registered Address', silent: true })
      if (!res.ok) {
        toast.error(res.reason || 'Registered addresses failed to load')
        return
      }
      const d = res.data?.data || {}
      setRows(d.addresses || [])
      setAuto({ on: !!d.auto_reminders, days: d.auto_days || 7, canManage: !!d.can_manage, card: !!d.card_payments, webhook: !!d.card_webhook })
    } finally {
      setIsLoading(false)
    }
  }, [])
  useRefreshOnReturn(load)
  useEffect(() => {
    load()
  }, [load])

  // Reminder button: first the team checks the email (some are wrong), then the customer gets the renewal email.
  // A corrected email is kept on the customer's profile (or for this company when a team account holds it).
  const [confirming, setConfirming] = useState(null) // the row whose email is being checked
  const [email, setEmail] = useState('')
  // Mark paid (admins and managers): the bank transfer arrived; the renewal is paid and the address runs a year more
  const markPaid = async (r) => {
    const amount = r.payment_claim?.amount ? ` (£${Number(r.payment_claim.amount).toFixed(2)})` : ''
    if (!window.confirm(`Mark the address renewal for ${r.company_name} as paid${amount}? Do this once the bank transfer has arrived.`)) return
    setSending(`paid-${r.id}`)
    try {
      const res = await apiRequest(`/admin/smart-links/registered-addresses/${r.company_id}/mark-paid`, {
        method: 'POST', label: 'Mark paid', silent: true,
      })
      if (!res.ok) {
        toast.error(res.reason || 'Could not mark it paid')
        return
      }
      toast.success(res.data?.message || 'Marked paid')
      load()
    } finally {
      setSending(null)
    }
  }

  // The email is asked only the first time for a company; after that the reminder goes straight to it
  const askEmail = (r) => {
    if (r.email_confirmed && r.reminder_email) {
      remind(r)
      return
    }
    setConfirming(r)
    setEmail(r.reminder_email || '')
  }

  const remind = async (r, to) => {
    setSending(r.id)
    try {
      const res = await apiRequest(`/admin/smart-links/registered-addresses/${r.company_id}/remind`, {
        method: 'POST', body: { email: to }, label: 'Reminder', silent: true,
      })
      if (!res.ok) {
        toast.error(res.reason || 'The reminder could not be sent')
        return
      }
      const sent = res.data?.data
      if (sent?.emailed) toast.success(res.data?.message || 'Reminder sent')
      else toast.warning(res.data?.message || 'The email could not be sent')
      setConfirming(null)
      // The same customer's other companies use the saved email too
      setRows((list) => list.map((x) => {
        const same = x.id === r.id || (r.owner_is_customer && x.customer_id && x.customer_id === r.customer_id)
        const next = same ? { ...x, reminder_email: sent?.sent_to || x.reminder_email } : x
        return x.id === r.id
          ? { ...next, email_confirmed: true, last_reminder: { sent_on: sent?.sent_on, kind: 'manual', emailed: !!sent?.emailed } }
          : next
      }))
    } finally {
      setSending(null)
    }
  }

  const toggleAuto = async (enabled) => {
    const res = await apiRequest('/admin/smart-links/registered-addresses/auto-reminders', {
      method: 'POST', body: { enabled }, label: 'Auto reminders', silent: true,
    })
    if (!res.ok) {
      toast.error(res.reason || 'Could not change auto reminders')
      return
    }
    setAuto((a) => ({ ...a, on: !!res.data?.data?.auto_reminders }))
    toast.success(res.data?.message || 'Saved')
  }

  const counts = useMemo(() => {
    const out = { 'Needs action': rows.filter((r) => NEEDS_ACTION.includes(r.status)).length, All: rows.length }
    SUMMARY.forEach((s) => { out[s.key] = rows.filter((r) => s.match(r.status)).length })
    return out
  }, [rows])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const card = SUMMARY.find((s) => s.key === filter)
    return rows.filter((r) => {
      if (filter === 'Needs action' && !NEEDS_ACTION.includes(r.status)) return false
      if (card && !card.match(r.status)) return false
      if (!q) return true
      return [r.company_name, r.company_number, r.customer_name, r.customer_email, r.address, r.status]
        .some((v) => String(v || '').toLowerCase().includes(q))
    })
  }, [rows, search, filter])

  return (
    <div className="flex flex-col gap-4">
      {/* Status summary: each card is also a filter */}
      <SectionCards
        compact
        isLoading={isLoading && !rows.length}
        stats={SUMMARY.map((s) => ({
          title: s.label,
          value: String(counts[s.key]),
          icon: s.icon,
          tone: s.tone,
          active: filter === s.key,
          onClick: () => setFilter(filter === s.key ? 'Needs action' : s.key),
        }))}
      />

      {/* Search, the list filter and auto reminders */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/60 p-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search company, customer or address…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 rounded-full border bg-background p-0.5">
            {['Needs action', 'All'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {f === 'Needs action' ? 'Needs Action' : f} <span className="opacity-70">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label
            className="flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs"
            title={`One renewal email a day to the customer in the last ${auto.days} days before the renewal date`}
          >
            <Checkbox checked={auto.on} onCheckedChange={(v) => toggleAuto(Boolean(v))} disabled={!auto.canManage} />
            <IconBell className="size-3.5 text-muted-foreground" />
            <span>Daily Reminders, Last {auto.days} Days</span>
            <span className={`font-semibold ${auto.on ? 'text-emerald-600' : 'text-muted-foreground'}`}>{auto.on ? 'On' : 'Off'}</span>
          </label>
          {/* Card payments work once Stripe's keys are on the server (Coolify); the keys are never shown */}
          <span
            className="flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs"
            title={auto.card && !auto.webhook ? 'STRIPE_WEBHOOK_SECRET is missing: payments go through but the CRM is not told' : 'Card payments by Stripe in the reminder email and the portal'}
          >
            <IconCreditCard className="size-3.5 text-muted-foreground" />
            <span>Card Payments</span>
            <span className={`font-semibold ${auto.card && auto.webhook ? 'text-emerald-600' : auto.card ? 'text-amber-600' : 'text-muted-foreground'}`}>
              {auto.card && auto.webhook ? 'On' : auto.card ? 'Webhook missing' : 'Off'}
            </span>
          </span>
          <Button variant="ghost" size="sm" onClick={load} disabled={isLoading}>
            <IconRefresh className={`size-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="grid gap-2 rounded-2xl border bg-card p-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/40 px-4 py-16 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconMapPin className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">
            {search.trim() ? 'No addresses found' : filter === 'Needs action' ? 'Nothing needs a renewal right now' : 'No addresses here'}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Companies whose registered office is one of Brixen's addresses show up here with their renewal date.
          </p>
        </div>
      ) : (
        <div className="@container overflow-hidden rounded-2xl border bg-card">
          <div className={`hidden ${COLS} border-b bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground @3xl:grid`}>
            <span>Company</span>
            <span>Address · Customer</span>
            <span>Renewal</span>
            <span className="text-right">Reminder</span>
          </div>
          <div className="divide-y">
            {shown.map((r, i) => {
              const left = daysLeft(r.expiry_date)
              const tone = toneOf(r.status)
              const needs = NEEDS_ACTION.includes(r.status)
              // The email reminders go to (a customer's notification email, or the one typed for this company)
              const customer = [r.customer_name, r.reminder_email || (r.owner_is_customer ? r.customer_email : 'no customer email')]
                .filter(Boolean).join(' · ')
              return (
                <m.div
                  key={r.id}
                  initial={i < 12 ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ ...spring, delay: Math.min(i, 12) * 0.02 }}
                  className={`grid gap-3 px-4 py-3 transition-colors hover:bg-muted/30 @3xl:items-center @3xl:gap-4 ${COLS}`}
                >
                  {/* Company */}
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {initials(r.company_name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium leading-tight" title={r.company_name}>{r.company_name || '—'}</p>
                      <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                        {r.company_number || 'No company number'}{r.source === 'Added by hand' ? ' · by hand' : ''}
                        {r.director ? ` · ${r.director}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Address and customer */}
                  <div className="min-w-0 pl-12 @3xl:pl-0">
                    <p className="truncate text-sm" title={r.address}>{r.address || '—'}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground" title={customer}>{customer || '—'}</p>
                  </div>

                  {/* Renewal date and status */}
                  <div className="min-w-0 pl-12 @3xl:pl-0">
                    <p className="text-sm tabular-nums">
                      {shortDate(r.expiry_date) || '—'}
                      {left !== null && (
                        <span className={`ml-1.5 text-xs ${left < 0 ? 'text-destructive' : left <= 30 ? 'text-sky-600 dark:text-sky-400' : 'text-muted-foreground'}`}>
                          {left < 0 ? `${-left}d ago` : left === 0 ? 'today' : `in ${left}d`}
                        </span>
                      )}
                    </p>
                    <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.badge}`}>
                      <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
                      {r.status}
                    </span>
                    {/* Moved to our address after it was formed: the year counts from that change (AD01) */}
                    {r.start_source === 'ad01' && r.start_date && (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground" title="From the change of registered office address (AD01) on Companies House">
                        Address since {shortDate(r.start_date)} · AD01
                      </p>
                    )}
                    {r.renewal_invoice && (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">
                        Invoice {r.renewal_invoice.invoice_number} · {r.renewal_invoice.status}
                      </p>
                    )}
                  </div>

                  {/* Reminder */}
                  <div className="flex items-center justify-between gap-2 pl-12 @3xl:justify-end @3xl:pl-0">
                    {needs && r.company_id ? (
                      <>
                        <span className="text-right text-[11px] leading-tight text-muted-foreground">
                          {/* The customer pressed "I have paid by bank transfer" in the email */}
                          {r.payment_claim ? (
                            <span className="block font-medium text-emerald-600 dark:text-emerald-400" title={r.payment_claim.reference ? `Reference: ${r.payment_claim.reference}` : undefined}>
                              Customer says paid · {shortDate(r.payment_claim.at)}
                            </span>
                          ) : null}
                          {r.last_reminder
                            ? <>Sent {shortDate(r.last_reminder.sent_on)}{r.last_reminder.kind === 'auto' ? ' · auto' : ''}{r.last_reminder.emailed ? '' : <span className="text-destructive"> · failed</span>}</>
                            : 'Not sent yet'}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          {auto.canManage && (
                            <Button variant={r.payment_claim ? 'default' : 'ghost'} size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={() => markPaid(r)} disabled={sending === `paid-${r.id}`}>
                              {sending === `paid-${r.id}` ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconCircleCheck className="size-3.5" />}
                              Mark paid
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={() => askEmail(r)} disabled={sending === r.id}>
                            {sending === r.id ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconBell className="size-3.5" />}
                            Remind
                          </Button>
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </m.div>
              )
            })}
          </div>
        </div>
      )}

      {/* Check the email before a reminder goes */}
      <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send a Renewal Reminder</DialogTitle>
            <DialogDescription>
              {confirming?.company_name}
              {confirming?.customer_name ? ` · ${confirming.customer_name}` : ''}. Check the email before it goes.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (confirming && email.trim()) remind(confirming, email.trim())
            }}
          >
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Customer's Email</span>
              <Input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </label>
            <p className="text-xs text-muted-foreground">
              {confirming?.owner_is_customer
                ? `A changed email is saved on ${confirming?.customer_name || "the customer"}'s profile as their notification email, so all their emails go there. Their login email stays the same.`
                : `This company is not under its own customer's account (it is under ${confirming?.customer_name || 'no customer'}), so the email is kept for this company's reminders only. Link the company to its customer in Companies when you can.`}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
              <Button type="submit" disabled={!email.trim() || sending === confirming?.id}>
                {sending === confirming?.id ? <IconLoader2 className="size-4 animate-spin" /> : <IconBell className="size-4" />}
                Send reminder
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
