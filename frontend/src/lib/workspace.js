/**
 * Finstap workspaces: each company signs in to its own workspace (backend: one database per company).
 *
 * With company subdomains (VITE_TENANT_DOMAIN=finstap.com) the address names the workspace:
 * acme.finstap.com is "acme", and the main domain finstap.com (or www.) is the shared signup and
 * "find your workspace" page. Without them, the chosen workspace is remembered in this browser.
 * Either way it is sent as X-Tenant on requests made before login; after login the session token
 * itself names the workspace.
 */

// Build with VITE_PRODUCT=finstap for the Finstap app (signup page, workspace login)
export const IS_FINSTAP = String(import.meta.env.VITE_PRODUCT || "").toLowerCase() === "finstap"

// Base domain for company subdomains (finstap.com; "localhost" for local tests); empty = off
export const TENANT_DOMAIN = IS_FINSTAP
  ? String(import.meta.env.VITE_TENANT_DOMAIN || "").trim().toLowerCase().replace(/^\.+|\.+$/g, "")
  : ""

// Shared addresses that are never a company workspace (matches the backend's reserved names)
const RESERVED = new Set(["www", "api", "app", "admin", "portal", "platform", "finstap", "mail", "static"])

const KEY = "workspace"

export function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

/** A new workspace name: one lowercase word, letters and numbers only ("Acme-Co 1" → "acmeco1"). */
export function toWorkspaceName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30)
}

// Words left out when suggesting a workspace name from the company name
const NAME_FILLER = new Set(["the", "ltd", "limited", "llp", "plc", "co", "company", "inc", "group", "and", "uk"])

/** Suggest a short one-word name from the company name: "The Acme Transport Ltd" → "acme". */
export function suggestWorkspaceName(companyName) {
  const words = String(companyName || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !NAME_FILLER.has(w))
  let name = words.shift() || ""
  // Very short first words ("ab", "j") take the next word too: "AB Accounting" → "abaccounting"
  while (name.length < 3 && words.length) name += words.shift()
  return toWorkspaceName(name)
}

/** The address a workspace will have, for showing to people: "acme.finstap.com". */
export function workspaceHost(slug) {
  return `${slug || "yourcompany"}.${TENANT_DOMAIN || "finstap.com"}`
}

/** The workspace named by this page's address (acme.finstap.com → "acme"), else "". */
export function subdomainWorkspace() {
  if (!TENANT_DOMAIN || typeof window === "undefined") return ""
  const host = window.location.hostname.toLowerCase()
  const suffix = `.${TENANT_DOMAIN}`
  if (!host.endsWith(suffix)) return ""
  const sub = host.slice(0, -suffix.length)
  if (!sub || sub.includes(".") || RESERVED.has(sub)) return ""
  return normalizeSlug(sub) === sub ? sub : ""
}

/** Subdomains are on and this page is the shared address (finstap.com), not a company's own. */
export function onSharedHost() {
  return Boolean(TENANT_DOMAIN) && !subdomainWorkspace()
}

/** A company's own address, e.g. https://acme.finstap.com/login (keeps http and the port for local tests). */
export function workspaceUrl(slug, path = "/") {
  if (!TENANT_DOMAIN || !slug) return ""
  const { protocol, port } = window.location
  return `${protocol}//${slug}.${TENANT_DOMAIN}${port ? `:${port}` : ""}${path}`
}

/** The shared address, the main domain itself (https://finstap.com/signup), for signup and "find your workspace". */
export function sharedUrl(path = "/") {
  if (!TENANT_DOMAIN) return path
  const { protocol, port } = window.location
  return `${protocol}//${TENANT_DOMAIN}${port ? `:${port}` : ""}${path}`
}

export function getWorkspace() {
  const fromAddress = subdomainWorkspace()
  if (fromAddress) return fromAddress
  try {
    return localStorage.getItem(KEY) || ""
  } catch {
    return ""
  }
}

export function setWorkspace(slug) {
  try {
    if (slug) localStorage.setItem(KEY, normalizeSlug(slug))
    else localStorage.removeItem(KEY)
  } catch {
    // Private mode: the user types the workspace again next time
  }
}

/** X-Tenant header for the given (or remembered) workspace; empty when there is none. */
export function workspaceHeaders(slug = getWorkspace()) {
  return slug ? { "X-Tenant": slug } : {}
}
