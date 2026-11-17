"use client"

import { useSyncExternalStore } from "react"
import { PACKAGES } from "@/lib/home"
import { SERVICE_PAGES } from "@/lib/services"

/**
 * "My Cart": the orders a visitor started on this site and has not paid for yet. The order forms keep what was typed
 * in this browser (localStorage brixen-formation-<package> / brixen-order-<service>); OrderNumber.jsx clears them
 * after payment. Nothing here is sent anywhere.
 */
const PREFIXES = ["brixen-formation-", "brixen-order-"]

const started = (draft) =>
  Object.values(draft || {}).some((value) =>
    Array.isArray(value)
      ? value.some((x) => String(x || "").trim())
      : typeof value === "string" && value.trim() && !/^\+\d{1,4}$/.test(value.trim()),
  )

// A CRM order form keeps its answers as crm_<question>: the company question names the order
const companyAnswer = (draft) =>
  (Object.entries(draft).find(([k, v]) => /company/.test(k) && typeof v === "string" && v.trim()) || [])[1] || ""

function read() {
  const items = []
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (!PREFIXES.some((p) => key.startsWith(p))) continue
      let draft = {}
      try {
        draft = JSON.parse(window.localStorage.getItem(key) || "{}")
      } catch {
        continue
      }
      if (!started(draft)) continue
      if (key.startsWith("brixen-formation-")) {
        const pkg = PACKAGES.find((p) => p.slug === key.slice("brixen-formation-".length))
        if (!pkg) continue
        items.push({ key, name: `${pkg.name} Package`, detail: draft.company_name || "Company formation", price: pkg.price, href: pkg.next })
      } else {
        const service = SERVICE_PAGES.find((s) => s.order === key.slice("brixen-order-".length))
        if (!service) continue
        items.push({ key, name: service.name, detail: draft.company_name || draft.name || companyAnswer(draft), price: service.price ? `£${service.price}` : "", href: service.details })
      }
    }
  } catch {
    // storage blocked (private mode): an empty cart
  }
  return items
}

// Snapshot cached by its text, so React sees the same object until the cart really changes
let cache = { text: "", items: [] }
function snapshot() {
  const items = read()
  const text = JSON.stringify(items)
  if (text !== cache.text) cache = { text, items }
  return cache.items
}
const EMPTY = []
const listeners = new Set()
function subscribe(callback) {
  listeners.add(callback)
  window.addEventListener("storage", callback)
  window.addEventListener("focus", callback)
  return () => {
    listeners.delete(callback)
    window.removeEventListener("storage", callback)
    window.removeEventListener("focus", callback)
  }
}

export function useCart() {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY)
}

export function removeFromCart(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // nothing to remove
  }
  for (const callback of listeners) callback()
}
