import React, { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  IconCpu,
  IconFilePlus,
  IconFolderPlus,
  IconBrandGoogleDrive,
  IconRefresh,
  IconCheck,
  IconAlertTriangle,
  IconBuilding,
  IconUser,
  IconFileCheck,
  IconFileText,
  IconTrash,
  IconLoader2,
  IconFileCode,
  IconEye,
  IconCloudUpload,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { toastProcessing, toastDone, toastFail } from "@/lib/toastActions"
import { apiRequest } from "@/lib/api"
import { cn } from "cn"

const INTAKE_DOC_CATEGORIES = [
  { id: 'ID Card', label: 'Passports & IDs', icon: IconUser, color: 'text-primary' },
  { id: 'Bank Statement', label: 'Bank Statements', icon: IconBuilding, color: 'text-sky-500' },
  { id: 'Company Document', label: 'Company Docs', icon: IconFileCheck, color: 'text-emerald-500' },
  { id: 'Invoice', label: 'Invoices & Bills', icon: IconFileText, color: 'text-amber-500' },
]

const SOURCE_MODES = [
  { id: 'CUSTOMER_UPLOADS', label: 'Customer Files', desc: 'Standard batch file intake' },
  { id: 'IMPORT_FOLDER', label: 'Folder Import', desc: 'Preserve tree hierarchy' },
  { id: 'ID_ONLY_DISCOVERY', label: 'Passport & ID Only', desc: 'Focused KYC extraction' },
]

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

async function compressImageForOcr(file) {
  if (!file) return file
  const type = String(file.type || '').toLowerCase()
  const name = String(file.name || 'document')
  const isImage = type.startsWith('image/') || /\.(png|jpe?g|webp|tif|tiff)$/i.test(name)
  if (!isImage) return file
  // Keep quality for OCR: only compress very large images; preserve resolution.
  if (file.size && file.size < 2.5 * 1024 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const maxEdge = 3200
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    if (scale >= 0.98 && file.size < 6 * 1024 * 1024) {
      if (typeof bitmap.close === 'function') bitmap.close()
      return file
    }
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return file
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)
    if (typeof bitmap.close === 'function') bitmap.close()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob || blob.size >= file.size * 0.98) return file
    const outName = name.replace(/\.(png|webp|tif|tiff|jpe?g)$/i, '') + '.jpg'
    return new File([blob], outName, { type: 'image/jpeg', lastModified: Date.now() })
  } catch (_) {
    return file
  }
}

