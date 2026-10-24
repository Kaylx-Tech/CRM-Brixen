/**
 * Finstap company branding (Settings → Branding): the company's logo, dark-background logo, tab icon
 * and accent colour. They come from /settings/public of the company's workspace, are remembered in
 * this browser so the next visit starts in the company's colours, and are only used in the Finstap
 * build (the Brixen build keeps its own look).
 */
import { useSyncExternalStore } from "react"
import { getApiBase, authHeaders } from "@/lib/api"
import { IS_FINSTAP, getWorkspace } from "@/lib/workspace"

const EMPTY = { logo: "", logoDark: "", icon: "", accent: "" }
const STYLE_ID = "company-brand-accent"
const CACHE_PREFIX = "brand:"

let state = EMPTY
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => fn())
}

/** The workspace these settings belong to: the signed-in one (token "<slug>.<uuid>"), else the chosen one. */
function currentWorkspace() {
  try {
    const token = localStorage.getItem("token") || ""
    const slug = token.includes(".") ? token.split(".")[0] : ""
    if (slug) return slug
  } catch {
    // Private mode: fall back to the address / remembered workspace
  }
  return getWorkspace()
}

// ── Colours ────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`
}

function rgbToHsl([r, g, b]) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255]
}

function withLightness(hex, fn) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [h, s, l] = rgbToHsl(rgb)
  return rgbToHex(hslToRgb([h, s, Math.max(0, Math.min(1, fn(l)))]))
}

/** The colour's hue at a set lightness, with its saturation capped (deep shades for the menu). */
export function shade(hex, lightness, maxSaturation = 0.55) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [h, s] = rgbToHsl(rgb)
  return rgbToHex(hslToRgb([h, Math.min(s, maxSaturation), lightness]))
}

function mix(hex, otherHex, amount) {
  const a = hexToRgb(hex)
  const b = hexToRgb(otherHex)
  if (!a || !b) return hex
  return rgbToHex(a.map((v, i) => v * amount + b[i] * (1 - amount)))
}

function luminance(hex) {
  const rgb = hexToRgb(hex) || [0, 0, 0]
  const [r, g, b] = rgb.map((v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** White text on the colour when it reads well enough, otherwise near-black. */
export function textOn(hex) {
  const contrastWithWhite = 1.05 / (luminance(hex) + 0.05)
  return contrastWithWhite >= 3 ? "#ffffff" : "#111111"
}

/** A picked logo colour made usable for buttons: not too pale, not too dark. */
export function usableAccent(hex) {
  return withLightness(hex, (l) => Math.min(0.62, Math.max(0.28, l)))
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not read this image."))
    img.src = src
  })
}

/**
 * The logo's main colours, most brand-like first (frequent and saturated; white, black and greys
 * are skipped). Empty when the logo has no colour at all.
 */
export async function extractPalette(src, max = 6) {
  if (!src) return []
  const img = await loadImage(src)
  const size = 96
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  // SVGs without a width/height still draw at the canvas size
  const w = img.naturalWidth || size
  const h = img.naturalHeight || size
  const scale = Math.min(size / w, size / h)
  ctx.drawImage(img, 0, 0, w * scale, h * scale)
  const { data } = ctx.getImageData(0, 0, size, size)

  const buckets = new Map()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 160) continue
    const rgb = [data[i], data[i + 1], data[i + 2]]
    const [, s, l] = rgbToHsl(rgb)
    if (s < 0.22 || l < 0.1 || l > 0.93) continue
    const key = (rgb[0] >> 4) * 256 + (rgb[1] >> 4) * 16 + (rgb[2] >> 4)
    const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, s: 0 }
    b.n += 1
    b.r += rgb[0]
    b.g += rgb[1]
    b.b += rgb[2]
    b.s += s
    buckets.set(key, b)
  }

  const ranked = [...buckets.values()]
    .map((b) => ({ rgb: [b.r / b.n, b.g / b.n, b.b / b.n], score: b.n * (0.35 + b.s / b.n) }))
    .sort((a, b) => b.score - a.score)

  // Keep colours that look different from the ones already chosen. Anti-aliased edges make many
  // paler copies of each colour, so the same hue counts as the same colour at any lightness.
  const sameColour = (a, b) => {
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 60) return true
    const [ha] = rgbToHsl(a)
    const [hb] = rgbToHsl(b)
    return Math.min(Math.abs(ha - hb), 1 - Math.abs(ha - hb)) < 0.04
  }
  const picked = []
  for (const c of ranked) {
    if (picked.every((p) => !sameColour(p, c.rgb))) {
      picked.push(c.rgb)
      if (picked.length >= max) break
    }
  }
  return picked.map(rgbToHex)
}

// ── Uploads ────────────────────────────────────────────────────────────────

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Could not read this file."))
    reader.readAsDataURL(file)
  })
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]

/**
 * An uploaded image as a small data: URL for saving in Settings. Photos and large PNGs are scaled
 * down to `maxSize` pixels (PNG keeps transparency); SVG and ICO files are kept as they are.
 */
