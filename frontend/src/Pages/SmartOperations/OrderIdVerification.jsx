import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconCopy, IconExternalLink, IconId, IconLoader2, IconMail, IconRefresh } from '@tabler/icons-react'
import { toast } from 'sonner'
import { apiRequest } from '@/lib/api'
import { amlLabel, amlTone, checkTone, shortDate } from './idvStatus'

// ID verification on the order view: shown for KYC orders only, with each person's Didit status
export default function OrderIdVerification({ orderId }) {
  const [data, setData] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    if (!orderId) return
    const res = await apiRequest(`/admin/id-verification/orders/${orderId}`, { label: 'ID verification', silent: true })
    if (res.ok) setData(res.data?.data || null)
  }, [orderId])

  useEffect(() => {
    load()
  }, [load])

  const run = async (person, action) => {
    setBusyId(person.id)
    try {
      const res = await apiRequest(`/admin/id-verification/${person.id}/${action}`, { method: 'POST', label: 'ID verification', silent: true })
      if (!res.ok) {
        toast.error(res.reason || 'Something went wrong')
        return
      }
      toast.success(res.data?.message || 'Done')
      load()
    } finally {
      setBusyId(null)
    }
  }

  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  if (!data?.is_kyc) return null
  const people = data.people || []

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconId className="size-4 text-primary" />
          <h4 className="text-sm font-bold">Identity verification</h4>
        </div>
        <Button variant="ghost" size="xs" className="h-7 gap-1 text-muted-foreground" nativeButton={false} render={<Link to="/admin/smart-operations" />}>
          Open in ID Verification
          <IconExternalLink className="size-3.5" />
        </Button>
      </div>

      {people.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {data.didit_configured
            ? 'Not started yet. Add the directors and PSCs in Smart Operations › ID Verification.'
            : 'Didit is not connected yet (Settings › Integrations).'}
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {people.map((p) => (
            <div key={p.id} className="flex flex-col gap-1.5 rounded-md bg-muted/30 p-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.full_name}
                  {p.person_role ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{p.person_role}</span> : null}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge className={checkTone(p.status)}>{p.status || 'Not Started'}</Badge>
                  {p.result?.poa && <Badge className={checkTone(p.result.poa.status)}>Address: {p.result.poa.status}</Badge>}
                  {p.result?.aml && <Badge className={amlTone(p.result.aml)}>AML: {amlLabel(p.result.aml)}</Badge>}
                  {p.ch_personal_code && <Badge variant="outline" className="font-mono">CH {p.ch_personal_code}</Badge>}
                </div>
                {p.link_sent_at && <p className="mt-0.5 text-xs text-muted-foreground">Link emailed {shortDate(p.link_sent_at)}</p>}
              </div>
              {p.session_url && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="xs" className="h-7 gap-1" onClick={() => copy(p.session_url)}>
                    <IconCopy className="size-3.5" />
                    Link
                  </Button>
                  <Button variant="outline" size="xs" className="h-7 gap-1" disabled={busyId === p.id || !p.email} onClick={() => run(p, 'email')}>
                    <IconMail className="size-3.5" />
                    Email
                  </Button>
                  <Button variant="ghost" size="xs" className="h-7 w-7 p-0 text-muted-foreground" title="Get the latest result from Didit" disabled={busyId === p.id} onClick={() => run(p, 'refresh')}>
                    {busyId === p.id ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconRefresh className="size-3.5" />}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
