import { useEffect, useState } from "react"
import { IconFileText, IconAlertTriangle } from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { fetchDocumentBlob, downloadDocument } from "@/lib/documents"
import { toast } from "@/components/ui/toast"

/**
 * Inline viewer for a CRM document. The file is fetched through the authenticated API
 * (works for any staff member, not only the Google account that owns the Drive).
 * Images and PDFs render inline; other types offer download + "Open in Drive".
 */
export default function DocumentPreview({ doc, className = "" }) {
  const [state, setState] = useState({ status: "loading", entry: null, error: "" })

  useEffect(() => {
    if (!doc?.id) return undefined
    let cancelled = false
    setState({ status: "loading", entry: null, error: "" })
    fetchDocumentBlob(doc.id)
      .then((entry) => !cancelled && setState({ status: "ready", entry, error: "" }))
      .catch((err) => !cancelled && setState({ status: "error", entry: null, error: err.message || "Could not load file" }))
    return () => { cancelled = true }
  }, [doc?.id])

  if (!doc) return null
  const name = doc.name || doc.file_name || "document"
  // A Google Drive link only for files on Drive (R2 files are "r2:<key>" and private, no outside link)
  const onDrive = doc.drive_file_id && !String(doc.drive_file_id).startsWith("r2:")
  const driveLink = doc.drive_web_link || (onDrive ? `https://drive.google.com/file/d/${doc.drive_file_id}/view` : null)

  if (state.status === "loading") {
    return <Skeleton className={`w-full h-[70vh] rounded-md ${className}`} />
  }

  if (state.status === "error") {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 py-16 text-center ${className}`}>
        <IconAlertTriangle className="w-8 h-8 text-amber-500" />
        <p className="text-sm font-medium">{state.error}</p>
        {driveLink && (
          <Button asChild size="sm" variant="outline">
            <a href={driveLink} target="_blank" rel="noopener noreferrer">Open in Drive</a>
          </Button>
        )}
      </div>
    )
  }

  const { url, type } = state.entry
  const lower = name.toLowerCase()
  const isImage = type.startsWith("image/") || /\.(jpe?g|png|webp|gif|svg)$/.test(lower)
  const isPdf = type === "application/pdf" || lower.endsWith(".pdf")

  if (isImage) {
    return (
      <div className={`flex items-center justify-center w-full ${className}`}>
        <img src={url} alt={name} className="max-h-[75vh] max-w-full object-contain rounded-md border shadow-sm bg-background" />
      </div>
    )
  }
  if (isPdf) {
    return <iframe src={url} title={name} className={`w-full h-[75vh] rounded-md border bg-background ${className}`} />
  }
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-16 text-center ${className}`}>
      <IconFileText className="w-10 h-10 text-muted-foreground" />
      <p className="text-sm font-medium">{name}</p>
      <p className="text-sm text-muted-foreground">Preview is not available for this file type.</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => downloadDocument(doc.id, name).catch((e) => toast.error(e.message || "Download failed"))}>
          Download
        </Button>
        {driveLink && (
          <Button asChild size="sm" variant="outline">
            <a href={driveLink} target="_blank" rel="noopener noreferrer">Open in Drive</a>
          </Button>
        )}
      </div>
    </div>
  )
}
