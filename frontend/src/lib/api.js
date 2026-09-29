/**
 * Shared API helpers — clear toast reasons when backend data fails to load.
 */
import { toast } from "sonner"

export function getApiBase() {
  return String(import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "")
}

export function authHeaders(extra = {}) {
  const token = localStorage.getItem("token")
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

function networkReason(err, apiBase) {
  const msg = String(err?.message || err || "")
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(msg)) {
    return (
      `Cannot reach API at ${apiBase}. ` +
      `Check: backend is running, CORS allows this site, and VITE_API_URL is correct ` +
      `(expected like https://api.brixenconsultants.com/api).`
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
      "Not authenticated (401). Session expired or missing token — please log in again."
    )
  }
  if (res.status === 403) {
    return serverMsg || "Access denied (403). Your role cannot load this data."
  }
  if (res.status === 404) {
    return (
      serverMsg ||
      `API route not found (404) on ${apiBase}. ` +
        `Frontend may be calling the wrong host, or this endpoint is missing on the live backend.`
    )
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return (
      serverMsg ||
      `API gateway/backend unavailable (${res.status}). Coolify/backend may be restarting.`
    )
  }
  if (res.status >= 500) {
    return serverMsg || `Server error (${res.status}). Check backend logs.`
  }
  if (typeof rawText === "string" && rawText.includes("<!doctype html")) {
    return (
      `Got an HTML page instead of JSON from ${apiBase}. ` +
      `VITE_API_URL is probably wrong (hitting WordPress/admin static host, not the CRM API).`
    )
  }
  return serverMsg || `Request failed with HTTP ${res.status}.`
}

/**
 * Show a long, readable error toast.
 */
export function toastApiError({ title, reason, status, url } = {}) {
  const desc = [reason, status ? `HTTP ${status}` : null, url ? `URL: ${url}` : null]
    .filter(Boolean)
    .join("\n")
  toast.error(title || "Failed to load data", {
    description: desc,
    duration: 10000,
  })
}

/**
 * Soft info when API succeeded but list is empty.
 */
export function toastApiEmpty(label, apiBase) {
  toast.message(`${label}: no records`, {
    description: `API responded OK from ${apiBase}, but the list is empty (database may have no data yet).`,
    duration: 6000,
  })
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
    const info = {
      ok: false,
      status: res.status,
      data,
      url,
      title: `${label} failed to load`,
      reason: httpReason(res, data, base, rawText),
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
