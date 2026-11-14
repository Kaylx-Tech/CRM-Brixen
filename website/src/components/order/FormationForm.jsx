"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { COUNTRIES } from "@/lib/countries"
import { SITE } from "@/lib/site"

// Step 3 of an order ("File Details"), as on the WordPress site. It is sent to the CRM
// (POST /api/public/formation-orders), which saves the order and returns the Stripe card payment page.

const subscribe = () => () => {}
const readAddress = () => {
  const q = new URLSearchParams(window.location.search)
  return `${(q.get("name") || "").trim().slice(0, 160)}\n${q.get("payment") || ""}`
}

const EMPTY = {
  company_name: "",
  director_name: "",
  date_of_birth: "",
  nationality: "",
  passport_cnic: "",
  issuance_country: "",
  uk_contact_number: "",
  email: "",
  email_password: "",
  company_role: "",
  address_street: "",
  address_line2: "",
  address_city: "",
  address_state: "",
  address_zip: "",
  address_country: "United Kingdom",
  registered_address_zip: "",
  registered_address_street: "",
  registered_address_line2: "",
  registered_address_city: "",
  registered_address_state: "",
  sic_code: "",
  sic_description: "",
  business_description: "",
  non_refund_ack: false,
}
// Kept in this browser so a refresh does not lose the form; never the mailbox password or the files
const NOT_SAVED = ["email_password"]
const MAX_FILES = 5
const MAX_BYTES = 15 * 1024 * 1024
const FILE_TYPES = /\.(pdf|jpe?g|png)$/i

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3.5 py-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30 read-only:bg-slate-100 read-only:text-slate-600"

function Field({ label, required, hint, children, wide }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-sm font-semibold text-slate-800">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-brand-slate">{hint}</span>}
    </label>
  )
}

