/** Current logged-in user (as stored at login) and role checks for hiding controls the backend would refuse. */
export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}") || {}
  } catch {
    return {}
  }
}

export function getRole(user = getCurrentUser()) {
  return String(user?.role || "").toUpperCase()
}

/** Where a user lands after login: customers get their portal, the team gets the CRM. */
export function homePath(user = getCurrentUser()) {
  return getRole(user) === "CLIENT" ? "/portal/dashboard" : "/admin/dashboard"
}

export function isAdminRole(user = getCurrentUser()) {
  const role = getRole(user)
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

/** Admins and managers: run the team (create / assign tasks, see team incentives). */
export function isManagerOrAbove(user = getCurrentUser()) {
  return isAdminRole(user) || getRole(user) === "MANAGER"
}

export function isStaffRole(user = getCurrentUser()) {
  return getRole(user) === "STAFF"
}

/** Money (revenue, turnover, profit) is for admins only, as in the old portal. */
export function canViewRevenue(user = getCurrentUser()) {
  return isAdminRole(user)
}

/**
 * Order prices (what the customer pays): everyone except Staff Operations. The server sends
 * can_view_prices at login and leaves every money field empty for them anyway.
 */
export function canViewPrices(user = getCurrentUser()) {
  if (user?.can_view_prices === false) return false
  return !(getRole(user) === "STAFF" && String(user?.staff_type || "").toLowerCase() === "operations")
}

/** Team roles as they are picked and shown: STAFF splits into Staff Marketing and Staff Operations. */
export const TEAM_ROLE_OPTIONS = [
  { value: "STAFF_MARKETING", label: "Staff Marketing", role: "STAFF", staff_type: "marketing" },
  { value: "STAFF_OPERATIONS", label: "Staff Operations", role: "STAFF", staff_type: "operations", hint: "No prices" },
  { value: "MANAGER", label: "Manager", role: "MANAGER" },
  { value: "ADMIN", label: "Admin", role: "ADMIN" },
]

/** The role picker value for a member: "STAFF_OPERATIONS" etc. */
export function teamRoleValue(role, staffType) {
  const r = String(role || "").toUpperCase()
  if (r !== "STAFF") return r
  return String(staffType || "").toLowerCase() === "operations" ? "STAFF_OPERATIONS" : "STAFF_MARKETING"
}

/** { role, staff_type } to send for a picked team role value. */
export function teamRolePayload(value) {
  const opt = TEAM_ROLE_OPTIONS.find((o) => o.value === value)
  if (opt) return { role: opt.role, staff_type: opt.staff_type || null }
  return { role: String(value || "").toUpperCase(), staff_type: null }
}

export function teamRoleLabel(role, staffType) {
  const value = teamRoleValue(role, staffType)
  return TEAM_ROLE_OPTIONS.find((o) => o.value === value)?.label || (value === "SUPER_ADMIN" ? "Super Admin" : value)
}

function userDepartments(user) {
  const raw = user?.departments ?? user?.department
  if (Array.isArray(raw)) return raw
  const text = String(raw || "").trim()
  if (!text) return []
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return text.split(",").map((d) => d.trim()).filter(Boolean)
}

/**
 * Which admin pages each role may open (mirrors the old portal's canOpenView + VIEW_ACCESS and the
 * backend's department permissions). STAFF also needs one of the listed departments.
 */
const PAGE_ACCESS = {
  dashboard: { roles: "internal" },
  performance: { roles: "internal" },
  notifications: { roles: "internal" },
  profile: { roles: "internal" },
  companies: { roles: "internal" },
  tasks: { roles: "internal" },
  customers: { roles: "internal", departments: ["New Signups"] },
  orders: { roles: "internal", departments: ["Orders", "Support"] },
  services: { roles: "internal", departments: ["Orders"] },
  documents: { roles: "internal", departments: ["Documents", "Compliance"] },
  intake: { roles: "internal", departments: ["Documents", "Compliance"] },
  accountancy: { roles: "internal", departments: ["Accountancy", "Accounts", "Compliance"] },
  payments: { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] },
  logs: { roles: ["SUPER_ADMIN", "ADMIN"] },
  "email-log": { roles: ["SUPER_ADMIN", "ADMIN"] },
  tickets: { roles: "internal", departments: ["Support"] },
  "smart-operations": { roles: "internal" },
  // The Settings page also holds "Profile & Password"; it shows only that tab to non-admins
  settings: { roles: "internal" },
}

const INTERNAL_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGER", "STAFF"]

export function canOpenPage(page, user = getCurrentUser()) {
  const rule = PAGE_ACCESS[page]
  const role = getRole(user)
  if (!rule) return INTERNAL_ROLES.includes(role)
  const roles = rule.roles === "internal" ? INTERNAL_ROLES : rule.roles
  if (!roles.includes(role)) return false
  if (role !== "STAFF" || !rule.departments) return true
  const mine = userDepartments(user)
  return rule.departments.some((d) => mine.includes(d))
}

/** "/admin/orders?x=1" -> "orders" */
export function pageFromPath(path) {
  const match = String(path || "").match(/^\/admin\/([^/?#]+)/)
  return match ? match[1] : ""
}

export function canOpenPath(path, user = getCurrentUser()) {
  const page = pageFromPath(path)
  return page ? canOpenPage(page, user) : true
}
