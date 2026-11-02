/**
 * Finstap owner portal (admin.finstap.com) and KYC panel (kyc.finstap.com): their own sign-ins, kept apart
 * from any company workspace. Each panel's session token is stored under its own key and sent without X-Tenant.
 */
import { getApiBase } from "@/lib/api"
import { IS_FINSTAP, TENANT_DOMAIN } from "@/lib/workspace"

const KEY = "owner_token"
// The KYC panel (kyc.finstap.com) signs in through the same API but keeps its own token
const KYC_KEY = "kyc_token"

function readToken(key) {
  try {
    return localStorage.getItem(key) || ""
  } catch {
    return ""
  }
}

function writeToken(key, token) {
  try {
    if (token) localStorage.setItem(key, token)
    else localStorage.removeItem(key)
  } catch {
    // Private mode: sign in again next time
  }
}

export const getOwnerToken = () => readToken(KEY)
export const setOwnerToken = (token) => writeToken(KEY, token)
export const getKycToken = () => readToken(KYC_KEY)
export const setKycToken = (token) => writeToken(KYC_KEY, token)

/** This page is the owner portal's own address (admin.finstap.com). */
export function onOwnerHost() {
  return IS_FINSTAP && Boolean(TENANT_DOMAIN) && window.location.hostname.toLowerCase() === `admin.${TENANT_DOMAIN}`
}

/** The owner portal can open here: on its own address, or anywhere when subdomains are off (local tests). */
export function ownerPortalAllowed() {
  return IS_FINSTAP && (onOwnerHost() || !TENANT_DOMAIN)
}

/** This page is the KYC panel's own address (kyc.finstap.com). */
export function onKycHost() {
  return IS_FINSTAP && Boolean(TENANT_DOMAIN) && window.location.hostname.toLowerCase() === `kyc.${TENANT_DOMAIN}`
}

/** The KYC panel opens on its own address, or at /kyc when subdomains are off (local tests). */
export function kycPanelAllowed() {
  return IS_FINSTAP && (onKycHost() || !TENANT_DOMAIN)
}

/** An API caller for one panel: returns { ok, status, data, error }; a 401 signs that panel out. */
function panelApi(getToken, setToken, signedOutEvent) {
  return async (path, { method = "GET", body } = {}) => {
    const token = getToken()
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
      setToken("")
      window.dispatchEvent(new Event(signedOutEvent))
    }
    return {
      ok: res.ok && json.success !== false,
      status: res.status,
      data: json.data,
      message: json.message,
      error: json.error || json.message || (res.ok ? "" : "Something went wrong."),
    }
  }
}

/** Call the owner API with the owner's token. */
export const ownerApi = panelApi(getOwnerToken, setOwnerToken, "owner-signed-out")
/** Call the owner API with the KYC panel's token (only /me, /logout and /desk answer it). */
export const kycApi = panelApi(getKycToken, setKycToken, "kyc-signed-out")

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
