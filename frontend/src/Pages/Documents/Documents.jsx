import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  IconRefresh,
  IconUpload,
  IconEye,
  IconDownload,
  IconTrash,
  IconCheck,
  IconLoader2,
  IconClipboardCheck,
} from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "../../Layout/DataTable"
import UploadDocumentModal from "./UploadDocumentModal"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { OverflowTooltip } from "@/components/OverflowTooltip"
import { toast } from "sonner"
import { apiRequest, getApiBase, toastApiEmpty, authHeaders } from "@/lib/api"
import {
  toastUndoableDelete,
  toastProcessing,
  toastDone,
  toastFail,
  toastWithAction,
} from "@/lib/toastActions"

const col = createColumnHelper()

const LIFECYCLE_TABS = [
  { key: 'CUSTOMER_UPLOADS', label: 'Customer Uploads' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'REVIEW_REQUIRED', label: 'Review Required' },
  { key: 'READY_FOR_APPROVAL', label: 'Ready for Approval' },
  { key: 'POSTED_DOCUMENTS', label: 'Posted Documents' },
  { key: 'QUARANTINE', label: 'Quarantine' },
]

function confidenceTone(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 'bg-muted text-muted-foreground'
  if (n >= 75) return 'badge-green'
  if (n >= 50) return 'badge-amber'
  return 'badge-red'
}

