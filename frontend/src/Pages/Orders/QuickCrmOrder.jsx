import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { toastProcessing, toastDone, toastFail } from "@/lib/toastActions"
import { apiRequest } from "@/lib/api"
import ToastSave from "@/components/ToastSave"
import { IconLoader2, IconPlus, IconTrash } from "@tabler/icons-react"

const COMPANY_TYPES = [
  "Private Limited Company by Shares (LTD)",
  "Limited Liability Partnership (LLP)",
  "Public Limited Company (PLC)",
  "Company Limited by Guarantee",
  "Sole Trader / Business Partnership",
]

const SIC_CODES = [
  "62020 - Information technology consultancy activities",
  "70229 - Management consultancy activities other than financial management",
  "68209 - Letting and operating of own or leased real estate",
  "47910 - Retail sale via mail order houses or via Internet",
  "82990 - Other business support service activities n.e.c.",
  "Other",
]

const PAYMENT_CHANNELS = [
  "Website Checkout",
  "Bank Transfer",
  "Invoice",
  "Manual CRM",
  "Card Payment",
]

const INITIAL_STATUSES = ["Pending", "In Progress", "Completed"]

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

function newLine() {
  return {
    id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    product_name: "",
    price: "",
  }
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl border bg-muted/20 p-4 sm:p-5 space-y-4">
      <h4 className="text-sm font-bold text-foreground">{title}</h4>
      {children}
    </section>
  )
}

