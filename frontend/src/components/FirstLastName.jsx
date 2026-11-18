import { useState } from "react"
import { Input } from "@/components/ui/input"

/**
 * A person's name asked as First Name + Last Name, saved as one "First Last" text (so every older order, email and
 * export keeps working). An existing name opens with its last word as the last name.
 */
function split(value) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean)
  return words.length > 1 ? { first: words.slice(0, -1).join(" "), last: words[words.length - 1] } : { first: words[0] || "", last: "" }
}

export default function FirstLastName({ id, value, onChange, disabled, invalid, describedBy }) {
  const [parts, setParts] = useState(() => split(value))
  // A name filled in from outside (e.g. "Same Details as the Customer") opens in the two boxes
  const [seen, setSeen] = useState(value || "")
  if ((value || "") !== seen) {
    setSeen(value || "")
    setParts(split(value))
  }
  const set = (key, text) => {
    const next = { ...parts, [key]: text }
    const joined = [next.first.trim(), next.last.trim()].filter(Boolean).join(" ")
    setParts(next)
    setSeen(joined)
    onChange(joined)
  }
  const aria = invalid ? { "aria-invalid": true, "aria-describedby": describedBy } : {}
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Input
        id={id}
        className="text-sm"
        placeholder="First Name"
        aria-label="First Name"
        autoComplete="given-name"
        value={parts.first}
        onChange={(e) => set("first", e.target.value)}
        disabled={disabled}
        {...aria}
      />
      <Input
        id={id ? `${id}-last` : undefined}
        className="text-sm"
        placeholder="Last Name"
        aria-label="Last Name"
        autoComplete="family-name"
        value={parts.last}
        onChange={(e) => set("last", e.target.value)}
        disabled={disabled}
        {...aria}
      />
    </div>
  )
}
