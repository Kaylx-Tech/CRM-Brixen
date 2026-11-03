import * as React from "react"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import SIC_CODES from "@/lib/sic-codes.json"

// Companies House's SIC codes (resources.companieshouse.gov.uk/sic), as "47910 - Retail sale via mail order…"
const LIST = SIC_CODES.map(([code, text]) => ({ code, text, label: `${code} - ${text}`, search: `${code} ${text}`.toLowerCase() }))

function matches(query) {
  const q = String(query || "").trim().toLowerCase()
  if (!q) return LIST.slice(0, 8)
  const words = q.split(/[\s,-]+/).filter(Boolean)
  // Codes that start with what was typed first, then descriptions with every word
  const byCode = LIST.filter((s) => s.code.startsWith(q.replace(/\D/g, "") || "x"))
  const byWords = LIST.filter((s) => !byCode.includes(s) && words.every((w) => s.search.includes(w)))
  return [...byCode, ...byWords].slice(0, 8)
}

/**
 * Nature of business: type a SIC code or words ("retail", "47910") and pick from Companies House's list.
 * The value is one string like "47910 - Retail sale via mail order houses or via Internet"; anything typed
 * that is not picked is kept as it is. onChange gets { target: { value } }, like an <Input>.
 */
function SicInput({ value, onChange, className, id, placeholder, ...props }) {
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const results = React.useMemo(() => matches(value), [value])
  const listId = `${id || "sic"}-list`

  const emit = (next) => onChange?.({ target: { value: next }, currentTarget: { value: next } })
  const pick = (s) => {
    emit(s.label)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) setOpen(true)
    if (!results.length) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === "Enter" && open) {
      e.preventDefault()
      pick(results[active] || results[0])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className={cn("relative w-full", className)}>
      <Input
        {...props}
        id={id}
        value={value || ""}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        placeholder={placeholder || "Type a SIC code or business activity, e.g. 47910 or retail"}
        onChange={(e) => {
          emit(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
        >
          {results.map((s, i) => (
            <li
              key={s.code}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer gap-2 rounded-lg px-2.5 py-1.5", i === active && "bg-muted")}
            >
              <span className="shrink-0 font-mono text-xs leading-5 text-primary">{s.code}</span>
              <span className="leading-5">{s.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export { SicInput }
