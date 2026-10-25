/**
 * Prices as people write them: whole pounds without ".00" (£49, £1,250), pence only when there
 * are some (£49.50). Every price on screen goes through here so the app shows them the same way.
 */

function toNumber(value) {
  if (typeof value === "number") return value
  const n = parseFloat(String(value ?? "").replace(/[^0-9.-]+/g, ""))
  return Number.isFinite(n) ? n : 0
}

/** "£49", "£49.50", "£1,250", "-£12.40" */
export function formatGBP(value) {
  const n = Math.round(toNumber(value) * 100) / 100
  const whole = Number.isInteger(n)
  const text = Math.abs(n).toLocaleString("en-GB", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
  return `${n < 0 ? "-" : ""}£${text}`
}

/** The same amount for an input box, without the £ or ".00": "49", "49.50". */
export function plainAmount(value) {
  const n = Math.round(toNumber(value) * 100) / 100
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

/** The same, in the given currency: "£49" for GBP, "Rs 12,500" for PKR. */
export function formatMoney(value, currency = "GBP") {
  if (currency !== "PKR") return formatGBP(value)
  return formatGBP(value).replace("£", "Rs ")
}
