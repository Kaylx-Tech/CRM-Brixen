import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { IconAlertCircle, IconDownload, IconExternalLink, IconLoader2 } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { getApiBase } from "@/lib/api"
import { useBranding } from "@/lib/branding"

/**
 * acme.finstap.com/invoice/<code> — the "View invoice" button in invoice emails.
 * The code is a private link to one invoice (it starts with the workspace name), so the client sees the
 * PDF without signing in; after 30 days it asks them to sign in to the portal instead.
 */
export default function SharedInvoice() {
  const { token = "" } = useParams()
  const { logo } = useBranding()
  const [pdfUrl, setPdfUrl] = useState("")
  const [error, setError] = useState("")

  const workspace = token.includes(".") ? token.split(".")[0] : ""
  const apiUrl = `${getApiBase()}/invoices/shared/${encodeURIComponent(token)}${workspace ? `?workspace=${encodeURIComponent(workspace)}` : ""}`

  useEffect(() => {
    let url = ""
    ;(async () => {
      try {
        const res = await fetch(apiUrl)
        if (!res.ok) {
          let message = "This invoice link is not valid."
          try {
            const data = await res.json()
            message = data.error || data.message || message
          } catch {
            /* not json */
          }
          setError(message)
          return
        }
        url = URL.createObjectURL(await res.blob())
        setPdfUrl(url)
      } catch {
        setError("The invoice could not be loaded. Please try again in a moment.")
      }
    })()
    return () => url && URL.revokeObjectURL(url)
  }, [apiUrl])

  const downloadUrl = `${apiUrl}${apiUrl.includes("?") ? "&" : "?"}download=1`

  return (
    <div className="min-h-svh bg-muted/40 flex flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          {logo ? (
            <img src={logo} alt="" className="h-8 w-auto max-w-[180px] object-contain" />
          ) : (
            <span className="text-sm font-semibold">Your invoice</span>
          )}
          {pdfUrl ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-8 px-3 gap-1.5" nativeButton={false} render={<a href={pdfUrl} target="_blank" rel="noreferrer" />}>
                <IconExternalLink className="size-4" />
                <span className="hidden sm:inline">Open</span>
              </Button>
              <Button className="h-8 px-3.5 gap-1.5" nativeButton={false} render={<a href={downloadUrl} />}>
                <IconDownload className="size-4" />
                Download PDF
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-4 sm:py-6">
        {error ? (
          <div className="m-auto max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
            <IconAlertCircle className="mx-auto size-8 text-muted-foreground" />
            <h1 className="mt-3 text-base font-semibold">{error}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to see all your invoices, or ask us to send the invoice again.
            </p>
            <Button className="mt-4 h-9 px-5" nativeButton={false} render={<Link to="/login" />}>
              Sign in
            </Button>
          </div>
        ) : pdfUrl ? (
          <iframe
            title="Invoice"
            src={`${pdfUrl}#navpanes=0&view=FitH`}
            className="w-full flex-1 min-h-[75svh] rounded-2xl border bg-white shadow-sm"
          />
        ) : (
          <div className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" />
            Loading your invoice…
          </div>
        )}
      </main>
    </div>
  )
}
