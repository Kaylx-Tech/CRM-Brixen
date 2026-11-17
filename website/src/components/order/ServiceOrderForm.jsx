"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { COUNTRIES } from "@/lib/countries"
import { crmSections, useCrmForm } from "@/lib/crm-forms"
import { SERVICE_FORMS } from "@/lib/service-forms"
import { SITE } from "@/lib/site"

// A service's order form, sent to the CRM (POST /api/public/service-orders), which saves the order and returns the
// Stripe card payment page. The form is the service's own order form from the CRM when it has one there
// (src/lib/crm-forms.js), otherwise the WordPress-style form in src/lib/service-forms.js.

const subscribe = () => () => {}
const MAX_BYTES = 15 * 1024 * 1024
const FILE_TYPES = /\.(pdf|jpe?g|png|docx?)$/i
const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3.5 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30"

const visible = (rule, v) => !rule || (rule[1] === true ? Boolean(v[rule[0]]) : v[rule[0]] === rule[1])

export default function ServiceOrderForm(props) {
  // The form keeps a draft in this browser, so it is drawn in the browser only
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false)
  const cancelled = useSyncExternalStore(subscribe, () => new URLSearchParams(window.location.search).get("payment") === "cancelled", () => false)
  const crm = useCrmForm(props.orderKey)
  const sections = useMemo(() => (crm ? crmSections(crm) : SERVICE_FORMS[props.orderKey]), [crm, props.orderKey])
  if (!inBrowser || crm === undefined) return <div className="h-[900px] animate-pulse rounded-3xl bg-white ring-1 ring-slate-100" aria-label="Loading the form" />
  return <Form key={crm ? "crm" : "site"} {...props} sections={sections} fromCrm={Boolean(crm)} cancelled={cancelled} />
}

