import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { toast } from "sonner"
import { toastProcessing, toastDone, toastFail } from "@/lib/toastActions"
import { apiRequest } from "@/lib/api"
import ToastSave from "@/components/ToastSave"
import { DateOfBirthInput } from "@/components/date-of-birth-input"
import { isDateOfBirthLabel } from "@/lib/date-of-birth"
import { canViewPrices } from "@/lib/permissions"
import { formatGBP } from "@/lib/money"
import {
  IconArrowRight,
  IconBookmark,
  IconCheck,
  IconLoader2,
  IconSearch,
  IconBuilding,
  IconCircleCheck,
  IconInfoCircle,
  IconAlertCircle,
  IconUpload,
} from "@tabler/icons-react"

const STEPS = [
  { id: 1, label: "Customer" },
  { id: 2, label: "Service" },
  { id: 3, label: "Details" },
  { id: 4, label: "Documents" },
  { id: 5, label: "Review" },
]

const DEFAULT_DOCS = [
  { key: "passport", label: "Passport / Photo ID", required: true },
  { key: "proof_of_address", label: "Proof of address", required: true },
  { key: "other", label: "Supporting document", required: false },
]

// A service's own upload field already asks for this standard document (so it is not asked twice)
const DEFAULT_DOC_MATCH = {
  passport: /passport|photo id|\bid\b|identity|identification|driving licen/i,
  proof_of_address: /address|utility|bank statement|council tax/i,
  other: /supporting|other document|additional document/i,
}

/** Standard documents not already covered by an upload field on the services' own forms. */
function uncoveredDefaultDocs(fileFields) {
  return DEFAULT_DOCS.filter((d) => !fileFields.some((f) => DEFAULT_DOC_MATCH[d.key]?.test(String(f.label || ""))))
}

// Filler words that do not change what a question asks ("Your full name" = "Full name" = "Name")
const LABEL_FILLER = new Set(["the", "your", "a", "an", "please", "enter", "provide", "upload", "copy", "scan", "of", "full", "here"])

/** Comparable form of a label: lower case, no punctuation / possessive / filler words / plural "s". */
function normalizeLabel(label) {
  const normalized = String(label || "")
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !LABEL_FILLER.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ")

  const aliases = {
    "email address": "email",
    "email id": "email",
    "e mail": "email",
    "email field": "email",
    "mobile number": "phone",
    mobile: "phone",
    "phone number": "phone",
    "telephone number": "phone",
    telephone: "phone",
    "contact number": "phone",
    "date birth": "date of birth",
    "birth date": "date of birth",
    dob: "date of birth",
    "company name": "company name",
    "business name": "company name",
    "business legal name": "company name",
    postcode: "postal code",
    "zip code": "postal code",
    "postal/zip code": "postal code",
  }
  return aliases[normalized] || normalized
}

/**
 * Order-form fields from every selected service, merged so the same question is asked once even when several
 * services need it ("Director's Name" and "director name" are one field). Each keeps the names of the services
 * that asked for it.
 */
function mergeFieldList(list, fields, serviceName, parentKey) {
  for (const f of Array.isArray(fields) ? fields : []) {
    const key = `${parentKey ? `${parentKey}>` : ""}${f.type}:${normalizeLabel(f.label) || String(f.label || "").trim().toLowerCase()}`
    let node = list.find((n) => n.key === key)
    if (node) {
      node.required = node.required || !!f.required
      if (!node.services.includes(serviceName)) node.services.push(serviceName)
      for (const opt of f.options || []) if (!node.options.includes(opt)) node.options.push(opt)
    } else {
      node = {
        key,
        label: f.label,
        type: f.type,
        required: !!f.required,
        placeholder: f.placeholder || "",
        options: [...(f.options || [])],
        services: [serviceName],
        children: [],
        branches: {}, // radio: option text -> fields asked when that option is chosen
      }
      list.push(node)
    }
    if (f.type === "checkbox") mergeFieldList(node.children, f.fields, serviceName, key)
    if (f.type === "radio") {
      ;(f.options || []).forEach((opt, i) => {
        const branch = (f.option_fields || [])[i]
        if (!Array.isArray(branch) || !branch.length) return
        node.branches[opt] = node.branches[opt] || []
        mergeFieldList(node.branches[opt], branch, serviceName, `${key}=${opt}`)
      })
    }
  }
  return list
}

/** Sub-fields opened by a field's current answer: a ticked checkbox, or the chosen radio option. */
function openedChildren(f, values) {
  if (f.type === "checkbox") return values[f.key] === true ? f.children : []
  if (f.type === "radio") return f.branches?.[values[f.key]] || []
  return []
}

function openedByLabel(f, values) {
  return f.type === "radio" ? `${f.label}: ${values[f.key]}` : f.label
}

function mergeServiceFields(products) {
  const list = []
  for (const p of products) mergeFieldList(list, p.form_fields, p.name, "")
  return list
}

/** Fields that currently apply: every top-level field, plus a checkbox's sub-form only while it is ticked. */
function activeServiceFields(fields, values) {
  const out = []
  for (const f of fields) {
    out.push({ ...f, parentLabel: "" })
    for (const c of openedChildren(f, values)) out.push({ ...c, parentLabel: openedByLabel(f, values) })
  }
  return out
}

function fieldTitle(f) {
  return f.parentLabel ? `${f.parentLabel} › ${f.label}` : f.label
}

/**
 * "Company" order-form field: the typed name or number is searched at Companies House and the matching companies
 * are listed; one must be picked (as in Import WebFiling), or "not registered" chosen to keep the typed text as the
 * proposed company name.
 * Value: { input, state: idle|typing|checking|results|registered|not_registered|error, results, exactNumber,
 *          name, number, companyStatus, address, inCrm }.
 */