function Section({ title, children }) {
  return (
    <fieldset className="border-t border-slate-100 pt-7 first:border-0 first:pt-0">
      <legend className="float-left mb-5 w-full text-xl font-bold text-brand-navy">{title}</legend>
      <div className="clear-both grid gap-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

export default function FormationForm({ pkg }) {
  // The form uses this browser's saved draft, so it is drawn in the browser only
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false)
  const [addressName, payment] = useSyncExternalStore(subscribe, readAddress, () => "\n").split("\n")
  if (!inBrowser) return <div className="h-[1200px] animate-pulse rounded-3xl bg-white ring-1 ring-slate-100" aria-label="Loading the form" />
  // A name from the name search arrives in the address; a new one starts the form afresh with it
  return <Form key={addressName} pkg={pkg} searchedName={addressName} cancelled={payment === "cancelled"} />
}

function Form({ pkg, searchedName, cancelled }) {
  const draftKey = `brixen-formation-${pkg.slug}`
  const [v, setV] = useState(() => {
    let saved = {}
    try {
      saved = JSON.parse(window.localStorage.getItem(draftKey) || "{}")
    } catch {
      saved = {}
    }
    return { ...EMPTY, ...saved, email_password: "", ...(searchedName ? { company_name: searchedName } : {}) }
  })
  const [files, setFiles] = useState({ photo_id: [], address_proof: [] })
  const [status, setStatus] = useState({ state: "idle" })
  const errorRef = useRef(null)
  const set = (key) => (e) => setV((old) => ({ ...old, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }))

  // Save the details in this browser as they are typed (not the mailbox password)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const keep = Object.fromEntries(Object.entries(v).filter(([k]) => !NOT_SAVED.includes(k)))
        window.localStorage.setItem(draftKey, JSON.stringify(keep))
      } catch {
        // private mode or storage full: the form still works
      }
    }, 400)
    return () => clearTimeout(t)
  }, [v, draftKey])

  const pickFiles = (field) => (e) => {
    const chosen = [...(e.target.files || [])]
    const problem =
      chosen.length > MAX_FILES
        ? `Choose at most ${MAX_FILES} files.`
        : chosen.find((f) => !FILE_TYPES.test(f.name))
          ? "Only PDF, JPG or PNG files can be uploaded."
          : chosen.find((f) => f.size > MAX_BYTES)
            ? "Each file must be 15 MB or smaller."
            : ""
    if (problem) {
      e.target.value = ""
      e.target.setCustomValidity(problem)
      e.target.reportValidity()
      setFiles((old) => ({ ...old, [field]: [] }))
      return
    }
    e.target.setCustomValidity("")
    setFiles((old) => ({ ...old, [field]: chosen }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!v.sic_code) {
      setStatus({ state: "error", message: "Please choose the business activity (SIC) from the list." })
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }
    setStatus({ state: "sending" })
    const body = new FormData()
    body.append("package", pkg.slug)
    for (const [key, value] of Object.entries(v)) body.append(key, key === "non_refund_ack" ? (value ? "1" : "") : value)
    for (const field of ["photo_id", "address_proof"]) files[field].forEach((f, i) => body.append(`${field}_${i}`, f, f.name))
    try {
      const res = await fetch(`${SITE.apiUrl}/public/formation-orders`, { method: "POST", body })
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
  const nameLocked = Boolean(searchedName)

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
      <form onSubmit={submit} className="space-y-8 rounded-3xl bg-white p-6 shadow-[0_30px_60px_-40px_rgba(0,57,113,0.5)] ring-1 ring-slate-100 sm:p-10">
        {cancelled && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            The card payment was not completed. Your details are still here: check them and press “Continue to payment” to try again.
          </p>
        )}

        <Section title="Company Information">
          <Field
            label="Desired Company Name"
            required
            wide
            hint={
              nameLocked
                ? "Filled in from the name you searched. To use another name, go back to the name check."
                : "This company is not registered yet. Enter the exact name you want Companies House to create."
            }
          >
            <input className={inputClass} value={v.company_name} onChange={set("company_name")} readOnly={nameLocked} required minLength={3} maxLength={160} placeholder="The company name you want to register" />
          </Field>
        </Section>

        <Section title="Director Details">
          <Field label="Director Full Name" required>
            <input className={inputClass} value={v.director_name} onChange={set("director_name")} required maxLength={200} autoComplete="name" placeholder="Enter director's full name" />
          </Field>
          <Field label="Date of Birth" required>
            <input className={inputClass} type="date" value={v.date_of_birth} onChange={set("date_of_birth")} required max={new Date().toISOString().slice(0, 10)} autoComplete="bday" />
          </Field>
          <Field label="Nationality" required>
            <input className={inputClass} value={v.nationality} onChange={set("nationality")} required maxLength={100} placeholder="e.g. British / Pakistani" />
          </Field>
          <Field label="Passport/CNIC No." required>
            <input className={inputClass} value={v.passport_cnic} onChange={set("passport_cnic")} required maxLength={60} placeholder="Enter passport or CNIC number" />
          </Field>
          <Field label="Country of issuance for your Passport/CNIC" required>
            <input className={inputClass} value={v.issuance_country} onChange={set("issuance_country")} required list="countries" placeholder="Start typing a country" autoComplete="off" />
          </Field>
          <Field label="UK Contact Number" required hint="Your UK mobile or landline number including area code.">
            <input className={inputClass} type="tel" value={v.uk_contact_number} onChange={set("uk_contact_number")} required maxLength={30} autoComplete="tel" placeholder="e.g. 07700 900123" />
          </Field>
          <Field label="Email" required>
            <input className={inputClass} type="email" value={v.email} onChange={set("email")} required maxLength={200} autoComplete="email" placeholder="Enter your email" />
          </Field>
          <Field label="Email Password" required hint="Needed so our team can access the company mailbox while forming the company.">
            <input className={inputClass} type="text" value={v.email_password} onChange={set("email_password")} required maxLength={200} autoComplete="off" placeholder="Mailbox password for this email" />
          </Field>
        </Section>

        <fieldset className="border-t border-slate-100 pt-7">
          <legend className="float-left mb-4 w-full text-xl font-bold text-brand-navy">
            Role in Company <span className="text-red-500">*</span>
          </legend>
          <div className="clear-both flex flex-wrap gap-3">
            {[
              ["director", "Director"],
              ["psc", "PSC (Person with Significant control)"],
              ["both", "Director & PSC Both"],
            ].map(([value, label]) => (
              <label key={value} className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-4 py-3 text-sm font-medium transition ${v.company_role === value ? "border-brand-blue bg-brand-blue/5 text-brand-navy" : "border-slate-300 text-slate-700"}`}>
                <input type="radio" name="company_role" value={value} checked={v.company_role === value} onChange={set("company_role")} required className="accent-brand-blue" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <Section title="Director Home Address">
          <Field label="Street Address" required wide>
            <input className={inputClass} value={v.address_street} onChange={set("address_street")} required maxLength={200} autoComplete="address-line1" placeholder="Enter street address" />
          </Field>
          <Field label="Address Line 2" wide>
            <input className={inputClass} value={v.address_line2} onChange={set("address_line2")} maxLength={200} autoComplete="address-line2" placeholder="Apartment, suite, unit (optional)" />
          </Field>
          <Field label="City" required>
            <input className={inputClass} value={v.address_city} onChange={set("address_city")} required maxLength={100} autoComplete="address-level2" />
          </Field>
          <Field label="Province/State" required>
            <input className={inputClass} value={v.address_state} onChange={set("address_state")} required maxLength={100} autoComplete="address-level1" />
          </Field>
          <Field label="Zip/Postal Code" required>
            <input className={inputClass} value={v.address_zip} onChange={set("address_zip")} required maxLength={20} autoComplete="postal-code" />
          </Field>
          <Field label="Country" required>
            <input className={inputClass} value={v.address_country} onChange={set("address_country")} required list="countries" autoComplete="off" />
          </Field>
        </Section>

        <RegisteredAddress v={v} setV={setV} set={set} />

        <Section title="Document Upload">
          <Field
            label="Upload Director Photo ID"
            required
            wide
            hint="Max. 15 MB per file, up to 5 files. Upload any of: Passport, National ID, Driving licence. All 4 corners and the holograms / security features must be visible."
          >
            <input type="file" accept=".jpg,.jpeg,.png,.pdf" multiple required onChange={pickFiles("photo_id")} className="block w-full rounded-md border border-dashed border-slate-300 bg-brand-mist p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-navy file:px-4 file:py-2 file:font-semibold file:text-white" />
          </Field>
          <Field
            label="Upload Proof of Address"
            required
            wide
            hint="The name must match the passport. Accepted: bank statement, tax document, driving licence, national ID with address, or a utility bill (water / gas / electricity / landline / broadband only, dated within the last 3 months). Mobile phone bills are not accepted."
          >
            <input type="file" accept=".jpg,.jpeg,.png,.pdf" multiple required onChange={pickFiles("address_proof")} className="block w-full rounded-md border border-dashed border-slate-300 bg-brand-mist p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-navy file:px-4 file:py-2 file:font-semibold file:text-white" />
          </Field>
        </Section>

        <SicPicker v={v} setV={setV} set={set} />

        <label className="flex gap-3 rounded-xl bg-brand-mist p-4 text-sm leading-relaxed text-slate-700">
          <input type="checkbox" checked={v.non_refund_ack} onChange={set("non_refund_ack")} required className="mt-1 size-4 shrink-0 accent-brand-blue" />
          <span>
            I understand that company formation fees cover Companies House filing and processing. If the application cannot proceed because of invalid, false, altered, or unverifiable documents, the fee is not refundable. <span className="text-red-500">*</span>
          </span>
        </label>

        <div ref={errorRef} aria-live="polite">
          {status.state === "error" && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">{status.message}</p>}
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-8 py-4 text-lg font-semibold text-white transition hover:brightness-110 disabled:opacity-60 sm:w-auto"
        >
          {status.state === "sending" ? "Sending your details…" : status.state === "paying" ? "Opening the payment page…" : `Continue to payment · ${pkg.price}`}
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
        <p className="mt-2 text-2xl font-extrabold text-brand-navy">{pkg.name} Package</p>
        {v.company_name && <p className="mt-1 break-words text-sm text-brand-slate">{v.company_name}</p>}
        <p className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-5">
          <span className="font-semibold text-slate-700">Total</span>
          <span className="text-3xl font-extrabold text-brand-blue">{pkg.price}</span>
        </p>
        <ul className="mt-5 space-y-2 text-sm text-slate-600">
          <li>✓ Companies House filing included</li>
          <li>✓ Secure card payment on Stripe</li>
          <li>✓ Our team checks your documents</li>
        </ul>
      </aside>
    </div>
  )
}

/** Registered office: a UK postcode fills the town and county (postcodes.io); the street is typed. */
function RegisteredAddress({ v, setV, set }) {
  const [look, setLook] = useState({ state: "idle" })
  async function find() {
    const pc = v.registered_address_zip.trim()
    if (!pc) {
      setLook({ state: "error", message: "Type a UK postcode first." })
      return
    }
    setLook({ state: "busy" })
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`)
      const data = await res.json()
      if (!res.ok || !data.result) {
        setLook({ state: "error", message: "That postcode was not found. Check it, or type the address below." })
        return
      }
      const r = data.result
      setV((old) => ({
        ...old,
        registered_address_zip: r.postcode,
        registered_address_city: r.admin_district || r.parish || old.registered_address_city,
        registered_address_state: r.admin_county || r.region || r.country || old.registered_address_state,
      }))
      setLook({ state: "done", message: `Found ${r.postcode}: ${[r.admin_district, r.region].filter(Boolean).join(", ")}. Now add the street address.` })
    } catch {
      setLook({ state: "error", message: "The postcode search is not available right now. Please type the address below." })
    }
  }
  return (
    <Section title="Registered Company Address">
      <Field label="UK Postcode" required wide>
        <div className="flex gap-3">
          <input
            className={inputClass}
            value={v.registered_address_zip}
            onChange={set("registered_address_zip")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                find()
              }
            }}
            required
            maxLength={10}
            autoComplete="off"
            placeholder="e.g. SW1A 1AA"
          />
          <button type="button" onClick={find} disabled={look.state === "busy"} className="shrink-0 rounded-md bg-brand-navy px-5 font-semibold text-white transition hover:bg-brand-blue disabled:opacity-60">
            {look.state === "busy" ? "Finding…" : "Find Address"}
          </button>
        </div>
        <span className={`mt-1.5 block text-xs ${look.state === "error" ? "text-red-600" : "text-brand-slate"}`}>
          {look.message || "Search a UK postcode to fill the registered office, or type the address below."}
        </span>
      </Field>
      <Field label="Street Address" required wide>
        <input className={inputClass} value={v.registered_address_street} onChange={set("registered_address_street")} required maxLength={200} placeholder="Enter street address" />
      </Field>
      <Field label="Address Line 2" wide>
        <input className={inputClass} value={v.registered_address_line2} onChange={set("registered_address_line2")} maxLength={200} placeholder="Apartment, suite, unit (optional)" />
      </Field>
      <Field label="City" required>
        <input className={inputClass} value={v.registered_address_city} onChange={set("registered_address_city")} required maxLength={100} />
      </Field>
      <Field label="Province/State" required>
        <input className={inputClass} value={v.registered_address_state} onChange={set("registered_address_state")} required maxLength={100} />
      </Field>
      <Field label="Country" required wide hint="Registered office country is locked to the United Kingdom.">
        <input className={inputClass} value="United Kingdom" readOnly />
      </Field>
    </Section>
  )
}