function Form({ orderKey, name, price, sections, fromCrm, cancelled }) {
  const draftKey = `brixen-order-${orderKey}`
  const [v, setV] = useState(() => {
    const start = {}
    for (const s of sections) for (const f of s.fields) {
      if (f.type === "repeat") start[f.name] = [""]
      else if (f.type === "checkbox") start[f.name] = false
      else if (f.type === "tel") start[f.name] = f.defaultCode ? `${f.defaultCode} ` : ""
      else start[f.name] = ""
    }
    try {
      return { ...start, ...JSON.parse(window.localStorage.getItem(draftKey) || "{}") }
    } catch {
      return start
    }
  })
  const [files, setFiles] = useState({})
  const [status, setStatus] = useState({ state: "idle" })
  const errorRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(v))
      } catch {
        // private mode: the form still works
      }
    }, 400)
    return () => clearTimeout(t)
  }, [v, draftKey])

  const set = (key, value) => setV((old) => ({ ...old, [key]: value }))
  const shown = sections.filter((s) => visible(s.showIf, v)).map((s) => ({ ...s, fields: s.fields.filter((f) => visible(f.showIf, v)) }))
  const total = useMemo(() => {
    let t = price
    for (const s of shown) for (const f of s.fields) if (f.priceAdd && f.priceAdd[v[f.name]]) t += f.priceAdd[v[f.name]]
    return t
  }, [shown, v, price])

  const pick = (field) => (e) => {
    const chosen = [...(e.target.files || [])]
    const problem = chosen.length > 5 ? "Choose at most 5 files." : chosen.find((f) => !FILE_TYPES.test(f.name)) ? "Only PDF, JPG, PNG or Word files can be uploaded." : chosen.find((f) => f.size > MAX_BYTES) ? "Each file must be 15 MB or smaller." : ""
    e.target.setCustomValidity(problem)
    if (problem) {
      e.target.value = ""
      e.target.reportValidity()
      setFiles((old) => ({ ...old, [field.name]: [] }))
      return
    }
    setFiles((old) => ({ ...old, [field.name]: chosen }))
  }

  async function submit(e) {
    e.preventDefault()
    const body = new FormData()
    const rows = []
    const answers = []
    const role = {}
    body.append("service", orderKey)
    for (const s of shown) {
      for (const f of s.fields) {
        const value = v[f.name]
        let text = ""
        if (f.type === "radio" || f.type === "select") text = (f.options.find((o) => o[0] === value) || [value, value])[1] || ""
        else if (f.type === "checkbox") text = value ? "Yes" : ""
        else if (f.type === "repeat") text = value.map((x) => x.trim()).filter(Boolean).join(", ")
        else if (f.type === "file") {
          const chosen = files[f.name] || []
          chosen.forEach((file, i) => body.append(`file_${f.name}_${i}`, file, file.name))
          if (chosen.length) body.append(`file_label_${f.name}`, f.label)
          text = chosen.map((file) => file.name).join(", ")
        } else text = String(value || "").trim()
        if (f.type === "tel" && /^\+\d{1,4}$/.test(text)) text = ""
        // The CRM writes dates as DD/MM/YYYY
        if (f.crm && f.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(text)) text = text.split("-").reverse().join("/")
        if (text) rows.push({ label: f.label, value: text })
        if (f.crm) answers.push({ id: f.crm.id, label: f.label, type: f.crm.type, value: text })
        if (f.role) role[f.role] = String(value || "").trim()
        if (f.priceAdd) body.append(`opt_${f.name}`, value || "")
      }
    }
    body.append("fields_json", JSON.stringify(rows))
    if (fromCrm) body.append("service_fields_json", JSON.stringify(answers))
    body.append("email", role.email || "")
    body.append("name", role.name || [role.first_name, role.last_name].filter(Boolean).join(" "))
    body.append("phone", role.phone || "")
    body.append("company_name", role.company_name || "")
    body.append("company_number", role.company_number || "")

    setStatus({ state: "sending" })
    try {
      const res = await fetch(`${SITE.apiUrl}/public/service-orders`, { method: "POST", body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.status !== "success" || !data.checkout_url) {
        setStatus({ state: "error", message: data.message || "Your order could not be sent. Please try again or contact us." })
        setTimeout(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50)
        return
      }
      setStatus({ state: "paying" })
      window.location.href = data.checkout_url
    } catch {
      setStatus({ state: "error", message: "Network error. Please check your connection and try again." })
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50)
    }
  }

  const busy = status.state === "sending" || status.state === "paying"

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_330px] lg:items-start">
      <form onSubmit={submit} className="space-y-8 rounded-3xl bg-white p-6 shadow-[0_30px_60px_-40px_rgba(0,57,113,0.5)] ring-1 ring-slate-100 sm:p-10">
        {cancelled && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            The card payment was not completed. Your details are still here: check them and press “Continue to payment” to try again.
          </p>
        )}
        <p className="text-sm font-semibold text-brand-slate">Fields marked with an asterisk (<span className="text-red-500">*</span>) are required.</p>
        {shown.map((s) => (
          <fieldset key={s.title} className="border-t border-slate-100 pt-7 first-of-type:border-0 first-of-type:pt-0">
            <legend className="float-left w-full text-xl font-bold text-brand-navy">{s.title}</legend>
            {s.text && <p className="clear-both pt-1 text-sm text-brand-slate">{s.text}</p>}
            <div className="clear-both grid gap-5 pt-5 sm:grid-cols-2">
              {s.fields.map((f) => (
                <FieldInput key={f.name} f={f} value={v[f.name]} set={set} pick={pick} files={files[f.name]} />
              ))}
            </div>
          </fieldset>
        ))}

        <div ref={errorRef} aria-live="polite">
          {status.state === "error" && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">{status.message}</p>}
        </div>
        <button type="submit" disabled={busy} className="w-full rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-8 py-4 text-lg font-semibold text-white transition hover:brightness-110 disabled:opacity-60 sm:w-auto">
          {status.state === "sending" ? "Sending your details…" : status.state === "paying" ? "Opening the payment page…" : `Continue to payment · £${total}`}
        </button>
        <p className="text-xs text-brand-slate">You pay by card on Stripe&apos;s secure page. Your card details never reach us.</p>
        <datalist id="countries">
          {COUNTRIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </form>

      <aside className="rounded-3xl bg-white p-7 ring-1 ring-slate-100 lg:sticky lg:top-6">
        <p className="text-sm font-bold uppercase tracking-widest text-brand-teal">Your order</p>
        <p className="mt-2 text-2xl font-extrabold text-brand-navy">{name}</p>
        <p className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-5">
          <span className="font-semibold text-slate-700">Total</span>
          <span className="text-3xl font-extrabold text-brand-blue">£{total}</span>
        </p>
        <ul className="mt-5 space-y-2 text-sm text-slate-600">
          <li>✓ Secure card payment on Stripe</li>
          <li>✓ Email receipt straight away</li>
          <li>✓ Our team starts within working hours</li>
        </ul>
      </aside>
    </div>
  )
}

