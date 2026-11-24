import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBolt,
  IconCheck,
  IconCircleCheck,
  IconCopy,
  IconDownload,
  IconForms,
  IconLoader2,
  IconSearch,
  IconSettings,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { apiRequest, authHeaders, getApiBase } from '@/lib/api'
import { isAdminRole } from '@/lib/permissions'

const STATUS = {
  draft: ['Draft', 'bg-muted text-muted-foreground'],
  ready: ['Ready to File', 'bg-amber-500/15 text-amber-800 dark:text-amber-300'],
  filed: ['Filed', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'],
}
// The forms in groups, as Companies House sorts them
const GROUPS = [
  ['Company', ['CS01', 'AD01', 'AA01', 'DS01', 'RT01']],
  ['Directors', ['AP01', 'TM01', 'CH01']],
  ['People With Significant Control', ['PSC01', 'PSC07']],
]
// Where an order's form is: no form yet, draft, ready to file, filed
const STAGE = {
  new: ['New', 'bg-primary/10 text-primary'],
  draft: STATUS.draft,
  ready: STATUS.ready,
  filed: STATUS.filed,
}
const FILTERS = [
  ['todo', 'To Do', (i) => i.stage === 'new' || i.stage === 'draft'],
  ['ready', 'Ready to File', (i) => i.stage === 'ready'],
  ['filed', 'Filed', (i) => i.stage === 'filed'],
]
const PILL = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap'
const when = (v) => (v ? new Date(String(v).replace(' ', 'T') + 'Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

function visible(item, values) {
  return Object.entries(item.when || {}).every(([k, v]) => Boolean(values[k]) === Boolean(v))
}

function CopyButton({ text }) {
  const [done, setDone] = useState(false)
  if (!text) return null
  return (
    <button
      type="button"
      title="Copy for WebFiling"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(String(text))
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        } catch {
          // the answer is on screen to copy by hand
        }
      }}
      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {done ? <IconCheck className="size-4 text-emerald-600" /> : <IconCopy className="size-4" />}
    </button>
  )
}

