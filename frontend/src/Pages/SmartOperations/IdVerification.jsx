import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconId,
  IconLoader2,
  IconMail,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconUserCheck,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { apiRequest } from '@/lib/api'
import { useRefreshOnReturn } from '@/lib/useRefreshOnReturn'

const PERSON_ROLES = ['Director', 'PSC', 'Director & PSC', 'Secretary', 'Member', 'Presenter', 'Other']
const ACSP_SERVICE_URL = 'https://www.gov.uk/guidance/tell-companies-house-you-have-verified-someones-identity'
const EMPTY_PERSON = { full_name: '', email: '', person_role: 'Director' }

// Same colours as the Orders board
function statusTone(status) {
  const s = String(status || 'Pending')
  if (s === 'Completed') return 'badge-green'
  if (s === 'Cancelled' || s === 'Refunded') return 'bg-destructive/15 text-destructive'
  if (s === 'In Progress' || s === 'Processing') return 'badge-sky'
  return 'badge-amber'
}

// Didit session statuses
function checkTone(status) {
  const s = String(status || 'Not Started')
  if (s === 'Approved') return 'badge-green'
  if (['Declined', 'Abandoned', 'Expired', 'Kyc Expired'].includes(s)) return 'bg-destructive/15 text-destructive'
  if (['In Review', 'Resubmitted', 'Awaiting User'].includes(s)) return 'badge-amber'
  if (s === 'In Progress') return 'badge-sky'
  return 'bg-muted text-muted-foreground'
}

function shortDate(value) {
  if (!value) return '—'
  const d = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// The KYC product(s) of an order: its KYC line items, or the service name for a one-product order
const kycProduct = (o) => o.kyc_products || o.service_name

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Could not copy')
  }
}

// What the ACSP enters in "Tell Companies House you have verified someone's identity"
function acspPack(person) {
  const r = person.result || {}
  return [
    ['Full name', r.full_name || person.full_name],
    ['Date of birth', r.date_of_birth],
    ['Home address', r.address],
    ['Email', person.email],
    ['Nationality', r.nationality],
    ['Document checked', [r.document_type, r.issuing_country].filter(Boolean).join(', ')],
    ['Document number', r.document_number],
    ['Document expiry', r.document_expiry],
    ['Checks', [
      r.id_status && `ID document ${r.id_status.toLowerCase()}`,
      r.liveness_status && `liveness ${r.liveness_status.toLowerCase()}`,
      r.face_match_status && `face match ${r.face_match_status.toLowerCase()}`,
    ].filter(Boolean).join(', ')],
    ['Verified with', `Didit${r.session_number ? ` session ${r.session_number}` : ''}${r.verified_at ? ` on ${shortDate(r.verified_at)}` : ''}`],
  ].filter(([, v]) => v)
}

function PersonRow({ person, busy, onAction, onOpen }) {
  const started = !!person.session_url
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background/60 p-2.5 sm:flex-row sm:items-center">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(person)}>
        <p className="truncate text-sm font-medium">
          {person.full_name}
          {person.person_role ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{person.person_role}</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {person.email || 'No email'}
          {person.link_sent_at ? ` · link emailed ${shortDate(person.link_sent_at)}` : ''}
          {person.ch_personal_code ? ` · CH code ${person.ch_personal_code}` : ''}
        </p>
      </button>
      <div className="flex flex-wrap items-center gap-1">
        <Badge className={`${checkTone(person.status)} whitespace-nowrap`}>{person.status || 'Not Started'}</Badge>
        {started ? (
          <>
            <Button variant="outline" size="xs" className="h-7 gap-1" title="Copy verification link" onClick={() => copyText(person.session_url, 'Link')}>
              <IconCopy className="size-3.5" />
              Link
            </Button>
            <Button variant="outline" size="xs" className="h-7 gap-1" title="Email the link" disabled={busy || !person.email} onClick={() => onAction(person, 'email')}>
              <IconMail className="size-3.5" />
              Email
            </Button>
            <Button variant="ghost" size="xs" className="h-7 w-7 p-0 text-muted-foreground" title="Get the latest result from Didit" disabled={busy} onClick={() => onAction(person, 'refresh')}>
              {busy ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconRefresh className="size-3.5" />}
            </Button>
          </>
        ) : (
          <Button variant="outline" size="xs" className="h-7 gap-1" disabled={busy} onClick={() => onAction(person, 'session')}>
            {busy ? <IconLoader2 className="size-3.5 animate-spin" /> : <IconPlayerPlay className="size-3.5" />}
            Start
          </Button>
        )}
      </div>
    </div>
  )
}