function FieldInput({ f, value, set, pick, files }) {
  const label = (
    <span className="mb-1.5 block text-sm font-semibold text-slate-800">
      {f.label} {f.required && <span className="text-red-500">*</span>}
    </span>
  )
  const hint = f.hint && <span className="mt-1.5 block text-xs leading-relaxed text-brand-slate">{f.hint}</span>
  const wide = f.wide || ["textarea", "radio", "repeat", "checkbox"].includes(f.type) ? "sm:col-span-2" : ""

  if (f.type === "radio") {
    return (
      <div className={wide} role="radiogroup" aria-label={f.label}>
        {label}
        <div className="flex flex-wrap gap-3">
          {f.options.map(([val, text]) => (
            <label key={val} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-4 py-3 text-sm font-medium transition ${value === val ? "border-brand-blue bg-brand-blue/5 text-brand-navy" : "border-slate-300 text-slate-700"}`}>
              <input type="radio" name={f.name} value={val} checked={value === val} onChange={() => set(f.name, val)} required={f.required} className="accent-brand-blue" />
              {text}
            </label>
          ))}
        </div>
        {hint}
      </div>
    )
  }
  if (f.type === "checkbox") {
    return (
      <label className={`${wide} flex gap-3 rounded-xl bg-brand-mist p-4 text-sm leading-relaxed text-slate-700`}>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => set(f.name, e.target.checked)} required={f.required} className="mt-1 size-4 shrink-0 accent-brand-blue" />
        <span>
          {f.label} {f.required && <span className="text-red-500">*</span>}
        </span>
      </label>
    )
  }
  if (f.type === "repeat") {
    const list = Array.isArray(value) && value.length ? value : [""]
    return (
      <div className={wide}>
        {label}
        <div className="space-y-2.5">
          {list.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input className={inputClass} value={item} required={f.required && i === 0} maxLength={200} placeholder={i === 0 ? f.label : `${f.label} (optional)`} onChange={(e) => set(f.name, list.map((x, j) => (j === i ? e.target.value : x)))} />
              {i > 0 && (
                <button type="button" onClick={() => set(f.name, list.filter((_, j) => j !== i))} className="shrink-0 rounded-md border border-slate-300 px-3 text-sm text-slate-600 hover:border-red-300 hover:text-red-600" aria-label={`Remove ${f.label} ${i + 1}`}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        {list.length < (f.max || 6) && (
          <button type="button" onClick={() => set(f.name, [...list, ""])} className="mt-2.5 text-sm font-semibold text-brand-blue hover:underline">
            + Add another
          </button>
        )}
        {hint}
      </div>
    )
  }
  if (f.type === "file") {
    return (
      <label className={`block ${wide}`}>
        {label}
        <input type="file" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" multiple={Boolean(f.multiple)} required={f.required && !(files && files.length)} onChange={pick(f)} className="block w-full rounded-md border border-dashed border-slate-300 bg-brand-mist p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-navy file:px-4 file:py-2 file:font-semibold file:text-white" />
        {hint}
      </label>
    )
  }
  let input
  if (f.type === "textarea") input = <textarea className={inputClass} rows={4} value={value} onChange={(e) => set(f.name, e.target.value)} required={f.required} maxLength={2000} />
  else if (f.type === "select")
    input = (
      <select className={inputClass} value={value} onChange={(e) => set(f.name, e.target.value)} required={f.required}>
        <option value="">Select…</option>
        {f.options.map(([val, text]) => (
          <option key={val} value={val}>
            {text}
          </option>
        ))}
      </select>
    )
  else
    input = (
      <input
        className={inputClass}
        type={f.type === "country" ? "text" : f.type || "text"}
        list={f.type === "country" ? "countries" : undefined}
        value={value}
        onChange={(e) => set(f.name, e.target.value)}
        required={f.required}
        maxLength={f.type === "tel" ? 30 : 200}
        placeholder={f.type === "tel" ? "+44 7700 900123" : f.type === "country" ? "Start typing a country" : undefined}
        autoComplete={f.role === "email" ? "email" : f.role === "phone" ? "tel" : f.role === "first_name" ? "given-name" : f.role === "last_name" ? "family-name" : f.type === "country" ? "off" : undefined}
        max={f.type === "date" && /birth|dob/i.test(f.name) ? new Date().toISOString().slice(0, 10) : undefined}
      />
    )
  return (
    <label className={`block ${wide}`}>
      {label}
      {input}
      {hint}
    </label>
  )
}
