"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useSyncExternalStore } from "react"
import NameCheckResult from "@/components/order/NameCheckResult"
import { useNameCheck } from "@/lib/name-check"

// The name typed in the hero or on /packages/ arrives in the address (?name=); it is read in the browser so the page
// itself stays static
const subscribe = () => () => {}
const nameFromAddress = () => (new URLSearchParams(window.location.search).get("name") || "").trim().slice(0, 160)

/** Step 2 of an order: is this company name free at Companies House? Checked live while the visitor types. */
export default function CompanyNameCheck({ pkg }) {
  const initial = useSyncExternalStore(subscribe, nameFromAddress, () => "")
  // A new name in the address starts the box afresh with that name
  return <NameCheckBox key={initial} pkg={pkg} initial={initial} />
}

function NameCheckBox({ pkg, initial }) {
  const router = useRouter()
  const [name, setName] = useState(initial)
  const { state, checkNow } = useNameCheck(name)
  // A name brought from the home page search is checked once on arrival (the visitor already pressed Search)
  useEffect(() => {
    if (initial.trim()) checkNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = (e) => {
    e.preventDefault()
    checkNow()
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
          className="shrink-0 rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-7 font-semibold text-white transition hover:brightness-110"
        >
          Search
        </button>
      </form>

      <NameCheckResult state={state} />

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
