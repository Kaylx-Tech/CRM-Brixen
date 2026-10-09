/** Current logged-in user (as stored at login) and simple role checks for hiding admin-only controls. */
export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}") || {}
  } catch {
    return {}
  }
}

export function isAdminRole(user = getCurrentUser()) {
  const role = String(user?.role || "").toUpperCase()
  return role === "ADMIN" || role === "SUPER_ADMIN"
}
