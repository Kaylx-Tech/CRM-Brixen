import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconAlertTriangle, IconCopy, IconEye, IconId, IconRefresh, IconSearch, IconSend } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiRequest } from '@/lib/api'
import { SectionCards } from '../../Layout/StatsCard'
import KycCheckView from './KycCheckView'

// How a check's status reads to the team (the KYC team at Finstap sets Approved / In Review / Declined)
function statusLabel(status) {
  if (status === 'Approved') return ['Approved', 'badge-green']
  if (status === 'Declined') return ['Rejected, new link sent', 'bg-destructive/15 text-destructive']
  // The client sent everything: Finstap's KYC team is checking it
  if (status === 'In Review' || status === 'Submitted') return ['In review', 'badge-amber']
  if (status === 'In Progress') return ['Filling the form', 'badge-sky']
  return ['Waiting for client', 'bg-muted text-muted-foreground']
}

// Which tab a check sits under
function bucket(status) {
  if (status === 'Approved') return 'approved'
  if (status === 'Declined') return 'rejected'
  if (status === 'In Review' || status === 'Submitted') return 'review'
  return 'waiting'
}

const TAB = 'text-sm rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
const ORDER_CHIP = 'inline-flex h-6 items-center whitespace-nowrap rounded-md bg-sky-500/10 px-2 text-xs font-semibold tabular-nums tracking-wide text-sky-700 dark:text-sky-300'

function shortDate(value) {
  if (!value) return '—'
  const d = new Date(String(value).replace(' ', 'T') + (String(value).length > 10 ? 'Z' : ''))
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Could not copy')
  }
}

/**
 * KYC: Brixen's identity checks, run on Finstap. The KYC link to send to any client (they verify on
 * portal.brixenconsultants.com), and the record of every check with the status Finstap's KYC team set.
 */
