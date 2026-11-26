import { useEffect, useState } from 'react'
import { IconAlertTriangle, IconBrandWhatsapp, IconLoader2, IconMail, IconSend } from '@tabler/icons-react'
import { cn } from 'cn'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiRequest } from '@/lib/api'
import { offerStatusLine } from './attention'

const money = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(v || 0))

const SELECT =
  'h-9 w-full rounded-[10px] border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

const STATUS_TEXT = { sent: 'Sent', opened: 'Opened by the client', accepted: 'Accepted: order created', failed: 'Not sent' }

/**
 * Companies › Attention › Offer to Fix: pick the service that fixes the problem and send the client an offer by
 * email or WhatsApp. The client's link has a "Yes, Please Go Ahead" button that creates the order
 * (backend services/attention_offers.py).
 */
export default function OfferDialog({ company, onClose, onSent }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ service_id: '', channel: 'email', message: '', email: '', phone: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    apiRequest(`/admin/companies/${company.id}/offer`, { label: 'Offer', silent: true }).then((res) => {
      if (!alive) return
      if (!res.ok) return setError(res.reason || 'Could not load the offer.')
      const d = res.data.data
      setData(d)
      setForm({
        service_id: d.suggested_service_id ? String(d.suggested_service_id) : '',
        channel: d.client.email ? 'email' : d.client.whatsapp_ready ? 'whatsapp' : 'email',
        message: d.message,
        email: d.client.email,
        phone: d.client.phone,
      })
    })
    return () => {
      alive = false
    }
  }, [company.id])

  const service = data?.services.find((s) => String(s.id) === String(form.service_id))
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  // A different service: the price in the ready message follows it (only while the message is still the ready one)
  const pickService = (e) => {
    const next = data.services.find((s) => String(s.id) === e.target.value)
    let message = form.message
    const old = data.services.find((s) => String(s.id) === String(form.service_id))
    if (old && next && message.includes(old.name)) {
      const priced = (s) => (Number(s.price) > 0 ? `${s.name} for ${money(s.price)}${Number(s.vat_rate) > 0 ? ' + VAT' : ''}` : s.name)
      message = message.replace(priced(old), priced(next)).replace(old.name, next.name)
    }
    setForm({ ...form, service_id: e.target.value, message })
  }

  const send = async () => {
    setBusy(true)
    const res = await apiRequest(`/admin/companies/${company.id}/offer`, { method: 'POST', body: form, label: 'Offer', silent: true })
    setBusy(false)
    if (!res.ok) return toast.error(res.data?.error || res.reason || 'The offer was not sent.')
    const out = res.data.data
    if (out.whatsapp_url) window.open(out.whatsapp_url, '_blank', 'noopener')
    toast.success(res.data.message || 'Offer sent.')
    onSent?.(out.offer)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Offer to Fix</DialogTitle>
          <DialogDescription>
            {company.name} · the client gets a &quot;Yes, Please Go Ahead&quot; button that creates the order for you.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !data ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : (
          <div className="space-y-4">
            {data.issues.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {data.issues.map((i) => (
                  <span key={i.code} className="inline-flex items-center gap-1 rounded-lg bg-destructive/[0.07] px-2 py-1 text-xs font-medium text-destructive">
                    <IconAlertTriangle className="size-3.5" /> {i.title}
                    {i.detail?.startsWith('Due ') ? ` · ${i.detail}` : ''}
                  </span>
                ))}
              </div>
            )}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Service That Fixes It</span>
              <select className={SELECT} value={form.service_id} onChange={pickService}>
                <option value="">Pick a service…</option>
                {data.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {Number(s.price) > 0 ? ` · ${money(s.price)}` : ''}
                  </option>
                ))}
              </select>
              {!data.services.length && <span className="block text-xs text-muted-foreground">Add your services in Services first.</span>}
              {service && Number(service.price) <= 0 && (
                <span className="block text-xs text-muted-foreground">This service has no price yet, so the offer will not mention one.</span>
              )}
            </label>

            <div className="grid grid-cols-2 gap-2">
              {[
                ['email', IconMail, 'Email', true],
                ['whatsapp', IconBrandWhatsapp, 'WhatsApp', true],
              ].map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm({ ...form, channel: value })}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                    form.channel === value ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
            {form.channel === 'email' ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Client Email</span>
                <Input type="email" value={form.email} onChange={set('email')} placeholder="client@example.com" />
                {data.mailbox_ready === false && (
                  <span className="block rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                    Emails are switched off. Turn them on in{' '}
                    <a href="/admin/settings?tab=email" className="font-semibold underline">
                      Settings › Email
                    </a>{' '}
                    first, or send this one by WhatsApp.
                  </span>
                )}
              </label>
            ) : (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Client Mobile (With Country Code)</span>
                <Input value={form.phone} onChange={set('phone')} placeholder="+44 7700 900123" />
                <span className="block text-xs text-muted-foreground">WhatsApp opens with the message ready; you press send there.</span>
              </label>
            )}

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Message</span>
              <Textarea rows={6} value={form.message} onChange={set('message')} />
              <span className="block text-xs text-muted-foreground">
                The private link (and, in emails, the button) is added below your message.
              </span>
            </label>

            {data.last_offer && (
              <p className="text-xs text-muted-foreground">
                Last offer: {STATUS_TEXT[data.last_offer.status] || data.last_offer.status} · {offerStatusLine(data.last_offer)}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={send} disabled={busy || !data || !form.service_id || (form.channel === 'email' && data.mailbox_ready === false)}>
            {busy ? <IconLoader2 className="size-4 animate-spin" /> : form.channel === 'whatsapp' ? <IconBrandWhatsapp className="size-4" /> : <IconSend className="size-4" />}
            {form.channel === 'whatsapp' ? 'Open WhatsApp' : 'Send Offer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
