import { useEffect, useRef } from "react"

/**
 * Reloads a page's data when someone comes back to the tab after being away a while (30s by default),
 * so lists stay current without a Refresh button. Quick tab switches don't reload (no flicker).
 */
export function useRefreshOnReturn(reload, awayMs = 30_000) {
  const reloadRef = useRef(reload)
  useEffect(() => {
    reloadRef.current = reload
  }, [reload])

  useEffect(() => {
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : null
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
      } else if (hiddenAt && Date.now() - hiddenAt >= awayMs) {
        hiddenAt = null
        reloadRef.current?.()
      } else {
        hiddenAt = null
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [awayMs])
}