/** One field of a form, drawn from its template (backend services/gov_forms_templates.py). */
function Field({ field, value, error, ctx, countries, onChange, onPick, locked, fromOrder }) {
  const id = `gf-${field.key}`
  const readOnly = locked || field.readonly
  const people = field.pick ? ctx[field.pick] || [] : []
  const options = field.options_from ? (ctx[field.options_from] || []).map((p) => [p.id, p.name]) : field.options || []
  let input
  if (field.type === 'checkbox') {
    return (
      <label className={cn('flex items-start gap-2.5 text-sm', readOnly && 'opacity-70')}>
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={Boolean(value)} disabled={readOnly} onChange={(e) => onChange(e.target.checked)} />
        <span>
          {field.label}
          {field.help && <span className="block text-xs text-muted-foreground">{field.help}</span>}
          {error && <span className="block text-xs font-medium text-destructive">{error}</span>}
        </span>
      </label>
    )
  }
  if (field.type === 'checks') {
    const list = Array.isArray(value) ? value : []
    input = (
      <div className="space-y-1.5 rounded-lg border p-2.5">
        {options.map(([v, label]) => (
          <label key={v} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              disabled={readOnly}
              checked={list.includes(v)}
              onChange={(e) => onChange(e.target.checked ? [...list, v] : list.filter((x) => x !== v))}
            />
            {label}
          </label>
        ))}
        {!options.length && <p className="text-xs text-muted-foreground">Nothing to choose from.</p>}
      </div>
    )
  } else if (field.type === 'pick') {
    input = (
      <select
        id={id}
        disabled={readOnly}
        value={value || ''}
        onChange={(e) => onPick(field, people.find((p) => p.id === e.target.value))}
        className="h-9 w-full rounded-[10px] border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        <option value="">Choose…</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.date_of_birth ? ` (born ${p.date_of_birth})` : ''}
          </option>
        ))}
      </select>
    )
  } else if (field.type === 'select') {
    input = (
      <select
        id={id}
        disabled={readOnly}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-[10px] border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      >
        <option value="">Choose…</option>
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    )
  } else if (field.type === 'textarea') {
    input = <Textarea id={id} rows={2} value={value || ''} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />
  } else {
    input = (
      <Input
        id={id}
        type={field.type === 'date' ? 'date' : 'text'}
        list={field.type === 'country' ? 'gf-countries' : undefined}
        value={value || ''}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className={cn(readOnly && 'bg-muted/40')}
      />
    )
  }
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-1 text-sm font-medium">
        {field.label}
        {field.required && !readOnly && <span className="text-destructive">*</span>}
        {fromOrder && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">From order</span>}
      </label>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">{input}</div>
        {['text', 'textarea', 'date', 'country'].includes(field.type) && <CopyButton text={value} />}
      </div>
      {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      {field.type === 'country' && (
        <datalist id="gf-countries">
          {countries.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      )}
    </div>
  )
}

async function downloadSheet(filing) {
  const res = await fetch(`${getApiBase()}/admin/gov-forms/filings/${filing.id}/sheet`, { headers: authHeaders() })
  if (!res.ok) return toast.error('The sheet could not be made.')
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = `${filing.form_code} ${filing.company_name || ''} filing sheet.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

/** UK Gov Checks starts here: every form, each with the orders waiting for it. */
function FormsHome({ forms, choose }) {
  const [items, setItems] = useState(null)
  useEffect(() => {
    apiRequest('/admin/gov-forms/queue', { label: 'Gov Forms', silent: true }).then((res) => setItems(res.ok ? res.data.data.items : []))
  }, [])
  const count = (code, test) => (items || []).filter((i) => i.form_code === code && test(i)).length
  const groups = GROUPS.map(([title, codes]) => [title, codes.map((code) => forms.find((f) => f.code === code)).filter(Boolean)])
  const rest = forms.filter((f) => !GROUPS.some(([, codes]) => codes.includes(f.code)))
  if (rest.length) groups.push(['Other', rest])
  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Choose a form.</p>
        <Button variant="outline" onClick={() => choose({ view: 'services' })}>
          <IconSettings className="size-4" /> Services
        </Button>
      </div>
      {!forms.length ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" /> Loading forms…
        </p>
      ) : (
        groups.map(([title, list]) => (
          <section key={title} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((f) => {
                const todo = count(f.code, FILTERS[0][2])
                const ready = count(f.code, FILTERS[1][2])
                return (
                  <button
                    key={f.code}
                    type="button"
                    onClick={() => choose({ form: f.code, view: '' })}
                    className="group flex items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <IconForms className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-primary">{f.code}</span>
                        <span className="flex gap-1">
                          {todo > 0 && <span className={cn(PILL, STAGE.new[1])}>{todo} to do</span>}
                          {ready > 0 && <span className={cn(PILL, STAGE.ready[1])}>{ready} ready</span>}
                        </span>
                      </span>
                      <span className="block font-semibold leading-snug">{f.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{f.purpose}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function OrderCard({ o, choose }) {
  return (
    <button
      type="button"
      onClick={() => choose({ order: String(o.id), company: o.company_id ? String(o.company_id) : '' })}
      className="rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-medium">{o.number}</span>
        <span className="text-xs text-muted-foreground">{when(o.ordered_at)}</span>
      </span>
      <span className="block truncate text-sm">{o.service}</span>
      <span className="block truncate text-xs text-muted-foreground">
        {o.company_name || 'No company yet'}
        {o.client ? ` · ${o.client}` : ''}
      </span>
    </button>
  )
}

/** What the client wrote on the order: the answers this form needs first, the rest when asked for. */
function OrderAnswers({ answers, formCode }) {
  const [all, setAll] = useState(false)
  const used = answers.filter((a) => a.used)
  const rest = answers.filter((a) => !a.used)
  const list = all ? [...used, ...rest] : used
  return (
    <>
      {list.length > 0 ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
          {list.map((a, n) => (
            <div key={n} className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <dt className="text-xs text-muted-foreground">{a.label}</dt>
                <dd className="break-words">{a.value}</dd>
              </div>
              <CopyButton text={a.value} />
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {answers.length ? `Nothing on the order form is for ${formCode}.` : 'The client gave no answers on the order form.'}
        </p>
      )}
      {rest.length > 0 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-3 text-xs text-primary underline-offset-2 hover:underline">
          {all ? 'Only what this form needs' : `Show all the client's answers (${answers.length})`}
        </button>
      )}
    </>
  )
}

