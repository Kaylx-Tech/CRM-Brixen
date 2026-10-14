/**
 * Invoice PDFs (rendered by the API): open in a new tab or download.
 * The request carries the sign-in token, so the PDF is fetched first and then shown from a blob URL.
 * Customers use /client/invoices/:id/document, the team /admin/invoices/:id/document.
 */
import { toast } from "@/components/ui/toast"
import { getApiBase, authHeaders } from "@/lib/api"

async function fetchInvoicePdf(invoiceId, { client = false, download = false } = {}) {
  const headers = authHeaders()
  delete headers["Content-Type"]
  const base = client ? "/client/invoices" : "/admin/invoices"
  const res = await fetch(`${getApiBase()}${base}/${invoiceId}/document${download ? "?download=1" : ""}`, {
    credentials: "include",
    headers,
  })
  if (!res.ok) {
    let message = "Invoice could not be loaded"
    try {
      const data = await res.json()
      message = data.error || data.message || message
    } catch {
      /* not json */
    }
    throw new Error(message)
  }
  return res.blob()
}

export async function openInvoice(invoiceId, options = {}) {
  // Open the tab first (inside the click) so pop-up blockers allow it, then load the PDF into it
  const tab = window.open("", "_blank")
  try {
    const blob = await fetchInvoicePdf(invoiceId, options)
    const url = URL.createObjectURL(blob)
    if (tab) tab.location.href = url
    else window.location.href = url
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    if (tab) tab.close()
    toast.error(err.message)
  }
}

export async function downloadInvoice(invoiceId, invoiceNumber, options = {}) {
  try {
    const blob = await fetchInvoicePdf(invoiceId, { ...options, download: true })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Invoice ${invoiceNumber || invoiceId}.pdf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (err) {
    toast.error(err.message)
  }
}
