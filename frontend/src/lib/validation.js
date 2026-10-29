/**
 * Shared form validation. Same rules as backend/utils/validation.py, so a form shows the error
 * next to the field before saving and the server answers 400 { fields: { name: message } } the same way.
 *
 *   const errors = validateFields(form, {
 *     full_name: { label: "Full name", required: true },
 *     email: { label: "Email", required: true, type: "email" },
 *     phone: { label: "Phone", type: "phone" },
 *   })
 */
import { useCallback, useState } from "react"
import { isValid, parse } from "date-fns"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const UK_POSTCODE_RE = /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/
const COMPANY_NUMBER_RE = /^(\d{8}|[A-Z]{2}\d{6}|R\d{7})$/
const PERSONAL_CODE_RE = /^[A-Z0-9]{11}$/
const URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i

const blank = (v) => v === undefined || v === null || (typeof v === "string" ? !v.trim() : Array.isArray(v) ? !v.length : false)

/** "07700 900123" → "07700900123"; "+44 (0)7700…" → "+447700…" */
export function cleanPhone(value) {
  return String(value || "").replace(/\(0\)/g, "").replace(/[\s\-().]/g, "")
}

/** "sw1a1aa" → "SW1A 1AA" */
export function formatPostcode(value) {
  const compact = String(value || "").toUpperCase().replace(/\s+/g, "")
  return compact.length > 3 ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : compact
}

/** "123456" → "00123456", "sc12345" → "SC012345" (Companies House keeps leading zeros) */
export function formatCompanyNumber(value) {
  const compact = String(value || "").toUpperCase().replace(/\s+/g, "")
  const m = compact.match(/^([A-Z]{2})?(\d{1,8})$/)
  if (!m) return compact
  return m[1] ? m[1] + m[2].padStart(6, "0") : m[2].padStart(8, "0")
}

export function cleanPersonalCode(value) {
  return String(value || "").toUpperCase().replace(/[\s-]/g, "")
}

/** "DD/MM/YYYY" or "YYYY-MM-DD" as a Date, or null */
export function parseDate(value) {
  if (value instanceof Date) return isValid(value) ? value : null
  const text = String(value || "").trim()
  if (!text) return null
  const date = /^\d{4}-\d{2}-\d{2}/.test(text)
    ? parse(text.slice(0, 10), "yyyy-MM-dd", new Date())
    : /^\d{2}\/\d{2}\/\d{4}$/.test(text)
      ? parse(text, "dd/MM/yyyy", new Date())
      : null
  return date && isValid(date) && date.getFullYear() >= 1900 && date.getFullYear() <= 2200 ? date : null
}

/** One value against one rule: returns the error message or "" */
export function checkField(value, rule = {}, values = {}) {
  const label = rule.label || "This field"
  const required = typeof rule.required === "function" ? rule.required(values) : rule.required
  if (rule.when && !rule.when(values)) return ""
  if (blank(value)) {
    if (!required) return ""
    return rule.type === "checkbox" ? `${label} must be ticked.` : `${label} is required.`
  }
  if (rule.type === "checkbox") return required && value !== true ? `${label} must be ticked.` : ""

  const text = typeof value === "string" ? value.trim() : value
  switch (rule.type) {
    case "email":
      if (!EMAIL_RE.test(text)) return `Enter a valid email address, like name@example.com.`
      break
    case "emails": {
      const bad = String(text).split(/[,;\s]+/).filter(Boolean).find((e) => !EMAIL_RE.test(e))
      if (bad) return `"${bad}" is not a valid email address.`
      break
    }
    case "phone": {
      const p = cleanPhone(text)
      // UK 07700 900123, +44 7700 900123, or international digits without + (447700900123)
      const ok = p.startsWith("+") ? /^\+[1-9]\d{6,14}$/.test(p) : p.startsWith("0") ? /^0\d{9,10}$/.test(p) : /^[1-9]\d{9,14}$/.test(p)
      if (!ok) return `Enter a valid phone number, like 07700 900123 or +44 7700 900123.`
      break
    }
    case "postcode":
      if (!UK_POSTCODE_RE.test(formatPostcode(text))) return `Enter a valid UK postcode, like SW1A 1AA.`
      break
    case "company_number":
      if (!COMPANY_NUMBER_RE.test(formatCompanyNumber(text))) return `Company number must be 8 characters, like 01234567 or SC123456.`
      break
    case "personal_code":
      if (!PERSONAL_CODE_RE.test(cleanPersonalCode(text))) return `Personal code must be 11 letters and numbers.`
      break
    case "date": {
      const d = parseDate(text)
      if (!d) return `Enter a valid date as DD/MM/YYYY.`
      if (rule.past && d > new Date()) return `${label} cannot be in the future.`
      break
    }
    case "amount": {
      const s = String(text).replace(/[£,\s]/g, "")
      if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return `Enter an amount like 120 or 120.50.`
      const n = Number(s)
      const min = rule.min ?? 0
      if (n < min) return min === 0 ? `${label} cannot be negative.` : `${label} must be at least ${min}.`
      if (rule.max !== undefined && n > rule.max) return `${label} cannot be more than ${rule.max}.`
      break
    }
    case "integer": {
      if (!/^-?\d+$/.test(String(text))) return `${label} must be a whole number.`
      const n = Number(text)
      if (rule.min !== undefined && n < rule.min) return `${label} must be at least ${rule.min}.`
      if (rule.max !== undefined && n > rule.max) return `${label} cannot be more than ${rule.max}.`
      break
    }
    case "url":
      if (!URL_RE.test(text)) return `Enter a full web address starting with https://.`
      break
    default:
      break
  }
  if (typeof text === "string") {
    if (rule.minLength && text.length < rule.minLength) return `${label} must be at least ${rule.minLength} characters.`
    if (rule.maxLength && text.length > rule.maxLength) return `${label} must be ${rule.maxLength} characters or fewer.`
  }
  if (rule.match && text !== values[rule.match]) return rule.matchMessage || `${label} does not match.`
  if (rule.validate) return rule.validate(value, values) || ""
  return ""
}

