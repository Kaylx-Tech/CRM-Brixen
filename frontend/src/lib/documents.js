/**
 * Document file access (stored on Google Drive, streamed through the API so no Google login is needed).
 * - fetchDocumentBlob(): authenticated fetch of /documents/:id/view with a small in-memory cache
 * - downloadDocument() / openDocument(): save or open in a new tab
 */
import { toast } from "@/components/ui/toast"
import { getApiBase, authHeaders } from "@/lib/api"

const CACHE_LIMIT = 24
const cache = new Map() // docId -> { blob, url, type }

function trimCache() {
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    const entry = cache.get(oldest)
    if (entry) URL.revokeObjectURL(entry.url)
    cache.delete(oldest)
  }
}

export async function fetchDocumentBlob(docId, { mode = "view" } = {}) {
  if (mode === "view" && cache.has(docId)) {
    const hit = cache.get(docId)
    cache.delete(docId) // refresh LRU order
    cache.set(docId, hit)
    return hit
  }
  const headers = authHeaders()
  delete headers["Content-Type"]
  let res
  try {
    res = await fetch(`${getApiBase()}/documents/${docId}/${mode}`, { credentials: "include", headers })
  } catch {
    // The request never completed (server unreachable, restarting or timed out): say so plainly
    throw new Error("Could not reach the server to load this file. Please try again in a moment.")
  }
  if (!res.ok) {
    // The server says why (e.g. Google Drive sign-in expired, file removed from Drive)
    let message = res.status === 404 ? "This file is not on Drive or the server." : "File could not be loaded"
    try {
      const data = await res.json()
      message = data.error || data.message || message
    } catch {
      /* not json */
    }
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  const blob = await res.blob()
  const entry = { blob, url: URL.createObjectURL(blob), type: blob.type || "" }
  if (mode === "view") {
    cache.set(docId, entry)
    trimCache()
  }
  return entry
}

export async function downloadDocument(docId, filename) {
  const { blob } = await fetchDocumentBlob(docId, { mode: "download" })
  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = filename || `document-${docId}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
  toast.success("Download started")
}

export async function openDocument(docId) {
  const entry = await fetchDocumentBlob(docId)
  window.open(entry.url, "_blank", "noopener,noreferrer")
}
