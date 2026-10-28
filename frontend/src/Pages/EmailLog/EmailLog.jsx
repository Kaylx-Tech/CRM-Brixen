import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from '../../Layout/DataTable'
import { IconEye, IconSend, IconLoader2, IconMailCheck, IconMailX, IconMailPause } from '@tabler/icons-react'
import { SectionCards } from '../../Layout/StatsCard'
import { apiRequest } from '@/lib/api'
import { PlanLocked } from '@/components/PlanLocked'
import { isPlanLocked } from '@/lib/planLock'
import { toastProcessing, toastDone, toastFail } from '@/lib/toastActions'
import { OverflowTooltip } from '@/components/OverflowTooltip'
import { useRefreshOnReturn } from "@/lib/useRefreshOnReturn"

const columnHelper = createColumnHelper()

const STATUS = {
  sent: { label: 'Sent', className: 'badge-green' },
  failed: { label: 'Failed', className: 'badge-red' },
  not_configured: { label: 'SMTP not set', className: 'badge-amber' },
  invalid_recipient: { label: 'No address', className: 'badge-amber' },
  suppressed: { label: 'Suppressed (emails off)', className: 'badge-amber' },
  queued: { label: 'Queued (old portal)', className: 'bg-muted text-muted-foreground' },
}

const CATEGORY_LABELS = {
  ORDER: 'Order',
  DOCUMENT: 'Document',
  CUSTOMER_UPLOAD: 'Customer upload',
  INVOICE: 'Invoice',
  KYC: 'KYC / PSC',
  COMPLIANCE: 'Compliance',
  SECURITY: 'Password reset',
  SUPPORT: 'Support reply',
  STAFF: 'Team',
}