/** Business activity: Companies House's condensed SIC 2007 list (public/data/sic-codes.json), searched here. */
function SicPicker({ v, setV, set }) {
  const [codes, setCodes] = useState(null)
  const [query, setQuery] = useState(v.sic_code ? `${v.sic_code} · ${v.sic_description}` : "")
  const [open, setOpen] = useState(false)
  const load = () => {
    if (codes) return
    setCodes([])
    fetch("/data/sic-codes.json")
      .then((r) => r.json())
      .then(setCodes)
      .catch(() => setCodes(null))
  }
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!codes || q.length < 2) return []
    return codes.filter((c) => `${c.code} ${c.description} ${c.section}`.toLowerCase().includes(q)).slice(0, 20)
  }, [codes, query])
  const choose = (c) => {
    setV((old) => ({
      ...old,
      sic_code: c.code,
      sic_description: c.description,
      business_description: old.business_description || c.description,
    }))
    setQuery(`${c.code} · ${c.description}`)
    setOpen(false)
  }
  return (
    <Section title="Business Activity (SIC)">
      <Field label="Search company activity" required wide hint="Official Companies House condensed SIC 2007 list. Pick the activity that best matches the company.">
        <div className="relative">
          <input
            className={inputClass}
            value={query}
            onFocus={() => {
              load()
              setOpen(true)
            }}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
              if (v.sic_code) setV((old) => ({ ...old, sic_code: "", sic_description: "" }))
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            autoComplete="off"
            role="combobox"
            aria-expanded={open && results.length > 0}
            aria-controls="sic-results"
            placeholder="Type an activity, e.g. software, retail, consultancy"
          />
          {open && results.length > 0 && (
            <ul id="sic-results" role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md bg-white py-1 text-sm shadow-xl ring-1 ring-slate-200">
              {results.map((c) => (
                <li key={c.code} role="option" aria-selected={v.sic_code === c.code}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(c)} className="block w-full px-3.5 py-2.5 text-left hover:bg-brand-mist">
                    <b className="text-brand-navy">{c.code}</b> · {c.description}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {v.sic_code ? (
          <span className="mt-1.5 block text-sm font-semibold text-green-700">
            Selected: {v.sic_code} · {v.sic_description}
          </span>
        ) : null}
      </Field>
      <Field label="Description of Business Activities" wide>
        <textarea className={inputClass} rows={3} value={v.business_description} onChange={set("business_description")} maxLength={1000} placeholder="Brief description of the company's business activities" />
      </Field>
    </Section>
  )
}
