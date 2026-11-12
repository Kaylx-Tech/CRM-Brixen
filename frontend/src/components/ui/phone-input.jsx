import * as React from "react"
import { getCountries, getCountryCallingCode } from "libphonenumber-js/min"
import metadata from "libphonenumber-js/min/metadata"
import { cn } from "cn"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select"

// Every country with its calling code, named in English, A–Z
const NAMES = typeof Intl !== "undefined" && Intl.DisplayNames ? new Intl.DisplayNames(["en"], { type: "region" }) : null
const COUNTRIES = getCountries()
  .map((iso) => ({ iso, code: getCountryCallingCode(iso), name: NAMES?.of(iso) || iso }))
  .sort((a, b) => a.name.localeCompare(b.name))
const BY_ISO = Object.fromEntries(COUNTRIES.map((c) => [c.iso, c]))
// Shown first in the list: the countries Brixen and Finstap customers use most
const TOP = ["GB", "PK"]
const REST = COUNTRIES.filter((c) => !TOP.includes(c.iso))
// The main country for each calling code (+44: United Kingdom, +1: United States, +92: Pakistan)
const MAIN = Object.fromEntries(Object.entries(metadata.country_calling_codes).map(([code, list]) => [code, list[0]]))

const flag = (iso) => iso.replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)))

/** "+92 300 1234567" → { code: "92", rest: "300 1234567" }; the longest calling code that exists wins. */
function splitNumber(value) {
  const text = String(value || "").trim()
  if (!text.startsWith("+")) return { code: "", rest: text }
  const digits = text.slice(1).replace(/[^\d]/g, "")
  for (const len of [3, 2, 1]) {
    const code = digits.slice(0, len)
    if (code.length === len && MAIN[code]) {
      // Drop the code (and the space after it) from the typed text, keeping the rest as typed
      let seen = 0
      let i = 1
      while (i < text.length && seen < len) {
        if (/\d/.test(text[i])) seen += 1
        i += 1
      }
      return { code, rest: text.slice(i).trim() }
    }
  }
  return { code: "", rest: text.slice(1) }
}

/** One row of the country list: flag, name and calling code; typing a letter jumps to the name. */
function CountryItem({ country }) {
  return (
    <SelectItem value={country.iso} label={country.name}>
      <span className="text-base leading-none">{flag(country.iso)}</span>
      <span className="truncate">{country.name}</span>
      <span className="ml-auto pl-2 tabular-nums text-muted-foreground">+{country.code}</span>
    </SelectItem>
  )
}

/**
 * A phone field with the country in front: a Select (flag and calling code) joined to the number box. Typing or
 * pasting "+92…" picks Pakistan by itself; picking a country puts its code in front. The value stays one string like
 * "+92 300 1234567", and onChange gets { target: { value, name } }, so it drops in where an <Input> was.
 */
function PhoneInput({ value, onChange, defaultCountry = "GB", className, name, id, placeholder, ...props }) {
  const { code, rest } = splitNumber(value)
  const [chosen, setChosen] = React.useState(() => (code ? MAIN[code] : defaultCountry))
  // Keep the chosen country while its code matches (+44 United Kingdom vs Jersey); otherwise follow the code
  const country = code && BY_ISO[chosen]?.code !== code ? MAIN[code] : chosen
  const current = BY_ISO[country] || BY_ISO[defaultCountry] || COUNTRIES[0]

  const emit = (next) => onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } })

  const typeNumber = (e) => {
    const typed = e.target.value
    if (typed.trim().startsWith("+")) {
      // A full number with its code: the country follows it
      const found = splitNumber(typed)
      if (found.code) setChosen(MAIN[found.code])
      emit(typed.trim())
      return
    }
    emit(typed.trim() ? `+${current.code} ${typed.replace(/^\s+/, "")}` : "")
  }

  const pickCountry = (iso) => {
    const next = BY_ISO[iso]
    if (!next) return
    setChosen(next.iso)
    emit(rest ? `+${next.code} ${rest}` : "")
  }

  return (
    <div className={cn("flex w-full", className)}>
      <Select value={current.iso} onValueChange={pickCountry} disabled={props.disabled}>
        <SelectTrigger
          aria-label={`Country code: ${current.name} (+${current.code})`}
          aria-invalid={props["aria-invalid"]}
          className="h-auto shrink-0 self-stretch rounded-r-none border-r-0 pl-3 tabular-nums focus-visible:z-10"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-base leading-none">{flag(current.iso)}</span>
            <span>+{current.code}</span>
          </span>
        </SelectTrigger>
        <SelectContent align="start" className="max-h-80 w-72">
          <SelectGroup>
            <SelectLabel>Most used</SelectLabel>
            {TOP.map((iso) => (
              <CountryItem key={`top-${iso}`} country={BY_ISO[iso]} />
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>All countries</SelectLabel>
            {REST.map((c) => (
              <CountryItem key={c.iso} country={c} />
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Input
        {...props}
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete={props.autoComplete || "tel"}
        value={rest}
        onChange={typeNumber}
        placeholder={placeholder ? String(placeholder).replace(/^\+\d+\s*/, "") : "Phone number"}
        className="min-w-0 flex-1 rounded-l-none"
      />
    </div>
  )
}

export { PhoneInput }
