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
      return event
    },
  })
}

/** createRoot options: React 19 hands uncaught and caught render errors to these callbacks. */
export const rootErrorOptions = errorTrackingEnabled
  ? { onUncaughtError: Sentry.reactErrorHandler(), onCaughtError: Sentry.reactErrorHandler() }
  : {}
