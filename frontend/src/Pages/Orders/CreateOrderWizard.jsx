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

/**
 * Order-form fields from every selected service, merged so the same question (same label + type) is asked
 * once even when several services need it. Each keeps the names of the services that asked for it.
 */
function mergeFieldList(list, fields, serviceName, parentKey) {
  for (const f of Array.isArray(fields) ? fields : []) {
    const key = `${parentKey ? `${parentKey}>` : ""}${f.type}:${String(f.label || "").trim().toLowerCase()}`
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
 * "Company" order-form field: the typed name or number is checked at Companies House. Registered -> the
 * official name and number are kept; not registered -> the typed text is kept as the proposed company name.
 * The value is an object { input, state, name, number, companyStatus, address, suggestions, inCrm }.
 */
function CompanyCheckField({ id, value, onChange, placeholder }) {
  const current = value && typeof value === "object" ? value : { input: "", state: "idle" }
  const input = current.input || ""
  // Latest typed text: a slow Companies House answer for older text must not overwrite newer typing
  const latestInput = useRef(input)
  latestInput.current = input

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
      } else if (d.registered && d.match) {
        onChange({ input, state: "registered", name: d.match.name, number: d.match.number, companyStatus: d.match.status,
          address: d.match.address, inCrm: d.in_crm || null, suggestions: [] })
      } else {
        onChange({ input, state: "not_registered", suggestions: d.suggestions || [] })
      }
    }, 600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, current.state])

  const pickSuggestion = (s) =>
    onChange({ input: s.name, state: "registered", name: s.name, number: s.number, companyStatus: s.status, address: s.address, suggestions: [] })

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

      {current.state === "registered" ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[12px]">
          <IconCircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">Registered at Companies House</p>
            <p className="truncate">{current.name} · {current.number}{current.companyStatus ? ` · ${current.companyStatus}` : ""}</p>
            {current.address ? <p className="truncate text-muted-foreground">{current.address}</p> : null}
            {current.inCrm ? <p className="text-muted-foreground">Already in the CRM as "{current.inCrm.name}"</p> : null}
          </div>
        </div>
      ) : null}

      {current.state === "not_registered" ? (
        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px]">
          <p className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
            <IconInfoCircle className="h-4 w-4" />
            Not registered. "{input.trim()}" will be used as the proposed company name.
          </p>
          {(current.suggestions || []).length ? (
            <div>
              <p className="text-muted-foreground">Did you mean one of these registered companies?</p>
              <div className="mt-1 flex flex-col gap-1">
                {current.suggestions.map((s) => (
                  <button
                    key={s.number}
                    type="button"
                    className="cursor-pointer truncate rounded-md px-2 py-1 text-left hover:bg-muted"
                    onClick={() => pickSuggestion(s)}
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground"> · {s.number}{s.status ? ` · ${s.status}` : ""}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {current.state === "error" ? (
        <p className="text-[12px] text-destructive">{current.error}. The typed name will be kept as entered.</p>
      ) : null}
    </div>
  )
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
          placeholder={placeholder || "e.g. Brixen Ventures Ltd"}
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
          className="text-sm"
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
          <Button type="button" variant="ghost" size="sm" onClick={() => onFile(null)}>Remove</Button>
        ) : null}
      </div>
      {file ? (
        <p className="text-[11px] text-emerald-600">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>
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
      <Label htmlFor={["text", "company", "company_name"].includes(field.type) ? id : undefined} className="text-sm font-semibold">
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

function formatGbp(n) {
  return `£${Number(n || 0).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

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

export default function CreateOrderWizard({ open, onClose, onCreated }) {
  const [step, setStep] = useState(1)
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
    selectedCustomer ||
    selectedProducts.length > 0 ||
    notes.trim() ||
    Object.keys(docMarks).length > 0 ||
    formValues.full_name.trim() ||
    formValues.company_name.trim() ||
    formValues.access_email.trim()
  )

  const resetState = useCallback(() => {
    setStep(1)
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
  }, [])

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true)
    try {
      const res = await apiRequest("/admin/customers?limit=500", {
        label: "Customers",
        silent: true,
      })
      setCustomers(unwrapList(res, ["customers", "clients", "users"]))
    } finally {
      setLoadingCustomers(false)
    }
  }, [])

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
  const fieldAnswer = (f) => {
    const v = fieldValues[f.key]
    if (f.type === "checkbox") return v === true ? "Yes" : "No"
    if (f.type === "company") {
      if (!v || !String(v.input || "").trim()) return ""
      if (v.state === "registered") return `${v.name} (${v.number}) · Registered${v.companyStatus ? `, ${v.companyStatus}` : ""}`
      if (v.state === "not_registered") return `${v.input.trim()} · Not registered (proposed name)`
      return `${v.input.trim()} · Not checked at Companies House`
    }
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
          if (f.type === "company" && v && String(v.input || "").trim()) {
            item.company = {
              registered: v.state === "registered",
              name: v.state === "registered" ? v.name : v.input.trim(),
              number: v.state === "registered" ? v.number : "",
              status: v.companyStatus || "",
            }
          }
          if (f.type === "company_name" && v && String(v.input || "").trim()) {
            item.name_check = { name: v.input.trim(), available: v.state === "available", checked: ["available", "taken"].includes(v.state) }
          }
          return item
        }),
      },
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
      if (lookups.some((f) => ["typing", "checking"].includes(fieldValues[f.key]?.state))) {
        return "Wait a moment, Companies House is still being checked."
      }
      const taken = lookups.filter((f) => f.type === "company_name" && fieldValues[f.key]?.state === "taken")
      if (taken.length) return `"${fieldValues[taken[0].key].input.trim()}" is already registered. Choose a different company name.`
      const missingText = textFields.filter((f) => {
        if (!f.required) return false
        if (f.type === "checkbox") return fieldValues[f.key] !== true
        if (f.type === "company" || f.type === "company_name") return !String(fieldValues[f.key]?.input || "").trim()
        return !String(fieldValues[f.key] || "").trim()
      })
      if (missingText.length) return `Complete: ${missingText.map(fieldTitle).join(", ")}.`
      const missingFiles = fileFields.filter((f) => f.required && !fieldFiles[f.key])
      if (missingFiles.length) return `Upload: ${missingFiles.map(fieldTitle).join(", ")}.`
    }
    if (targetStep > 4) {
      const missing = DEFAULT_DOCS.filter((d) => d.required && !docMarks[d.key])
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
    setStep((s) => Math.max(1, s - 1))
  }

  const toggleProduct = (product) => {
    setSelectedProducts((prev) => {
      const exists = prev.some((p) => p.id === product.id)
      if (exists) return prev.filter((p) => p.id !== product.id)
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
      const res = await apiRequest("/orders/draft", {
        method: "POST",
        body: JSON.stringify(buildPayload(step)),
        label: "Save draft",
        silent: true,
      })
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
      const res = await apiRequest("/admin/orders", {
        method: "POST",
        body: JSON.stringify(buildPayload(5)),
        label: "Create order",
        silent: true,
      })
      let final = res
      if (!res.ok) {
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
          const up = await apiRequest("/admin/documents/upload", {
            method: "POST",
            body: {
              order_id: orderId,
              client_id: selectedCustomer?.id,
              name: fieldTitle(f),
              file_name: file.name,
              file_content_base64: await readFileAsBase64(file),
              mime_type: file.type || "application/octet-stream",
              category: f.label,
              client_visible: 0,
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

  const setFieldValue = (key, val) => setFieldValues((v) => ({ ...v, [key]: val }))
  const setFieldFile = (key, file) =>
    setFieldFiles((v) => {
      const next = { ...v }
      if (file) next[key] = file
      else delete next[key]
      return next
    })
  // The whole service form (uploads included) is shown on the Details step, in the order it was built
  const detailServiceFields = serviceFields
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
          const opened = openedChildren(f, fieldValues)
          // Fields opened by a ticked checkbox or the chosen radio answer, indented under it
          const subForm = opened.length > 0 ? (
            <div className="mt-3 space-y-4 border-l-2 border-primary/30 pl-4">
              {opened.map((c) => <div key={c.key}>{renderField(c)}</div>)}
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
  ) : null

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(v) => {
          if (!v) handleAttemptClose()
        }}
      >
      <DrawerContent className="max-w-4xl mx-auto h-[88vh] max-h-[92vh] p-0 overflow-hidden gap-0 flex flex-col">
        <DrawerHeader className="px-6 pt-3 pb-4 border-b text-left space-y-3 shrink-0">
          <div>
            <DrawerTitle className="text-xl font-extrabold tracking-tight">Create New Order</DrawerTitle>
            <DrawerDescription className="text-sm mt-1">
              {selectedCustomer
                ? `Customer: ${selectedCustomer.full_name || selectedCustomer.email}`
                : "5-step staff order wizard — customer, products, details, documents, review."}
            </DrawerDescription>
          </div>
          <div className="grid grid-cols-5 gap-2 w-full pt-1">
            {STEPS.map((s) => (
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
                        const selected = selectedProducts.some((x) => x.id === p.id)
                        return (
                          <button
                            key={p.id}
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
                                {selectedCustomer && isB2BCustomer(selectedCustomer)
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
                    <div className="text-xl font-extrabold text-primary">
                      {selectedCustomer && isB2BCustomer(selectedCustomer)
                        ? "Custom B2B Rate"
                        : formatGbp(selectedSummary.price)}
                    </div>
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
                <div className="space-y-2">
                  {DEFAULT_DOCS.map((doc) => (
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

                {fileFields.length > 0 && (
                  <p className="rounded-xl border bg-muted/20 px-4 py-3 text-[12px] text-muted-foreground">
                    Service documents chosen on the Details step:{" "}
                    {fileFields.map((f) => `${fieldTitle(f)} ${fieldFiles[f.key] ? "✓" : "(not added)"}`).join(", ")}
                  </p>
                )}
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
                    <div className="text-right">
                      <div className="text-[11px] font-semibold text-muted-foreground">AUTHORITATIVE TOTAL</div>
                      <div className="text-2xl font-extrabold">
                        {selectedCustomer && isB2BCustomer(selectedCustomer)
                          ? "Custom B2B"
                          : formatGbp(selectedSummary.price)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">No VAT</div>
                    </div>
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
                        {DEFAULT_DOCS.filter((d) => d.required && docMarks[d.key]).length} of{" "}
                        {DEFAULT_DOCS.filter((d) => d.required).length} required marked
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
                          <div className="font-medium mt-0.5 break-words">{value || "—"}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Order Notes & Special Instructions</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any special instructions or staff notes..."
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
            {step > 1 ? (
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
