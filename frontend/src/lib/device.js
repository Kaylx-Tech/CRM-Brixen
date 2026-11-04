/**
 * A random id for this browser. The login sends it so the server can skip the emailed login code for
 * 30 days on a browser that already entered one (a new browser has a new id, so it always gets a code).
 *
 * Browsers keep localStorage per address, so finstap.com, acme.finstap.com, admin.finstap.com and
 * kyc.finstap.com would each make their own id, and a code entered on one would not count on the
 * others. The id is therefore also kept in a cookie for the whole main domain (.finstap.com), which
 * every one of those addresses reads first; localStorage stays as the fallback (and for local tests).
 */
import { TENANT_DOMAIN } from "@/lib/workspace"

const KEY = "device_id"
const COOKIE = "device_id"
const COOKIE_DAYS = 400 // the longest browsers keep a cookie

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

/** ".finstap.com" when this page is on the main domain or one of its subdomains, else "" (this address only). */
function sharedDomain() {
  const domain = TENANT_DOMAIN
  if (!domain || domain === "localhost" || !domain.includes(".")) return ""
  const host = window.location.hostname.toLowerCase()
  return host === domain || host.endsWith(`.${domain}`) ? domain : ""
}

function readCookie() {
  const found = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`))
  return found ? decodeURIComponent(found.slice(COOKIE.length + 1)) : ""
}

function writeCookie(id) {
  const domain = sharedDomain()
  document.cookie = [
    `${COOKIE}=${encodeURIComponent(id)}`,
    "Path=/",
    `Max-Age=${COOKIE_DAYS * 24 * 60 * 60}`,
    "SameSite=Lax",
    domain ? `Domain=.${domain}` : "",
    window.location.protocol === "https:" ? "Secure" : "",
  ].filter(Boolean).join("; ")
}

export function getDeviceId() {
  let id
  try {
    id = readCookie()
  } catch {
    id = ""
  }
  try {
    if (!id || id.length < 16) id = localStorage.getItem(KEY) || ""
    if (!id || id.length < 16) id = newId()
    localStorage.setItem(KEY, id)
  } catch {
    // Private mode without storage: the cookie alone (or a new id, so a code) is used
    if (!id || id.length < 16) id = newId()
  }
  try {
    // Written every time, so the cookie's 400 days start again and every address shares this id
    writeCookie(id)
  } catch {
    // Cookies blocked: this address keeps its own id in localStorage
  }
  return id
}
