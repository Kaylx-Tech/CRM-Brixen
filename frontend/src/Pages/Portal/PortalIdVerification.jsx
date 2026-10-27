import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconCircleCheck, IconExternalLink, IconId } from "@tabler/icons-react"
import { apiRequest } from "@/lib/api"

// What the customer sees for each identity check (never the AML or document details)
const STEPS = {
  action_needed: { label: "Action needed", tone: "badge-amber", text: "Verify your identity: ID document, a selfie and a recent proof of address." },
  checking: { label: "Being checked", tone: "badge-sky", text: "Thank you, we are checking your documents." },
  verified: { label: "Verified", tone: "badge-green", text: "Your identity is verified." },
  not_verified: { label: "Not verified", tone: "bg-destructive/15 text-destructive", text: "We could not verify your identity. Please contact us." },
  expired: { label: "Link expired", tone: "bg-muted text-muted-foreground", text: "The link has expired. Please contact us for a new one." },
}

// Identity verification for Companies House (directors and PSCs) on the customer's orders.
// With orderId it shows that order only; on the dashboard it shows only while something is open.
export default function PortalIdVerification({ orderId, onlyOpen = false }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    let alive = true
    apiRequest("/client/id-verification", { silent: true, label: "Identity verification" }).then((res) => {
      if (alive && res.ok) setItems(res.data?.data?.verifications || [])
    })
    return () => {
      alive = false
    }
  }, [orderId])

  let shown = orderId ? items.filter((v) => v.order_id === orderId) : items
  if (onlyOpen) shown = shown.filter((v) => v.step !== "verified")
  if (!shown.length) return null

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <IconId className="size-4 text-primary" />
        <h3 className="font-semibold">Identity verification</h3>
      </div>
      <ul className="divide-y">
        {shown.map((v) => {
          const step = STEPS[v.step] || STEPS.action_needed
          return (
            <li key={v.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {v.full_name}
                  <Badge className={step.tone}>{step.label}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {[v.person_role, !orderId && v.order_number].filter(Boolean).join(" · ")}
                  {v.person_role || (!orderId && v.order_number) ? " — " : ""}
                  {step.text}
                </p>
                {v.ch_personal_code && (
                  <p className="mt-1 flex items-center gap-1 text-xs">
                    <IconCircleCheck className="size-3.5 text-emerald-600" />
                    Companies House personal code: <span className="font-mono font-semibold">{v.ch_personal_code}</span>
                  </p>
                )}
              </div>
              {v.verify_url && (
                <Button size="sm" nativeButton={false} render={<a href={v.verify_url} target="_blank" rel="noopener noreferrer" />}>
                  Verify now
                  <IconExternalLink className="size-3.5" />
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