function formatWhen(value) {
  if (!value) return '—'
  const raw = String(value)
  const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z')
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function StatusBadge({ status, error }) {
  const meta = STATUS[status] || { label: status || '—', className: 'bg-muted text-muted-foreground' }
  return (
    <Badge className={`${meta.className} text-[11px]`} title={error || undefined}>
      {meta.label}
    </Badge>
  )
}

/** Preview of one logged email (rendered in a sandboxed frame) with its delivery details. */
function EmailPreview({ emailId, onClose, onResend }) {
  const [email, setEmail] = useState(null)

  useEffect(() => {
    if (!emailId) return
    let cancelled = false
    setEmail(null)
    apiRequest(`/admin/email-logs/${emailId}`, { silent: true, label: 'Email' }).then((res) => {
      if (!cancelled) setEmail(res.ok ? res.data?.data || null : { error: res.reason || 'Could not load the email' })
    })
    return () => {
      cancelled = true
    }
  }, [emailId])

  return (
    <Dialog open={!!emailId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{email?.subject || 'Email'}</DialogTitle>
          <DialogDescription>
            {email?.recipient ? `To ${email.recipient} · ${formatWhen(email.created_at)}` : 'Loading…'}
          </DialogDescription>
        </DialogHeader>
        {!email ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : email.error ? (
          <p className="text-sm text-destructive">{email.error}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge status={email.status} error={email.last_error} />
              <span className="text-muted-foreground">
                {CATEGORY_LABELS[email.category] || email.category || 'Email'}
                {email.order_number ? ` · Order ${email.order_number}` : ''}
                {email.company_name ? ` · ${email.company_name}` : ''}
                {email.triggered_by_name ? ` · by ${email.triggered_by_name}` : ''}
                {Number(email.attempts) > 1 ? ` · ${email.attempts} attempts` : ''}
              </span>
            </div>
            {email.last_error && email.status !== 'sent' ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {email.last_error}
              </p>
            ) : null}
            {email.body_html ? (
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={email.body_html}
                className="h-[55vh] w-full rounded-xl border bg-white"
              />
            ) : email.body_text ? (
              <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/30 p-3 text-sm">
                {email.body_text}
              </pre>
            ) : (
              <p className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                The content of this email is not stored (for example a password reset link).
              </p>
            )}
            {Number(email.resendable) ? (
              <div className="flex justify-end">
                <Button onClick={() => onResend(email)}>
                  <IconSend /> Send again
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function EmailLog() {
  const [emails, setEmails] = useState([])
  const [counts, setCounts] = useState({})
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [planLocked, setPlanLocked] = useState(null)
  const [previewId, setPreviewId] = useState(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    setPlanLocked(null)
    try {
      const res = await apiRequest('/admin/email-logs?limit=200', { label: 'Email log', silent: true })
      if (!res.ok) {
        setEmails([])
        // Not in the workspace's plan: an upgrade card instead of an error, zero counts and an empty table
        if (isPlanLocked(res)) setPlanLocked(res.reason)
        else setLoadError(res.reason)
        return
      }
      const d = res.data?.data || {}
      setEmails(
        (d.emails || []).map((e) => ({
          ...e,
          when: formatWhen(e.created_at),
          categoryLabel: CATEGORY_LABELS[e.category] || e.category || '—',
        }))
      )
      setCounts(d.counts || {})
      setTotal(d.pagination?.total ?? (d.emails || []).length)
    } finally {
      setIsLoading(false)
    }
  }, [])
  useRefreshOnReturn(load)

  useEffect(() => {
    load()
  }, [load])

  const resend = useCallback(
    async (email) => {
      const toastId = toastProcessing(`Sending again to ${email.recipient}…`)
      const res = await apiRequest(`/admin/email-logs/${email.id}/resend`, { method: 'POST', silent: true, label: 'Resend' })
      if (res.ok) toastDone(toastId, 'Email sent')
      else toastFail(toastId, res.reason || 'Not sent')
      setPreviewId(null)
      load()
    },
    [load]
  )

  const columns = useMemo(
    () => [
      columnHelper.accessor('when', {
        header: 'When',
        cell: ({ row }) => <span className="text-sm text-muted-foreground whitespace-nowrap">{row.getValue('when')}</span>,
      }),
      columnHelper.accessor('recipient', {
        header: 'To',
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5 min-w-0 max-w-[220px]">
            <OverflowTooltip text={row.getValue('recipient')} className="text-sm font-medium text-foreground" />
            {row.original.client_name ? (
              <OverflowTooltip text={row.original.client_name} className="text-[11px] text-muted-foreground" />
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor('subject', {
        header: 'Subject',
        cell: ({ row }) => (
          <button
            type="button"
            className="flex max-w-[360px] cursor-pointer flex-col gap-0.5 text-left"
            onClick={() => setPreviewId(row.original.id)}
          >
            <OverflowTooltip text={row.getValue('subject')} className="text-sm text-foreground hover:underline" />
            {row.original.order_number || row.original.company_name ? (
              <span className="text-[11px] text-muted-foreground">
                {[row.original.order_number, row.original.company_name].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </button>
        ),
      }),
      columnHelper.accessor('categoryLabel', {
        header: 'Type',
        cell: ({ row }) => <Badge className="badge-sky text-[11px]">{row.getValue('categoryLabel')}</Badge>,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.getValue('status')} error={row.original.last_error} />,
      }),
      columnHelper.accessor('triggered_by_name', {
        header: 'Triggered by',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.getValue('triggered_by_name') || 'System'}</span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="View email" onClick={() => setPreviewId(row.original.id)}>
              <IconEye />
            </Button>
            {Number(row.original.resendable) && row.original.status !== 'sent' ? (
              <Button variant="ghost" size="icon-sm" aria-label="Send again" onClick={() => resend(row.original)}>
                <IconSend />
              </Button>
            ) : null}
          </div>
        ),
      }),
    ],
    [resend]
  )

  const filterConfig = useMemo(() => {
    const cats = [...new Set(emails.map((e) => e.categoryLabel).filter((c) => c && c !== '—'))].sort()
    return [
      {
        columnKey: 'status',
        placeholder: 'Status',
        options: Object.entries(STATUS).map(([value, meta]) => ({ label: meta.label, value })),
      },
      {
        columnKey: 'categoryLabel',
        placeholder: 'Type',
        options: cats.map((c) => ({ label: c, value: c })),
      },
    ]
  }, [emails])

  const failed = (counts.failed || 0) + (counts.not_configured || 0) + (counts.invalid_recipient || 0)

  return (
    <div className="flex flex-col gap-4 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Email Log</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Every email the CRM sent or tried to send · {total} email{total === 1 ? '' : 's'}
            {' · '}
            <span className="text-emerald-600">{counts.sent || 0} sent</span>
            {failed ? <span className="text-destructive"> · {failed} not delivered</span> : null}
            {counts.suppressed ? <span className="text-amber-600"> · {counts.suppressed} held (emails off)</span> : null}
          </p>
        </div>
      </div>

      {planLocked ? (
        <PlanLocked message={planLocked} />
      ) : (
        <>
          <SectionCards
            compact
            isLoading={isLoading && total === 0}
            stats={[
              { title: 'Total Emails', hero: true, value: String(total), footerSubText: 'Sent or attempted' },
              { title: 'Delivered', tone: 'emerald', icon: IconMailCheck, value: String(counts.sent || 0), footerSubText: total ? `${Math.round(((counts.sent || 0) / total) * 100)}% of all emails` : 'Nothing yet' },
              { title: 'Not Delivered', tone: 'rose', icon: IconMailX, value: String(failed), footerSubText: 'Failed, bad address or no SMTP' },
              { title: 'Held (emails off)', tone: 'amber', icon: IconMailPause, value: String(counts.suppressed || 0), footerSubText: 'Send emails is switched off' },
            ]}
          />

          {loadError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
              {loadError}
            </div>
          )}

          <DataTable
            hideOnSmallerScreens={['triggered_by_name']}
            columns={columns}
            data={emails}
            filterConfig={filterConfig}
            isLoading={isLoading}
            searchPlaceholder="Search address, subject, customer…"
          />
        </>
      )}

      <EmailPreview emailId={previewId} onClose={() => setPreviewId(null)} onResend={resend} />
    </div>
  )
}
