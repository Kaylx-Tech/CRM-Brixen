import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  IconAlertTriangle,
  IconBell,
  IconCircleCheck,
  IconClockHour4,
  IconHourglassLow,
  IconLoader2,
  IconMapPin,
  IconRefresh,
  IconSearch,
  IconUser,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { apiRequest } from '@/lib/api'
import { useRefreshOnReturn } from '@/lib/useRefreshOnReturn'
import { m, spring } from '@/lib/motion'
import { shortDate } from './idvStatus'

// What needs the team: the year runs out soon, has run out, or a card payment failed
const NEEDS_ACTION = ['Renews soon', 'Renewal due', 'Expired', 'Payment failed', 'Pending Renewal']
const PAID = ['Paid', 'Auto-renew', 'Active']

// Each status: its colour (badge, left strip, progress bar) and the summary card it counts in
const TONES = {
  Expired: { badge: 'bg-destructive/10 text-destructive ring-destructive/20', strip: 'bg-destructive', bar: 'bg-destructive' },
  'Payment failed': { badge: 'bg-destructive/10 text-destructive ring-destructive/20', strip: 'bg-destructive', bar: 'bg-destructive' },
  'Renewal due': { badge: 'bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-400', strip: 'bg-amber-500', bar: 'bg-amber-500' },
  'Pending Renewal': { badge: 'bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-400', strip: 'bg-amber-500', bar: 'bg-amber-500' },
  'Renews soon': { badge: 'bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:text-sky-400', strip: 'bg-sky-500', bar: 'bg-sky-500' },
  default: { badge: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400', strip: 'bg-emerald-500', bar: 'bg-emerald-500' },
}
const toneOf = (status) => TONES[status] || TONES.default

const SUMMARY = [
  { key: 'Renews soon', label: 'Renews soon', icon: IconClockHour4, match: (s) => s === 'Renews soon', tone: 'text-sky-600 bg-sky-500/12' },
  { key: 'Renewal due', label: 'Renewal due', icon: IconHourglassLow, match: (s) => s === 'Renewal due' || s === 'Pending Renewal', tone: 'text-amber-600 bg-amber-500/12' },
  { key: 'Expired', label: 'Expired', icon: IconAlertTriangle, match: (s) => s === 'Expired' || s === 'Payment failed', tone: 'text-destructive bg-destructive/10' },
  { key: 'Paid', label: 'Paid', icon: IconCircleCheck, match: (s) => PAID.includes(s) || !NEEDS_ACTION.includes(s), tone: 'text-emerald-600 bg-emerald-500/12' },
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

/** How far into the paid year the address is: 0% just renewed, 100% on the renewal date (or past it). */
function yearProgress(expiry) {
  const left = daysLeft(expiry)
  if (left === null) return null
  return Math.max(0, Math.min(100, Math.round(((365 - left) / 365) * 100)))
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
      setAuto({ on: !!d.auto_reminders, days: d.auto_days || 7, canManage: !!d.can_manage })
    } finally {
      setIsLoading(false)
    }
  }, [])
  useRefreshOnReturn(load)
  useEffect(() => {
    load()
  }, [load])

  // Reminder button: the customer gets the renewal email now
  const remind = async (r) => {
    setSending(r.id)
    try {
      const res = await apiRequest(`/admin/smart-links/registered-addresses/${r.company_id}/remind`, {
        method: 'POST', label: 'Reminder', silent: true,
      })
      if (!res.ok) {
        toast.error(res.reason || 'The reminder could not be sent')
        return
      }
      const sent = res.data?.data
      if (sent?.emailed) toast.success(res.data?.message || 'Reminder sent')
      else toast.warning(res.data?.message || 'The email could not be sent')
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, last_reminder: { sent_on: sent?.sent_on, kind: 'manual', emailed: !!sent?.emailed } } : x)))
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
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {SUMMARY.map((s) => {
          const active = filter === s.key
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setFilter(active ? 'Needs action' : s.key)}
              className={`group flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${active ? 'border-primary/50 ring-2 ring-primary/15' : ''}`}
            >
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${s.tone}`}>
                <s.icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-muted-foreground">{s.label}</span>
                <span className="block text-xl font-semibold tabular-nums leading-tight">{isLoading && !rows.length ? '–' : counts[s.key]}</span>
              </span>
            </button>
          )
        })}
      </div>

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
                {f} <span className="opacity-70">{counts[f]}</span>
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
            <span>Daily reminders, last {auto.days} days</span>
            <span className={`font-semibold ${auto.on ? 'text-emerald-600' : 'text-muted-foreground'}`}>{auto.on ? 'On' : 'Off'}</span>
          </label>
          <Button variant="ghost" size="sm" onClick={load} disabled={isLoading}>
            <IconRefresh className={`size-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
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
        <div className="grid gap-3 xl:grid-cols-2">
          {shown.map((r, i) => {
            const left = daysLeft(r.expiry_date)
            const tone = toneOf(r.status)
            const progress = yearProgress(r.expiry_date)
            const needs = NEEDS_ACTION.includes(r.status)
            return (
              <m.div
                key={r.id}
                initial={i < 10 ? { opacity: 0, y: 10 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: Math.min(i, 10) * 0.03 }}
                className="relative overflow-hidden rounded-2xl border bg-card shadow-xs transition-shadow hover:shadow-md"
              >
                <span className={`absolute inset-y-0 left-0 w-1 ${tone.strip}`} aria-hidden="true" />
                <div className="flex flex-col gap-3 p-4 pl-5">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                      {initials(r.company_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold leading-tight">{r.company_name || '—'}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.company_number || 'No company number'}{r.source === 'Added by hand' ? ' · added by hand' : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tone.badge}`}>
                      {r.status}
                    </span>
                  </div>

                  <div className="grid gap-1.5 rounded-xl bg-muted/50 px-3 py-2 text-xs">
                    <p className="flex items-start gap-1.5">
                      <IconMapPin className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 break-words">{r.address || '—'}</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <IconUser className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">{[r.customer_name, r.customer_email].filter(Boolean).join(' · ') || '—'}</span>
                    </p>
                  </div>

                  <div>
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                      <span className="text-muted-foreground">Since {shortDate(r.start_date) || '—'}</span>
                      <span className={left !== null && left < 0 ? 'font-semibold text-destructive' : left !== null && left <= 30 ? 'font-semibold text-sky-700 dark:text-sky-400' : 'font-medium'}>
                        {r.status === 'Auto-renew' ? 'Card charged ' : 'Renews '}{shortDate(r.expiry_date) || '—'}
                        {left !== null ? (left < 0 ? ` · ${-left} days ago` : ` · in ${left} days`) : ''}
                      </span>
                    </div>
                    {progress !== null && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" title={`${progress}% of the year used`}>
                        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${progress}%` }} />
                      </div>
                    )}
                    {r.renewal_invoice && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Renewal invoice {r.renewal_invoice.invoice_number} · {r.renewal_invoice.status}
                      </p>
                    )}
                  </div>

                  {needs && r.company_id && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <IconBell className="size-3.5" />
                        {r.last_reminder
                          ? `Last reminder ${shortDate(r.last_reminder.sent_on)}${r.last_reminder.kind === 'auto' ? ' (auto)' : ''}${r.last_reminder.emailed ? '' : ' · not delivered'}`
                          : 'No reminder sent yet'}
                      </span>
                      <Button size="sm" className="h-8 gap-1.5 rounded-full px-3.5" onClick={() => remind(r)} disabled={sending === r.id}>
                        {sending === r.id ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconBell className="size-3.5" />}
                        Reminder
                      </Button>
                    </div>
                  )}
                </div>
              </m.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
