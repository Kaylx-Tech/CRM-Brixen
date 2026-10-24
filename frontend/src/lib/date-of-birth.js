import { isValid, parse } from "date-fns"

export const DOB_FORMAT = "dd/MM/yyyy"

/** "DD/MM/YYYY" (or an older "YYYY-MM-DD" answer) as a Date, or null. */
export function parseDob(value) {
  const text = String(value || "").trim()
  if (!text) return null
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? parse(text, "yyyy-MM-dd", new Date())
    : parse(text, DOB_FORMAT, new Date())
  return isValid(date) && date.getFullYear() >= 1900 ? date : null
}

/** Digits typed in any way become DD/MM/YYYY as you go: "01021990" → "01/02/1990". */
export function maskDob(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/** A form question that asks for a date of birth ("Date of birth", "Director's DOB", "Birth date" …). */
export function isDateOfBirthLabel(label) {
  return /\b(date of birth|birth ?date|d\.?o\.?b\.?|born)\b/i.test(String(label || ""))
}