function CompanyCheckField({ id, value, onChange, placeholder }) {
  const current = value && typeof value === "object" ? value : { input: "", state: "idle" }
  const input = current.input || ""
  // Latest typed text: a slow Companies House answer for older text must not overwrite newer typing
  const latestInput = useRef(input)
  latestInput.current = input

  // Once a registered company is picked, its details (incorporation date, office, directors) are loaded
  useEffect(() => {
    if (current.state !== "registered" || !current.number || current.detailsState) return
    const number = current.number
    onChange((prev) => ({ ...prev, detailsState: "loading" }))
    apiRequest(`/companies/ch-details?number=${encodeURIComponent(number)}`, { silent: true, label: "Companies House" }).then((res) => {
      onChange((prev) => {
        if (!prev || prev.state !== "registered" || prev.number !== number) return prev
        if (!res.ok) return { ...prev, detailsState: "error", detailsError: res.reason || "Details could not be loaded" }
        const d = res.data?.data || {}
        return {
          ...prev,
          detailsState: "done",
          name: d.name || prev.name,
          companyStatus: d.status || prev.companyStatus,
          address: d.address || prev.address,
          incorporated: d.incorporated || "",
          sicCodes: d.sic_codes || "",
          directors: d.directors || [],
          inCrm: d.in_crm || prev.inCrm || null,
        }
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.state, current.number, current.detailsState])

  useEffect(() => {
    const q = input.trim()
    if (q.length < 2 || current.state !== "typing") return
    const timer = setTimeout(async () => {
      onChange({ ...current, state: "checking" })
      const res = await apiRequest(`/companies/check-name?q=${encodeURIComponent(q)}`, { silent: true, label: "Companies House" })
      if (latestInput.current !== input) return
      const d = res.data?.data || {}
      if (!res.ok) {
        onChange({ input, state: "error", error: res.reason || "Companies House could not be checked" })
        return
      }
      // Exact match first, then the other search results; nothing is chosen until the user picks one
      const results = [...(d.match ? [{ ...d.match, inCrm: d.in_crm || null }] : []), ...(d.suggestions || [])]
      onChange({ input, state: "results", results, exactNumber: d.match?.number || "" })
    }, 600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, current.state])

  const pick = (r) =>
    onChange({
      ...current,
      state: "registered",
      name: r.name,
      number: r.number,
      companyStatus: r.status,
      address: r.address,
      inCrm: r.inCrm || null,
      incorporated: r.incorporated || "",
      directors: [],
      detailsState: "",
    })
  const pickNotRegistered = () => onChange({ ...current, state: "not_registered" })
  const change = () => onChange({ ...current, state: "results" })
  const results = current.results || []

  return (
    <div className="space-y-2">
      <div className="relative">
        <IconBuilding className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          className="w-full pl-9 text-sm"
          value={input}
          onChange={(e) => onChange({ input: e.target.value, state: e.target.value.trim().length >= 2 ? "typing" : "idle" })}
          placeholder={placeholder || "Company name or number"}
          autoComplete="off"
        />
        {current.state === "checking" || current.state === "typing" ? (
          <IconLoader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {current.state === "results" ? (
        <div className="rounded-xl bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10">
          <p className="px-3 py-1.5 text-[11px] text-muted-foreground">
            {results.length ? "Select the company:" : "No registered company found."}
          </p>
          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {results.map((r) => (
              <button
                key={r.number}
                type="button"
                onClick={() => pick(r)}
                className="flex w-full cursor-pointer items-start gap-2 rounded-[14px] px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <IconBuilding className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.name}</span>
                    {r.number === current.exactNumber ? <Badge className="badge-green text-[10px]">Exact match</Badge> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.number}{r.status ? ` · ${r.status}` : ""}{r.address ? ` · ${r.address}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={pickNotRegistered}
            className="mt-1 flex w-full cursor-pointer items-start gap-2 rounded-[14px] border-t px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <IconInfoCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <span className="font-medium">None of these, not registered yet</span>
              <span className="block text-xs text-muted-foreground">Use "{input.trim()}" as the proposed company name</span>
            </span>
          </button>
        </div>
      ) : null}

      {current.state === "registered" ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[12px]">
          <IconCircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">Registered at Companies House</p>
            <p className="truncate">{current.name} · {current.number}{current.companyStatus ? ` · ${current.companyStatus}` : ""}</p>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-muted-foreground">Incorporated</dt>
              <dd>{current.incorporated ? formatUkDate(current.incorporated) : "—"}</dd>
              <dt className="text-muted-foreground">Registered office</dt>
              <dd className="min-w-0 break-words">{current.address || "—"}</dd>
              <dt className="text-muted-foreground">Directors</dt>
              <dd>
                {current.detailsState === "loading" ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <IconLoader2 className="h-3 w-3 animate-spin" /> Loading from Companies House…
                  </span>
                ) : current.detailsState === "error" ? (
                  <span className="text-destructive">{current.detailsError}</span>
                ) : (current.directors || []).length ? (
                  <ul className="space-y-0.5">
                    {current.directors.map((d) => (
                      <li key={`${d.name}-${d.appointed}`}>
                        <span className="font-medium">{d.name}</span>
                        {d.dob ? ` · born ${d.dob}` : ""}
                        {d.nationality ? ` · ${d.nationality}` : ""}
                        {d.appointed ? ` · appointed ${formatUkDate(d.appointed)}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
            {current.inCrm ? <p className="mt-1 text-muted-foreground">Already in the CRM as "{current.inCrm.name}". The order will be linked to it.</p> : (
              <p className="mt-1 text-muted-foreground">Will be added to the customer's companies and linked to the order.</p>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={change}>Change</Button>
        </div>
      ) : null}

      {current.state === "not_registered" ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px]">
          <IconInfoCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="flex-1 font-semibold text-amber-700 dark:text-amber-400">
            Not registered. "{input.trim()}" will be used as the proposed company name.
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={change}>Change</Button>
        </div>
      ) : null}

      {current.state === "error" ? (
        <p className="text-[12px] text-destructive">{current.error}. The typed name will be kept as entered.</p>
      ) : null}
    </div>
  )
}

function formatUkDate(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value || "")
}

/** One line describing a Company field's answer (empty while nothing is picked yet). */
function companyAnswer(v) {
  if (!v || !String(v.input || "").trim()) return ""
  if (v.state === "registered") {
    const extra = [
      v.companyStatus,
      v.incorporated ? `incorporated ${formatUkDate(v.incorporated)}` : "",
      (v.directors || []).length ? `directors: ${v.directors.map((d) => `${d.name}${d.dob ? ` (born ${d.dob})` : ""}`).join(", ")}` : "",
    ].filter(Boolean)
    return `${v.name} (${v.number}) · Registered${extra.length ? `, ${extra.join(", ")}` : ""}`
  }
  if (v.state === "not_registered") return `${v.input.trim()} · Not registered (proposed name)`
  if (v.state === "error") return `${v.input.trim()} · Not checked at Companies House`
  return "" // results shown but nothing picked yet
}

/** The company sent with the order for linking / creating in the CRM (only once a choice is made). */
function companyForOrder(v) {
  if (!v || !["registered", "not_registered"].includes(v.state)) return null
  return {
    registered: v.state === "registered",
    name: v.state === "registered" ? v.name : v.input.trim(),
    number: v.state === "registered" ? v.number : "",
    status: v.companyStatus || "",
    incorporated: v.incorporated || "",
    address: v.state === "registered" ? v.address || "" : "",
    directors: v.state === "registered" ? v.directors || [] : [],
  }
}

/**
 * "Company name availability" field: checks if a new name can be registered at Companies House.
 * Value: { input, state: idle|typing|checking|available|taken|error, conflicts, similar, warnings }.
 */
function CompanyNameAvailabilityField({ id, value, onChange, placeholder }) {
  const current = value && typeof value === "object" ? value : { input: "", state: "idle" }
  const input = current.input || ""
  const latestInput = useRef(input)
  latestInput.current = input

  useEffect(() => {
    const name = input.trim()
    if (name.length < 3 || current.state !== "typing") return
    const timer = setTimeout(async () => {
      onChange({ ...current, state: "checking" })
      const res = await apiRequest(`/companies/name-availability?name=${encodeURIComponent(name)}`, {
        silent: true,
        label: "Name availability",
      })
      if (latestInput.current !== input) return
      const d = res.data?.data || {}
      if (!res.ok) onChange({ input, state: "error", error: res.reason || "Companies House could not be checked" })
      else onChange({ input, state: d.available ? "available" : "taken", conflicts: d.conflicts || [], similar: d.similar || [], warnings: d.warnings || [] })
    }, 700)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, current.state])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          id={id}
          className="w-full pr-9 text-sm"
          value={input}
          onChange={(e) => onChange({ input: e.target.value, state: e.target.value.trim().length >= 3 ? "typing" : "idle" })}
          placeholder={placeholder || "e.g. Acme Ventures Ltd"}
          autoComplete="off"
        />
        {current.state === "checking" || current.state === "typing" ? (
          <IconLoader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {current.state === "available" ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[12px]">
          <IconCircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p><span className="font-semibold text-emerald-700 dark:text-emerald-400">Available.</span> No live company uses "{input.trim()}".</p>
        </div>
      ) : null}

      {current.state === "taken" ? (
        <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px]">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <IconAlertCircle className="h-4 w-4" /> Not available. Choose a different name.
          </p>
          {(current.conflicts || []).map((c) => (
            <p key={c.number} className="text-muted-foreground">Already registered: {c.name} · {c.number}{c.status ? ` · ${c.status}` : ""}</p>
          ))}
        </div>
      ) : null}

      {["available", "taken"].includes(current.state) && (current.warnings || []).length ? (
        <ul className="space-y-0.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
          {current.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      ) : null}

      {current.state === "available" && (current.similar || []).length ? (
        <p className="text-[11px] text-muted-foreground">
          Similar names already registered: {current.similar.slice(0, 3).map((s) => s.name).join(", ")}
        </p>
      ) : null}

      {current.state === "error" ? <p className="text-[12px] text-destructive">{current.error}</p> : null}
    </div>
  )
}

/** A document-upload field from a service's order form (the file is uploaded once the order is created). */
function ServiceFileInput({ field, file, onFile, hint }) {
  const id = `svc-file-${field.key.replace(/[^a-z0-9]+/gi, "-")}`
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-semibold">
        {field.label}
        {field.required ? <span className="text-destructive ml-1">*</span> : null}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          // A picked file turns the box green
          className={`text-sm ${file ? "border-solid border-emerald-500/60 bg-emerald-500/5 hover:border-emerald-500 hover:bg-emerald-500/10" : ""}`}
          onChange={(e) => {
            const picked = e.target.files?.[0]
            if (!picked) return
            if (picked.size > 15 * 1024 * 1024) {
              toast.error(`${picked.name} is larger than 15 MB`)
              e.target.value = ""
              return
            }
            onFile(picked)
          }}
        />
        {file ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="animate-in fade-in zoom-in-95 duration-300 text-muted-foreground hover:text-destructive"
            onClick={() => {
              const input = document.getElementById(id)
              if (input) input.value = ""
              onFile(null)
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>
      {file ? (
        <p
          key={file.name}
          className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 animate-in fade-in slide-in-from-top-1 duration-300"
        >
          <IconCircleCheck className="size-3.5 shrink-0" />
          {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">PDF, image or Word, up to 15 MB. Saved in the order's documents.</p>
      )}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** One text input, radio question or company check from a service's order form. */
function ServiceFieldInput({ field, value, onChange, hint }) {
  const id = `svc-field-${field.key.replace(/[^a-z0-9]+/gi, "-")}`
  return (
    <div className="space-y-2">
      <Label htmlFor={["text", "date", "company", "company_name"].includes(field.type) ? id : undefined} className="text-sm font-semibold">
        {field.label}
        {field.required ? <span className="text-destructive ml-1">*</span> : null}
      </Label>
      {field.type === "company_name" ? (
        <CompanyNameAvailabilityField id={id} value={value} onChange={onChange} placeholder={field.placeholder} />
      ) : field.type === "company" ? (
        <CompanyCheckField id={id} value={value} onChange={onChange} placeholder={field.placeholder} />
      ) : field.type === "radio" ? (
        <RadioGroup value={value || ""} onValueChange={(v) => onChange(v)} className="flex flex-wrap gap-x-5 gap-y-2">
          {field.options.map((opt) => (
            <Label key={opt} className="flex cursor-pointer items-center gap-2 text-sm font-normal">
              <RadioGroupItem value={opt} />
              {opt}
            </Label>
          ))}
        </RadioGroup>
      ) : field.type === "date" || isDateOfBirthLabel(field.label) ? (
        // Date fields (and older "Date of birth" text questions): a calendar and DD/MM/YYYY
        <DateOfBirthInput id={id} value={value} onChange={onChange} allowFuture={!isDateOfBirthLabel(field.label)} />
      ) : (
        <Input
          id={id}
          className="w-full text-sm"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || undefined}
        />
      )}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result || "")
      resolve(raw.slice(raw.indexOf(",") + 1))
    }
    reader.onerror = () => reject(new Error(`${file.name} could not be read`))
    reader.readAsDataURL(file)
  })
}

function isB2BCustomer(c) {
  return Number(c?.is_b2b) === 1 || String(c?.client_type || "").toUpperCase() === "B2B"
}

function isBusinessCustomer(c) {
  return !isB2BCustomer(c) && String(c?.client_type || "").toLowerCase() === "business"
}

function customerTypeLabel(c) {
  if (isB2BCustomer(c)) return "B2B Account"
  if (isBusinessCustomer(c)) return "Business Customer"
  return "Normal Customer"
}

// £49, or £49.50 when there are pence
const formatGbp = formatGBP

function unwrapList(res, keys = []) {
  const root = res?.data
  if (!root) return []
  if (Array.isArray(root)) return root
  if (Array.isArray(root.data)) return root.data
  for (const k of keys) {
    if (Array.isArray(root[k])) return root[k]
    if (root.data && Array.isArray(root.data[k])) return root.data[k]
  }
  return []
}

function StepPill({ step, current, onClick }) {
  const active = current === step.id
  const done = current > step.id
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-all w-full cursor-pointer select-none ${
        active
          ? "border-primary bg-primary/10 text-primary shadow-xs ring-1 ring-primary/20"
          : done
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
            : "border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          active
            ? "bg-primary text-primary-foreground"
            : done
              ? "bg-emerald-600 text-white"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <IconCheck className="h-3 w-3" /> : step.id}
      </span>
      <span className="truncate">{step.label}</span>
    </button>
  )
}

// portal: a signed-in (B2B) customer orders for themselves, so the Customer step is skipped and
// every request goes to the /client API
export default function CreateOrderWizard({ open, onClose, onCreated, portal = false }) {
  // Staff Operations order without seeing prices (the server prices their orders from the catalogue)
  const showPrices = portal || canViewPrices()
  const firstStep = portal ? 2 : 1
  const steps = portal ? STEPS.filter((s) => s.id !== 1) : STEPS
  const [step, setStep] = useState(firstStep)
  const [error, setError] = useState("")
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [saving, setSaving] = useState(false)

  const [customers, setCustomers] = useState([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerType, setCustomerType] = useState("All")
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  const [products, setProducts] = useState([])
  const [productSearch, setProductSearch] = useState("")
  const [category, setCategory] = useState("All")
  const [selectedProducts, setSelectedProducts] = useState([])

  const [formValues, setFormValues] = useState({
    full_name: "",
    email: "",
    phone: "",
    company_name: "",
    access_email: "",
    access_email_password: "",
  })
  const [docMarks, setDocMarks] = useState({})
  // Answers to the selected services' own order-form fields
  const [fieldValues, setFieldValues] = useState({})
  const [fieldFiles, setFieldFiles] = useState({})
  const [notes, setNotes] = useState("")
  const [draftOrderId, setDraftOrderId] = useState(null)
  const [showUnsavedToast, setShowUnsavedToast] = useState(false)
  const [toastSaveState, setToastSaveState] = useState("initial")

  const isDirty = Boolean(
    (!portal && selectedCustomer) ||
    selectedProducts.length > 0 ||
    notes.trim() ||
    Object.keys(docMarks).length > 0 ||
    formValues.full_name.trim() ||
    formValues.company_name.trim() ||
    formValues.access_email.trim()
  )

  const resetState = useCallback(() => {
    setStep(firstStep)
    setError("")
    setCustomerSearch("")
    setCustomerType("All")
    setSelectedCustomer(null)
    setProductSearch("")
    setCategory("All")
    setSelectedProducts([])
    setFormValues({
      full_name: "",
      email: "",
      phone: "",
      company_name: "",
      access_email: "",
      access_email_password: "",
    })
    setDocMarks({})
    setFieldValues({})
    setFieldFiles({})
    setNotes("")
    setDraftOrderId(null)
  }, [firstStep])

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true)
    try {
      if (portal) {
        // The customer is the signed-in account
        const me = await apiRequest("/auth/me", { label: "Account", silent: true })
        setSelectedCustomer(me.data?.data?.user || me.data?.user || null)
        return
      }
      const res = await apiRequest("/admin/customers?limit=500", {
        label: "Customers",
        silent: true,
      })
      setCustomers(unwrapList(res, ["customers", "clients", "users"]))
    } finally {
      setLoadingCustomers(false)
    }
  }, [portal])

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true)
    try {
      let res = await apiRequest("/catalog/products", { label: "Catalog", silent: true })
      let list = unwrapList(res, ["products", "services"])
      if (!list.length) {
        res = await apiRequest("/admin/services", { label: "Services", silent: true })
        list = unwrapList(res, ["products", "services"])
      }
      setProducts(list)
    } finally {
      setLoadingProducts(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    resetState()
    loadCustomers()
    loadProducts()
  }, [open, resetState, loadCustomers, loadProducts])

  useEffect(() => {
    if (!selectedCustomer) return
    // Contact details always follow the selected customer (they are no longer typed in the wizard)
    setFormValues((prev) => ({
      ...prev,
      full_name: selectedCustomer.full_name || "",
      email: selectedCustomer.email || "",
      phone: selectedCustomer.phone || "",
    }))
  }, [selectedCustomer])

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    return customers.filter((c) => {
      const b2b = isB2BCustomer(c)
      const typeOk =
        customerType === "All" ||
        (customerType === "B2B" && b2b) ||
        (customerType === "Business" && isBusinessCustomer(c)) ||
        (customerType === "Normal" && !b2b && !isBusinessCustomer(c))
      if (!typeOk) return false
      if (!q) return true
      return (
        String(c.full_name || "").toLowerCase().includes(q) ||
        String(c.email || "").toLowerCase().includes(q) ||
        String(c.phone || "").toLowerCase().includes(q) ||
        String(c.b2b_id || "").toLowerCase().includes(q)
      )
    })
  }, [customers, customerSearch, customerType])

  const categories = useMemo(() => {
    const cats = ["All"]
    products.forEach((p) => {
      if (p.category && !cats.includes(p.category)) cats.push(p.category)
    })
    return cats
  }, [products])

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase()
    
    // Sort so most recent, popular, and high-demand services show at the top first
    const sorted = [...products].sort((a, b) => {
      const countA = Number(a.orders_count || a.total_orders || a.usage_count || a.order_count || 0)
      const countB = Number(b.orders_count || b.total_orders || b.usage_count || b.order_count || 0)
      if (countA !== countB) return countB - countA
      if (a.is_popular || a.is_featured) return -1
      if (b.is_popular || b.is_featured) return 1
      return (b.id || 0) - (a.id || 0)
    })

    return sorted.filter((p) => {
      if (category !== "All" && p.category !== category) return false
      if (!q) return true
      return (
        String(p.name || "").toLowerCase().includes(q) ||
        String(p.description || "").toLowerCase().includes(q) ||
        String(p.category || "").toLowerCase().includes(q)
      )
    })
  }, [products, productSearch, category])

  const selectedSummary = useMemo(() => {
    const price = selectedProducts.reduce((sum, p) => {
      if (selectedCustomer && isB2BCustomer(selectedCustomer)) return sum
      return sum + (Number(p.price) || 0)
    }, 0)
    const title =
      selectedProducts.length === 1
        ? selectedProducts[0].name
        : selectedProducts.length > 1
          ? "Multiple Products"
          : "—"
    const cat =
      selectedProducts.length === 1
        ? selectedProducts[0].category || "Service"
        : selectedProducts.length > 1
          ? "Multi"
          : "—"
    return { price, title, cat }
  }, [selectedProducts, selectedCustomer])

  const serviceFields = useMemo(() => mergeServiceFields(selectedProducts), [selectedProducts])
  const activeFields = useMemo(() => activeServiceFields(serviceFields, fieldValues), [serviceFields, fieldValues])
  // Everything answered on the Details step (text, question, checkbox) vs. uploads on the Documents step
  const textFields = activeFields.filter((f) => f.type !== "file")
  const fileFields = activeFields.filter((f) => f.type === "file")
  // Standard documents the services' own upload fields do not already ask for
  const standardDocs = useMemo(
    () => uncoveredDefaultDocs(activeFields.filter((f) => f.type === "file")),
    [activeFields]
  )
  const fieldAnswer = (f) => {
    const v = fieldValues[f.key]
    if (f.type === "checkbox") return v === true ? "Yes" : "No"
    if (f.type === "company") return companyAnswer(v)
    if (f.type === "company_name") {
      if (!v || !String(v.input || "").trim()) return ""
      if (v.state === "available") return `${v.input.trim()} · Available`
      if (v.state === "taken") return `${v.input.trim()} · Not available`
      return `${v.input.trim()} · Availability not checked`
    }
    return String(v || "").trim()
  }

  // The first company field decides the order's company name (official name if registered, else proposed)
  // (falls back to the first "Company name availability" field when there is no company field)
  useEffect(() => {
    const field = activeFields.find((f) => f.type === "company") || activeFields.find((f) => f.type === "company_name")
    const v = field ? fieldValues[field.key] : null
    if (!v || !String(v.input || "").trim()) return
    const name = v.state === "registered" ? v.name : v.input.trim()
    setFormValues((prev) => (prev.company_name === name ? prev : { ...prev, company_name: name }))
  }, [activeFields, fieldValues])

  const buildPayload = (currentStep) => {
    const isB2B = selectedCustomer && isB2BCustomer(selectedCustomer)
    return {
      service_id: selectedProducts[0]?.id || null,
      service_name: selectedSummary.title,
      line_items: selectedProducts.map((p) => ({
        product_name: p.name,
        price: isB2B ? 0 : Number(p.price) || 0,
        category_name: p.category || "",
      })),
      client_id: selectedCustomer?.id,
      company_email: selectedCustomer?.email,
      form_values: {
        ...formValues,
        // The services' own questions, saved with the order so staff see the answers
        service_fields: textFields.map((f) => {
          const item = { label: fieldTitle(f), type: f.type, value: fieldAnswer(f), services: f.services }
          const v = fieldValues[f.key]
          if (f.type === "company" && companyForOrder(v)) item.company = companyForOrder(v)
          if (f.type === "company_name" && v && String(v.input || "").trim()) {
            item.name_check = { name: v.input.trim(), available: v.state === "available", checked: ["available", "taken"].includes(v.state) }
          }
          return item
        }),
      },
      // Every company picked on the form: found or created in the CRM and linked to the order
      companies: textFields
        .filter((f) => f.type === "company")
        .map((f) => companyForOrder(fieldValues[f.key]))
        .filter(Boolean),
      uploaded_docs: {
        ...docMarks,
        ...Object.fromEntries(fileFields.map((f) => [fieldTitle(f), !!fieldFiles[f.key]])),
      },
      notes,
      order_id: draftOrderId,
      current_step: currentStep,
      amount: selectedSummary.price,
      total: selectedSummary.price,
    }
  }

  const validateStep = (targetStep) => {
    if (targetStep > 1 && !selectedCustomer) return "Please select a customer."
    if (targetStep > 2 && selectedProducts.length < 1) return "Please select at least one product."
    if (targetStep > 3) {
      const lookups = textFields.filter((f) => f.type === "company" || f.type === "company_name")
      const busy = (v) => ["typing", "checking"].includes(v?.state) || v?.detailsState === "loading"
      if (lookups.some((f) => busy(fieldValues[f.key]))) {
        return "Wait a moment, Companies House is still being checked."
      }
      // A company search that returned results needs a choice: one of the companies, or "not registered"
      const unpicked = lookups.filter((f) => f.type === "company" && fieldValues[f.key]?.state === "results")
      if (unpicked.length) return `Select the company for "${fieldTitle(unpicked[0])}" from the list.`
      const taken = lookups.filter((f) => f.type === "company_name" && fieldValues[f.key]?.state === "taken")
      if (taken.length) return `"${fieldValues[taken[0].key].input.trim()}" is already registered. Choose a different company name.`
      const missingText = textFields.filter((f) => {
        if (!f.required) return false
        if (f.type === "checkbox") return fieldValues[f.key] !== true
        if (f.type === "company" || f.type === "company_name") return !String(fieldValues[f.key]?.input || "").trim()
        return !String(fieldValues[f.key] || "").trim()
      })
      if (missingText.length) return `Complete: ${missingText.map(fieldTitle).join(", ")}.`
    }
    if (targetStep > 4) {
      // Uploads are asked on the Documents step, so they are checked when leaving it
      const missingFiles = fileFields.filter((f) => f.required && !fieldFiles[f.key])
      if (missingFiles.length) return `Upload: ${missingFiles.map(fieldTitle).join(", ")}.`
      const missing = standardDocs.filter((d) => d.required && !docMarks[d.key])
      if (missing.length) return `Mark required documents: ${missing.map((d) => d.label).join(", ")}.`
    }
    return ""
  }

  const goTo = (next) => {
    const err = validateStep(next)
    if (err) {
      setError(err)
      return
    }
    setError("")
    setStep(next)
  }

  const handleContinue = () => {
    if (step >= 5) return
    goTo(step + 1)
  }

  const handleBack = () => {
    setError("")
    setStep((s) => Math.max(firstStep, s - 1))
  }

  // A product is told apart by its id; the built-in list (shown while a workspace has no services) has
  // no ids, so its products go by name, otherwise ticking one ticked them all
  const productKey = (p) => (p.id != null ? `id:${p.id}` : `name:${p.name}`)
  const toggleProduct = (product) => {
    setSelectedProducts((prev) => {
      const key = productKey(product)
      const exists = prev.some((p) => productKey(p) === key)
      if (exists) return prev.filter((p) => productKey(p) !== key)
      return [...prev, product]
    })
  }

  const handleSaveDraft = async () => {
    if (!selectedProducts.length) {
      setError("Please select a product first.")
      setStep(2)
      return
    }
    setSaving(true)
    setError("")
    const toastId = toastProcessing("Saving draft…")
    try {
      const res = await apiRequest(portal ? "/client/orders/draft" : "/orders/draft", {
        method: "POST",
        body: JSON.stringify(buildPayload(step)),
        label: "Save draft",
        silent: true,
      })
      if (!res.ok && portal) {
        setError(res.reason || "Could not save draft.")
        toastFail(toastId, res.reason || "Could not save draft.")
        return
      }
      if (!res.ok) {
        const res2 = await apiRequest("/admin/orders/draft", {
          method: "POST",
          body: JSON.stringify(buildPayload(step)),
          label: "Save draft",
          silent: true,
        })
        if (!res2.ok) {
          setError(res2.reason || "Could not save draft.")
          toastFail(toastId, res2.reason || "Could not save draft.")
          return
        }
        const data = res2.data?.data || res2.data || {}
        setDraftOrderId(data.order_id || data.id)
        toastDone(toastId, `Draft saved as ${data.order_number || "draft"}`)
        return
      }
      const data = res.data?.data || res.data || {}
      setDraftOrderId(data.order_id || data.id)
      toastDone(toastId, `Draft saved as ${data.order_number || "draft"}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    const err = validateStep(5)
    if (err) {
      setError(err)
      return
    }
    setSaving(true)
    setError("")
    const toastId = toastProcessing("Submitting order…")
    try {
      const res = await apiRequest(portal ? "/client/orders" : "/admin/orders", {
        method: "POST",
        body: JSON.stringify(buildPayload(5)),
        label: "Create order",
        silent: true,
      })
      let final = res
      if (!res.ok && !portal) {
        final = await apiRequest("/orders", {
          method: "POST",
          body: JSON.stringify(buildPayload(5)),
          label: "Create order",
          silent: true,
        })
      }
      if (!final.ok) {
        setError(final.reason || "Could not submit order.")
        toastFail(toastId, final.reason || "Could not submit order.")
        return
      }
      const data = final.data?.data || final.data || {}
      const num = data.order_number || data.order?.order_number || "created"
      const orderId = data.order_id || data.id || data.order?.id

      // Files for the services' document-upload fields are filed against the new order
      const failed = []
      for (const f of fileFields) {
        const file = fieldFiles[f.key]
        if (!file || !orderId) continue
        try {
          const up = await apiRequest(portal ? "/client/documents/upload" : "/admin/documents/upload", {
            method: "POST",
            body: {
              order_id: orderId,
              client_id: selectedCustomer?.id,
              name: fieldTitle(f),
              file_name: file.name,
              file_content_base64: await readFileAsBase64(file),
              mime_type: file.type || "application/octet-stream",
              category: f.label,
              ...(portal ? {} : { client_visible: 0 }),
            },
            label: "Order document",
            silent: true,
          })
          if (!up.ok) failed.push(`${fieldTitle(f)} (${up.reason || "upload failed"})`)
        } catch (uploadErr) {
          failed.push(`${fieldTitle(f)} (${uploadErr.message})`)
        }
      }
      if (failed.length) {
        toastFail(toastId, `Order ${num} created, but these files did not upload: ${failed.join(", ")}. Add them from the order page.`)
      } else {
        toastDone(toastId, `Order ${num} submitted successfully`)
      }
      onClose?.()
      onCreated?.(data)
    } finally {
      setSaving(false)
    }
  }

  const typePills = [
    { key: "All", label: "All Customers" },
    { key: "Normal", label: "Normal Customers" },
    { key: "Business", label: "Business Customers" },
    { key: "B2B", label: "B2B Accounts" },
  ]

  const handleAttemptClose = () => {
    if (saving) return
    if (isDirty) {
      setShowUnsavedToast(true)
    } else {
      onClose?.()
    }
  }

  // `val` may be an updater (prev => next) so async lookups apply to the latest answer
  const setFieldValue = (key, val) =>
    setFieldValues((v) => ({ ...v, [key]: typeof val === "function" ? val(v[key]) : val }))
  const setFieldFile = (key, file) =>
    setFieldFiles((v) => {
      const next = { ...v }
      if (file) next[key] = file
      else delete next[key]
      return next
    })
  // Details step: the service form's questions only; every upload field moves to the Documents step
  const detailServiceFields = serviceFields.filter((f) => f.type !== "file")
  const renderField = (f, hint) =>
    f.type === "file" ? (
      <ServiceFileInput field={f} file={fieldFiles[f.key]} onFile={(file) => setFieldFile(f.key, file)} hint={hint} />
    ) : (
      <ServiceFieldInput field={f} value={fieldValues[f.key]} onChange={(val) => setFieldValue(f.key, val)} hint={hint} />
    )

  // The selected services' own order form, shown first on the Details step
  const serviceDetailsBlock = detailServiceFields.length > 0 ? (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4 space-y-3">
      <div>
        <h5 className="text-sm font-bold">{selectedProducts.length === 1 ? `${selectedProducts[0].name} form` : "Service form"}</h5>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Asked by the selected {selectedProducts.length === 1 ? "service" : "services"}. A question shared by several services is asked once.
        </p>
      </div>
      <div className="space-y-4">
        {detailServiceFields.map((f) => {
          const hint = selectedProducts.length > 1 ? `For ${f.services.join(", ")}` : ""
          const openedAll = openedChildren(f, fieldValues)
          const opened = openedAll.filter((c) => c.type !== "file")
          const openedUploads = openedAll.length - opened.length
          // Fields opened by a ticked checkbox or the chosen radio answer, indented under it
          // (their uploads are asked on the Documents step)
          const subForm = openedAll.length > 0 ? (
            <div className="mt-3 space-y-4 border-l-2 border-primary/30 pl-4">
              {opened.map((c) => <div key={c.key}>{renderField(c)}</div>)}
              {openedUploads > 0 ? (
                <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <IconUpload className="h-3.5 w-3.5" />
                  {openedUploads} document{openedUploads === 1 ? "" : "s"} for this on the Documents step
                </p>
              ) : null}
            </div>
          ) : null

          if (f.type !== "checkbox") {
            return (
              <div key={f.key}>
                {renderField(f, hint)}
                {subForm}
              </div>
            )
          }
          const ticked = fieldValues[f.key] === true
          return (
            <div key={f.key} className={`rounded-xl border p-3 ${ticked ? "border-primary/40 bg-card" : "bg-card"}`}>
              <Label className="flex cursor-pointer items-start gap-3 text-sm font-semibold">
                <Checkbox className="mt-0.5" checked={ticked} onCheckedChange={(on) => setFieldValue(f.key, !!on)} />
                <span>
                  {f.label}
                  {f.required ? <span className="text-destructive ml-1">*</span> : null}
                  {hint ? <span className="block text-[11px] font-normal text-muted-foreground">{hint}</span> : null}
                </span>
              </Label>
              {subForm}
            </div>
          )
        })}
      </div>
    </div>
  ) : serviceFields.length === 0 ? (
    <p className="rounded-xl border border-dashed px-4 py-3 text-[12px] text-muted-foreground">
      {selectedProducts.length === 1 ? `"${selectedProducts[0].name}" has` : "The selected services have"} no order form yet.
      Add one in Services Catalog → Edit → Order form, and it will appear here.
    </p>
  ) : (
    <p className="rounded-xl border border-dashed px-4 py-3 text-[12px] text-muted-foreground">
      No questions to answer here. The service form only asks for documents, on the next step.
    </p>
  )

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(v) => {
          if (!v) handleAttemptClose()
        }}
      >
      <DrawerContent className="max-w-4xl mx-auto h-[88vh] max-h-[92vh] p-0 overflow-clip gap-0 flex flex-col">
        <DrawerHeader className="px-6 pt-3 pb-4 border-b text-left space-y-3 shrink-0">
          <div>
            <DrawerTitle className="text-xl font-extrabold tracking-tight">
              {portal ? "New Order" : "Create New Order"}
            </DrawerTitle>
            <DrawerDescription className="text-sm mt-1">
              {portal
                ? "Choose the services, answer a few questions, add documents and submit."
                : selectedCustomer
                  ? `Customer: ${selectedCustomer.full_name || selectedCustomer.email}`
                  : "5-step staff order wizard — customer, products, details, documents, review."}
            </DrawerDescription>
          </div>
          <div className={`grid gap-2 w-full pt-1 ${portal ? "grid-cols-4" : "grid-cols-5"}`}>
            {steps.map((s) => (
              <StepPill key={s.id} step={s} current={step} onClick={() => goTo(s.id)} />
            ))}
          </div>
        </DrawerHeader>

        {error ? (
          <div className="mx-6 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive shrink-0">
            {error}
          </div>
        ) : null}

        <ScrollArea className="flex-1 overflow-hidden min-h-0">
          <div className="px-6 py-4 space-y-4">
            {/* STEP 1 */}
            {step === 1 && (
              <section className="space-y-4">
                <div>
                  <h4 className="text-base font-bold">Select Customer</h4>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Search or select the customer placing this order.
                  </p>
                </div>

                <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
                  <div className="relative flex-1 min-w-[240px]">
                    <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Search customer by name, email, phone..."
                      className="pl-9 text-sm"
                    />
                  </div>
                  <Tabs value={customerType} onValueChange={setCustomerType}>
                    <TabsList className="flex flex-wrap h-auto p-1 gap-1">
                      {typePills.map((p) => (
                        <TabsTrigger key={p.key} value={p.key} className="text-sm">
                          {p.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>

                {loadingCustomers ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                    <IconLoader2 className="h-4 w-4 animate-spin" /> Loading customers…
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredCustomers.length ? (
                      filteredCustomers.map((c) => {
                        const b2b = isB2BCustomer(c)
                        const selected = selectedCustomer?.id === c.id
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedCustomer(c)}
                            className={`text-left rounded-xl border-2 p-4 space-y-3 transition-all ${
                              selected
                                ? "border-primary bg-primary/5 shadow-sm"
                                : "border-border bg-card hover:border-primary/40"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <Badge className={b2b ? "badge-green text-[10px]" : isBusinessCustomer(c) ? "badge-amber text-[10px]" : "badge-sky text-[10px]"}>
                                {customerTypeLabel(c)}
                              </Badge>
                              <Checkbox checked={selected} className="pointer-events-none" />
                            </div>
                            <div>
                              <div className="font-bold text-sm leading-snug">{c.full_name || "Client"}</div>
                              <p className="text-sm text-muted-foreground mt-1 break-all line-clamp-1">{c.email}</p>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              {b2b && c.b2b_id ? (
                                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                                  {c.b2b_id}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">{c.phone || "—"}</span>
                              )}
                              {b2b && c.b2b_id && c.phone ? (
                                <span className="text-muted-foreground">{c.phone}</span>
                              ) : null}
                            </div>
                          </button>
                        )
                      })
                    ) : (
                      <div className="col-span-full text-center py-10 text-sm text-muted-foreground">
                        No matching customers found.
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <section className="space-y-4">
                <div>
                  <h4 className="text-base font-bold">Select products</h4>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Tick as many as you need. Requirements merge into one details form and one document upload.
                  </p>
                </div>

                <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
                  <div className="relative flex-1 min-w-[240px]">
                    <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Search products or services..."
                      className="pl-9 text-sm"
                    />
                  </div>
                  <Select value={category} onValueChange={(v) => setCategory(v || "All")}>
                    <SelectTrigger className="w-full lg:w-56 text-sm">
                      <SelectValue>{category === "All" ? "All categories" : category}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat === "All" ? "All categories" : cat}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>



                {loadingProducts ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                    <IconLoader2 className="h-4 w-4 animate-spin" /> Loading catalog…
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredProducts.length ? (
                      filteredProducts.map((p) => {
                        const selected = selectedProducts.some((x) => productKey(x) === productKey(p))
                        return (
                          <button
                            key={productKey(p)}
                            type="button"
                            onClick={() => toggleProduct(p)}
                            className={`text-left rounded-xl border-2 p-4 space-y-3 transition-all ${
                              selected
                                ? "border-primary bg-primary/5"
                                : "border-border bg-card hover:border-primary/40"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <Badge variant="outline" className="text-[10px]">
                                {p.category || "Service"}
                              </Badge>
                              <Checkbox checked={selected} className="pointer-events-none" />
                            </div>
                            <div>
                              <div className="font-bold text-sm leading-snug">{p.name}</div>
                              {p.description ? (
                                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                              ) : null}
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-bold text-primary">
                                {!showPrices
                                  ? ""
                                  : selectedCustomer && isB2BCustomer(selectedCustomer)
                                    ? "Custom B2B"
                                    : formatGbp(p.price)}
                              </span>
                              <span className="text-muted-foreground">{p.duration || p.estimated_delivery_time || ""}</span>
                            </div>
                          </button>
                        )
                      })
                    ) : (
                      <div className="col-span-full text-center py-10 text-sm text-muted-foreground">
                        No matching products found.
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* STEP 3 */}
            {step === 3 && (
              <section className="space-y-4">
                <div className="rounded-xl border bg-muted/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <Badge className="badge-sky text-[10px]">{selectedSummary.cat}</Badge>
                    <h4 className="text-base font-extrabold mt-1">{selectedSummary.title}</h4>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Customer: {selectedCustomer?.full_name} ({selectedCustomer?.email})
                    </p>
                  </div>
                  <div className="text-right">
                    {showPrices ? (
                      <div className="text-xl font-extrabold text-primary">
                        {selectedCustomer && isB2BCustomer(selectedCustomer)
                          ? "Custom B2B Rate"
                          : formatGbp(selectedSummary.price)}
                      </div>
                    ) : null}
                    <Button type="button" variant="ghost" size="sm" className="text-sm mt-1" onClick={() => setStep(2)}>
                      Change products
                    </Button>
                  </div>
                </div>

                {/* Only the service's own form; name, email and phone come from the selected customer */}
                {serviceDetailsBlock}
              </section>
            )}

            {/* STEP 4 */}
            {step === 4 && (
              <section className="space-y-4">
                <div>
                  <h4 className="text-base font-bold">Upload required documents once</h4>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    If you selected several products, requirements are merged and asked only once.
                  </p>
                </div>

                {/* Upload fields from the services' own forms (moved here from the Details step) */}
                {fileFields.length > 0 && (
                  <div className="rounded-xl border border-primary/30 bg-primary/[0.03] p-4 space-y-4">
                    <div>
                      <h5 className="text-sm font-bold">
                        {selectedProducts.length === 1 ? `${selectedProducts[0].name} documents` : "Service documents"}
                      </h5>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Asked by the selected {selectedProducts.length === 1 ? "service" : "services"}. A document shared by several services is asked once.
                      </p>
                    </div>
                    {fileFields.map((f) => (
                      <div key={f.key}>
                        {renderField(
                          f,
                          [
                            f.parentLabel ? `For "${f.parentLabel}"` : "",
                            selectedProducts.length > 1 ? `For ${f.services.join(", ")}` : "",
                          ].filter(Boolean).join(" · ")
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {standardDocs.length > 0 && fileFields.length > 0 && (
                  <p className="text-sm font-semibold pt-1">Other documents</p>
                )}
                <div className="space-y-2">
                  {standardDocs.map((doc) => (
                    <label
                      key={doc.key}
                      className="flex items-start gap-3 rounded-xl border bg-card p-4 cursor-pointer hover:border-primary/40"
                    >
                      <Checkbox
                        checked={!!docMarks[doc.key]}
                        onCheckedChange={(v) =>
                          setDocMarks((prev) => ({ ...prev, [doc.key]: !!v }))
                        }
                        className="mt-0.5"
                      />
                      <div>
                        <div className="text-sm font-semibold">
                          {doc.label}
                          {doc.required ? <span className="text-destructive ml-1">*</span> : null}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {doc.required
                            ? "Required before filing / completion."
                            : "Optional supporting file."}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

              </section>
            )}

            {/* STEP 5 */}
            {step === 5 && (
              <section className="space-y-4">
                <div className="rounded-2xl border bg-muted/20 p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b pb-4">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
                        {selectedSummary.cat}
                      </div>
                      <h3 className="text-xl font-extrabold mt-1">{selectedSummary.title}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Customer: {selectedCustomer?.full_name} ({selectedCustomer?.email})
                      </p>
                    </div>
                    {showPrices ? (
                      <div className="text-right">
                        <div className="text-[11px] font-semibold text-muted-foreground">AUTHORITATIVE TOTAL</div>
                        <div className="text-2xl font-extrabold">
                          {selectedCustomer && isB2BCustomer(selectedCustomer)
                            ? "Custom B2B"
                            : formatGbp(selectedSummary.price)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">No VAT</div>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border bg-card p-3">
                      <div className="text-sm font-semibold">Service form</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {textFields.length
                          ? `${textFields.filter((f) => fieldAnswer(f) && fieldAnswer(f) !== "No").length} of ${textFields.length} answered`
                          : "This service has no form questions"}
                      </div>
                    </div>
                    <div className="rounded-xl border bg-card p-3">
                      <div className="text-sm font-semibold">Required documents</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {fileFields.filter((f) => f.required && fieldFiles[f.key]).length +
                          standardDocs.filter((d) => d.required && docMarks[d.key]).length} of{" "}
                        {fileFields.filter((f) => f.required).length + standardDocs.filter((d) => d.required).length} required added
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h5 className="text-sm font-bold">Order specifications</h5>
                      <span className="text-[11px] text-muted-foreground">Checked once</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {[
                        ["Customer", formValues.full_name],
                        ["Email", formValues.email],
                        ["Products", selectedProducts.map((p) => p.name).join(", ")],
                        ...textFields.map((f) => [fieldTitle(f), fieldAnswer(f)]),
                        ...fileFields.map((f) => [fieldTitle(f), fieldFiles[f.key]?.name || ""]),
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border bg-muted/20 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                            {label}
                          </div>
                          <div className="font-medium mt-0.5 break-words whitespace-pre-line">{value || "—"}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Order Notes & Special Instructions</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={portal ? "Anything our team should know about this order..." : "Add any special instructions or staff notes..."}
                      rows={3}
                      className="text-sm"
                    />
                  </div>
                </div>
              </section>
            )}
          </div>
        </ScrollArea>

        <DrawerFooter className="px-6 py-4 border-t bg-muted/10 flex-row items-center justify-between gap-2 shrink-0 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={handleSaveDraft}
          >
            {saving ? <IconLoader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <IconBookmark className="h-3.5 w-3.5 mr-1.5" />}
            Save Draft
          </Button>
          <div className="flex gap-2">
            {step > firstStep ? (
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={handleBack}>
                Back
              </Button>
            ) : null}
            {step < 5 ? (
              <Button type="button" size="sm" disabled={saving} onClick={handleContinue}>
                Continue
                <IconArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={saving}
                onClick={handleSubmit}
              >
                {saving ? <IconLoader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Submit Order
              </Button>
            )}
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>

    <ToastSave
      open={open && showUnsavedToast}
      state={toastSaveState}
      initialText="You have unsaved changes. Discard and close order wizard?"
      discardText="Discard & Close"
      saveText="Save Draft"
      cancelText="Keep Editing"
      onCancel={() => setShowUnsavedToast(false)}
      onDiscard={() => {
        setShowUnsavedToast(false)
        resetState()
        onClose?.()
      }}
      onSave={async () => {
        setToastSaveState("loading")
        try {
          await handleSaveDraft()
          setToastSaveState("success")
          setTimeout(() => {
            setShowUnsavedToast(false)
            setToastSaveState("initial")
            onClose?.()
          }, 700)
        } catch (e) {
          setToastSaveState("initial")
        }
      }}
    />
  </>
  )
}