/** Every rule in the schema: returns { field: message } with only the failing fields */
export function validateFields(values, schema) {
  const errors = {}
  for (const [key, rule] of Object.entries(schema)) {
    const msg = checkField(values?.[key], rule, values || {})
    if (msg) errors[key] = msg
  }
  return errors
}

/** Scroll to and focus the first field with an error (inputs need id or name = field key) */
export function focusFirstError(errors, prefix = "") {
  const key = Object.keys(errors || {})[0]
  if (!key || typeof document === "undefined") return
  const el = document.getElementById(prefix + key) || document.querySelector(`[name="${prefix + key}"]`)
  if (el) {
    el.scrollIntoView?.({ block: "center", behavior: "smooth" })
    el.focus?.({ preventScroll: true })
  }
}

/**
 * Errors for one form. `check(values)` validates against the schema and returns true when clean;
 * `fromResponse(res)` shows a server 400 { fields } next to the fields too.
 */
export function useFormErrors(schema, { prefix = "" } = {}) {
  const [errors, setErrors] = useState({})

  /** `only`: check just these fields (one step of a multi-step form) */
  const check = useCallback(
    (values, extraSchema, only) => {
      let rules = extraSchema ? { ...schema, ...extraSchema } : schema
      if (only) rules = Object.fromEntries(Object.entries(rules).filter(([k]) => only.includes(k)))
      const next = validateFields(values, rules)
      setErrors(next)
      if (Object.keys(next).length) focusFirstError(next, prefix)
      return !Object.keys(next).length
    },
    [schema, prefix],
  )

  /** Re-check one field after it changes, only once it already shows an error */
  const recheck = useCallback(
    (key, value, values = {}) => {
      setErrors((prev) => {
        if (!prev[key]) return prev
        const msg = checkField(value, schema?.[key], { ...values, [key]: value })
        const next = { ...prev }
        if (msg) next[key] = msg
        else delete next[key]
        return next
      })
    },
    [schema],
  )

  const fromResponse = useCallback(
    (res) => {
      const fields = res?.fieldErrors || res?.data?.fields
      if (fields && typeof fields === "object" && Object.keys(fields).length) {
        setErrors(fields)
        focusFirstError(fields, prefix)
        return true
      }
      return false
    },
    [prefix],
  )

  const clear = useCallback(() => setErrors({}), [])

  return { errors, setErrors, check, recheck, fromResponse, clear }
}

/**
 * Format rule for a free-text question in a service's order form, read from its label
 * ("Email address", "Mobile number", "Postcode", "Company number", "Personal code", "Website"…).
 */
export function ruleFromLabel(label) {
  const l = String(label || "").toLowerCase()
  if (/e-?mail/.test(l)) return { type: "email" }
  if (/\b(phone|mobile|telephone|tel\.?|whatsapp|contact number)\b/.test(l)) return { type: "phone" }
  if (/post ?code/.test(l)) return { type: "postcode" }
  if (/personal code|identity code|verification code \(11/.test(l)) return { type: "personal_code" }
  if (/\b(company|registration|crn) (registration )?(number|no\.?)\b|\bcrn\b/.test(l)) return { type: "company_number" }
  if (/\b(website|web address|url)\b/.test(l)) return { type: "url" }
  if (/\butr\b/.test(l)) return { validate: (v) => (/^\d{10}$/.test(String(v).replace(/\s/g, "")) ? "" : "UTR must be 10 digits.") }
  return null
}
