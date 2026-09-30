import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { apiRequest } from "@/lib/api"
import { IconFileCheck, IconLoader2, IconTrash, IconUpload } from "@tabler/icons-react"

const IDENTITY_STATUSES = ["Not started", "In progress", "Verified", "Failed"]
const PSC_STATUSES = ["Not started", "In progress", "Verified", "Update required"]
const BOOK_CATEGORIES = [
  "Turnover",
  "Other income",
  "Cost of sales",
  "Staff costs",
  "Other operating charges",
  "Tax",
  "Dividends / drawings",
  "Bank charges",
  "Director loan",
  "VAT",
  "Other",
]
const OUTFLOW_CATEGORIES = new Set([
  "Cost of sales",
  "Staff costs",
  "Other operating charges",
  "Tax",
  "Dividends / drawings",
  "Bank charges",
  "VAT",
])

function formatUkDate(value) {
  const s = String(value || "").trim().slice(0, 10)
  if (!s) return "—"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(s)) return s
  return s
}

function formatGbp(amount) {
  const n = Number(amount || 0)
  const sign = n < 0 ? "-" : ""
  return `${sign}£${Math.abs(n).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function unwrapPayload(res) {
  const root = res?.data
  if (!root || typeof root !== "object") return {}
  if (root.data && typeof root.data === "object" && (root.data.readiness || root.data.company || root.data.entries)) {
    return root.data
  }
  if (root.readiness || root.company || root.entries) return root
  return root.data || root
}

function CheckCard({ label, ok, detail }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100"
          : "border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
      }`}
    >
      <div className={`text-[11px] font-semibold ${ok ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-200"}`}>
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold leading-snug break-words">{detail}</div>
    </div>
  )
}

