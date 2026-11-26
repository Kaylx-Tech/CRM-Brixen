import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { IconAlertTriangle, IconBrandWhatsapp, IconCircleCheck, IconLoader2 } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { getApiBase } from "@/lib/api"

async function call(path, method = "GET") {
  try {
    const res = await fetch(`${getApiBase()}${path}`, { method, headers: { "Content-Type": "application/json" } })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok && json.success !== false, data: json.data, error: json.error || json.message }
  } catch {
    return { ok: false, error: "Could not connect. Please try again." }
  }
}

/**
 * /offer/<token> on the portal: the client's side of an Offer to Fix (Companies › Attention). One button says
 * yes; that creates the order for the firm (backend services/attention_offers.py). No sign-in.
 */
export default function OfferAccept() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const workspace = params.get("workspace")
  const query = workspace ? `?workspace=${encodeURIComponent(workspace)}` : ""
  const [state, setState] = useState({ loading: true, error: "", offer: null, busy: false })

  useEffect(() => {
    let alive = true
    call(`/public/offer/${token}${query}`).then((res) => {
      if (!alive) return
      setState({ loading: false, error: res.ok ? "" : res.error, offer: res.ok ? res.data : null, busy: false })
      if (res.ok && res.data.firm) document.title = `${res.data.firm} · ${res.data.company}`
    })
    return () => {
      alive = false
    }
  }, [token, query])

  const accept = async () => {
    setState((s) => ({ ...s, busy: true }))
    const res = await call(`/public/offer/${token}/accept${query}`, "POST")
    setState((s) => ({ ...s, busy: false, error: res.ok ? "" : res.error, offer: res.ok ? res.data : s.offer }))
  }

  const o = state.offer
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 py-10">
      <div className="fs-panel w-full max-w-lg rounded-[20px] bg-card p-6 sm:p-8">
        {state.loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : !o ? (
          <p className="text-sm text-destructive">{state.error || "This link is not valid."}</p>
        ) : (
          <>
            {o.firm && <p className="text-sm font-medium text-muted-foreground">{o.firm}</p>}
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{o.company}</h1>
            {o.company_number && <p className="text-sm text-muted-foreground">Company number {o.company_number}</p>}

            {o.issues.length > 0 && (
              <ul className="mt-5 space-y-1.5">
                {o.issues.map((issue) => (
                  <li key={issue} className="flex items-center gap-2 rounded-lg bg-destructive/[0.07] px-3 py-2 text-sm font-medium text-destructive">
                    <IconAlertTriangle className="size-4 shrink-0" /> {issue}
                  </li>
                ))}
              </ul>
            )}

            {o.message && (
              <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-foreground/80">
                {/* **words** are bold, as in the email */}
                {String(o.message).split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i} className="font-semibold text-foreground">{part}</strong> : part))}
              </p>
            )}

            <div className="mt-5 flex items-center justify-between rounded-xl border px-4 py-3">
              <span className="font-medium">{o.service}</span>
              {o.price && <span className="font-semibold tabular-nums">{o.price}</span>}
            </div>

            {o.accepted ? (
              <p className="mt-6 flex items-start gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                <IconCircleCheck className="mt-0.5 size-5 shrink-0" />
                Thank you. {o.firm || "We"} {o.firm ? "has" : "have"} your go-ahead and will be in touch about the next steps.
              </p>
            ) : (
              <>
                <Button size="lg" className="mt-6 w-full" disabled={state.busy} onClick={accept}>
                  {state.busy ? <IconLoader2 className="size-4 animate-spin" /> : "Yes, Please Go Ahead"}
                </Button>
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  This tells {o.firm || "us"} to start. {o.price ? "You will get an invoice for it." : ""}
                </p>
              </>
            )}
            {o.whatsapp && (
              <Button variant="outline" size="lg" className="mt-3 w-full" onClick={() => window.open(o.whatsapp, "_blank", "noopener")}>
                <IconBrandWhatsapp className="size-5 text-[#25D366]" /> Chat on WhatsApp
              </Button>
            )}
            {state.error && <p className="mt-3 text-sm text-destructive">{state.error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
