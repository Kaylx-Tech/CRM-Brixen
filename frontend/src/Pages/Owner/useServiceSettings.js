import { useCallback, useEffect, useState } from "react"
import { toastDone, toastFail, toastProcessing } from "@/lib/toastActions"
import { ownerApi } from "@/lib/owner"

/**
 * Prices of the services Finstap sells (KYC per check, registered office per year) and Finstap's
 * office addresses. Each page changes its own part and saves the whole set, so nothing is lost.
 */
export function useServiceSettings() {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ownerApi("/services/settings").then((res) => res.ok && setSettings(res.data))
  }, [])

  const save = useCallback(
    async (changes) => {
      setSaving(true)
      const id = toastProcessing("Saving…")
      const res = await ownerApi("/services/settings", { method: "POST", body: { ...settings, ...changes } })
      setSaving(false)
      if (res.ok) {
        setSettings(res.data)
        toastDone(id, "Saved")
        return true
      }
      toastFail(id, res.error)
      return false
    },
    [settings],
  )

  return { settings, save, saving }
}
