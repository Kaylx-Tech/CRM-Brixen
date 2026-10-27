/**
 * Finstap owner portal (admin.finstap.com): its own sign-in, kept apart from any company workspace.
 * The owner's session token is stored under its own key and sent without X-Tenant.
 */
import { getApiBase } from "@/lib/api"
import { IS_FINSTAP, TENANT_DOMAIN } from "@/lib/workspace"

const KEY = "owner_token"

export function getOwnerToken() {
  try {
    return localStorage.getItem(KEY) || ""
  } catch {
    return ""
  }
}

export function setOwnerToken(token) {
  try {
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  } catch {
    // Private mode: the owner signs in again next time
  }
}

/** This page is the owner portal's own address (admin.finstap.com). */
export function onOwnerHost() {
  return IS_FINSTAP && Boolean(TENANT_DOMAIN) && window.location.hostname.toLowerCase() === `admin.${TENANT_DOMAIN}`
}

/** The owner portal can open here: on its own address, or anywhere when subdomains are off (local tests). */
export function ownerPortalAllowed() {
  return IS_FINSTAP && (onOwnerHost() || !TENANT_DOMAIN)
}

/** Call the owner API. Returns { ok, status, data, error }; a 401 signs the owner out. */
export async function ownerApi(path, { method = "GET", body } = {}) {
  const token = getOwnerToken()
  let res
  try {
    res = await fetch(`${getApiBase()}/platform/owner${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    return { ok: false, status: 0, data: null, error: "Cannot reach the server. Check your connection." }
  }
  const json = await res.json().catch(() => ({}))
  if (res.status === 401 && token) {
    setOwnerToken("")
    window.dispatchEvent(new Event("owner-signed-out"))
  }
  return {
    ok: res.ok && json.success !== false,
    status: res.status,
    data: json.data,
    message: json.message,
    error: json.error || json.message || (res.ok ? "" : "Something went wrong."),
  }
}

export const money = (value) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(
    Number(value || 0),
  )

/** "27 Oct 2026" from a database date ('' when empty). */
export function shortDate(value) {
  if (!value) return ""
  const d = new Date(String(value).replace(" ", "T") + (String(value).length <= 10 ? "" : "Z"))
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}
