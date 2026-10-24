/**
 * A random id for this browser, kept in localStorage. The login sends it so the server can skip the
 * emailed login code for 24 hours on a browser that already entered one (a new browser has a new id).
 */
const KEY = "device_id"

export function getDeviceId() {
  try {
    let id = localStorage.getItem(KEY)
    if (!id || id.length < 16) {
      id = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    // Private mode without storage: every sign-in asks for a code
    return ""
  }
}
