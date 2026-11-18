"use client"

import { useState } from "react"

function split(value) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean)
  return words.length > 1 ? { first: words.slice(0, -1).join(" "), last: words[words.length - 1] } : { first: words[0] || "", last: "" }
}

/** A person's name as First Name + Last Name, sent to the CRM as one "First Last" (as before). */
export default function NameInput({ value, onChange, required, className }) {
  const [parts, setParts] = useState(() => split(value))
  // A name filled in from saved details opens in the two boxes
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
  return (
    <span className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <input className={className} value={parts.first} onChange={(e) => set("first", e.target.value)} required={required}
        maxLength={100} autoComplete="given-name" placeholder="First Name" aria-label="First Name" />
      <input className={className} value={parts.last} onChange={(e) => set("last", e.target.value)} required={required}
        maxLength={100} autoComplete="family-name" placeholder="Last Name" aria-label="Last Name" />
    </span>
  )
}
