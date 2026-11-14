"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { SITE } from "@/lib/site"

// The name typed in the hero or on /packages/ arrives in the address (?name=); it is read in the browser so the page
// itself stays static
const subscribe = () => () => {}
const nameFromAddress = () => (new URLSearchParams(window.location.search).get("name") || "").trim().slice(0, 160)

/** Step 2 of an order: is this company name free at Companies House? (CRM: GET /api/public/name-availability) */
export default function CompanyNameCheck({ pkg }) {
  const initial = useSyncExternalStore(subscribe, nameFromAddress, () => "")
  // A new name in the address starts the box afresh with that name
  return <NameCheckBox key={initial} pkg={pkg} initial={initial} />
}

function NameCheckBox({ pkg, initial }) {
  const router = useRouter()
  const [name, setName] = useState(initial)
  const [state, setState] = useState({ status: "idle" })
  const request = useRef(0)

  async function check(value) {
    const wanted = value.trim()
    if (wanted.length < 3) {
      setState({ status: "error", message: "Please enter a company name (at least 3 characters)." })
      return
    }
    const id = ++request.current
    setState({ status: "checking", name: wanted })
    try {
      const res = await fetch(`${SITE.apiUrl}/public/name-availability?name=${encodeURIComponent(wanted)}`)
      const data = await res.json().catch(() => ({}))
      if (id !== request.current) return // an older answer arriving late
      if (!res.ok || data.status !== "success") {
        setState({ status: "error", message: data.message || "We could not check this name. Please try again." })
        return
      }
      setState({ status: data.available ? "available" : "taken", name: data.name, warnings: data.warnings || [], similar: data.similar || [] })
    } catch {
      if (id === request.current) setState({ status: "error", message: "Network error. Please check your connection and try again." })
    }
  }

  // Came here with a name already: check it straight away
  const checkedInitial = useRef(false)
  useEffect(() => {
    if (initial && !checkedInitial.current) {
      checkedInitial.current = true
      check(initial)
    }
  }, [initial])

  const submit = (e) => {
    e.preventDefault()
    check(name)
  }

  const goOn = () => router.push(`${pkg.next}?name=${encodeURIComponent(state.name)}`)

  return (
    <div className="mx-auto mt-10 w-full max-w-[800px] text-left">
      <form onSubmit={submit} className="flex gap-3">
        <label htmlFor="name-check" className="sr-only">
          Company name
        </label>
        <input
          id="name-check"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter company name"
          maxLength={160}
          autoComplete="organization"
          className="h-[55px] min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-4 text-base text-slate-800 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-brand-blue"
        />
        <button
          type="submit"
          disabled={state.status === "checking"}
          className="shrink-0 rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-7 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          Search
        </button>
      </form>

      <div className="mt-5 text-lg font-semibold text-white" aria-live="polite">
        {state.status === "checking" && <p>⏳ Checking availability...</p>}
        {state.status === "error" && <p className="text-red-400">⚠️ {state.message}</p>}
        {(state.status === "available" || state.status === "taken") && (
          <div>
            <p className="break-words">{state.name}</p>
            {state.status === "available" ? (
              <p className="text-green-400">✅ This company name is available!</p>
            ) : (
              <p className="text-red-400">❌ This company name is not available. Please try a different name.</p>
            )}
            {state.status === "available" &&
              state.warnings.map((w) => (
                <p key={w} className="mt-1 text-sm font-normal text-amber-300">
                  Note: {w}
                </p>
              ))}
            {state.status === "taken" && state.similar.length > 0 && (
              <p className="mt-2 text-sm font-normal text-white/70">Similar names already registered: {state.similar.join(", ")}</p>
            )}
          </div>
        )}
      </div>

      {state.status === "available" && (
        <button
          type="button"
          onClick={goOn}
          className="mt-4 rounded-md bg-[#2b8a2b] px-7 py-3.5 font-semibold text-white transition hover:brightness-110"
        >
          {pkg.button}
        </button>
      )}
    </div>
  )
}
