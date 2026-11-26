import { useCallback, useEffect, useState } from 'react'
import { IconBellRinging, IconLoader2, IconMail, IconSend } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/api'

const when = (v) =>
  v ? new Date(String(v).replace(' ', 'T') + (String(v).includes('Z') ? '' : 'Z')).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const PILL = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap'
const tone = (status) => {
  const s = String(status || '').toLowerCase()
  if (['sent', 'accepted'].includes(s)) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (['failed', 'blocked', 'not_configured', 'invalid_recipient'].includes(s)) return 'bg-destructive/10 text-destructive'
  return 'bg-muted text-muted-foreground'
}

function Box({ title, icon: Icon, action, children }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="size-4 text-primary" /> {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Company › Emails & Reminders: the compliance reminders, Offer to Fix offers and every email this company got. */
export default function CompanyComms({ companyId, active }) {
  const [data, setData] = useState(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(() => {
    apiRequest(`/admin/companies/${companyId}/communications`, { label: 'Emails', silent: true }).then((res) =>
      setData(res.ok ? res.data.data : { error: res.data?.error || res.reason || 'Could not load' }),
    )
  }, [companyId])

  useEffect(() => {
    if (active && companyId && data === null) load()
  }, [active, companyId, data, load])

  const sendNow = async () => {
    setSending(true)
    const res = await apiRequest(`/admin/companies/${companyId}/send-reminder`, { method: 'POST', body: {}, label: 'Reminder', silent: true })
    setSending(false)
    if (!res.ok) return toast.error(res.data?.error || res.reason || 'Not sent.')
    toast.success(res.data.message || 'Reminder sent.')
    load()
  }

  if (data === null) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <IconLoader2 className="size-4 animate-spin" /> Loading emails and reminders…
      </p>
    )
  }
  if (data.error) return <p className="py-8 text-sm text-destructive">{data.error}</p>

  const r = data.reminders || {}
  return (
    <div className="space-y-4">
      <Box
        title="Compliance Reminders"
        icon={IconBellRinging}
        action={
          <Button size="sm" onClick={sendNow} disabled={sending || !r.recipient || !(r.issues || []).length}>
            {sending ? <IconLoader2 className="size-4 animate-spin" /> : <IconSend className="size-4" />} Send Reminder Now
          </Button>
        }
      >
        <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Automatic reminders</dt>
            <dd>
              {r.enabled ? `On: every ${r.interval_hours} hours while a problem is open` : 'Off (turn them on in Settings › Compliance)'}
              {r.test_mode ? ' · test mode' : ''}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Sent to</dt>
            <dd className={r.recipient ? '' : 'text-destructive'}>{r.recipient || r.recipient_problem || 'No email'}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs text-muted-foreground">What needs doing now</dt>
            <dd>{(r.issues || []).length ? r.issues.join(' · ') : 'Nothing: Companies House shows no problem.'}</dd>
          </div>
        </dl>
        {(r.history || []).length > 0 && (
          <ul className="mt-4 divide-y border-t text-sm">
            {r.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="text-muted-foreground">{when(h.created_at)}</span>
                  <span className="mx-1.5 text-muted-foreground">·</span>
                  {h.issue_summary || 'Reminder'}
                  {h.recipient ? <span className="text-muted-foreground"> → {h.recipient}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  {h.engagement && <span className="text-xs text-muted-foreground">{h.engagement}</span>}
                  <span className={`${PILL} ${tone(h.status)}`} title={h.blocked_reason || ''}>
                    {String(h.status || '').toLowerCase() === 'blocked' ? `Not sent: ${h.blocked_reason || ''}` : h.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Box>

      {Array.isArray(data.offers) && (
        <Box title="Offers (Offer to Fix)" icon={IconSend}>
          {data.offers.length ? (
            <ul className="divide-y text-sm">
              {data.offers.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{o.service_name}</span>
                    <span className="text-muted-foreground">
                      {' '}· {o.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} · {when(o.sent_at)}
                      {Number(o.followups) > 0 ? ` · ${o.followups} reminder${o.followups > 1 ? 's' : ''} sent` : ''}
                    </span>
                  </span>
                  <span className={`${PILL} ${tone(o.accepted_at ? 'accepted' : o.status)}`}>
                    {o.accepted_at ? 'Accepted · order created' : o.opened_at ? 'Opened' : o.status === 'failed' ? 'Failed' : 'Sent'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No offers yet. Send one with Offer to Fix in Companies › Attention.</p>
          )}
        </Box>
      )}

      <Box
        title="Emails"
        icon={IconMail}
        action={
          <a href="/admin/email-log" className="text-xs text-primary underline-offset-2 hover:underline">
            Open Email Log
          </a>
        }
      >
        {(data.emails || []).length ? (
          <ul className="divide-y text-sm">
            {data.emails.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{e.subject}</span>
                  <span className="block text-xs text-muted-foreground">
                    {when(e.sent_at || e.created_at)} · {e.recipient}
                    {e.category ? ` · ${String(e.category).toLowerCase()}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  {Number(e.click_count) > 0 ? (
                    <span className={`${PILL} bg-emerald-500/10 text-emerald-700 dark:text-emerald-300`} title={`First click ${when(e.clicked_at)}`}>Clicked</span>
                  ) : Number(e.open_count) > 0 ? (
                    <span className={`${PILL} bg-sky-500/10 text-sky-700 dark:text-sky-300`} title={`First opened ${when(e.opened_at)}`}>Opened</span>
                  ) : Number(e.tracked) && e.status === 'sent' ? (
                    <span className={`${PILL} bg-muted text-muted-foreground`}>Not opened</span>
                  ) : null}
                  <span className={`${PILL} ${tone(e.status)}`} title={e.last_error || ''}>
                    {String(e.status || '').replace('_', ' ')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No emails to this company yet.</p>
        )}
      </Box>
    </div>
  )
}
