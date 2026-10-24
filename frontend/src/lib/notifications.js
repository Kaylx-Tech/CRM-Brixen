/** Shared helpers for the notification bell and the Notifications page. */

function parseServerDate(dateStr) {
  if (!dateStr) return null
  const text = String(dateStr)
  // The server stores UTC as "YYYY-MM-DD HH:MM:SS" (no timezone)
  const normalized = text.includes(" ") && !text.includes("T") ? `${text.replace(" ", "T")}Z` : text
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatRelativeTime(dateStr) {
  const date = parseServerDate(dateStr)
  if (!dateStr) return "just now"
  if (!date) return String(dateStr)
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (diffSec < 45) return "just now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

const ADMIN_LINKS = {
  "admin-tasks": "/admin/tasks",
  tasks: "/admin/tasks",
  "admin-orders": "/admin/orders",
  orders: "/admin/orders",
  "admin-documents": "/admin/documents",
  documents: "/admin/documents",
  "admin-customers": "/admin/customers",
  customers: "/admin/customers",
  "admin-companies": "/admin/companies",
  companies: "/admin/companies",
  "admin-invoices": "/admin/payments",
  invoices: "/admin/payments",
  payments: "/admin/payments",
  "admin-dashboard": "/admin/dashboard",
  dashboard: "/admin/dashboard",
  "admin-settings": "/admin/settings",
  settings: "/admin/settings",
}

/** Turn a stored notification link (old "#admin-orders" or "/orders" style, or a new "/admin/..." route) into a route. */
export function resolveAdminLink(link) {
  if (!link) return null
  const raw = String(link).trim()
  if (raw.startsWith("http")) return raw
  const route = (() => {
    if (raw.startsWith("/admin/")) return raw
    const cleaned = raw.replace(/^#/, "").replace(/^\//, "")
    if (ADMIN_LINKS[cleaned]) return ADMIN_LINKS[cleaned]
    if (cleaned.startsWith("admin-")) return `/admin/${cleaned.replace(/^admin-/, "")}`
    return null
  })()
  // Tasks are GOV Forms in Smart Operations (Team is only the members list)
  if (route && route.split("?")[0] === "/admin/tasks") return "/admin/smart-operations?tab=gov-forms"
  return route
}