// ID Verification: every order with a KYC product and the people on it, verified through Didit
export default function IdVerification() {
  const [orders, setOrders] = useState([])
  const [configured, setConfigured] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [adding, setAdding] = useState(null) // the order a person is being added to
  const [personForm, setPersonForm] = useState(EMPTY_PERSON)
  const [isSaving, setIsSaving] = useState(false)
  const [viewing, setViewing] = useState(null) // the person whose result is open
  const [chCode, setChCode] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await apiRequest('/admin/smart-links/id-verification', { label: 'ID Verification', silent: true })
      if (!res.ok) {
        toast.error(res.reason || 'KYC orders failed to load')
        return
      }
      setOrders(res.data?.data?.orders || [])
      setConfigured(res.data?.data?.didit_configured !== false)
    } finally {
      setIsLoading(false)
    }
  }, [])
  useRefreshOnReturn(load)

  useEffect(() => {
    load()
  }, [load])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orders
    return orders.filter((o) =>
      [o.order_number, o.customer_name, o.customer_email, o.owner_name, o.company_name, o.company_number,
        kycProduct(o), o.status, ...(o.people || []).flatMap((p) => [p.full_name, p.email, p.status])]
        .some((v) => String(v || '').toLowerCase().includes(q)),
    )
  }, [orders, search])

  // Put a changed person back into its order
  const replacePerson = (person) => {
    setOrders((prev) => prev.map((o) => (o.id !== person.order_id ? o : {
      ...o,
      people: (o.people || []).some((p) => p.id === person.id)
        ? o.people.map((p) => (p.id === person.id ? person : p))
        : [...(o.people || []), person],
    })))
    setViewing((v) => (v && v.id === person.id ? person : v))
  }

  const runAction = async (person, action) => {
    setBusyId(person.id)
    try {
      const res = await apiRequest(`/admin/id-verification/${person.id}/${action}`, {
        method: 'POST',
        label: 'ID Verification',
        silent: true,
      })
      if (!res.ok) {
        toast.error(res.reason || 'Something went wrong')
        return
      }
      if (res.data?.data) replacePerson(res.data.data)
      toast.success(res.data?.message || 'Done')
    } finally {
      setBusyId(null)
    }
  }

  const openAdd = (order) => {
    // The first person is usually the customer themself
    const first = !(order.people || []).length
    setPersonForm({
      ...EMPTY_PERSON,
      full_name: first ? order.owner_name || order.customer_name || '' : '',
      email: first ? order.customer_email || '' : '',
    })
    setAdding(order)
  }

  const savePerson = async () => {
    if (!personForm.full_name.trim()) {
      toast.error('Name is required')
      return
    }
    setIsSaving(true)
    try {
      const res = await apiRequest(`/admin/id-verification/orders/${adding.id}/people`, {
        method: 'POST',
        body: personForm,
        label: 'Add person',
        silent: true,
      })
      if (!res.ok) {
        toast.error(res.reason || 'Could not add the person')
        return
      }
      replacePerson(res.data.data)
      const msg = res.data?.message || 'Person added'
      if (res.data.data.session_url) toast.success(msg)
      else toast.warning(msg)
      setAdding(null)
    } finally {
      setIsSaving(false)
    }
  }

  const openResult = (person) => {
    setChCode(person.ch_personal_code || '')
    setViewing(person)
  }

  const saveChCode = async () => {
    setIsSaving(true)
    try {
      const res = await apiRequest(`/admin/id-verification/${viewing.id}`, {
        method: 'PUT',
        body: { ch_personal_code: chCode.trim() },
        label: 'Save personal code',
        silent: true,
      })
      if (!res.ok) {
        toast.error(res.reason || 'Could not save')
        return
      }
      replacePerson(res.data.data)
      setChCode(res.data.data.ch_personal_code || '')
      toast.success('Companies House personal code saved')
    } finally {
      setIsSaving(false)
    }
  }

  const pack = viewing ? acspPack(viewing) : []
  const viewingOrder = viewing ? orders.find((o) => o.id === viewing.order_id) : null

  return (
    <div className="flex flex-col gap-4">
      {!configured && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p>
            Didit is not connected yet. An admin adds the API key, webhook secret and workflow ID in{' '}
            <Link to="/admin/settings?tab=integrations" className="font-medium text-primary hover:underline">Settings › Integrations</Link>;
            until then people can be added but no verification starts.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search customer, company, person or order…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {!isLoading && (
          <p className="text-sm text-muted-foreground">
            {shown.length === orders.length ? `${orders.length} KYC order${orders.length === 1 ? '' : 's'}` : `${shown.length} of ${orders.length}`}
          </p>
        )}
      </div>

      {isLoading && orders.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-4 py-16 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconId className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">{search.trim() ? 'No KYC orders found' : 'No KYC orders yet'}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {search.trim()
              ? 'Try another name, company or order number.'
              : 'Orders with a KYC product show up here, ready for identity verification.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {shown.map((o) => (
            <Card key={o.id} size="sm" className="gap-3 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Link to={`/admin/orders?open=${o.id}`} className="text-sm font-semibold text-primary hover:underline">
                      {o.order_number}
                    </Link>
                    <span className="text-xs text-muted-foreground">{shortDate(o.created_at)}</span>
                  </div>
                  <p className="truncate text-sm font-medium" title={o.customer_email}>{o.customer_name || '—'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.company_name ? `${o.company_name}${o.company_number ? ` (${o.company_number})` : ''}` : 'No company'}
                    {' · '}
                    {kycProduct(o)}
                  </p>
                </div>
                <Badge className={`${statusTone(o.status)} shrink-0 whitespace-nowrap`}>{o.status || 'Pending'}</Badge>
              </div>

              <div className="space-y-1.5">
                {(o.people || []).map((p) => (
                  <PersonRow key={p.id} person={p} busy={busyId === p.id} onAction={runAction} onOpen={openResult} />
                ))}
                <Button variant="ghost" size="xs" className="h-7 gap-1 text-muted-foreground" onClick={() => openAdd(o)}>
                  <IconPlus className="size-3.5" />
                  {(o.people || []).length ? 'Add another person' : 'Add person to verify'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add a person (director, PSC …) to verify */}
      <Dialog open={!!adding} onOpenChange={(open) => !open && setAdding(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Add person to verify</DialogTitle>
            <DialogDescription>
              {adding?.order_number}: {configured ? 'a Didit verification link is created straight away.' : 'Didit is not connected yet.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="idv-name">Full name *</Label>
              <Input id="idv-name" value={personForm.full_name} onChange={(e) => setPersonForm((p) => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="idv-email">Email</Label>
              <Input id="idv-email" type="email" placeholder="For emailing the link" value={personForm.email} onChange={(e) => setPersonForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <div className="flex flex-wrap gap-1.5">
                {PERSON_ROLES.map((r) => (
                  <Button
                    key={r}
                    type="button"
                    size="xs"
                    variant={personForm.person_role === r ? 'default' : 'outline'}
                    className="h-7"
                    onClick={() => setPersonForm((p) => ({ ...p, person_role: r }))}
                  >
                    {r}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(null)} disabled={isSaving}>Cancel</Button>
            <Button onClick={savePerson} disabled={isSaving}>
              {isSaving ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconUserCheck className="h-4 w-4" />}
              {configured ? 'Add and start' : 'Add person'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result and the ACSP filing pack */}
      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewing?.full_name}
              <Badge className={checkTone(viewing?.status)}>{viewing?.status || 'Not Started'}</Badge>
            </DialogTitle>
            <DialogDescription>
              {[viewing?.person_role, viewingOrder?.order_number, viewingOrder?.company_name].filter(Boolean).join(' · ')}
            </DialogDescription>
          </DialogHeader>

          {viewing?.status === 'Approved' ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Companies House (ACSP) details</p>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-7 gap-1"
                    onClick={() => copyText(pack.map(([k, v]) => `${k}: ${v}`).join('\n'), 'Details')}
                  >
                    <IconCopy className="size-3.5" />
                    Copy all
                  </Button>
                </div>
                <dl className="space-y-1.5 text-sm">
                  {pack.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[120px_1fr_auto] items-start gap-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="min-w-0 break-words font-medium">{v}</dd>
                      <button type="button" className="text-muted-foreground hover:text-foreground" title={`Copy ${k.toLowerCase()}`} onClick={() => copyText(String(v), k)}>
                        <IconCopy className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </dl>
                <a href={ACSP_SERVICE_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  Tell Companies House you have verified this person
                  <IconExternalLink className="size-3" />
                </a>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="idv-ch-code">Companies House personal code</Label>
                <div className="flex gap-2">
                  <Input
                    id="idv-ch-code"
                    className="font-mono uppercase tracking-wider"
                    placeholder="11 characters, from Companies House"
                    maxLength={13}
                    value={chCode}
                    onChange={(e) => setChCode(e.target.value.toUpperCase())}
                  />
                  <Button
                    onClick={saveChCode}
                    disabled={isSaving || chCode.trim() === (viewing.ch_personal_code || '')
                      || (chCode.trim() !== '' && chCode.replace(/[\s-]/g, '').length !== 11)}
                  >
                    {isSaving ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconCheck className="h-4 w-4" />}
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Companies House emails the person their 11-character personal code once you have reported the
                  verification. They use it to link their verified identity as a director or PSC.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                {viewing?.session_url
                  ? 'The result appears here as soon as Didit has checked the ID. Send the link if the person has not opened it yet.'
                  : 'The verification has not started yet.'}
              </p>
              {viewing?.result?.id_status && (
                <p>ID document: {viewing.result.id_status}{viewing.result.liveness_status ? ` · liveness: ${viewing.result.liveness_status}` : ''}{viewing.result.face_match_status ? ` · face match: ${viewing.result.face_match_status}` : ''}</p>
              )}
            </div>
          )}

          <DialogFooter>
            {viewing?.session_url && (
              <Button variant="outline" onClick={() => copyText(viewing.session_url, 'Link')}>
                <IconCopy className="h-4 w-4" />
                Copy link
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
