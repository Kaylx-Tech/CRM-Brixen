import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconCircleCheck,
  IconCopy,
  IconDownload,
  IconForms,
  IconLoader2,
  IconSearch,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { apiRequest, authHeaders, getApiBase } from '@/lib/api'

const STATUS = {
  draft: ['Draft', 'bg-muted text-muted-foreground'],
  ready: ['Ready to File', 'bg-amber-500/15 text-amber-800 dark:text-amber-300'],
  filed: ['Filed', 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'],
}
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
function Field({ field, value, error, ctx, countries, onChange, onPick, locked }) {
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

/**
 * Gov Forms: Companies House forms filled in from what is known about the company (Companies House first, then
 * the CRM), checked, then Ready (Filing Sheet in Documents + a task in UK Gov Checks) and Filed.
 */
export default function GovForms({ embedded = false }) {
  const [params, setParams] = useSearchParams()
  const companyId = params.get('company') || ''
  const formCode = params.get('form') || ''
  const [forms, setForms] = useState([])
  const [companies, setCompanies] = useState(null)
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null) // prepared form
  const [values, setValues] = useState({})
  const [filingId, setFilingId] = useState(null)
  const [filingStatus, setFilingStatus] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState('')
  const [saved, setSaved] = useState([])

  useEffect(() => {
    if (!embedded) document.title = 'Gov Forms'
    apiRequest('/admin/gov-forms', { label: 'Gov Forms', silent: true }).then((res) => res.ok && setForms(res.data.data.forms))
    apiRequest('/admin/companies?limit=500', { label: 'Companies', silent: true }).then((res) => {
      const list = res.ok ? res.data?.data?.companies || res.data?.companies || [] : []
      setCompanies(list.filter((c) => c.is_registered !== false))
    })
  },[embedded])

  const company = useMemo(() => (companies || []).find((c) => String(c.id) === String(companyId)), [companies, companyId])

  // Saved forms of the chosen company
  useEffect(() => {
    if (!companyId) return undefined
    let alive = true
    apiRequest(`/admin/gov-forms/filings?company_id=${companyId}`, { label: 'Gov Forms', silent: true }).then((res) => {
      if (alive && res.ok) setSaved(res.data.data.filings)
    })
    return () => {
      alive = false
    }
  }, [companyId, filingStatus])

  // The chosen form, filled in for the chosen company
  useEffect(() => {
    if (!companyId || !formCode) return undefined
    let alive = true
    const t = setTimeout(() => {
      setData(null)
      setErrors({})
      apiRequest(`/admin/gov-forms/${formCode}?company_id=${companyId}`, { label: 'Gov Forms', silent: true }).then((res) => {
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
  }, [companyId, formCode])

  // company / form / filing live in the address next to anything else there (Smart Operations' tab and section)
  const choose = (next) =>
    setParams((prev) => {
      const out = new URLSearchParams(prev)
      Object.entries(next).forEach(([key, value]) => (value ? out.set(key, value) : out.delete(key)))
      if ('form' in next && !next.filing) out.delete('filing')
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
    const body = { company_id: Number(companyId), values, status, filing_id: filingId }
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

  // ── 1. choose the company ──
  if (!companyId) {
    return (
      <div className="flex w-full flex-col gap-5 pb-10">
        <div>
          {!embedded && <h1 className="text-2xl font-bold tracking-tight">Gov Forms</h1>}
          <p className="mt-1 text-sm text-muted-foreground">
            Companies House forms filled in for you from Companies House and the CRM. Choose the company first.
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
                onClick={() => choose({ company: String(c.id), form: '' })}
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

  // ── 2. choose the form ──
  if (!formCode) {
    return (
      <div className="flex w-full flex-col gap-5 pb-10">
        <div>
          <button type="button" onClick={() => choose({ company: '', form: '' })} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <IconArrowLeft className="size-4" /> Companies
          </button>
          <h1 className="text-2xl font-bold tracking-tight">{company?.name || 'Company'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{company?.company_number} · choose a form</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {forms.map((f) => (
            <button
              key={f.code}
              type="button"
              onClick={() => choose({ form: f.code })}
              className="flex flex-col rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-primary">
                <IconForms className="size-4" /> {f.code}
              </span>
              <span className="mt-2 font-semibold">{f.title}</span>
              <span className="mt-1 text-xs text-muted-foreground">{f.purpose}</span>
            </button>
          ))}
        </div>
        {saved.length > 0 && (
          <div className="rounded-2xl border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Saved Forms</h2>
            <ul className="divide-y text-sm">
              {saved.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <button type="button" onClick={() => choose({ form: f.form_code, filing: String(f.id) })} className="min-w-0 text-left hover:text-primary">
                    <span className="font-medium">{f.form_code}</span> · {f.title}
                    <span className="ml-2 text-xs text-muted-foreground">{when(f.updated_at || f.created_at)}</span>
                  </button>
                  <span className="flex items-center gap-2">
                    <span className={cn(PILL, STATUS[f.status]?.[1])}>{STATUS[f.status]?.[0] || f.status}</span>
                    {f.status !== 'draft' && (
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => downloadSheet(f)}>
                        <IconDownload className="size-4" />
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
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
        <button type="button" onClick={() => choose({ form: '' })} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <IconArrowLeft className="size-4" /> {company?.name || 'Forms'}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {formCode}: {form?.title || '…'}
          </h1>
          {filingStatus && <span className={cn(PILL, STATUS[filingStatus]?.[1])}>{STATUS[filingStatus]?.[0]}</span>}
        </div>
        {form && <p className="mt-1 text-sm text-muted-foreground">{form.purpose}</p>}
        {data && !data.context.company.from_companies_house && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <IconAlertTriangle className="size-4" /> Companies House did not answer, so only the CRM&apos;s details are filled in.
          </p>
        )}
      </div>

      {!data ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" /> Filling in from Companies House…
        </p>
      ) : (
        <>
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
                </Button>
                {filingStatus === 'ready' && (
                  <Button variant="outline" disabled={Boolean(busy)} onClick={() => run('save', 'filed')}>
                    Mark Filed
                  </Button>
                )}
              </>
            )}
            {filingId && filingStatus !== 'draft' && (
              <Button variant="ghost" onClick={() => downloadSheet({ id: filingId, form_code: formCode, company_name: company?.name })}>
                <IconDownload className="size-4" /> Filing Sheet
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {locked ? 'Filed: this form is closed.' : 'Ready makes the Filing Sheet (in Documents) and a task in UK Gov Checks.'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