function ConfidencePill({ label, value }) {
  const n = Number(value)
  const shown = Number.isFinite(n) ? `${Math.round(n)}%` : '—'
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none ${confidenceTone(n)}`}>
      {label} {shown}
    </span>
  )
}

function lifecycleBadgeClass(stage, isPosted) {
  if (stage === 'POSTED_DOCUMENTS' || isPosted) return 'badge-green'
  if (stage === 'QUARANTINE') return 'badge-red'
  if (stage === 'READY_FOR_APPROVAL') return 'badge-sky'
  if (stage === 'REVIEW_REQUIRED') return 'badge-amber'
  return 'bg-muted text-muted-foreground'
}

function canActOnDoc(doc) {
  return doc?.lifecycle_status !== 'POSTED_DOCUMENTS' && !doc?.is_posted
}

function TwoLineCell({ title, subtitle }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0 max-w-[200px]">
      <OverflowTooltip
        text={title}
        className="text-xs font-medium text-foreground"
      />
      {subtitle ? (
        <OverflowTooltip
          text={subtitle}
          className="text-[11px] text-muted-foreground"
        />
      ) : null}
    </div>
  )
}

async function downloadDocument(docId, filename) {
  const base = getApiBase()
  const headers = authHeaders()
  delete headers['Content-Type']
  const res = await fetch(`${base}/documents/${docId}/download`, {
    credentials: 'include',
    headers,
  })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename || `document-${docId}`
  a.click()
  URL.revokeObjectURL(href)
  toast.success('Download started')
}

async function openDocumentPreview(docId) {
  const base = getApiBase()
  const headers = authHeaders()
  delete headers['Content-Type']
  const res = await fetch(`${base}/documents/${docId}/view`, {
    credentials: 'include',
    headers,
  })
  if (!res.ok) throw new Error('Preview failed')
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  window.open(href, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(href), 60_000)
}

export default function Documents() {
  const [stage, setStage] = useState('READY_FOR_APPROVAL')
  const [documents, setDocuments] = useState([])
  const [counts, setCounts] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [jobStatus, setJobStatus] = useState('')
  const [triageDoc, setTriageDoc] = useState(null)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignForm, setReassignForm] = useState({ client_id: '', company_id: '', category: '' })
  const [uploadOpen, setUploadOpen] = useState(false)
  const [actingId, setActingId] = useState(null)
  const [selected, setSelected] = useState(() => new Set())

  const loadDocuments = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await apiRequest(
        `/admin/documents/lifecycle?stage=${encodeURIComponent(stage)}`,
        { label: 'Documents lifecycle' },
      )
      if (!res.ok) {
        setDocuments([])
        setLoadError(res.reason)
        return
      }
      const payload = res.data || {}
      const nested = payload.data || {}
      const list = Array.isArray(payload.documents)
        ? payload.documents
        : Array.isArray(nested.documents)
          ? nested.documents
          : []
      setDocuments(list)
      setCounts(payload.counts || nested.counts || {})
      setSelected(new Set())
      if (list.length === 0) toastApiEmpty('Documents', getApiBase())
    } finally {
      setIsLoading(false)
    }
  }, [stage])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const selectedIds = useMemo(() => Array.from(selected), [selected])

  const toggleSelect = (id, checked) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleSelectPage = (checked) => {
    setSelected(() => {
      if (!checked) return new Set()
      const next = new Set()
      documents.forEach((d) => {
        if (canActOnDoc(d) && d.id) next.add(Number(d.id))
      })
      return next
    })
  }

  const approveOne = async (docId) => {
    setActingId(docId)
    const toastId = toastProcessing('Approving document…')
    try {
      const res = await apiRequest(`/admin/documents/${docId}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
        label: 'Approve document',
        silent: true,
      })
      if (!res.ok) {
        toastFail(toastId, res.reason || 'Approve failed')
        return
      }
      toastDone(toastId, 'Document approved and posted')
      setTriageDoc(null)
      await loadDocuments()
    } finally {
      setActingId(null)
    }
  }

  const rejectOne = async (docId) => {
    const reason = window.prompt('Rejection reason', 'Rejected by staff') || 'Rejected by staff'
    setActingId(docId)
    const toastId = toastProcessing('Moving to quarantine…')
    try {
      const res = await apiRequest(`/admin/documents/${docId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
        label: 'Reject document',
        silent: true,
      })
      if (!res.ok) {
        toastFail(toastId, res.reason || 'Reject failed')
        return
      }
      toastWithAction('Document moved to Quarantine', {
        id: toastId,
        type: 'success',
        actionLabel: 'Refresh',
        onAction: () => loadDocuments(),
      })
      setTriageDoc(null)
      await loadDocuments()
    } finally {
      setActingId(null)
    }
  }

  const submitReassign = async () => {
    if (!triageDoc?.id) return
    const payload = { reprocess: true }
    if (String(reassignForm.client_id || '').trim()) payload.client_id = Number(reassignForm.client_id)
    if (String(reassignForm.company_id || '').trim()) payload.company_id = Number(reassignForm.company_id)
    if (String(reassignForm.category || '').trim()) payload.category = String(reassignForm.category).trim()
    setActingId(triageDoc.id)
    const toastId = toastProcessing('Reassigning document…')
    try {
      const res = await apiRequest(`/admin/documents/${triageDoc.id}/reassign`, {
        method: 'POST',
        body: JSON.stringify(payload),
        label: 'Reassign document',
        silent: true,
      })
      if (!res.ok) {
        toastFail(toastId, res.reason || 'Reassign failed')
        return
      }
      toastDone(toastId, 'Document reassigned')
      setReassignOpen(false)
      setTriageDoc(null)
      await loadDocuments()
    } finally {
      setActingId(null)
    }
  }

  const deleteOne = (doc) => {
    if (!window.confirm(`Delete "${doc.name || 'document'}"?`)) return
    const victim = doc
    const snapshot = documents
    setTriageDoc(null)
    setActingId(null)
    setDocuments((prev) => prev.filter((d) => d.id !== victim.id))

    toastUndoableDelete({
      message: 'Document deleted',
      description: victim.name || 'Undo available for a few seconds',
      onUndo: () => setDocuments(snapshot),
      onCommit: async () => {
        const res = await apiRequest(`/admin/documents/${victim.id}`, {
          method: 'DELETE',
          label: 'Delete document',
          silent: true,
        })
        if (!res.ok) throw new Error(res.reason || 'Failed to delete document')
      },
    })
  }

  const bulkApprove = async (override = false) => {
    if (!selectedIds.length) {
      toast.message('Select documents first')
      return
    }
    setJobStatus(override ? 'Bulk approve + override…' : 'Bulk approve…')
    const toastId = toastProcessing(override ? 'Bulk approving…' : 'Bulk approving…')
    const res = await apiRequest('/admin/documents/bulk-approve', {
      method: 'POST',
      body: JSON.stringify({
        document_ids: selectedIds,
        override_review_required: override,
      }),
      label: 'Bulk approve',
      silent: true,
    })
    if (!res.ok) {
      setJobStatus('')
      toastFail(toastId, res.reason || 'Bulk approve failed')
      return
    }
    const msg = res.data?.message || 'Bulk approve finished'
    setJobStatus(msg)
    toastDone(toastId, msg)
    await loadDocuments()
  }

  const bulkQuarantine = async () => {
    if (!selectedIds.length) {
      toast.message('Select documents first')
      return
    }
    const reason = window.prompt('Quarantine reason', 'Bulk quarantined by staff') || 'Bulk quarantined by staff'
    const toastId = toastProcessing('Moving to quarantine…')
    const res = await apiRequest('/admin/documents/bulk-quarantine', {
      method: 'POST',
      body: JSON.stringify({ document_ids: selectedIds, reason }),
      label: 'Bulk quarantine',
      silent: true,
    })
    if (!res.ok) {
      toastFail(toastId, res.reason || 'Bulk quarantine failed')
      return
    }
    toastDone(toastId, res.data?.message || 'Moved to Quarantine')
    await loadDocuments()
  }

  const actionable = documents.filter(canActOnDoc)
  const allPageSelected = actionable.length > 0 && actionable.every((d) => selected.has(Number(d.id)))

  const columns = useMemo(() => [
    col.display({
      id: 'select',
      header: () => (
        <Checkbox
          checked={allPageSelected || (selectedIds.length > 0 && !allPageSelected && 'indeterminate')}
          onCheckedChange={(v) => toggleSelectPage(!!v)}
          aria-label="Select page"
        />
      ),
      cell: ({ row }) => (
        canActOnDoc(row.original) ? (
          <Checkbox
            checked={selected.has(Number(row.original.id))}
            onCheckedChange={(v) => toggleSelect(Number(row.original.id), !!v)}
            aria-label="Select row"
          />
        ) : null
      ),
      enableSorting: false,
      enableHiding: false,
    }),
    col.accessor('client_name', {
      header: 'Client',
      cell: ({ row }) => (
        <TwoLineCell title={row.original.client_name} subtitle={row.original.client_email} />
      ),
    }),
    col.accessor('name', {
      header: 'Document',
      cell: ({ row }) => (
        <TwoLineCell title={row.original.name || 'Document'} subtitle={row.original.category} />
      ),
    }),
    col.accessor('company_name', {
      header: 'Company',
      cell: ({ row }) => (
        <TwoLineCell title={row.original.company_name} subtitle={row.original.company_number} />
      ),
    }),
    col.display({
      id: 'confidence',
      header: 'Confidence',
      cell: ({ row }) => {
        const d = row.original
        return (
          <div className="flex flex-nowrap items-center gap-1">
            <ConfidencePill label="OCR" value={d.ocr_confidence} />
            <ConfidencePill label="ID" value={d.identity_confidence} />
            <ConfidencePill label="Co" value={d.company_match_confidence} />
            {Number(d.duplicate_confidence) >= 100 && (
              <ConfidencePill label="Dup" value={d.duplicate_confidence} />
            )}
          </div>
        )
      },
    }),
    col.accessor('lifecycle_status', {
      header: 'Lifecycle',
      cell: ({ row }) => (
        <Badge className={`text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${lifecycleBadgeClass(row.original.lifecycle_status, row.original.is_posted)}`}>
          {row.original.lifecycle_status || '—'}
        </Badge>
      ),
    }),
    col.display({
      id: 'actions',
      header: 'Action',
      cell: ({ row }) => {
        const d = row.original
        const busy = actingId === d.id
        return (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Tooltip>
              <TooltipTrigger className="inline-flex">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2.5 text-xs"
                  disabled={busy}
                  onClick={async () => {
                    try { await openDocumentPreview(d.id) }
                    catch { toast.error('Preview failed') }
                  }}
                >
                  <IconEye className="mr-1 h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger className="inline-flex">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2.5 text-xs"
                  disabled={busy}
                  onClick={async () => {
                    try { await downloadDocument(d.id, d.name) }
                    catch { toast.error('Download failed') }
                  }}
                >
                  <IconDownload className="mr-1 h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger className="inline-flex">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2.5 text-xs"
                  disabled={busy}
                  onClick={() => setTriageDoc(d)}
                >
                  <IconClipboardCheck className="mr-1 h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Review document</TooltipContent>
            </Tooltip>

            {canActOnDoc(d) && (
              <Tooltip>
                <TooltipTrigger className="inline-flex">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 shrink-0 px-2.5 text-xs"
                    disabled={busy}
                    onClick={() => approveOne(d.id)}
                  >
                    {busy ? (
                      <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <IconCheck className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Approve &amp; post</TooltipContent>
              </Tooltip>
            )}
          </div>
        )
      },
    }),
  ], [actingId, selected, selectedIds, allPageSelected, documents])

  const meta = triageDoc?.match_meta || {}
  const matching = triageDoc?.matching_evidence || meta.reasons || []
  const conflicting = triageDoc?.conflicting_evidence || []
  const tops = triageDoc?.top_candidates || meta.top_candidates || []

  return (
    <div className="flex flex-col gap-4 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Documents Lifecycle</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadDocuments} disabled={isLoading}>
            <IconRefresh className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <IconUpload className="mr-2 h-4 w-4" />
            Upload Document
          </Button>
        </div>
      </div>

      <Tabs value={stage} onValueChange={setStage} className="w-full">
        <TabsList className="h-auto flex-wrap bg-background gap-1 p-1">
          {LIFECYCLE_TABS.map((tab) => (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className="text-xs rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {tab.label}
              <span className="ml-1.5 rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0 text-[10px] font-semibold">
                {counts[tab.key] != null ? counts[tab.key] : 0}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
          Clear
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => bulkApprove(false)}>
          Bulk Approve Selected
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => bulkApprove(true)}>
          Bulk Approve + Override
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={bulkQuarantine}>
          Bulk Quarantine
        </Button>
        {selectedIds.length > 0 && (
          <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
        )}
      </div>

      {jobStatus && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          {jobStatus}
        </div>
      )}


      <DataTable columns={columns} data={documents} isLoading={isLoading} />

      <Dialog open={!!triageDoc} onOpenChange={(open) => !open && setTriageDoc(null)}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document Review</DialogTitle>
            <DialogDescription>
              Confidence, matching evidence, and approve / quarantine actions.
            </DialogDescription>
          </DialogHeader>

          {triageDoc && (
            <div className="grid gap-3 py-1 text-sm">
              <div>
                <div className="font-semibold">{triageDoc.name || 'Document'}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {[triageDoc.category, triageDoc.file_type, triageDoc.file_size].filter(Boolean).join(' · ')}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">Customer</div>
                  <div>{triageDoc.client_name || '—'} {triageDoc.user_id ? `(#${triageDoc.user_id})` : ''}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Company</div>
                  <div>
                    {triageDoc.company_name || '—'}
                    {triageDoc.company_number ? ` (${triageDoc.company_number})` : ''}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <ConfidencePill label="OCR" value={triageDoc.ocr_confidence} />
                <ConfidencePill label="Class" value={triageDoc.classification_confidence} />
                <ConfidencePill label="Identity" value={triageDoc.identity_confidence} />
                <ConfidencePill label="Customer" value={triageDoc.customer_match_confidence} />
                <ConfidencePill label="Company" value={triageDoc.company_match_confidence} />
                <ConfidencePill label="Duplicate" value={triageDoc.duplicate_confidence} />
              </div>

              <div className="text-xs">
                Score gap Δ:{' '}
                <strong>
                  {triageDoc.score_gap != null
                    ? triageDoc.score_gap
                    : meta.score_gap != null
                      ? meta.score_gap
                      : '—'}
                </strong>
              </div>

              <div>
                <div className="font-semibold mb-1">Matching evidence</div>
                <ul className="list-disc pl-5 text-emerald-700 dark:text-emerald-300 space-y-0.5">
                  {(matching.length ? matching : ['—']).map((x, i) => (
                    <li key={`m-${i}`}>{String(x)}</li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="font-semibold mb-1">Conflicting evidence</div>
                <ul className="list-disc pl-5 text-destructive space-y-0.5">
                  {(conflicting.length ? conflicting : ['—']).map((x, i) => (
                    <li key={`c-${i}`}>{String(x)}</li>
                  ))}
                </ul>
              </div>

              {tops.length > 0 && (
                <div>
                  <div className="font-semibold mb-1">Top candidates</div>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {tops.slice(0, 5).map((t, i) => (
                      <li key={`t-${i}`}>
                        {t.name || ''} ({t.company_number || ''}) — {t.score != null ? t.score : ''}%
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {triageDoc.review_notes && (
                <p className="text-xs text-muted-foreground m-0">{triageDoc.review_notes}</p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            {triageDoc && canActOnDoc(triageDoc) && (
              <>
                <Button disabled={actingId === triageDoc.id} onClick={() => approveOne(triageDoc.id)}>
                  Approve &amp; Post
                </Button>
                <Button
                  variant="outline"
                  disabled={actingId === triageDoc.id}
                  onClick={() => rejectOne(triageDoc.id)}
                >
                  Reject / Quarantine
                </Button>
                <Button
                  variant="outline"
                  disabled={actingId === triageDoc.id}
                  onClick={() => {
                    setReassignForm({
                      client_id: triageDoc.user_id ? String(triageDoc.user_id) : '',
                      company_id: triageDoc.company_id ? String(triageDoc.company_id) : '',
                      category: triageDoc.category || '',
                    })
                    setReassignOpen(true)
                  }}
                >
                  Reassign
                </Button>
              </>
            )}
            {triageDoc && (
              <>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try { await openDocumentPreview(triageDoc.id) }
                    catch { toast.error('Preview failed') }
                  }}
                >
                  <IconEye className="mr-1 h-4 w-4" />
                  View
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try { await downloadDocument(triageDoc.id, triageDoc.name) }
                    catch { toast.error('Download failed') }
                  }}
                >
                  <IconDownload className="mr-1 h-4 w-4" />
                  Download
                </Button>
                <Button variant="destructive" onClick={() => deleteOne(triageDoc)}>
                  <IconTrash className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setTriageDoc(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Reassign document</DialogTitle>
            <DialogDescription>Update client, company, or category, then re-queue for approval.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Client user id</Label>
              <Input
                className="w-full"
                value={reassignForm.client_id}
                onChange={(e) => setReassignForm((p) => ({ ...p, client_id: e.target.value }))}
                placeholder="Blank to keep"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Company id</Label>
              <Input
                className="w-full"
                value={reassignForm.company_id}
                onChange={(e) => setReassignForm((p) => ({ ...p, company_id: e.target.value }))}
                placeholder="Blank to keep"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Input
                className="w-full"
                value={reassignForm.category}
                onChange={(e) => setReassignForm((p) => ({ ...p, category: e.target.value }))}
                placeholder="Blank to keep"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>Cancel</Button>
            <Button onClick={submitReassign}>Save reassignment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UploadDocumentModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={async () => {
          if (stage === 'POSTED_DOCUMENTS') await loadDocuments()
          else setStage('POSTED_DOCUMENTS')
        }}
      />
    </div>
  )
}