export default function KycRecords() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewing, setViewing] = useState(null) // the check whose details and documents are open
  const [tab, setTab] = useState('all')
  const [starting, setStarting] = useState(0)

  const ignoreOrder = async (order) => {
    const res = await apiRequest('/admin/kyc/ignore', { method: 'POST', body: { order_id: order.id }, label: 'KYC', silent: true })
    if (res.ok) {
      toast.success(res.data?.message || 'Removed from the list')
      load()
    } else {
      toast.error(res.reason || 'Could not remove it')
    }
  }

  // A KYC order that has no check yet (made while Finstap was off): start it and email the link now
  const startOrder = async (order) => {
    setStarting(order.id)
    const res = await apiRequest('/admin/kyc/start', { method: 'POST', body: { order_id: order.id }, label: 'KYC', silent: true })
    setStarting(0)
    if (res.ok) {
      toast.success(res.data?.message || 'KYC link sent')
      load()
    } else {
      toast.error(res.reason || 'Could not start the check')
    }
  }

  const load = useCallback(() => {
    apiRequest('/admin/kyc', { label: 'KYC', silent: true }).then((res) => {
      setLoading(false)
      if (res.ok) {
        setData(res.data?.data || null)
        setError('')
      } else {
        setError(res.reason || 'KYC could not be loaded')
      }
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const checks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.checks || []).filter((c) =>
      (tab === 'all' || bucket(c.status) === tab) &&
      (!q || [c.full_name, c.email, c.phone, c.order_number].some((v) => String(v || '').toLowerCase().includes(q))))
  }, [data, search, tab])

  const stats = useMemo(() => {
    const all = data?.checks || []
    const count = (b) => all.filter((c) => bucket(c.status) === b).length
    return [
      { title: 'KYC checks', value: String(all.length), footerSubText: 'Sent to Finstap', icon: IconId },
      { title: 'Waiting for client', tone: 'sky', value: String(count('waiting')), footerSubText: 'Link sent, form not sent yet' },
      { title: 'In review', tone: 'amber', value: String(count('review')), footerSubText: "Finstap's KYC team is checking" },
      { title: 'Approved', tone: 'emerald', value: String(count('approved')), footerSubText: `${count('rejected')} rejected` },
    ]
  }, [data])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">KYC Verification</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Identity checks for your clients. Send them the KYC link; Finstap's KYC team checks what they send.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true)
            load()
          }}
          disabled={loading}
          className="gap-1.5"
        >
          <IconRefresh className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
        </div>
      )}

      {data && !data.configured && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          KYC is not connected yet. Set FINSTAP_KYC_KEY (and FINSTAP_KYC_WORKSPACE) on the Brixen backend, with the key
          made in admin.finstap.com → KYC → KYC for another website.
        </div>
      )}

      {data?.configured && <SectionCards stats={stats} isLoading={loading} compact />}

      {data?.missing_orders?.length > 0 && (
        <Card className="gap-0 border-amber-500/30 p-4">
          <p className="text-sm font-semibold">KYC orders without a check ({data.missing_orders.length})</p>
          <p className="text-xs text-muted-foreground">
            Open orders with the KYC product but no check on Finstap yet (completed and cancelled orders are left
            out). Send the link to start one, or Ignore it if the client is already verified.
          </p>
          <ul className="mt-3 divide-y text-sm">
            {data.missing_orders.map((o) => (
              <li key={o.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${o.newer_order || o.verified ? 'opacity-70' : ''}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className={ORDER_CHIP}>{o.order_number}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium">{o.client_name || '—'}</span>
                      <Badge className="bg-muted text-muted-foreground">{o.status}</Badge>
                      {o.b2b && <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300">B2B</Badge>}
                      {o.verified === 'ch_code' && <Badge className="badge-green">Already verified · CH code</Badge>}
                      {o.verified === 'approved' && <Badge className="badge-green">Already verified · earlier check</Badge>}
                      {o.newer_order && <Badge className="badge-amber">Same client as {o.newer_order}</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{o.email || 'No email'} · {shortDate(o.created_at)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => ignoreOrder(o)}>
                    Ignore
                  </Button>
                  <Button
                    size="sm"
                    variant={o.newer_order || o.verified ? 'outline' : 'default'}
                    className="gap-1.5"
                    disabled={starting === o.id}
                    onClick={() => startOrder(o)}
                  >
                    <IconSend className="size-3.5" /> Send KYC link
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data?.link && (
        <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Your KYC link</p>
            <p className="text-xs text-muted-foreground">Send it to any client: they verify their identity on your portal.</p>
            <p className="mt-1 truncate font-mono text-xs" title={data.link}>{data.link}</p>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => copyText(data.link, 'KYC link')}>
            <IconCopy className="size-3.5" /> Copy link
          </Button>
        </Card>
      )}
      {data?.configured && !data.link && (
        <p className="text-sm text-muted-foreground">The KYC service is off for Brixen's workspace on Finstap.</p>
      )}

      {data?.configured && (
        <Card className="p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <TabsTrigger value="all" className={TAB}>All</TabsTrigger>
                <TabsTrigger value="waiting" className={TAB}>Waiting</TabsTrigger>
                <TabsTrigger value="review" className={TAB}>In review</TabsTrigger>
                <TabsTrigger value="approved" className={TAB}>Approved</TabsTrigger>
                <TabsTrigger value="rejected" className={TAB}>Rejected</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative sm:w-72">
              <IconSearch className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name, email, order…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          {checks.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Order #</th>
                    <th className="px-3 py-2 font-semibold">Client</th>
                    <th className="px-3 py-2 font-semibold">Started</th>
                    <th className="px-3 py-2 font-semibold" title="When the client sent the completed form">Submitted</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="py-2 pl-3" />
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => {
                    const [label, tone] = statusLabel(c.status)
                    return (
                      <tr key={c.id} className="border-b align-top last:border-0">
                        <td className="py-2.5 pr-3">
                          {c.order_number ? <span className={ORDER_CHIP}>{c.order_number}</span> : <span className="text-xs text-muted-foreground">KYC link</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <button type="button" className="text-left font-medium hover:text-primary" onClick={() => setViewing(c)}>
                            {c.full_name}
                          </button>
                          <div className="text-xs text-muted-foreground">{c.email || '—'}</div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{shortDate(c.created_at)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{shortDate(c.submitted_at)}</td>
                        <td className="px-3 py-2.5">
                          <Badge className={`${tone} whitespace-nowrap`}>{label}</Badge>
                          {c.reason && <div className="mt-1 max-w-56 text-xs text-muted-foreground">{c.reason}</div>}
                        </td>
                        <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                          <Button variant="outline" size="xs" className="h-7 gap-1" onClick={() => setViewing(c)}>
                            <IconEye className="size-3.5" /> View
                          </Button>
                          {c.session_url && (
                            <Button variant="ghost" size="xs" className="h-7 gap-1 text-muted-foreground" onClick={() => copyText(c.session_url, "Client's link")}>
                              <IconCopy className="size-3.5" /> Their link
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-muted-foreground">
              <IconId className="mb-2 size-8" />
              {search.trim() ? 'No checks found.' : 'No KYC checks yet. Send your KYC link to a client.'}
            </div>
          )}
        </Card>
      )}

      <KycCheckView key={viewing?.id || 'none'} check={viewing} statusLabel={statusLabel} onClose={() => setViewing(null)} />
    </div>
  )
}
