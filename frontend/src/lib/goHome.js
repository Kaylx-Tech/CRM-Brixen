import { homePath } from "@/lib/permissions"

// The code of each home (the layout and its first page), fetched before the move so no "Loading…" shows
const HOMES = {
  admin: () => Promise.all([import("@/Layout/AdminLayout"), import("@/Pages/Dasboard"), import("@/Pages/Performance/Performance")]),
  portal: () => Promise.all([import("@/Layout/ClientLayout"), import("@/Pages/Portal/PortalDashboard")]),
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * After signing in: open the user's home without a flash. The home's code is fetched first (up to 2.5 seconds), then
 * the page changes with a short cross-fade (the sign-in page is light, the CRM may be dark), where the browser can.
 */
export async function goHome(navigate, user, options) {
  const to = homePath(user || {})
  await Promise.race([(to.startsWith("/portal") ? HOMES.portal : HOMES.admin)().catch(() => {}), wait(2500)])
  const go = () => navigate(to, options)
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  if (!document.startViewTransition || reduceMotion) return go()
  document.startViewTransition(() => new Promise((resolve) => {
    const from = window.location.pathname
    const started = performance.now()
    go()
    // Let the new page draw (two frames after the address changes), never holding the screen over a second
    let frames = 0
    const check = () => {
      if (window.location.pathname !== from) frames += 1
      if (frames >= 2 || performance.now() - started > 1000) resolve()
      else requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }))
}
