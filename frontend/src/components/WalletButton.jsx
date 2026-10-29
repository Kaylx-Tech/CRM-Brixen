import { useCallback, useEffect, useState } from 'react'
import { IconBuildingBank, IconCopy, IconCreditCard, IconLoader2, IconWallet } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiRequest } from '@/lib/api'

const money = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(v || 0))

function shortDate(value) {
  const d = new Date(String(value || '').replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * Finstap header (workspace admins): the workspace's balance with Finstap. Services (ID checks, registered
 * offices) are paid from it by themselves; top it up by bank transfer, or pay what is due by card.
 */
export default function WalletButton() {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)
  const [paying, setPaying] = useState(false)

  const load = useCallback(async () => {
    const res = await apiRequest('/admin/billing/wallet', { silent: true })
    if (res.ok) setData(res.data?.data || null)
  }, [])

  useEffect(() => {
    let alive = true
    apiRequest('/admin/billing/wallet', { silent: true }).then((res) => alive && res.ok && setData(res.data?.data || null))
    return () => {
      alive = false
    }
  }, [])

  if (!data) return null
  const due = Number(data.due?.total || 0)
  const short = due > data.balance + 0.004

  const payByCard = async () => {
    setPaying(true)
    const res = await apiRequest('/admin/billing/services', { method: 'POST', silent: true })
    const url = res.data?.data?.url
    if (!res.ok || !url) {
      setPaying(false)
      toast.error(res.reason || 'Card payment could not start')
      return
    }
    window.location.assign(url)
  }

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="relative h-7 gap-1.5 px-2 text-xs font-semibold tabular-nums"
        onClick={() => {
          setOpen(true)
          load()
        }}
        aria-label={`Balance ${money(data.balance)}`}
      >
        <IconWallet className="size-4 text-primary" />
        <span className="hidden sm:inline">{money(data.balance)}</span>
        {short && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive" aria-hidden />}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Balance</DialogTitle>
            <DialogDescription>
              ID checks and registered offices are paid from your balance by themselves. Your plan is paid as before.
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
            <Button onClick={payByCard} disabled={paying} className="w-full">
              {paying ? <IconLoader2 className="size-4 animate-spin" /> : <IconCreditCard className="size-4" />}
              Pay {money(due)} online by card
            </Button>
          )}

          <div className="space-y-2 rounded-xl border p-3 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <IconBuildingBank className="size-4 text-primary" /> Top up by bank transfer
            </p>
            {data.bank_details ? (
              <p className="whitespace-pre-line text-muted-foreground">{data.bank_details}</p>
            ) : (
              <p className="text-muted-foreground">Ask Finstap for the bank details.</p>
            )}
            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2 py-1.5">
              <span className="text-xs text-muted-foreground">
                Reference <span className="font-semibold text-foreground">{data.reference}</span>
              </span>
              <Button variant="ghost" size="xs" className="h-6 gap-1" onClick={() => copy(data.reference)}>
                <IconCopy className="size-3.5" /> Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Your balance goes up when Finstap receives the transfer.</p>
          </div>

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
