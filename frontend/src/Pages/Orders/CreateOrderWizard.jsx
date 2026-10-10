import React, { useCallback, useEffect, useMemo, useState } from "react"
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
    setFormValues((prev) => ({
      ...prev,
      full_name: prev.full_name || selectedCustomer.full_name || "",
      email: prev.email || selectedCustomer.email || "",
      phone: prev.phone || selectedCustomer.phone || "",
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
      form_values: formValues,
      uploaded_docs: docMarks,
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
      if (!String(formValues.full_name || "").trim()) return "Full name is required."
      if (!String(formValues.email || "").trim()) return "Email is required."
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
      toastDone(toastId, `Order ${num} submitted successfully`)
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Full name *</Label>
                    <Input
                      className="w-full text-sm"
                      value={formValues.full_name}
                      onChange={(e) => setFormValues((f) => ({ ...f, full_name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Email *</Label>
                    <Input
                      type="email"
                      className="w-full text-sm"
                      value={formValues.email}
                      onChange={(e) => setFormValues((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Phone</Label>
                    <Input
                      className="w-full text-sm"
                      value={formValues.phone}
                      onChange={(e) => setFormValues((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Proposed company name</Label>
                    <Input
                      className="w-full text-sm"
                      value={formValues.company_name}
                      onChange={(e) => setFormValues((f) => ({ ...f, company_name: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                  <div>
                    <h5 className="text-sm font-bold">Service Access Credentials</h5>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Record the service account email and password for this order.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Service Account Email</Label>
                      <Input
                        type="email"
                        className="w-full text-sm"
                        value={formValues.access_email}
                        onChange={(e) => setFormValues((f) => ({ ...f, access_email: e.target.value }))}
                        placeholder="e.g. info@clientcompany.co.uk"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Email Password / Access Code</Label>
                      <Input
                        type="password"
                        className="w-full text-sm"
                        value={formValues.access_email_password}
                        onChange={(e) => setFormValues((f) => ({ ...f, access_email_password: e.target.value }))}
                        placeholder="Enter password / access code"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                </div>
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
                      <div className="text-sm font-semibold">Product information complete</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {formValues.full_name && formValues.email
                          ? "Required contact fields entered"
                          : "Missing required fields"}
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
                        ["Full name", formValues.full_name],
                        ["Email", formValues.email],
                        ["Phone", formValues.phone],
                        ["Company name", formValues.company_name],
                        ["Access email", formValues.access_email],
                        ["Products", selectedProducts.map((p) => p.name).join(", ")],
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