function IssueBanner({ issue }) {
  const block = issue?.severity === "block"
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        block
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
          : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
      }`}
    >
      <strong className="font-semibold">{issue.title}</strong>
      {issue.detail ? <span className="ml-1 opacity-90">{issue.detail}</span> : null}
    </div>
  )
}

const ViewAccount = ({ isOpen, onClose, company, onProceedToFile }) => {
  const companyId = company?.id || company?.company_id
  const [workspace, setWorkspace] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [identity, setIdentity] = useState("Not started")
  const [psc, setPsc] = useState("Not started")
  const [savingChecks, setSavingChecks] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState("")
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [entryDesc, setEntryDesc] = useState("")
  const [entryCategory, setEntryCategory] = useState("Turnover")
  const [entryAmount, setEntryAmount] = useState("")
  const [entryDirection, setEntryDirection] = useState("in")
  const [savingEntry, setSavingEntry] = useState(false)

  const periodEnd = useMemo(() => {
    const raw =
      company?.period_end ||
      company?.year_end ||
      company?.accounts_next_due ||
      workspace?.period_end ||
      ""
    const s = String(raw).trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split("/")
      return `${y}-${m}-${d}`
    }
    return ""
  }, [company, workspace?.period_end])

  const applyWorkspace = useCallback((data) => {
    setWorkspace(data || null)
    const readiness = data?.readiness || {}
    setIdentity(readiness.identity?.status || "Not started")
    setPsc(readiness.psc?.status || "Not started")
  }, [])

  const fetchBooks = useCallback(async () => {
    if (!companyId) return
    setIsLoading(true)
    setError("")
    try {
      const qs = periodEnd ? `?period_end=${encodeURIComponent(periodEnd)}` : ""
      const res = await apiRequest(`/admin/accountancy/${companyId}/books${qs}`, {
        label: "Accounts workspace",
        silent: true,
      })
      if (!res.ok) {
        const res2 = await apiRequest(`/accountancy/${companyId}/books${qs}`, {
          label: "Accounts workspace",
          silent: true,
        })
        if (!res2.ok) {
          setWorkspace(null)
          setError(res2.reason || res.reason || "Unable to load the cash book.")
          return
        }
        applyWorkspace(unwrapPayload(res2))
        return
      }
      applyWorkspace(unwrapPayload(res))
    } catch (err) {
      setWorkspace(null)
      setError(err?.message || "Unable to load the cash book.")
    } finally {
      setIsLoading(false)
    }
  }, [applyWorkspace, companyId, periodEnd])

  useEffect(() => {
    if (isOpen && companyId) fetchBooks()
  }, [isOpen, companyId, fetchBooks])

  const readiness = workspace?.readiness || {}
  const issues = Array.isArray(readiness.issues) ? readiness.issues : []
  const statements = Array.isArray(workspace?.statements) ? workspace.statements : []
  const entries = Array.isArray(workspace?.entries) ? workspace.entries : []
  const totals = workspace?.totals || {}
  const wsCompany = workspace?.company || {}

  const title =
    wsCompany.name || company?.company_name || company?.name || "Accounts workspace"
  const subtitleBits = [
    wsCompany.company_number || company?.company_number,
    [wsCompany.director || company?.director || company?.owner_name, wsCompany.client_email || company?.owner_email]
      .filter(Boolean)
      .join(" · "),
    `year end ${formatUkDate(periodEnd || workspace?.period_end || company?.year_end)}`,
  ].filter(Boolean)

  const checks = [
    {
      label: "Registered office",
      ok: Boolean(readiness.address?.ok),
      detail: readiness.address?.value || "Missing",
    },
    {
      label: "Identity verification",
      ok: Boolean(readiness.identity?.ok),
      detail: readiness.identity?.status || "Not started",
    },
    {
      label: "PSC register",
      ok: Boolean(readiness.psc?.ok),
      detail: readiness.psc?.status || "Not started",
    },
    {
      label: "Authentication code",
      ok: Boolean(readiness.authentication_code?.ok),
      detail: readiness.authentication_code?.ok ? "On file" : "Missing",
    },
    {
      label: "Personal 11 digits code",
      ok: Boolean(readiness.personal_code?.ok),
      detail: readiness.personal_code?.ok ? "On file" : "Missing",
    },
    {
      label: "UTR",
      ok: Boolean(readiness.utr?.ok),
      detail: readiness.utr?.ok ? "On file" : "Missing",
    },
  ]

  const handleSaveChecks = async () => {
    if (!companyId) return
    setSavingChecks(true)
    setError("")
    try {
      const res = await apiRequest(`/admin/companies/${companyId}`, {
        method: "PUT",
        body: JSON.stringify({
          identity_verified: identity,
          psc_verified: psc,
        }),
        label: "Save checks",
      })
      if (!res.ok) {
        const res2 = await apiRequest(`/companies/${companyId}`, {
          method: "PUT",
          body: JSON.stringify({
            identity_verified: identity,
            psc_verified: psc,
          }),
          label: "Save checks",
        })
        if (!res2.ok) {
          setError(res2.reason || res.reason || "Could not save verification.")
          return
        }
      }
      toast.success("Checks saved")
      await fetchBooks()
    } finally {
      setSavingChecks(false)
    }
  }

  const handleUpload = async (event) => {
    event.preventDefault()
    const fileInput = event.currentTarget.elements.namedItem("statementFile")
    const file = fileInput?.files?.[0]
    if (!companyId || !file) {
      setUploadStatus("Choose a bank statement file.")
      return
    }
    setUploading(true)
    setUploadStatus("Uploading…")
    try {
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = String(reader.result || "")
          const parts = result.split(",")
          resolve(parts.length > 1 ? parts[1] : result)
        }
        reader.onerror = () => reject(reader.error || new Error("Read failed"))
        reader.readAsDataURL(file)
      })
      const payload = {
        company_id: companyId,
        name: file.name,
        file_name: file.name,
        category: "Bank statement",
        file_content_base64: b64,
        mime_type: file.type || "application/pdf",
      }
      if (wsCompany.client_id || company?.user_id || company?.client_id) {
        payload.client_id = wsCompany.client_id || company.user_id || company.client_id
      }
      let res = await apiRequest("/admin/documents", {
        method: "POST",
        body: JSON.stringify(payload),
        label: "Upload statement",
        silent: true,
      })
      if (!res.ok) {
        res = await apiRequest("/documents", {
          method: "POST",
          body: JSON.stringify(payload),
          label: "Upload statement",
        })
      }
      if (!res.ok) {
        setUploadStatus(res.reason || "Upload failed")
        return
      }
      setUploadStatus("Uploaded")
      toast.success("Bank statement uploaded")
      if (fileInput) fileInput.value = ""
      await fetchBooks()
    } catch (err) {
      setUploadStatus(err?.message || "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const handleAddEntry = async (event) => {
    event.preventDefault()
    if (!entryDesc.trim() || !entryAmount) {
      toast.error("Please enter a description and amount")
      return
    }
    setSavingEntry(true)
    try {
      const res = await apiRequest(`/admin/accountancy/${companyId}/books`, {
        method: "POST",
        body: JSON.stringify({
          description: entryDesc.trim(),
          amount: entryAmount,
          category: entryCategory,
          direction: entryDirection,
          entry_date: entryDate,
          period_end: periodEnd || undefined,
        }),
        label: "Cash book entry",
      })
      if (!res.ok) {
        toast.error(res.reason || "Failed to add line")
        return
      }
      toast.success("Cash book line entry recorded.")
      setEntryDesc("")
      setEntryAmount("")
      await fetchBooks()
    } finally {
      setSavingEntry(false)
    }
  }

  const handleDeleteEntry = async (id) => {
    const res = await apiRequest(`/admin/accountancy/${companyId}/books/${id}`, {
      method: "DELETE",
      label: "Remove entry",
    })
    if (res.ok) {
      toast.success("Entry removed from cash book.")
      await fetchBooks()
    }
  }

  const categoryOptions = workspace?.book_categories?.length
    ? workspace.book_categories
    : BOOK_CATEGORIES

  if (!company && !isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[720px] p-0 overflow-hidden gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b text-left space-y-1 shrink-0">
          <DialogTitle className="text-lg font-bold tracking-tight">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {subtitleBits.join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[min(70vh,640px)]">
          <div className="px-6 py-4 space-y-6">
            {error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {isLoading && !workspace ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <IconLoader2 className="h-4 w-4 animate-spin" />
                Loading workspace…
              </div>
            ) : (
              <>
                {/* UK filing checks */}
                <section className="space-y-3">
                  <div>
                    <h4 className="text-sm font-bold">UK filing checks</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Companies Act registered office, ECCTA identity verification, PSC register, and Companies House codes.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {checks.map((item) => (
                      <CheckCard key={item.label} {...item} />
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Identity verification</Label>
                      <Select value={identity} onValueChange={setIdentity}>
                        <SelectTrigger className="w-full text-xs">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-hidden p-0">
                          <ScrollArea className="h-auto max-h-60 w-full p-1">
                            <SelectGroup>
                              {(workspace?.identity_statuses || IDENTITY_STATUSES).map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectGroup>
                          </ScrollArea>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">PSC verification</Label>
                      <Select value={psc} onValueChange={setPsc}>
                        <SelectTrigger className="w-full text-xs">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-hidden p-0">
                          <ScrollArea className="h-auto max-h-60 w-full p-1">
                            <SelectGroup>
                              {(workspace?.psc_statuses || PSC_STATUSES).map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectGroup>
                          </ScrollArea>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={savingChecks}
                      onClick={handleSaveChecks}
                    >
                      {savingChecks ? <IconLoader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      Save checks
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {issues.length ? (
                      issues.map((issue, idx) => <IssueBanner key={`${issue.code}-${idx}`} issue={issue} />)
                    ) : (
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                        UK filing checks are complete for this period.
                      </p>
                    )}
                  </div>
                </section>

                {/* Bank statements */}
                <section className="space-y-3">
                  <div>
                    <h4 className="text-sm font-bold">Bank statements</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Upload the period statements, then post each line into the cash book.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {statements.length ? (
                      statements.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{doc.name || "Bank statement"}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {[doc.file_size, formatUkDate(String(doc.created_at || "").slice(0, 10))]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No bank statements on file for this company yet.</p>
                    )}
                  </div>

                  <form onSubmit={handleUpload} className="space-y-3 rounded-xl border bg-card p-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Statement file</Label>
                      <Input
                        name="statementFile"
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.zip"
                        className="w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium"
                        required
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                      <span className="text-[11px] text-muted-foreground min-h-4">
                        {uploadStatus || "PDF, image, Word, or ZIP"}
                      </span>
                      <Button type="submit" variant="outline" size="sm" className="w-full sm:w-auto" disabled={uploading}>
                        {uploading ? <IconLoader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <IconUpload className="h-3.5 w-3.5 mr-1.5" />}
                        Upload statement
                      </Button>
                    </div>
                  </form>
                </section>

                {/* Cash book */}
                <section className="space-y-3">
                  <div>
                    <h4 className="text-sm font-bold">Cash book</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      FRS 105 headings for micro-entity accounts. Receipts are positive; costs and drawings are payments out.
                    </p>
                  </div>

                  <form onSubmit={handleAddEntry} className="space-y-4 rounded-xl border bg-card p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">Date</Label>
                        <Input
                          type="date"
                          value={entryDate}
                          onChange={(e) => setEntryDate(e.target.value)}
                          className="w-full text-xs"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">Heading</Label>
                        <Select
                          value={entryCategory}
                          onValueChange={(val) => {
                            setEntryCategory(val)
                            setEntryDirection(OUTFLOW_CATEGORIES.has(val) ? "out" : "in")
                          }}
                        >
                          <SelectTrigger className="w-full text-xs">
                            <SelectValue placeholder="Select heading" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 w-(--anchor-width) overflow-hidden p-0">
                            <ScrollArea className="h-60 w-full p-1">
                              <SelectGroup>
                                {categoryOptions.map((c) => (
                                  <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                              </SelectGroup>
                            </ScrollArea>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Description</Label>
                      <Input
                        value={entryDesc}
                        onChange={(e) => setEntryDesc(e.target.value)}
                        placeholder="Statement narrative"
                        maxLength={200}
                        className="w-full text-xs"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">Amount (£)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={entryAmount}
                          onChange={(e) => setEntryAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full text-xs"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">Direction</Label>
                        <Select value={entryDirection} onValueChange={setEntryDirection}>
                          <SelectTrigger className="w-full text-xs">
                            <SelectValue placeholder="In / Out" />
                          </SelectTrigger>
                          <SelectContent className="overflow-hidden p-0">
                            <SelectGroup className="p-1">
                              <SelectItem value="in">In (receipt)</SelectItem>
                              <SelectItem value="out">Out (payment)</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button type="submit" size="sm" className="w-full sm:w-auto" disabled={savingEntry}>
                        {savingEntry ? <IconLoader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                        Add line
                      </Button>
                    </div>
                  </form>

                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] font-medium">
                      In {formatGbp(totals.inflows)}
                    </span>
                    <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] font-medium">
                      Out {formatGbp(totals.outflows)}
                    </span>
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      Net {formatGbp(totals.net)}
                    </span>
                    {(totals.by_category || []).map((item) => (
                      <span key={item.category} className="rounded-full border bg-card px-2.5 py-1 text-[11px]">
                        {item.category} {formatGbp(item.amount)}
                      </span>
                    ))}
                  </div>

                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Description</TableHead>
                          <TableHead className="text-xs">Heading</TableHead>
                          <TableHead className="text-xs">Amount</TableHead>
                          <TableHead className="text-xs">Source</TableHead>
                          <TableHead className="text-xs w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.length ? (
                          entries.map((entry) => {
                            const amount = Number(entry.amount || 0)
                            return (
                              <TableRow key={entry.id}>
                                <TableCell className="text-xs">{formatUkDate(entry.entry_date)}</TableCell>
                                <TableCell className="text-xs font-medium">{entry.description || entry.desc || ""}</TableCell>
                                <TableCell className="text-xs">{entry.category || "Other"}</TableCell>
                                <TableCell className={`text-xs font-semibold ${amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                  {formatGbp(amount)}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {entry.source === "bank_statement" ? "Statement" : "Manual"}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDeleteEntry(entry.id)}
                                  >
                                    <IconTrash className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="h-20 text-center text-xs text-muted-foreground">
                              No cash book lines yet. Post each bank statement line here.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-3 border-t bg-muted/20 flex-row justify-between sm:justify-between gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              onClose()
              if (onProceedToFile) onProceedToFile(company)
            }}
          >
            <IconFileCheck className="h-4 w-4" />
            {readiness.can_file ? "File accounts" : "File anyway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ViewAccount
