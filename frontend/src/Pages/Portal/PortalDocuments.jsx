import React, { useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { IconUpload, IconLoader2, IconEye, IconDownload, IconSearch } from "@tabler/icons-react"
import { toast } from "sonner"
import { apiRequest } from "@/lib/api"
import { openDocument, downloadDocument } from "@/lib/documents"
import { usePortalData, PageHeader, PageState, StatusBadge, formatDate } from "./portalShared"

const CATEGORIES = ["Company Documents", "ID Document", "Proof of Address", "Bank Statement", "Other"]

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result || "")
      resolve(raw.slice(raw.indexOf(",") + 1))
    }
    reader.onerror = () => reject(new Error("The file could not be read"))
    reader.readAsDataURL(file)
  })
}

function UploadCard({ orders, defaultOrderId, onUploaded }) {
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [category, setCategory] = useState(CATEGORIES[0])
  const [orderId, setOrderId] = useState(defaultOrderId || "none")
  const [isUploading, setIsUploading] = useState(false)

  const upload = async () => {
    if (!file) {
      toast.error("Choose a file first")
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Files must be 15 MB or smaller")
      return
    }
    setIsUploading(true)
    try {
      const content = await readAsBase64(file)
      const res = await apiRequest("/client/documents/upload", {
        method: "POST",
        body: {
          file_name: file.name,
          name: file.name,
          category,
          order_id: orderId !== "none" ? Number(orderId) : undefined,
          file_content_base64: content,
        },
        silent: true,
        label: "Upload",
      })
      if (!res.ok) {
        toast.error(res.reason || "Upload failed")
        return
      }
      toast.success(res.data?.message || "Document uploaded")
      setFile(null)
      if (fileRef.current) fileRef.current.value = ""
      onUploaded()
    } catch (err) {
      toast.error(err.message || "Upload failed")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="font-semibold">Upload a document</h3>
      <p className="mb-4 text-sm text-muted-foreground">PDF, image or Word file, up to 15 MB. Our team reviews every upload.</p>
      <div className="grid gap-3 md:grid-cols-[1fr_200px_200px_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="portal-doc-file">File</Label>
          <Input id="portal-doc-file" ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={category} onValueChange={(v) => setCategory(v || CATEGORIES[0])}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>For order (optional)</Label>
          <Select value={orderId} onValueChange={(v) => setOrderId(v || "none")}>
            <SelectTrigger className="w-full">
              <SelectValue>{orderId === "none" ? "No specific order" : (orders.find((o) => String(o.id) === String(orderId))?.order_number || "Order")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">No specific order</SelectItem>
                {orders.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.order_number} · {o.service_name}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={upload} disabled={isUploading || !file}>
          {isUploading ? <IconLoader2 className="size-4 animate-spin" /> : <IconUpload className="size-4" />}
          Upload
        </Button>
      </div>
    </div>
  )
}

export default function PortalDocuments() {
  const [searchParams] = useSearchParams()
  const { data, isLoading, error, reload } = usePortalData("/client/documents")
  const { data: orderData } = usePortalData("/client/orders?limit=100")
  const [search, setSearch] = useState("")
  const docs = data?.documents || []
  const inReview = data?.my_uploads_in_review || []
  const orders = (orderData?.orders || []).filter((o) => !["Cancelled", "Refunded"].includes(o.status))

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return docs
    return docs.filter((d) => [d.name, d.category, d.company_name, d.order_number].some((v) => String(v || "").toLowerCase().includes(q)))
  }, [docs, search])

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <PageHeader title="Documents" description="Documents we have shared with you, and files you send us" onRefresh={reload} isLoading={isLoading} />
      <UploadCard orders={orders} defaultOrderId={searchParams.get("order")} onUploaded={reload} />

      {inReview.length ? (
        <div className="rounded-2xl border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="font-semibold">Your uploads in review</h3>
          </div>
          <ul className="divide-y">
            {inReview.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate">{d.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {formatDate(d.created_at)} <StatusBadge status={d.status || "Pending Review"} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Shared with you</h3>
        <div className="relative w-full max-w-72">
          <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" className="pl-9" />
        </div>
      </div>
      <PageState isLoading={isLoading && !data} error={error} onRetry={reload} isEmpty={!visible.length} emptyText="No documents shared with you yet.">
        <div className="rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Company / order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="max-w-72 truncate font-medium">{d.name}</TableCell>
                  <TableCell className="text-muted-foreground">{d.category || "—"}</TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">{d.company_name || d.order_number || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(d.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" aria-label="View" onClick={() => openDocument(d.id).catch((e) => toast.error(e.message))}>
                        <IconEye className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Download" onClick={() => downloadDocument(d.id, d.name).catch((e) => toast.error(e.message))}>
                        <IconDownload className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </PageState>
    </div>
  )
}
