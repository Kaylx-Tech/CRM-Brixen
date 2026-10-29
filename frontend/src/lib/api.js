/**
 * Shared API helpers — clear toast reasons when backend data fails to load.
 */
import { toast } from "@/components/ui/toast"
import { workspaceHeaders } from "@/lib/workspace"

export function getApiBase() {
  return String(import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "")
}

export function authHeaders(extra = {}) {
  const token = localStorage.getItem("token")
  return {
    "Content-Type": "application/json",
    // Finstap workspace (only set in the Finstap app); the token prefix wins once signed in
    ...workspaceHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

function networkReason(err, apiBase) {
  const msg = String(err?.message || err || "")
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(msg)) {
    return (
      `Cannot reach API at ${apiBase}. ` +
      `Check if backend is running and CORS allows requests.`
    )
  }
  return msg || "Unknown network error"
}

function httpReason(res, data, apiBase, rawText) {
  const serverMsg =
    (data && (data.error || data.message || data.detail)) ||
    (typeof rawText === "string" && rawText && !rawText.trim().startsWith("<")
      ? rawText.slice(0, 160)
      : null)

  if (res.status === 401) {
    return (
      serverMsg ||
      "Session expired or missing token. Please log in again."
    )
  }
  if (res.status === 403) {
    return serverMsg || "Access denied. Your role cannot access this resource."
  }
  if (res.status === 404) {
    return (
      serverMsg ||
      `Resource not found (404) on ${apiBase}.`
    )
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return (
      serverMsg ||
      `Server/Gateway unavailable (${res.status}). Server might be restarting.`
    )
  }
  if (res.status >= 500) {
    return serverMsg || `Internal Server Error (${res.status}).`
  }
  if (typeof rawText === "string" && rawText.includes("<!doctype html")) {
    return (
      `Got HTML page instead of JSON from ${apiBase}. Check VITE_API_URL.`
    )
  }
  return serverMsg || `Request failed with HTTP status ${res.status}.`
}

/**
 * Show a clear, readable error toast.
 */
export function toastApiError({ title, reason, status, url } = {}) {
  const desc = [reason, status && status !== 0 ? `(Status: ${status})` : null]
    .filter(Boolean)
    .join(" ")
  toast.error(title || "API Request Failed", {
    description: desc || "Unable to complete request. Please try again.",
    duration: 5000,
  })
}

/**
 * Called when a list loaded but is empty. No toast any more: every list already shows its own
 * empty state, and the toast stayed on screen while the user moved to other pages.
 */
// eslint-disable-next-line no-unused-vars
export function toastApiEmpty(label, apiBase) {}

let sessionExpiredHandled = false

/** Session is gone on the server (expired / revoked / DB restored): clear local state and go to login. */
function handleSessionExpired() {
  if (sessionExpiredHandled || typeof window === "undefined") return
  if (window.location.pathname.startsWith("/login")) return
  sessionExpiredHandled = true
  try {
    localStorage.removeItem("user")
    localStorage.removeItem("token")
  } catch {
    /* storage blocked — still redirect */
  }
  toast.error("Session expired", { description: "Please log in again.", duration: 4000 })
  setTimeout(() => window.location.assign("/login"), 800)
}

/**
 * fetch wrapper with auth + structured result + optional toast on failure.
 *
 * @returns {{ ok: boolean, status: number, data: any, url: string, reason?: string, title?: string }}
 */
export async function apiRequest(path, options = {}) {
  const {
    silent = false,
    label = "Data",
    headers: extraHeaders,
    ...fetchOpts
  } = options

  // Plain-object bodies are sent as JSON (strings, FormData, Blob etc. pass through untouched)
  if (
    fetchOpts.body &&
    typeof fetchOpts.body === "object" &&
    !(fetchOpts.body instanceof FormData) &&
    !(fetchOpts.body instanceof Blob) &&
    !(fetchOpts.body instanceof URLSearchParams) &&
    !(fetchOpts.body instanceof ArrayBuffer)
  ) {
    fetchOpts.body = JSON.stringify(fetchOpts.body)
  }

  const base = getApiBase()
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`

  let res
  try {
    res = await fetch(url, {
      credentials: "include",
      ...fetchOpts,
      headers: {
        ...authHeaders(),
        ...(extraHeaders || {}),
      },
    })
  } catch (err) {
    const info = {
      ok: false,
      status: 0,
      data: null,
      url,
      title: `${label} failed to load`,
      reason: networkReason(err, base),
    }
    if (!silent) toastApiError(info)
    return info
  }

  const rawText = await res.text()
  let data = null
  try {
    data = rawText ? JSON.parse(rawText) : null
  } catch {
    data = null
  }

  if (!res.ok) {
    if (res.status === 401 && !url.includes("/auth/")) {
      handleSessionExpired()
    }
    // Finstap: the workspace is locked until it pays; the layout then shows only Billing
    if (res.status === 402) {
      window.dispatchEvent(new Event("finstap-billing-changed"))
      return { ok: false, status: 402, data, url, reason: data?.error || "Payment needed" }
    }
    const info = {
      ok: false,
      status: res.status,
      data,
      url,
      title: `${label} failed to load`,
      reason: httpReason(res, data, base, rawText),
      // 400 { fields: { name: message } } from backend/utils/validation.py, shown next to each field
      fieldErrors: data && typeof data.fields === "object" ? data.fields : null,
    }
    if (!silent) toastApiError(info)
    return info
  }

  if (data && typeof data === "object" && data.success === false) {
    const info = {
      ok: false,
      status: res.status,
      data,
      url,
      title: `${label} failed to load`,
      reason: data.error || data.message || "API returned success: false",
      fieldErrors: typeof data.fields === "object" ? data.fields : null,
    }
    if (!silent) toastApiError(info)
    return info
  }

  // HTML success page? still wrong host
  if (typeof rawText === "string" && rawText.trim().toLowerCase().startsWith("<!doctype")) {
    const info = {
      ok: false,
      status: res.status,
      data: null,
      url,
      title: `${label} failed to load`,
      reason: httpReason(res, null, base, rawText),
    }
    if (!silent) toastApiError(info)
    return info
  }

  return { ok: true, status: res.status, data, url }
}
