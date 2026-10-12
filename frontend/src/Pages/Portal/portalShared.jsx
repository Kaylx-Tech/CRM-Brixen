import React, { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IconLoader2, IconRefresh, IconAlertCircle } from "@tabler/icons-react"
import { apiRequest } from "@/lib/api"

/** GET an endpoint and return { data, isLoading, error, reload }; `data` is the response's `data` object. */
export function usePortalData(path) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError("")
    try {
      const res = await apiRequest(path, { silent: true, label: "Portal" })
      if (!res.ok) {
        setError(res.reason || "Could not load this page")
        return
      }
      setData(res.data?.data ?? res.data ?? null)
    } finally {
      setIsLoading(false)
    }
  }, [path])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, isLoading, error, reload }
}

export function money(value) {
  const n = Number(value || 0)
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(value) {
  if (!value) return "—"
  const text = String(value)
  const d = new Date(text.includes("T") || text.length <= 10 ? text : text.replace(" ", "T") + "Z")
  if (Number.isNaN(d.getTime())) return text
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

const STATUS_TONES = {
  verified: "badge-green", filed: "badge-green",
  completed: "badge-green", paid: "badge-green", active: "badge-green", approved: "badge-green", resolved: "badge-green",
  "in progress": "badge-sky", processing: "badge-sky", open: "badge-sky",
  pending: "badge-amber", "partial paid": "badge-amber", "documents required": "badge-amber",
  "information required": "badge-amber", "pending review": "badge-amber", "due soon": "badge-amber",
  cancelled: "badge-red", overdue: "badge-red", refunded: "badge-red", dissolved: "badge-red", closed: "bg-muted text-muted-foreground",
}

export function StatusBadge({ status }) {
  const text = String(status || "—")
  return <Badge className={STATUS_TONES[text.toLowerCase()] || "bg-muted text-muted-foreground"}>{text}</Badge>
}

export function PageHeader({ title, description, onRefresh, isLoading, children }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {onRefresh ? (
          <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
            <IconRefresh className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Loading / error / empty states wrapped around a page's content. */
export function PageState({ isLoading, error, isEmpty, emptyText, onRetry, children }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border bg-card py-16 text-sm text-muted-foreground">
        <IconLoader2 className="size-4 animate-spin" /> Loading…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 py-12 text-center text-sm text-destructive">
        <IconAlertCircle className="size-5" />
        {error}
        {onRetry ? <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button> : null}
      </div>
    )
  }
  if (isEmpty) {
    return <p className="rounded-2xl border bg-card py-16 text-center text-sm text-muted-foreground">{emptyText}</p>
  }
  return children
}

export function ProgressBar({ value }) {
  const pct = Math.max(0, Math.min(100, Number(value || 0)))
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
}