export default function QuickCrmOrder({ open, onClose, onCreated }) {
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [loadingClients, setLoadingClients] = useState(false)
  const [loadingCompanies, setLoadingCompanies] = useState(false)
  const [services, setServices] = useState([])

  const [clientMode, setClientMode] = useState("existing")
  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState("")
  const [newClientName, setNewClientName] = useState("")
  const [newClientEmail, setNewClientEmail] = useState("")

  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState("none")
  const [companyName, setCompanyName] = useState("")
  const [companyType, setCompanyType] = useState(COMPANY_TYPES[0])
  const [sicCode, setSicCode] = useState(SIC_CODES[0])
  const [companyEmail, setCompanyEmail] = useState("")
  const [companyPhone, setCompanyPhone] = useState("")
  const [regAddress, setRegAddress] = useState("")
  const [regCity, setRegCity] = useState("")
  const [regPostcode, setRegPostcode] = useState("")

  const [ownerName, setOwnerName] = useState("")
  const [directorPhone, setDirectorPhone] = useState("")
  const [directorNationality, setDirectorNationality] = useState("")
  const [directorResidence, setDirectorResidence] = useState("United Kingdom")

  const [lines, setLines] = useState([newLine()])
  const [paymentMode, setPaymentMode] = useState("Manual CRM")
  const [status, setStatus] = useState("Pending")
  const [notes, setNotes] = useState("")
  const [showUnsavedToast, setShowUnsavedToast] = useState(false)
  const [toastSaveState, setToastSaveState] = useState("initial")

  const isDirty = Boolean(
    clientId ||
    newClientName.trim() ||
    newClientEmail.trim() ||
    companyName.trim() ||
    (companyEmail.trim() && companyEmail !== clients.find((c) => String(c.id) === String(clientId))?.email) ||
    companyPhone.trim() ||
    regAddress.trim() ||
    ownerName.trim() ||
    lines.some((l) => l.product_name.trim() || l.price) ||
    notes.trim()
  )

  const total = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const n = parseFloat(line.price)
        return sum + (Number.isFinite(n) && n > 0 ? n : 0)
      }, 0),
    [lines]
  )

  const resetForm = useCallback(() => {
    setError("")
    setClientMode("existing")
    setClientId("")
    setNewClientName("")
    setNewClientEmail("")
    setCompanies([])
    setCompanyId("none")
    setCompanyName("")
    setCompanyType(COMPANY_TYPES[0])
    setSicCode(SIC_CODES[0])
    setCompanyEmail("")
    setCompanyPhone("")
    setRegAddress("")
    setRegCity("")
    setRegPostcode("")
    setOwnerName("")
    setDirectorPhone("")
    setDirectorNationality("")
    setDirectorResidence("United Kingdom")
    setLines([newLine()])
    setPaymentMode("Manual CRM")
    setStatus("Pending")
    setNotes("")
  }, [])

  const loadClients = useCallback(async () => {
    setLoadingClients(true)
    try {
      const res = await apiRequest("/admin/customers?limit=500", {
        label: "Customers",
        silent: true,
      })
      setClients(unwrapList(res, ["customers", "clients", "users"]))
    } finally {
      setLoadingClients(false)
    }
  }, [])

  const loadServices = useCallback(async () => {
    let res = await apiRequest("/admin/services", { label: "Services", silent: true })
    let list = unwrapList(res, ["services", "products"])
    if (!list.length) {
      res = await apiRequest("/catalog/products", { label: "Catalog", silent: true })
      list = unwrapList(res, ["products", "services"])
    }
    setServices(list)
  }, [])

  const loadCompaniesForClient = useCallback(async (cid) => {
    setCompanies([])
    setCompanyId("none")
    if (!cid) return
    setLoadingCompanies(true)
    try {
      const res = await apiRequest(`/admin/companies?client_id=${cid}&limit=200`, {
        label: "Companies",
        silent: true,
      })
      const list = unwrapList(res, ["companies"])
      setCompanies(
        list.map((c) => ({
          id: c.id,
          name: c.name || c.company_name || "Company",
        }))
      )
    } finally {
      setLoadingCompanies(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    resetForm()
    loadClients()
    loadServices()
  }, [open, resetForm, loadClients, loadServices])

  useEffect(() => {
    if (clientMode !== "existing" || !clientId) {
      setCompanies([])
      setCompanyId("none")
      return
    }
    const selected = clients.find((c) => String(c.id) === String(clientId))
    if (selected?.email) setCompanyEmail(selected.email)
    if (selected?.full_name && !ownerName) setOwnerName(selected.full_name)
    loadCompaniesForClient(clientId)
  }, [clientId, clientMode, clients, loadCompaniesForClient]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateLine = (id, field, value) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line
        const next = { ...line, [field]: value }
        if (field === "product_name") {
          const match = services.find((s) => s.name === value)
          if (match && match.price != null) next.price = String(match.price)
        }
        return next
      })
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")

    const line_items = lines
      .map((l) => ({
        product_name: String(l.product_name || "").trim(),
        price: parseFloat(l.price) || 0,
      }))
      .filter((l) => l.product_name)

    if (!line_items.length) {
      setError("Please add at least one product or service.")
      return
    }
    if (clientMode === "existing" && !clientId) {
      setError("Please select a client.")
      return
    }
    if (clientMode === "new" && (!newClientName.trim() || !newClientEmail.trim())) {
      setError("Please enter the new client name and email.")
      return
    }
    if (!companyEmail.trim()) {
      setError("Please enter the company notification email.")
      return
    }

    const payload = {
      client_mode: clientMode,
      client_id: clientMode === "existing" ? clientId : undefined,
      new_client_full_name: clientMode === "new" ? newClientName.trim() : undefined,
      new_client_email: clientMode === "new" ? newClientEmail.trim() : undefined,
      company_id: companyId !== "none" ? companyId : "",
      company_name: companyName.trim(),
      company_type: companyType,
      sic_code: sicCode,
      company_email: companyEmail.trim(),
      company_phone: companyPhone.trim(),
      reg_office: [regAddress, regCity, regPostcode].map((s) => s.trim()).filter(Boolean).join(", "),
      registered_address_line1: regAddress.trim(),
      registered_city: regCity.trim(),
      registered_postcode: regPostcode.trim(),
      owner_name: ownerName.trim(),
      director_phone: directorPhone.trim(),
      director_nationality: directorNationality.trim(),
      director_residence: directorResidence.trim() || "United Kingdom",
      payment_mode: paymentMode,
      status,
      notes: notes.trim(),
      line_items,
    }

    setSubmitting(true)
    const toastId = toastProcessing("Creating order…")
    try {
      let res = await apiRequest("/admin/orders", {
        method: "POST",
        body: JSON.stringify(payload),
        label: "Create manual order",
        silent: true,
      })
      if (!res.ok) {
        res = await apiRequest("/orders", {
          method: "POST",
          body: JSON.stringify(payload),
          label: "Create manual order",
          silent: true,
        })
      }
      if (!res.ok) {
        setError(res.reason || "Could not create order.")
        toastFail(toastId, res.reason || "Could not create order.")
        return
      }
      const data = res.data?.data || res.data || {}
      const num = data.order_number || data.order?.order_number
      toastDone(toastId, res.data?.message || `Order ${num || ""} created successfully.`)
      onClose?.()
      onCreated?.(data)
    } finally {
      setSubmitting(false)
    }
  }

  const handleAttemptClose = () => {
    if (submitting) return
    if (isDirty) {
      setShowUnsavedToast(true)
    } else {
      onClose?.()
    }
  }

  return (
    <>
      <Drawer open={open} onOpenChange={(v) => { if (!v) handleAttemptClose() }}>
        <DrawerContent className="max-w-4xl mx-auto h-[90vh] max-h-[94vh] p-0 overflow-clip gap-0 flex flex-col">
          <DrawerHeader className="px-6 pt-3 pb-3 border-b text-left space-y-1 shrink-0">
          <DrawerTitle className="text-xl font-extrabold tracking-tight">
            Create Manual Order &amp; Company Registration
          </DrawerTitle>
          <DrawerDescription className="text-sm">
            Complete official company formation and registration details. Portal login stays on the client; work
            notifications go to the company email.
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="px-6 py-4 space-y-5">
              {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
                  {error}
                </div>
              ) : null}

              <Section title="1. Client Account & Contact Details">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Client Type</Label>
                  <div className="flex flex-wrap gap-4 text-sm font-medium">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="client-mode"
                        checked={clientMode === "existing"}
                        onChange={() => setClientMode("existing")}
                        className="accent-primary"
                      />
                      Existing client
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="client-mode"
                        checked={clientMode === "new"}
                        onChange={() => setClientMode("new")}
                        className="accent-primary"
                      />
                      New client signup
                    </label>
                  </div>
                </div>

                {clientMode === "existing" ? (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Select Client Account *</Label>
                    <Select value={clientId || undefined} onValueChange={setClientId} disabled={loadingClients}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="-- Select Client --" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-hidden p-0">
                        <ScrollArea className="h-60 w-full p-1">
                          <SelectGroup>
                            {clients.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.full_name || "Client"} ({c.email})
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Client Full Name *</Label>
                      <Input
                        className="w-full"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        placeholder="e.g. Alexander Vance"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Portal Login Email *</Label>
                      <Input
                        type="email"
                        className="w-full"
                        value={newClientEmail}
                        onChange={(e) => setNewClientEmail(e.target.value)}
                        placeholder="client@example.com"
                      />
                    </div>
                  </div>
                )}
              </Section>

              <Section title="2. Company Formation & Registration Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Existing Company (Optional)</Label>
                    <Select value={companyId} onValueChange={setCompanyId} disabled={loadingCompanies}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="No company / create with details below" />
                      </SelectTrigger>
                      <SelectContent className="overflow-hidden p-0">
                        <SelectGroup className="p-1">
                          <SelectItem value="none">No company / create with details below</SelectItem>
                          {companies.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Company Registered Name</Label>
                    <Input
                      className="w-full"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. BRIXEN CONSULTANTS LTD"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Company Entity Type</Label>
                    <Select value={companyType} onValueChange={setCompanyType}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="overflow-hidden p-0">
                        <SelectGroup className="p-1">
                          {COMPANY_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">SIC Code / Business Activity</Label>
                    <Select value={sicCode} onValueChange={setSicCode}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="overflow-hidden p-0">
                        <SelectGroup className="p-1">
                          {SIC_CODES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Company Work Notification Email *</Label>
                    <Input
                      type="email"
                      required
                      className="w-full"
                      value={companyEmail}
                      onChange={(e) => setCompanyEmail(e.target.value)}
                      placeholder="contact@company.co.uk"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Company Contact Phone</Label>
                    <Input
                      className="w-full"
                      value={companyPhone}
                      onChange={(e) => setCompanyPhone(e.target.value)}
                      placeholder="+44 20 7946 0912"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Registered Office Address</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3">
                    <Input
                      className="w-full"
                      value={regAddress}
                      onChange={(e) => setRegAddress(e.target.value)}
                      placeholder="Address Line 1 (e.g. 128 City Road)"
                    />
                    <Input
                      className="w-full"
                      value={regCity}
                      onChange={(e) => setRegCity(e.target.value)}
                      placeholder="City (e.g. London)"
                    />
                    <Input
                      className="w-full"
                      value={regPostcode}
                      onChange={(e) => setRegPostcode(e.target.value)}
                      placeholder="Postcode (e.g. EC1V 2NX)"
                    />
                  </div>
                </div>
              </Section>

              <Section title="3. Director & Officer Information">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Director / Owner Full Name</Label>
                    <Input
                      className="w-full"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g. Eleanor Finch"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Director Direct Phone</Label>
                    <Input
                      className="w-full"
                      value={directorPhone}
                      onChange={(e) => setDirectorPhone(e.target.value)}
                      placeholder="+44 7700 900077"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Director Nationality</Label>
                    <Input
                      className="w-full"
                      value={directorNationality}
                      onChange={(e) => setDirectorNationality(e.target.value)}
                      placeholder="e.g. British / Pakistani"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Country of Residence</Label>
                    <Input
                      className="w-full"
                      value={directorResidence}
                      onChange={(e) => setDirectorResidence(e.target.value)}
                      placeholder="e.g. United Kingdom"
                    />
                  </div>
                </div>
              </Section>

              <Section title="4. Ordered Products, Pricing & Payment Mode *">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">Add one or more services for this order.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setLines((prev) => [...prev, newLine()])}
                  >
                    <IconPlus className="h-3.5 w-3.5 mr-1" />
                    Add Product / Service
                  </Button>
                </div>

                <div className="space-y-2">
                  {lines.map((line) => (
                    <div key={line.id} className="grid grid-cols-1 sm:grid-cols-[1fr_110px_36px] gap-2 items-center">
                      <Input
                        list="manual-order-service-list"
                        className="w-full"
                        placeholder="Service / Product name"
                        value={line.product_name}
                        onChange={(e) => updateLine(line.id, "product_name", e.target.value)}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="w-full"
                        placeholder="Price (£)"
                        value={line.price}
                        onChange={(e) => updateLine(line.id, "price", e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="text-destructive"
                        onClick={() =>
                          setLines((prev) => (prev.length <= 1 ? [newLine()] : prev.filter((l) => l.id !== line.id)))
                        }
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <datalist id="manual-order-service-list">
                    {services.map((s) => (
                      <option key={s.id || s.name} value={s.name} />
                    ))}
                  </datalist>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Payment Channel</Label>
                    <Select value={paymentMode} onValueChange={setPaymentMode}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="overflow-hidden p-0">
                        <SelectGroup className="p-1">
                          {PAYMENT_CHANNELS.map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Initial Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="overflow-hidden p-0">
                        <SelectGroup className="p-1">
                          {INITIAL_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-right sm:pt-6">
                    <div className="text-[11px] font-semibold uppercase text-muted-foreground">Total Amount</div>
                    <div className="text-xl font-extrabold mt-0.5">£{total.toFixed(2)}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Internal Notes & Special Instructions</Label>
                  <Textarea
                    className="text-sm min-h-16"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add internal notes or special customer instructions..."
                  />
                </div>
              </Section>
            </div>
            </ScrollArea>
          </div>

          <DrawerFooter className="px-6 py-4 border-t bg-muted/10 flex-row items-center justify-end gap-2 shrink-0 sm:justify-end">
            <Button type="button" variant="outline" disabled={submitting} onClick={handleAttemptClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <IconLoader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Create Order & Record Registration
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>

    <ToastSave
      open={open && showUnsavedToast}
      state={toastSaveState}
      initialText="You have unsaved changes. Discard and close?"
      discardText="Discard & Close"
      saveText="Create Order"
      cancelText="Keep Editing"
      onCancel={() => setShowUnsavedToast(false)}
      onDiscard={() => {
        setShowUnsavedToast(false)
        resetForm()
        onClose?.()
      }}
      onSave={async (e) => {
        setToastSaveState("loading")
        try {
          await handleSubmit(e || { preventDefault: () => {} })
          setToastSaveState("success")
          setTimeout(() => {
            setShowUnsavedToast(false)
            setToastSaveState("initial")
          }, 700)
        } catch (err) {
          setToastSaveState("initial")
        }
      }}
    />
  </>
  )
}