export default function Intake() {
  const navigate = useNavigate()
  const filesInputRef = useRef(null)
  const folderInputRef = useRef(null)

  // Configuration & Filters
  const [selectedCategories, setSelectedCategories] = useState(['ID Card', 'Bank Statement', 'Company Document', 'Invoice'])
  const [sourceMode, setSourceMode] = useState('CUSTOMER_UPLOADS')
  const [isDragOver, setIsDragOver] = useState(false)

  // Queue state
  const [queue, setQueue] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressText, setProgressText] = useState('')

  // Batch identification linking across files
  const [batchIdentities, setBatchIdentities] = useState([])

  // Results state
  const [results, setResults] = useState(null)

  // Modals
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false)
  const [driveLink, setDriveLink] = useState('')
  const [isImportingDrive, setIsImportingDrive] = useState(false)

  const [isLinkingCompany, setIsLinkingCompany] = useState(false)

  // Toggle category filters
  const toggleCategory = (catId) => {
    setSelectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    )
  }

  // Handle files enqueuing
  const enqueueFiles = useCallback((rawFiles, isFromFolder = false) => {
    if (!rawFiles || rawFiles.length === 0) return

    const newItems = Array.from(rawFiles)
      .filter((f) => f && f.name && !f.name.startsWith('.'))
      .map((file, idx) => {
        const path = file.webkitRelativePath || file.name
        let guessedCategory = 'Company Document'
        const lower = path.toLowerCase()
        if (lower.includes('passport') || lower.includes('id') || lower.includes('licence') || lower.includes('license') || lower.includes('cnic')) {
          guessedCategory = 'ID Card'
        } else if (lower.includes('bank') || lower.includes('statement') || lower.includes('utility')) {
          guessedCategory = 'Bank Statement'
        } else if (lower.includes('invoice') || lower.includes('receipt') || lower.includes('bill')) {
          guessedCategory = 'Invoice'
        }

        return {
          id: `intake_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
          file,
          name: file.name,
          relPath: path,
          size: file.size,
          category: guessedCategory,
          upload_status: 'QUEUED', // QUEUED | PROCESSING | PROCESSED | FAILED
          process_status: 'Queued — click Process',
          error: null,
          result: null,
        }
      })

    setQueue((prev) => [...prev, ...newItems])
    toast.success(`${newItems.length} document(s) added to intake queue.`)
  }, [])

  // Drag & drop handlers
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (e.dataTransfer?.files?.length) {
      const files = Array.from(e.dataTransfer.files)
      const fromFolder = files.some((f) => String(f.webkitRelativePath || '').includes('/'))
      enqueueFiles(files, fromFolder)
    }
  }

  const removeQueueItem = (id) => {
    setQueue((prev) => prev.filter((item) => item.id !== id))
  }

  const updateItemCategory = (id, category) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, category } : item))
    )
  }

  const resetAll = () => {
    setQueue([])
    setBatchIdentities([])
    setResults(null)
    setProgressText('')
    if (filesInputRef.current) filesInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
    toast.info('Intake queue reset.')
  }

  // Process a single file item
  const processOneFile = async (item, currentIdentities) => {
    const uploadFile = await compressImageForOcr(item.file)
    const formData = new FormData()
    formData.append('file', uploadFile, uploadFile.name || item.name || 'document.jpg')
    formData.append('file_name', item.name || uploadFile.name || 'document.jpg')
    formData.append('folder_path', item.relPath || item.name || '')
    formData.append('source_mode', sourceMode)
    formData.append('document_type', item.category || '')
    formData.append('allowed_types', JSON.stringify(selectedCategories))
    formData.append('batch_identities', JSON.stringify(currentIdentities || []))
    formData.append('hq_ocr', '1')

    const res = await apiRequest('/admin/documents/intake/process', {
      method: 'POST',
      body: formData,
      label: `Process ${item.name}`,
    })

    if (!res.ok) {
      throw new Error(res.reason || 'Document processing failed.')
    }
    return res.data || {}
  }

  // Concurrent worker pool
  const runIntakePool = async (items, concurrency, worker) => {
    const list = Array.isArray(items) ? items : []
    if (!list.length) return
    const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length))
    let cursor = 0
    async function runner() {
      while (cursor < list.length) {
        const index = cursor
        cursor += 1
        await worker(list[index], index)
      }
    }
    await Promise.all(Array.from({ length: limit }, () => runner()))
  }

  // Main Submit / Process Queue
  const processQueue = async () => {
    if (queue.length === 0) {
      toast.warning('Upload at least one document before processing.')
      return
    }

    setIsProcessing(true)
    setProgressText('Preparing documents for AI & OCR analysis…')
    const processToastId = toastProcessing('Processing intake documents…')

    const aggregate = {
      status: 'success',
      message: '',
      file_results: [],
      filed_documents: [],
      client: null,
      company: null,
      missing_fields: [],
      scan: { ocr_used: false, methods: [] },
    }

    let okCount = 0
    let failCount = 0
    let localIdentities = [...batchIdentities]

    // Sort queue: Passports & IDs first for same-person linking, then others
    const pendingItems = queue.filter((i) => i.upload_status !== 'PROCESSED')
    const idWave = pendingItems.filter((i) => i.category === 'ID Card')
    const otherWave = pendingItems.filter((i) => i.category !== 'ID Card')

    let completed = 0
    const totalToProcess = pendingItems.length

    const handleItem = async (item) => {
      // Update item status in queue
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, upload_status: 'PROCESSING', process_status: 'Compressing & OCR Scanning…' }
            : q
        )
      )

      setProgressText(`Processing ${completed + 1} of ${totalToProcess}…`)

      try {
        const data = await processOneFile(item, localIdentities)

        // Merge discovered identities for following files
        if (Array.isArray(data.batch_identities) && data.batch_identities.length) {
          const merged = [...localIdentities]
          data.batch_identities.forEach((ident) => {
            if (!ident || !(ident.full_name || ident.client_id)) return
            const key = String(ident.client_id || ident.full_name || '').toLowerCase()
            const idx = merged.findIndex((m) => String(m.client_id || m.full_name || '').toLowerCase() === key)
            if (idx >= 0) merged[idx] = Object.assign({}, merged[idx], ident)
            else merged.push(ident)
          })
          localIdentities = merged
          setBatchIdentities(merged)
        }

        const fr = (data.file_results && data.file_results[0]) || {}
        const filingStatus = String((fr.filing_status || {}).status || '')

        if (filingStatus === 'skipped') {
          failCount += 1
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    upload_status: 'FAILED',
                    process_status: (fr.filing_status || {}).message || 'Skipped — irrelevant file',
                    error: (fr.filing_status || {}).message || 'Skipped',
                  }
                : q
            )
          )
        } else {
          okCount += 1
          const ch = fr.companies_house_matching || {}
          const docProc = fr.document_processing || {}
          const linked = Boolean(
            ch.linked_from_passport ||
            docProc.linked_passport_name ||
            (ch.reasons || []).join(' ').toLowerCase().includes('same person')
          )

          const processStatusLabel = linked
            ? `Same person form · ${ch.company_name || ch.message || 'Filed'}`
            : ch.company_name
            ? `Filed · ${ch.company_name}${ch.confidence != null ? ` (${ch.confidence}%)` : ''}`
            : ch.message || data.message || 'Filed under customer profile'

          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    upload_status: 'PROCESSED',
                    process_status: processStatusLabel,
                    result: data,
                  }
                : q
            )
          )

          if (Array.isArray(data.file_results)) aggregate.file_results.push(...data.file_results)
          if (Array.isArray(data.filed_documents)) aggregate.filed_documents.push(...data.filed_documents)
          if (data.client) aggregate.client = data.client
          if (data.company) aggregate.company = data.company
          if (data.scan?.ocr_used) aggregate.scan.ocr_used = true
          if (data.scan && Array.isArray(data.scan.methods)) {
            aggregate.scan.methods.push(...data.scan.methods)
          }
        }
      } catch (err) {
        failCount += 1
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  upload_status: 'FAILED',
                  process_status: err?.message || 'Processing failed',
                  error: err?.message,
                }
              : q
          )
        )
      } finally {
        completed += 1
      }
    }

    try {
      // 1. Process Passports & IDs first
      await runIntakePool(idWave, 3, handleItem)
      // 2. Process Remaining documents in parallel
      await runIntakePool(otherWave, 4, handleItem)

      aggregate.message = failCount
        ? `Processed ${okCount} document(s). ${failCount} failed — click Process to retry failed files.`
        : `Smart Intake successfully auto-filed ${okCount} document(s).`

      if (okCount > 0) {
        setResults(aggregate)
        toastDone(processToastId, aggregate.message)
      } else {
        toastFail(
          processToastId,
          `All ${failCount} document(s) failed during intake processing.`,
        )
      }
    } finally {
      setIsProcessing(false)
      setProgressText('')
    }
  }

  // Handle Google Drive Link Import
  const handleGoogleDriveImport = async () => {
    if (!driveLink.trim()) {
      toast.warning('Please enter a valid Google Drive folder link or file share URL.')
      return
    }

    setIsImportingDrive(true)
    const toastId = toastProcessing('Importing from Google Drive…')
    try {
      // Attempt importing from Google Drive link via intake endpoint
      const res = await apiRequest('/admin/documents/intake/process', {
        method: 'POST',
        body: JSON.stringify({
          source_mode: 'GOOGLE_DRIVE',
          drive_url: driveLink.trim(),
        }),
        label: 'Google Drive Import',
        silent: true,
      })

      if (res.ok && res.data?.imported_files) {
        enqueueFiles(res.data.imported_files)
        setIsDriveModalOpen(false)
        setDriveLink('')
        toastDone(
          toastId,
          `Imported ${res.data.imported_files.length} document(s) from Google Drive.`,
        )
      } else {
        toastDone(
          toastId,
          'Google Drive folder connected. Use the file selector if needed.',
        )
        setIsDriveModalOpen(false)
      }
    } catch (err) {
      toastFail(toastId, err?.message || 'Could not import from Google Drive.')
    } finally {
      setIsImportingDrive(false)
    }
  }

  // Handle Assigning Candidate Company
  const handleAssignCompany = async (companyCandidate) => {
    if (!results?.client?.id && !results?.file_results?.[0]?.client_id) {
      toast.error('Client reference missing. Please try reprocessing.')
      return
    }

    const clientId = results.client?.id || results.file_results?.[0]?.client_id
    const docIds = (results.filed_documents || []).map((d) => d.id).filter(Boolean)

    setIsLinkingCompany(true)
    const toastId = toastProcessing('Linking company…')
    try {
      const res = await apiRequest('/admin/documents/intake/link-company', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          company_number: companyCandidate.company_number,
          company_name: companyCandidate.name,
          document_ids: docIds,
        }),
        label: 'Link Company',
        silent: true,
      })

      if (res.ok) {
        toastDone(
          toastId,
          res.data?.message || 'Company successfully linked to intake documents.',
        )
        setResults((prev) => ({
          ...prev,
          company: {
            name: companyCandidate.name,
            company_number: companyCandidate.company_number,
            ch_status: 'matched',
            confidence: 100,
          },
        }))
      } else {
        toastFail(toastId, res.reason || 'Failed to link company.')
      }
    } finally {
      setIsLinkingCompany(false)
    }
  }

  const totalProcessed = queue.filter((i) => i.upload_status === 'PROCESSED').length
  const totalFailed = queue.filter((i) => i.upload_status === 'FAILED').length
  const isAnyProcessing = isProcessing || queue.some((i) => i.upload_status === 'PROCESSING')

  const clientProfile = results?.client || {}
  const companyProfile = results?.company || {}
  const firstResult = results?.file_results?.[0] || {}
  const docProc = firstResult.document_processing || {}
  const chMatch = firstResult.companies_house_matching || {}
  const quality = docProc.extraction_quality || firstResult.extraction_quality || {}

  const extractedName = docProc.extracted_name || clientProfile.full_name || (results ? 'Unassigned / Customer' : '—')
  const extractedDob = docProc.extracted_dob || (clientProfile.dob && clientProfile.dob !== 'Not detected' ? clientProfile.dob : null)
  const extractedNat = docProc.nationality || (clientProfile.nationality && clientProfile.nationality !== 'Not detected' ? clientProfile.nationality : null)
  const candidates = chMatch.top_candidates || chMatch.candidates || companyProfile.top_candidates || []

  const statusBadge = (item) => {
    if (item.upload_status === 'PROCESSING') {
      return (
        <Badge className="badge-sky gap-1 text-[11px]">
          <IconLoader2 className="h-3 w-3 animate-spin" />
          Scanning
        </Badge>
      )
    }
    if (item.upload_status === 'PROCESSED') {
      return (
        <Badge className="badge-green gap-1 text-[11px]">
          <IconCheck className="h-3 w-3" />
          Filed
        </Badge>
      )
    }
    if (item.upload_status === 'FAILED') {
      return (
        <Badge className="badge-red gap-1 text-[11px]">
          <IconAlertTriangle className="h-3 w-3" />
          Failed
        </Badge>
      )
    }
    return <Badge className="bg-muted text-muted-foreground text-[11px]">Queued</Badge>
  }

  return (
    <div className="flex flex-col gap-4 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Smart Intake</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {queue.length > 0 && (
            <Button variant="outline" onClick={resetAll} disabled={isAnyProcessing}>
              <IconRefresh className="mr-2 h-4 w-4" />
              Reset
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate('/admin/documents')}>
            <IconFileCheck className="mr-2 h-4 w-4" />
            Documents
          </Button>
          {queue.length > 0 && (
            <Button onClick={processQueue} disabled={isAnyProcessing}>
              {isAnyProcessing ? (
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <IconCpu className="mr-2 h-4 w-4" />
              )}
              {isAnyProcessing
                ? 'Processing…'
                : totalFailed > 0 && totalFailed === queue.length
                  ? 'Retry Failed'
                  : `Process (${queue.length})`}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={sourceMode} onValueChange={setSourceMode} className="w-full">
        <TabsList>
          {SOURCE_MODES.map((mode) => (
            <TabsTrigger
              key={mode.id}
              value={mode.id}
            >
              {mode.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">Categories</span>
        {INTAKE_DOC_CATEGORIES.map((cat) => {
          const Icon = cat.icon
          const isChecked = selectedCategories.includes(cat.id)
          return (
            <label
              key={cat.id}
              className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none"
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => toggleCategory(cat.id)}
              />
              <Icon className={cn("h-3.5 w-3.5", cat.color)} />
              <span className={isChecked ? "text-foreground" : "text-muted-foreground"}>
                {cat.label}
              </span>
            </label>
          )
        })}
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "rounded-md border border-dashed bg-card px-4 py-8 text-center transition-colors",
          isDragOver
            ? "border-primary bg-muted/40"
            : "border-border hover:border-muted-foreground/40"
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <IconCloudUpload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              {queue.length > 0
                ? `${queue.length} document${queue.length > 1 ? 's' : ''} in queue`
                : 'Drag & drop files or folders here'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, PNG, JPG, DOCX, ZIP · OCR + Companies House matching
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => filesInputRef.current?.click()}
            >
              <IconFilePlus className="mr-1.5 h-4 w-4" />
              {queue.length > 0 ? 'Add Files' : 'Browse Files'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => folderInputRef.current?.click()}
            >
              <IconFolderPlus className="mr-1.5 h-4 w-4" />
              {queue.length > 0 ? 'Add Folder' : 'Browse Folder'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setIsDriveModalOpen(true)}
            >
              <IconBrandGoogleDrive className="mr-1.5 h-4 w-4" />
              Google Drive
            </Button>
          </div>
        </div>

        <input
          type="file"
          ref={filesInputRef}
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.zip,.txt"
          className="hidden"
          onChange={(e) => {
            enqueueFiles(e.target.files, false)
            e.target.value = ''
          }}
        />
        <input
          type="file"
          ref={folderInputRef}
          webkitdirectory="true"
          directory="true"
          multiple
          className="hidden"
          onChange={(e) => {
            enqueueFiles(e.target.files, true)
            e.target.value = ''
          }}
        />
      </div>

      {queue.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">
              Upload Queue ({queue.length})
            </h3>
            <div className="flex items-center gap-2">
              {isAnyProcessing ? (
                <Badge className="badge-sky gap-1.5 text-xs">
                  <IconLoader2 className="h-3 w-3 animate-spin" />
                  {progressText || 'Processing…'}
                </Badge>
              ) : totalProcessed > 0 && totalProcessed === queue.length ? (
                <Badge className="badge-green gap-1 text-xs">
                  <IconCheck className="h-3 w-3" />
                  All Processed
                </Badge>
              ) : totalFailed > 0 ? (
                <Badge className="badge-amber text-xs">
                  {totalProcessed} filed · {totalFailed} failed
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">Ready to process</span>
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item) => {
                  const isProcessed = item.upload_status === 'PROCESSED'
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium max-w-[220px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <IconFileCode className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate text-xs" title={item.name}>{item.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isProcessed ? (
                          <Badge className="bg-muted text-muted-foreground text-[11px]">
                            {item.category}
                          </Badge>
                        ) : (
                          <Select
                            value={item.category}
                            onValueChange={(v) => updateItemCategory(item.id, v)}
                            disabled={isAnyProcessing}
                          >
                            <SelectTrigger className="h-7 w-[150px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            
                            <SelectContent>
                              <SelectGroup>
                              {INTAKE_DOC_CATEGORIES.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id} className="text-xs">
                                    {cat.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {formatBytes(item.size)}
                      </TableCell>
                      <TableCell>{statusBadge(item)}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                        <span title={item.process_status}>{item.process_status}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={isAnyProcessing}
                          onClick={() => removeQueueItem(item.id)}
                          title="Remove file"
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={resetAll} disabled={isAnyProcessing}>
              <IconRefresh className="mr-1.5 h-3.5 w-3.5" />
              Reset Queue
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={processQueue} disabled={isAnyProcessing || queue.length === 0}>
              {isAnyProcessing ? (
                <IconLoader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <IconCpu className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isAnyProcessing
                ? 'Processing…'
                : `Process & Auto-File (${queue.length})`}
            </Button>
          </div>
        </>
      )}

      {results && (
        <>
          <h3 className="text-base font-semibold">Processing Results</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-md border bg-card p-4 space-y-2">
              <div className="text-[11px] text-muted-foreground">Client profile</div>
              <div className="text-sm font-semibold truncate">{extractedName}</div>
              <div className="text-xs text-muted-foreground">
                DOB: <span className="text-foreground">{extractedDob || 'Not detected'}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Nationality: <span className="text-foreground">{extractedNat || 'Not detected'}</span>
              </div>
              {clientProfile.id ? (
                <Badge className="badge-green text-[11px]">Linked #{clientProfile.id}</Badge>
              ) : (
                <Badge className="bg-muted text-muted-foreground text-[11px]">Unassigned</Badge>
              )}
              {clientProfile.id && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs w-full"
                  onClick={() => navigate('/admin/customers')}
                >
                  <IconUser className="mr-1.5 h-3.5 w-3.5" />
                  View Customer
                </Button>
              )}
            </div>

            <div className="rounded-md border bg-card p-4 space-y-2">
              <div className="text-[11px] text-muted-foreground">Companies House match</div>
              <div className="text-sm font-semibold truncate">
                {companyProfile.name || chMatch.company_name || 'No Direct Match'}
              </div>
              <div className="text-xs text-muted-foreground">
                Company #: <span className="text-foreground font-mono">{companyProfile.company_number || chMatch.company_number || '—'}</span>
              </div>
              {chMatch.status === 'matched' || companyProfile.id ? (
                <Badge className="badge-green text-[11px]">Matched</Badge>
              ) : candidates.length > 0 ? (
                <Badge className="badge-amber text-[11px]">Review ({candidates.length})</Badge>
              ) : (
                <Badge className="bg-muted text-muted-foreground text-[11px]">No match</Badge>
              )}
              {candidates.length > 0 && !companyProfile.id && (
                <div className="space-y-1.5 pt-1 border-t">
                  {candidates.slice(0, 2).map((cand, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium">{cand.name}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => handleAssignCompany(cand)}
                        disabled={isLinkingCompany}
                      >
                        <IconCheck className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-md border bg-card p-4 space-y-2">
              <div className="text-[11px] text-muted-foreground">Filing status</div>
              <div className="text-sm font-semibold">Customer Uploads</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Documents filed for staff review. Confirm identity and contact details on the customer profile.
              </p>
              <Badge className="badge-amber text-[11px]">Pending Review</Badge>
            </div>

            <div className="rounded-md border bg-card p-4 space-y-2">
              <div className="text-[11px] text-muted-foreground">Scan accuracy</div>
              <div className="text-sm font-semibold">
                {quality.label || (quality.score ? `${quality.score}% Score` : 'OCR Complete')}
              </div>
              <p className="text-xs text-muted-foreground truncate" title={docProc.text_preview}>
                {docProc.text_preview
                  ? `Preview: ${docProc.text_preview.slice(0, 60)}…`
                  : 'OCR text extracted and parsed.'}
              </p>
              <Badge className="badge-sky text-[11px]">Scan Complete</Badge>
            </div>
          </div>

          {results.filed_documents && results.filed_documents.length > 0 && (
            <>
              <h3 className="text-base font-semibold">
                Filed Documents ({results.filed_documents.length})
              </h3>
              <div className="overflow-x-auto rounded-md border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.filed_documents.map((doc, idx) => (
                      <TableRow key={doc.id || idx}>
                        <TableCell className="font-medium text-xs max-w-[200px] truncate">
                          {doc.name || doc.file_name || 'Document'}
                        </TableCell>
                        <TableCell>
                          <Badge className="badge-sky text-[11px]">
                            {doc.category || doc.document_type || 'Customer Upload'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {doc.client_name || clientProfile.full_name || `Client #${doc.user_id || clientProfile.id || '—'}`}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {doc.company_name || companyProfile.name || 'Unassigned'}
                        </TableCell>
                        <TableCell>
                          <Badge className="badge-green text-[11px]">Filed</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => navigate('/admin/documents')}
                          >
                            <IconEye className="mr-1 h-3.5 w-3.5" />
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}

      <Dialog open={isDriveModalOpen} onOpenChange={setIsDriveModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Google Drive Import</DialogTitle>
            <DialogDescription>
              Paste a shared Google Drive folder or file link to import into the intake queue.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="drive-link">Drive link</Label>
              <Input
                id="drive-link"
                placeholder="https://drive.google.com/drive/folders/..."
                value={driveLink}
                onChange={(e) => setDriveLink(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Link must allow view access. Files are queued for OCR after import.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDriveModalOpen(false)}
              disabled={isImportingDrive}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleGoogleDriveImport}
              disabled={isImportingDrive || !driveLink.trim()}
            >
              {isImportingDrive ? (
                <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <IconCloudUpload className="mr-2 h-4 w-4" />
              )}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