export async function prepareBrandImage(file, maxSize = 512) {
  if (!file) return ""
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("Upload a PNG, JPG, WebP, SVG or ICO image.")
  if (file.size > 5 * 1024 * 1024) throw new Error("Image is too large (max 5 MB).")
  const original = await readAsDataUrl(file)
  if (file.type === "image/svg+xml" || file.type.includes("icon")) {
    if (original.length > 1_400_000) throw new Error("This file is too large (max about 1 MB).")
    return original
  }
  const img = await loadImage(original)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (w <= maxSize && h <= maxSize && original.length <= 400_000) return original
  const scale = Math.min(1, maxSize / Math.max(w, h))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/png")
}

// ── Applying it to the page ───────────────────────────────────────────────

/** Menu (sidebar) background and active-page colours for an accent, in light and dark mode. */
export function menuColours(accent) {
  return {
    light: shade(accent, 0.14),
    lightActive: shade(accent, 0.22),
    dark: shade(accent, 0.09),
    darkActive: shade(accent, 0.16),
  }
}

function applyAccent(accent) {
  let tag = document.getElementById(STYLE_ID)
  if (!accent || !hexToRgb(accent)) {
    tag?.remove()
    return
  }
  const fg = textOn(accent)
  const dark = withLightness(accent, (l) => Math.min(0.72, l + 0.07))
  const darkFg = textOn(dark)
  const tint = mix(accent, "#ffffff", 0.08)
  // The menu (sidebar) in a deep shade of the accent instead of Finstap's indigo, with the active
  // page a step lighter; white menu text stays readable at these lightnesses
  const menu = menuColours(accent)
  const css = `
:root[data-product="finstap"] {
  --primary: ${accent}; --primary-foreground: ${fg}; --ring: ${accent};
  --secondary: ${tint}; --accent: ${tint}; --chart-3: ${accent}; --viz-1: ${accent};
  --sidebar: ${menu.light}; --sidebar-accent: ${menu.lightActive};
  --sidebar-primary: ${accent}; --sidebar-primary-foreground: ${fg}; --sidebar-ring: ${accent};
}
:root[data-product="finstap"].dark {
  --primary: ${dark}; --primary-foreground: ${darkFg}; --ring: ${dark}; --chart-3: ${dark}; --viz-1: ${dark};
  --sidebar: ${menu.dark}; --sidebar-accent: ${menu.darkActive};
  --sidebar-primary: ${dark}; --sidebar-primary-foreground: ${darkFg}; --sidebar-ring: ${dark};
}`
  if (!tag) {
    tag = document.createElement("style")
    tag.id = STYLE_ID
    document.head.appendChild(tag)
  }
  tag.textContent = css
}

function applyIcon(icon) {
  document.querySelectorAll("link[rel~='icon']").forEach((link) => {
    if (!link.dataset.defaultHref) link.dataset.defaultHref = link.getAttribute("href") || ""
    link.setAttribute("href", icon || link.dataset.defaultHref)
    if (icon) link.removeAttribute("type")
  })
}

function setBranding(next, workspace = currentWorkspace()) {
  state = { ...EMPTY, ...next }
  applyAccent(state.accent)
  applyIcon(state.icon)
  try {
    if (workspace) localStorage.setItem(CACHE_PREFIX + workspace, JSON.stringify(state))
  } catch {
    // Storage full or blocked: it is loaded from the server again next time
  }
  emit()
}

/** Show a colour straight away (Settings preview) without saving it. */
export function previewAccent(accent) {
  if (IS_FINSTAP) applyAccent(accent || state.accent)
}

/** Load the company's branding: the remembered copy at once, then the saved settings from the server. */
export async function loadBranding() {
  if (!IS_FINSTAP || typeof window === "undefined") return
  const workspace = currentWorkspace()
  if (!workspace) {
    setBranding(EMPTY, "")
    return
  }
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_PREFIX + workspace) || "null")
    if (cached) setBranding(cached, workspace)
  } catch {
    // Ignore a broken cache entry
  }
  try {
    const res = await fetch(`${getApiBase()}/settings/public`, { headers: authHeaders() })
    if (!res.ok) return
    const json = await res.json()
    const d = json?.data || json || {}
    setBranding(
      {
        logo: d.brand_logo || "",
        logoDark: d.brand_logo_dark || "",
        icon: d.brand_icon || "",
        accent: d.accent_color || "",
      },
      workspace,
    )
  } catch {
    // Offline or server restarting: the remembered branding stays
  }
}

// The remembered branding goes on as soon as this file loads, before the first paint, so the app
// opens in the company's colours instead of flashing Finstap's violet first
if (IS_FINSTAP && typeof window !== "undefined") {
  try {
    const workspace = currentWorkspace()
    const cached = workspace && JSON.parse(localStorage.getItem(CACHE_PREFIX + workspace) || "null")
    if (cached) {
      state = { ...EMPTY, ...cached }
      applyAccent(state.accent)
      applyIcon(state.icon)
    }
  } catch {
    // No storage or a broken entry: loadBranding() fetches it from the server
  }
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The company's branding for components ({ logo, logoDark, icon, accent }; empty strings = Finstap's). */
export function useBranding() {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY)
}
