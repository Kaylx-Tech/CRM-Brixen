"use client"

import { useEffect, useSyncExternalStore } from "react"

const subscribe = () => () => {}
const read = () => (new URLSearchParams(window.location.search).get("order") || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 30)

/** The order number Stripe sends back (?order=GB...), shown to the customer; the saved form draft is cleared. */
export default function OrderNumber() {
  const order = useSyncExternalStore(subscribe, read, () => "")
  useEffect(() => {
    try {
      for (const key of Object.keys(window.localStorage)) if (key.startsWith("brixen-formation-")) window.localStorage.removeItem(key)
    } catch {
      // nothing saved
    }
  }, [])
  if (!order) return <p className="mt-5 text-lg text-white/85">We have received your order and payment.</p>
  return (
    <p className="mt-5 text-lg text-white/85">
      Your order number is <b className="text-white">#{order}</b>. Please keep it for your records.
    </p>
  )
}
