import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IconCheck, IconClipboardList, IconLoader2, IconSearch } from '@tabler/icons-react'
import { toast } from 'sonner'
import { apiRequest } from '@/lib/api'
import { formatGBP } from '@/lib/money'

const STATUS_TONE = {
  Eligible: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'Not eligible': 'bg-destructive/10 text-destructive',
  'Pending check': 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

function day(value) {
  const d = new Date(String(value || '').replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "Apply" on a Finstap perk: the partner's link is already open; who is this account for? */
export function ApplyDialog({ perk, onClose, onDone }) {
  const [form, setForm] = useState({ client_name: '', company_name: '', client_email: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const save = async (e) => {
    e.preventDefault()
    if (!form.client_name.trim()) {
      setError("Enter the client's name")
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await apiRequest('/admin/smart-links/perk-applications', {
        method: 'POST',
        body: { ...form, perk_id: perk.id },
        label: 'Applied account',
        silent: true,
      })
      if (!res.ok) {
        setError(res.reason || 'Could not save it')
        return
      }
      toast.success(res.data?.message || 'Added to Applied accounts')
      setForm({ client_name: '', company_name: '', client_email: '' })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!perk} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Who is this {perk?.category} account for?</DialogTitle>
            <DialogDescription>
              {perk?.category} is open in a new window. Add the client here, then finish the application there. Finstap
              checks it with {perk?.category}
              {Number(perk?.reward_amount) > 0 ? ` and adds ${formatGBP(perk.reward_amount)} to your balance when it is eligible.` : '.'}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pa-client">Client name *</Label>
              <Input id="pa-client" value={form.client_name} onChange={set('client_name')} placeholder="Sara Khan" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pa-company">Company</Label>
              <Input id="pa-company" value={form.company_name} onChange={set('company_name')} placeholder="EXAMPLE TRADING LTD" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pa-email">Client email</Label>
              <Input id="pa-email" type="email" value={form.client_email} onChange={set('client_email')} placeholder="sara@example.com" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? <IconLoader2 className="size-4 animate-spin" /> : <IconCheck className="size-4" />}
              Add to Applied accounts
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Partner Perks › Applied accounts: what the team applied for through the perks, and the rewards. */
export default function AppliedAccounts({ refreshKey }) {
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async (q) => {
    setIsLoading(true)
    try {
      const res = await apiRequest(`/admin/smart-links/perk-applications?search=${encodeURIComponent(q || '')}`, {
        label: 'Applied accounts',
        silent: true,
      })
      if (!res.ok) {
        toast.error(res.reason || 'Applied accounts failed to load')
        return
      }
      setData(res.data?.data || null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(search), 250)
    return () => clearTimeout(t)
  }, [search, load, refreshKey])

  const s = data?.summary
  const apps = data?.applications || []
  const nextPayout = s?.next_payout
    ? new Date(`${s.next_payout}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    : ''

  return (
    <div className="space-y-4">
      {s && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            ['Rewards earned', formatGBP(s.earned)],
            ['Paid out', formatGBP(s.paid_out)],
            ['Waiting for a check', String(s.pending_checks)],
            ['Next payout', nextPayout],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Finstap checks each account with the partner. An eligible account's reward goes into your balance; on the 5th of
        every month your due services are paid from it first and Finstap pays you the rest of the rewards.
      </p>

      <div className="relative w-full md:max-w-sm">
        <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search client, company or partner…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading && !data ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-4 py-14 text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconClipboardList className="size-6" />
          </div>
          <h3 className="font-semibold">{search.trim() ? 'Nothing found' : 'No applied accounts yet'}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Press Apply on a Finstap perk and add who the account is for. It shows up here until Finstap checks it.
          </p>
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {apps.map((a) => (
            <div key={a.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {a.client_name}
                  {a.company_name ? <span className="font-normal text-muted-foreground"> · {a.company_name}</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.partner} · {day(a.created_at)}{a.applied_by_name ? ` · by ${a.applied_by_name}` : ''}
                  {a.client_email ? ` · ${a.client_email}` : ''}
                </p>
                {a.status === 'Not eligible' && a.reason && <p className="mt-0.5 text-xs text-destructive">{a.reason}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {a.status === 'Eligible' && a.reward_amount ? (
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">+{formatGBP(a.reward_amount)}</span>
                ) : null}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[a.status] || 'bg-muted'}`}>{a.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
