import { useCallback, useEffect, useState } from 'react'
import { IconBuildingBank, IconCopy, IconCreditCard, IconLoader2, IconPlus, IconWallet } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiRequest } from '@/lib/api'

const money = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(v || 0))

const TRANSFER_TONE = {
  Pending: 'text-amber-700 dark:text-amber-300',
  Approved: 'text-emerald-600',
  Rejected: 'text-destructive',
}

function shortDate(value) {
  const d = new Date(String(value || '').replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * Finstap header (workspace admins): the workspace's balance with Finstap. Services (each ID check, registered
 * offices) are paid from it by themselves, and the plan can be paid from it in Billing. Add balance online by
 * card, or by bank transfer (Finstap approves it when the money arrives); what is due can also be paid by card.
 * variant="card" shows it as a box with the balance and an "Add balance" button (the Billing page).
 */
export default function WalletButton({ variant = 'button', onChange }) {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')

  const load = useCallback(async () => {
    const res = await apiRequest('/admin/billing/wallet', { silent: true })
    if (res.ok) setData(res.data?.data || null)
  }, [])

  useEffect(() => {
    let alive = true
    apiRequest('/admin/billing/wallet', { silent: true }).then((res) => alive && res.ok && setData(res.data?.data || null))
    // Back from a card top-up on Stripe: Stripe tells Finstap a moment later
    const params = new URLSearchParams(window.location.search)
    if (params.get('topup')) {
      toast.success('Card payment received', { description: 'Your balance goes up in a moment.' })
      params.delete('topup')
      const rest = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)
    }
    return () => {
      alive = false
    }
  }, [])

  if (!data) return null
  const due = Number(data.due?.total || 0)
  const short = due > data.balance + 0.004
  const min = data.min_top_up || 10
  const max = data.max_top_up || 1000
  const value = Number(String(amount).replace(/[£,\s]/g, ''))
  const amountOk = value >= min && value <= max

  const toStripe = async (path, body, failText) => {
    setBusy(path)
    const res = await apiRequest(path, { method: 'POST', body, silent: true })
    const url = res.data?.data?.url
    if (!res.ok || !url) {
      setBusy('')
      toast.error(res.reason || failText)
      return
    }
    window.location.assign(url)
  }

  const sentTransfer = async () => {
    setBusy('transfer')
    const res = await apiRequest('/admin/billing/wallet/transfer', {
      method: 'POST',
      body: { amount: value, reference: reference || data.reference },
      silent: true,
    })
    setBusy('')
    if (!res.ok) {
      toast.error(res.reason || 'Could not send it to Finstap')
      return
    }
    toast.success(res.data?.message || 'Sent to Finstap')
    setAmount('')
    setReference('')
    load()
    onChange?.()
  }

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  const openDialog = () => {
    setOpen(true)
    load()
  }

  return (
    <>
      {variant === 'card' ? (
        <section className="rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Balance</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Each ID check, registered offices and your plan are paid from your balance.
              </p>
            </div>
            <Button onClick={openDialog}>
              <IconPlus className="size-4" /> Add balance
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Balance</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{money(data.balance)}</div>
            </div>
            <div className={`rounded-lg border p-3 ${short ? 'border-destructive/40 bg-destructive/5' : ''}`}>
              <div className="text-xs text-muted-foreground">Due for services</div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums ${short ? 'text-destructive' : ''}`}>{money(due)}</div>
            </div>
          </div>
          {data.entries?.length > 0 && (
            <button type="button" className="mt-3 text-sm font-medium text-primary hover:underline" onClick={openDialog}>
              See recent payments and top-ups
            </button>
          )}
        </section>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="relative h-7 gap-1.5 px-2 text-xs font-semibold tabular-nums"
          onClick={openDialog}
          aria-label={`Balance ${money(data.balance)}`}
        >
          <IconWallet className="size-4 text-primary" />
          <span className="hidden sm:inline">{money(data.balance)}</span>
          {short && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive" aria-hidden />}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Balance</DialogTitle>
            <DialogDescription>
              Each ID check and registered offices are paid from your balance by themselves. You can pay your plan
              from it in Billing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className="text-xl font-bold tabular-nums">{money(data.balance)}</p>
            </div>
            <div className={`rounded-xl border p-3 ${short ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/40'}`}>
              <p className="text-xs text-muted-foreground">Due for services</p>
              <p className={`text-xl font-bold tabular-nums ${short ? 'text-destructive' : ''}`}>{money(due)}</p>
            </div>
          </div>

          {data.due?.items?.length > 0 && (
            <ul className="max-h-32 space-y-1 overflow-y-auto text-sm">
              {data.due.items.map((i) => (
                <li key={i.ref} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-muted-foreground">{i.label}</span>
                  <span className="shrink-0 tabular-nums">{money(i.amount)}</span>
                </li>
              ))}
            </ul>
          )}

          {due > 0 && data.card && (
            <Button
              variant="outline"
              onClick={() => toStripe('/admin/billing/services', undefined, 'Card payment could not start')}
              disabled={!!busy}
              className="w-full"
            >
              {busy === '/admin/billing/services' ? <IconLoader2 className="size-4 animate-spin" /> : <IconCreditCard className="size-4" />}
              Pay {money(due)} now by card
            </Button>
          )}

          {/* Add balance: online by card, or a bank transfer Finstap approves when it arrives */}
          <div className="space-y-3 rounded-xl border p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <IconPlus className="size-4 text-primary" /> Add balance
            </p>
            <Input
              inputMode="decimal"
              placeholder={`Amount, £${min} to £${max.toLocaleString('en-GB')}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Amount to add"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {data.card && (
                <Button
                  disabled={!amountOk || !!busy}
                  onClick={() => toStripe('/admin/billing/wallet/card', { amount: value }, 'Card payment could not start')}
                >
                  {busy === '/admin/billing/wallet/card' ? <IconLoader2 className="size-4 animate-spin" /> : <IconCreditCard className="size-4" />}
                  Pay by card
                </Button>
              )}
              <Button variant="outline" disabled={!amountOk || !!busy} onClick={sentTransfer} className={data.card ? '' : 'sm:col-span-2'}>
                {busy === 'transfer' ? <IconLoader2 className="size-4 animate-spin" /> : <IconBuildingBank className="size-4" />}
                I sent a bank transfer
              </Button>
            </div>
            <div className="space-y-2 rounded-lg bg-muted/50 p-2.5">
              <p className="text-xs font-medium">Bank transfer to Finstap</p>
              {data.bank_details ? (
                <p className="whitespace-pre-line text-xs text-muted-foreground">{data.bank_details}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Ask Finstap for the bank details.</p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Reference <span className="font-semibold text-foreground">{data.reference}</span>
                </span>
                <Button variant="ghost" size="xs" className="h-6 gap-1" onClick={() => copy(data.reference)}>
                  <IconCopy className="size-3.5" /> Copy
                </Button>
              </div>
              <Input
                className="h-8 text-xs"
                placeholder="Your transfer reference (optional)"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                After you send it, press “I sent a bank transfer”. Finstap checks it and your balance goes up.
              </p>
            </div>
          </div>

          {data.transfers?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bank transfers</p>
              <ul className="max-h-28 space-y-1 overflow-y-auto text-sm">
                {data.transfers.map((t) => (
                  <li key={t.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground">{shortDate(t.created_at)}</span> {money(t.approved_amount ?? t.amount)}
                      {t.status === 'Rejected' && t.reason ? <span className="text-muted-foreground"> · {t.reason}</span> : null}
                    </span>
                    <span className={`shrink-0 text-xs font-semibold ${TRANSFER_TONE[t.status] || ''}`}>
                      {t.status === 'Pending' ? 'Waiting for Finstap' : t.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.entries?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent</p>
              <ul className="max-h-36 space-y-1 overflow-y-auto text-sm">
                {data.entries.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground">{shortDate(e.created_at)}</span> {e.note || e.kind}
                    </span>
                    <span className={`shrink-0 tabular-nums ${e.amount < 0 ? '' : 'text-emerald-600'}`}>
                      {e.amount < 0 ? '−' : '+'}
                      {money(Math.abs(e.amount))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
