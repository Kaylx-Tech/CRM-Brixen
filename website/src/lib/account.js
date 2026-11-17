"use client"

import { useSyncExternalStore } from "react"
import { SITE } from "@/lib/site"

/**
 * My Account sign-in: the CRM gives the website its own session (POST /public/account/login), kept in this browser.
 * B2B and Business customers are sent to the CRM client portal instead.
 */
const KEY = "brixen-account"
const listeners = new Set()
let cache = { text: null, value: null }

function read() {
  let text = null
  try {
    text = window.localStorage.getItem(KEY)
  } catch {
    text = null
  }
  if (text !== cache.text) {
    let value = null
    try {
      value = text ? JSON.parse(text) : null
    } catch {
      value = null
    }
    cache = { text, value: value && value.token ? value : null }
  }
  return cache.value
}

function notify() {
  for (const l of listeners) l()
}

function subscribe(callback) {
  listeners.add(callback)
  window.addEventListener("storage", callback)
  return () => {
    listeners.delete(callback)
    window.removeEventListener("storage", callback)
  }
}

/** The signed-in customer ({token, user}) or null; undefined while the page is drawn on the server. */
export function useAccount() {
  return useSyncExternalStore(subscribe, read, () => undefined)
}

export function saveAccount(token, user) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ token, user }))
  } catch {
    // private mode: signed in for this page only
  }
  notify()
}

export function updateUser(user) {
  const current = read()
  if (current) saveAccount(current.token, { ...current.user, ...user })
}

export function forgetAccount() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // nothing stored
  }
  notify()
}

/** A call to the CRM's My Account API. Returns {ok, status, data}; signs the customer out when the session ended. */
export async function accountApi(path, { method = "GET", body, raw = false } = {}) {
  const session = read()
  const headers = {}
  if (session?.token) headers.Authorization = `Bearer ${session.token}`
  if (body !== undefined) headers["Content-Type"] = "application/json"
  let res
  try {
    res = await fetch(`${SITE.apiUrl}/public/account${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    return { ok: false, status: 0, data: { message: "No connection. Please check your internet and try again." } }
  }
  if (res.status === 401 && session?.token && !path.startsWith("/login")) forgetAccount()
  if (raw && res.ok) return { ok: true, status: res.status, blob: await res.blob() }
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

/** Open (view) or save a file the CRM sends (invoice PDF, document). */
export async function openFile(path, filename, download = false) {
  const res = await accountApi(path, { raw: true })
  if (!res.ok) throw new Error(res.data?.message || "The file could not be opened.")
  const url = URL.createObjectURL(res.blob)
  if (download) {
    const a = document.createElement("a")
    a.href = url
    a.download = filename || "document"
    document.body.appendChild(a)
    a.click()
    a.remove()
  } else {
    window.open(url, "_blank", "noopener")
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

export const PORTAL_LOGIN = `${SITE.portalUrl}/login`
