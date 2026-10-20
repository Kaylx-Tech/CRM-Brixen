/**
 * Finstap workspaces: each company signs in to its own workspace (backend: one database per company).
 * The chosen workspace is remembered in this browser and sent as X-Tenant on requests made before
 * login (login, forgot password); after login the session token itself names the workspace.
 */

// Build with VITE_PRODUCT=finstap for the Finstap app (signup page, workspace login)
export const IS_FINSTAP = String(import.meta.env.VITE_PRODUCT || "").toLowerCase() === "finstap"

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

export function getWorkspace() {
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