/** One form: the orders for it (To Do / Ready to File / Filed), then any other order, or no order at all. */
function FormOrders({ formCode, title, choose }) {
  const [items, setItems] = useState(null)
  const [others, setOthers] = useState([])
  const [filter, setFilter] = useState('todo')
  const [search, setSearch] = useState('')
  const [showOthers, setShowOthers] = useState(false)
  useEffect(() => {
    apiRequest('/admin/gov-forms/queue', { label: 'Gov Forms', silent: true }).then((res) =>
      setItems(res.ok ? res.data.data.items.filter((i) => i.form_code === formCode) : []),
    )
    apiRequest(`/admin/gov-forms/orders?form=${formCode}`, { label: 'Gov Forms', silent: true }).then((res) =>
      setOthers(res.ok ? res.data.data.orders.filter((o) => !o.match) : []),
    )
  }, [formCode])
  const q = search.trim().toLowerCase()
  const shown = (items || [])
    .filter(FILTERS.find(([key]) => key === filter)[2])
    .filter((i) => !q || `${i.order_number} ${i.company_name} ${i.client_name} ${i.service}`.toLowerCase().includes(q))
  const otherShown = others.filter((o) => !q || `${o.number} ${o.service} ${o.company_name} ${o.client}`.toLowerCase().includes(q))
  const open = (i) =>
    choose({ order: String(i.order_id), company: i.company_id ? String(i.company_id) : '', filing: i.filing_id ? String(i.filing_id) : '' })
  return (
    <div className="flex w-full flex-col gap-4 pb-10">
      <div>
        <button type="button" onClick={() => choose({ form: '' })} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <IconArrowLeft className="size-4" /> All Forms
        </button>
        <h1 className="text-2xl font-bold tracking-tight">
          {formCode}: {title || '…'}
        </h1>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit gap-1 rounded-full border bg-muted/50 p-1">
          {FILTERS.map(([key, label, test]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                filter === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label} <span className="ml-1 text-muted-foreground">{(items || []).filter(test).length}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="pl-9" />
          </div>
          <Button variant="outline" onClick={() => choose({ noorder: '1' })}>
            Without an Order
          </Button>
        </div>
      </div>
      <section className="rounded-2xl border bg-card">
        {items === null ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" /> Loading orders…
          </p>
        ) : shown.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Company</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((i) => (
                  <tr key={`${i.order_id}-${i.form_code}`} className="hover:bg-muted/40">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium">{i.order_number}</span>
                      <span className="block text-xs text-muted-foreground">{when(i.ordered_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {i.company_name || <span className="text-muted-foreground">No company yet</span>}
                      {i.client_name && <span className="block text-xs text-muted-foreground">{i.client_name}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(PILL, STAGE[i.stage]?.[1])}>{STAGE[i.stage]?.[0]}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {i.stage === 'filed' && i.filing_id && (
                        <Button size="sm" variant="ghost" className="mr-1 h-8 px-2" title="Download" onClick={() => downloadSheet({ id: i.filing_id, form_code: i.form_code, company_name: i.company_name })}>
                          <IconDownload className="size-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={i.stage === 'new' ? 'default' : 'outline'}
                        onClick={() => open(i)}
                        title={i.stage === 'new' ? 'Filled in for you in seconds from Companies House and the order' : undefined}
                      >
                        {i.stage === 'new' && <IconBolt className="size-4" />}
                        {{ new: 'Get It Instantly', draft: 'Continue', ready: 'Open', filed: 'View' }[i.stage]}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {q ? 'No order matches.' : filter === 'todo' ? `No order is waiting for ${formCode}.` : 'Nothing here yet.'}
          </p>
        )}
      </section>
      {otherShown.length > 0 &&
        (showOthers || q ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Other Orders</h2>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {otherShown.slice(0, 60).map((o) => (
                <OrderCard key={o.id} o={o} choose={choose} />
              ))}
            </div>
          </section>
        ) : (
          <button type="button" onClick={() => setShowOthers(true)} className="w-fit text-sm text-primary underline-offset-2 hover:underline">
            Use another order ({otherShown.length})
          </button>
        ))}
    </div>
  )
}

/** Which form each service needs: what its name points to, or what an admin set. */
function ServicesPanel({ forms, choose }) {
  const [services, setServices] = useState(null)
  const [onlyLinked, setOnlyLinked] = useState(true)
  const admin = isAdminRole()
  useEffect(() => {
    apiRequest('/admin/gov-forms/services', { label: 'Gov Forms', silent: true }).then((res) => setServices(res.ok ? res.data.data.services : []))
  }, [])
  const save = async (service, value) => {
    const form_code = value === 'auto' ? null : value
    const res = await apiRequest('/admin/gov-forms/services', { method: 'POST', body: { service_id: service.id, form_code }, label: 'Gov Forms', silent: true })
    if (!res.ok) return toast.error(res.data?.error || res.reason || 'Not saved.')
    setServices(res.data.data.services)
    toast.success('Saved.')
  }
  const list = (services || []).filter((s) => !onlyLinked || s.form_code || s.set_by_hand)
  return (
    <div className="flex w-full max-w-4xl flex-col gap-4 pb-10">
      <div>
        <button type="button" onClick={() => choose({ view: '' })} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <IconArrowLeft className="size-4" /> Orders
        </button>
        <h2 className="text-xl font-bold tracking-tight">Services and Their Forms</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          An order for a service with a form shows in UK Gov Checks. The form is found from the service&apos;s name (Confirmation Statement → CS01); choose
          another one, or none, where the name is not enough.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-primary" checked={onlyLinked} onChange={(e) => setOnlyLinked(e.target.checked)} />
        Only services with a form
      </label>
      <section className="rounded-2xl border bg-card">
        {services === null ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" /> Loading services…
          </p>
        ) : list.length ? (
          <ul className="divide-y">
            {list.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{s.name}</span>
                  {!s.active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                  <span className="block text-xs text-muted-foreground">{s.set_by_hand ? 'Set by hand' : s.auto_form ? 'Found from the name' : 'No form'}</span>
                </span>
                <select
                  disabled={!admin}
                  value={s.set_by_hand ? s.form_code : 'auto'}
                  onChange={(e) => save(s, e.target.value)}
                  className="h-9 w-72 max-w-full rounded-[10px] border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70 dark:bg-input/30"
                >
                  <option value="auto">{s.auto_form ? `From the name: ${s.auto_form}` : 'From the name: none'}</option>
                  <option value="">No form</option>
                  {forms.map((f) => (
                    <option key={f.code} value={f.code}>
                      {f.code} · {f.title}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No service is linked to a form yet. Untick &quot;Only services with a form&quot; to choose one.
          </p>
        )}
      </section>
      {!admin && <p className="text-xs text-muted-foreground">Only an admin can change these.</p>}
    </div>
  )
}

/**
 * Gov Forms: Companies House forms filled in from what is known about the company (Companies House first, then
 * the CRM), checked, then Ready (Filing Sheet in Documents + a task to file it) and Filed.
 */
export default function GovForms({ embedded = false }) {
  const [params, setParams] = useSearchParams()
  const companyId = params.get('company') || ''
  const formCode = params.get('form') || ''
  const orderId = params.get('order') || ''
  const view = params.get('view') || ''
  const [forms, setForms] = useState([])
  const [companies, setCompanies] = useState(null)
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null) // prepared form
  const [values, setValues] = useState({})
  const [filingId, setFilingId] = useState(null)
  const [filingStatus, setFilingStatus] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState('')

  useEffect(() => {
    if (!embedded) document.title = 'Gov Forms'
    apiRequest('/admin/gov-forms', { label: 'Gov Forms', silent: true }).then((res) => res.ok && setForms(res.data?.data?.forms || []))
    apiRequest('/admin/companies?limit=500', { label: 'Companies', silent: true }).then((res) => {
      const list = res.ok ? res.data?.data?.companies || res.data?.companies || [] : []
      setCompanies(list.filter((c) => c.is_registered !== false))
    })
  },[embedded])

  const company = useMemo(() => (companies || []).find((c) => String(c.id) === String(companyId)), [companies, companyId])

  // The chosen form, filled in for the chosen company
  useEffect(() => {
    if (!companyId || !formCode) return undefined
    let alive = true
    const t = setTimeout(() => {
      setData(null)
      setErrors({})
      apiRequest(`/admin/gov-forms/${formCode}?company_id=${companyId}${orderId ? `&order_id=${orderId}` : ''}`, { label: 'Gov Forms', silent: true }).then((res) => {
        if (!alive) return
        if (!res.ok) return toast.error(res.data?.error || res.reason || 'The form could not be opened.')
        const open = Number(params.get('filing')) || null
        const existing = open ? res.data.data.filings.find((f) => f.id === open) : null
        setData(res.data.data)
        setValues(existing ? existing.values : res.data.data.values)
        setFilingId(existing ? existing.id : null)
        setFilingStatus(existing ? existing.status : '')
      })
    }, 0)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, formCode, orderId])

  // company / form / filing live in the address next to anything else there (Smart Operations' tab and section)
  const choose = (next) =>
    setParams((prev) => {
      const out = new URLSearchParams(prev)
      Object.entries(next).forEach(([key, value]) => (value ? out.set(key, value) : out.delete(key)))
      if (!next.filing) out.delete('filing')
      if ('form' in next && !next.noorder) out.delete('noorder')
      return out
    })
  const setValue = (key, value) => setValues((v) => ({ ...v, [key]: value }))
  const pick = (field, person) =>
    setValues((v) => {
      const next = { ...v, [field.key]: person?.id || '' }
      Object.entries(field.fill || {}).forEach(([key, attr]) => {
        next[key] = person ? person[attr] || '' : ''
      })
      return next
    })

  const run = async (action, status) => {
    setBusy(status || action)
    const body = { company_id: Number(companyId), values, status, filing_id: filingId, order_id: orderId ? Number(orderId) : null }
    const res = await apiRequest(`/admin/gov-forms/${formCode}/${action}`, { method: 'POST', body, label: 'Gov Forms', silent: true })
    setBusy('')
    if (action === 'check') {
      const errs = res.data?.data?.errors || {}
      setErrors(errs)
      return Object.keys(errs).length ? toast.error('Some answers need a look.') : toast.success('All good: ready to mark Ready.')
    }
    if (!res.ok) {
      setErrors(res.data?.details?.errors || {})
      return toast.error(res.data?.error || res.reason || 'Not saved.')
    }
    setErrors({})
    setFilingId(res.data.data.id)
    setFilingStatus(res.data.data.status)
    toast.success(res.data.message || 'Saved.')
  }

  const locked = filingStatus === 'filed'
  const filtered = (companies || []).filter((c) => {
    const q = search.trim().toLowerCase()
    return !q || `${c.name} ${c.company_number}`.toLowerCase().includes(q)
  })

  const chosenForm = forms.find((f) => f.code === formCode)

  // ── 1. the forms, then 2. a form's orders ──
  if (!formCode && view === 'services') return <ServicesPanel forms={forms} choose={choose} />
  if (!formCode) return <FormsHome forms={forms} choose={choose} />

  if (!companyId && !orderId && params.get('noorder') !== '1') return <FormOrders formCode={formCode} title={chosenForm?.title} choose={choose} />
  if (!companyId) {
    return (
      <div className="flex w-full flex-col gap-5 pb-10">
        <div>
          <button type="button" onClick={() => choose({ order: '', noorder: '' })} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <IconArrowLeft className="size-4" /> {formCode} Orders
          </button>
          <h1 className="text-2xl font-bold tracking-tight">
            {formCode}: {chosenForm?.title || '…'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {orderId ? 'The order has no company yet. Which company is this for?' : 'Which company is this for?'}
          </p>
        </div>
        <div className="relative max-w-md">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company name or number" className="pl-9" />
        </div>
        {companies === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" /> Loading companies…
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filtered.slice(0, 60).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => choose({ company: String(c.id) })}
                className="rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="block truncate font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.company_number}</span>
              </button>
            ))}
            {!filtered.length && <p className="text-sm text-muted-foreground">No registered company matches.</p>}
          </div>
        )}
      </div>
    )
  }

  // ── 3. the form ──
  const form = data?.form
  return (
    <div className="flex w-full max-w-4xl flex-col gap-5 pb-24">
      <div>
        <button type="button" onClick={() => choose({ company: '', order: '', noorder: '' })} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <IconArrowLeft className="size-4" /> {formCode} Orders
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {formCode}: {form?.title || '…'}
          </h1>
          {filingStatus && <span className={cn(PILL, STATUS[filingStatus]?.[1])}>{STATUS[filingStatus]?.[0]}</span>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {company?.name}
          {company?.company_number ? ` · ${company.company_number}` : ''}
          {' · '}
          <button type="button" onClick={() => choose({ company: '' })} className="underline-offset-2 hover:text-foreground hover:underline">
            Change company
          </button>
        </p>
        {form && <p className="mt-1 text-sm text-muted-foreground">{form.purpose}</p>}
        {data && !data.context.company.from_companies_house && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <IconAlertTriangle className="size-4" /> Companies House did not answer, so only the CRM&apos;s details are filled in.
          </p>
        )}
      </div>

      {!data ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconBolt className="size-4 animate-pulse text-primary" /> Filling it in for you from Companies House and the order…
        </p>
      ) : (
        <>
          {data.order && (
            <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
              <h2 className="font-semibold">
                Order {data.order.number} · {data.order.service}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {data.order.client ? `${data.order.client} · ` : ''}
                {data.order.status}
              </p>
              <OrderAnswers answers={data.order.answers} formCode={formCode} />
            </section>
          )}
          {errors._form && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">{errors._form}</p>
          )}
          {form.sections.filter((s) => visible(s, values)).map((section) => (
            <section key={section.title} className="rounded-2xl border bg-card p-5">
              <h2 className="font-semibold">{section.title}</h2>
              {section.help && <p className="mt-0.5 text-xs text-muted-foreground">{section.help}</p>}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {section.fields.filter((f) => visible(f, values)).map((field) => (
                  <div key={field.key} className={cn((field.type === 'checks' || field.type === 'checkbox' || field.type === 'textarea') && 'md:col-span-2')}>
                    <Field
                      field={field}
                      value={values[field.key]}
                      error={errors[field.key]}
                      ctx={data.context}
                      countries={data.countries}
                      locked={locked}
                      onChange={(v) => setValue(field.key, v)}
                      onPick={pick}
                      fromOrder={(data.from_order || []).includes(field.key)}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur">
            {!locked && (
              <>
                <Button variant="outline" disabled={Boolean(busy)} onClick={() => run('check')}>
                  {busy === 'check' ? <IconLoader2 className="size-4 animate-spin" /> : <IconCheck className="size-4" />} Check
                </Button>
                <Button variant="outline" disabled={Boolean(busy)} onClick={() => run('save', 'draft')}>
                  Save Draft
                </Button>
                <Button disabled={Boolean(busy)} onClick={() => run('save', 'ready')}>
                  {busy === 'ready' ? <IconLoader2 className="size-4 animate-spin" /> : <IconCircleCheck className="size-4" />} Mark Ready
                  {data.price > 0 && filingStatus !== 'ready' && <span className="opacity-80">· £{Number(data.price).toFixed(2)}</span>}
                </Button>
                {filingStatus === 'ready' && (
                  <Button variant="outline" disabled={Boolean(busy)} onClick={() => run('save', 'filed')}>
                    {orderId ? 'Mark Filed and Complete Order' : 'Mark Filed'}
                  </Button>
                )}
              </>
            )}
            {filingId && filingStatus !== 'draft' && (
              <Button variant="ghost" onClick={() => downloadSheet({ id: filingId, form_code: formCode, company_name: company?.name })}>
                <IconDownload className="size-4" /> {data.official ? 'Companies House Form' : 'Filing Sheet'}
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {locked ? 'Filed: this form is closed.' : 'Ready saves the filled-in form in Documents.'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
