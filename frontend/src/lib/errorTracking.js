/**
 * Error tracking: browser crashes go to GlitchTip (errors.finstap.com, Sentry-compatible) when the build has
 * VITE_SENTRY_DSN (a Coolify build variable). Without it (local dev) nothing is sent.
 * No personal data: no IP address, cookies or session replay, only the signed-in user's id and role.
 */
import * as Sentry from "@sentry/react"

const dsn = String(import.meta.env.VITE_SENTRY_DSN || "").trim()

export const errorTrackingEnabled = Boolean(dsn)

function storedUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null")
  } catch {
    return null
  }
}

function storedWorkspace() {
  try {
    return localStorage.getItem("workspace") || window.location.hostname.split(".")[0] || ""
  } catch {
    return ""
  }
}

const reportedAt = new Map()

/**
 * A call to the server failed (no answer, or a 5xx): report it with the page and the call so it can be
 * diagnosed, at most once a minute for the same call. The person sees a calm message (lib/api.js).
 */
export function reportApiFailure({ url, method, status, error }) {
  if (!errorTrackingEnabled) return
  const path = String(url || "").replace(/^https?:\/\/[^/]+/, "").split("?")[0]
  const key = `${method} ${path} ${status}`
  const now = Date.now()
  if (now - (reportedAt.get(key) || 0) < 60000) return
  reportedAt.set(key, now)
  Sentry.withScope((scope) => {
    scope.setTag("area", status ? "api" : "network")
    scope.setTag("api_status", String(status))
    scope.setExtra("call", `${method} ${path}`)
    scope.setExtra("page", window.location.pathname)
    scope.setExtra("error", String(error || "").slice(0, 300))
    Sentry.captureMessage(status ? `API ${status}: ${method} ${path}` : `Network: ${method} ${path}`, "error")
  })
}

export function initErrorTracking() {
  if (!errorTrackingEnabled) return
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // The user is read when an error is sent, so a login or logout after page load is picked up
    beforeSend(event) {
      const user = storedUser()
      event.user = user?.id ? { id: String(user.id) } : undefined
      if (user?.role) event.tags = { ...event.tags, role: user.role }
      // Which company's workspace (acme.finstap.com) the error happened in
      const workspace = storedWorkspace()
      if (workspace) event.tags = { ...event.tags, workspace }
      return event
    },
  })
}

/** createRoot options: React 19 hands uncaught and caught render errors to these callbacks. */
export const rootErrorOptions = errorTrackingEnabled
  ? { onUncaughtError: Sentry.reactErrorHandler(), onCaughtError: Sentry.reactErrorHandler() }
  : {}
