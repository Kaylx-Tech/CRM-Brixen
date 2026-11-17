"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import NameCheckResult from "@/components/order/NameCheckResult"
import { useNameCheck } from "@/lib/name-check"

/** Company name search in the hero: checked live at Companies House while the visitor types. "Search" (or "Choose a
 *  Package" once the name is free) opens the packages page with the name, which each package carries on. */
export default function NameSearch() {
  const router = useRouter()
  const [name, setName] = useState("")
  const { state } = useNameCheck(name)
  const goOn = () => {
    const value = name.trim()
    router.push(value ? `/packages/?name=${encodeURIComponent(value)}` : "/packages/")
  }
  const submit = (e) => {
    e.preventDefault()
    goOn()
  }
  return (
    <div className="mt-8 w-full max-w-[650px]">
      <form onSubmit={submit} className="flex gap-3">
        <label htmlFor="company-name" className="sr-only">
          Company name
        </label>
        <input
          id="company-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter company name"
          maxLength={160}
          className="min-w-0 flex-1 rounded-md border border-white/80 bg-white px-4 py-3.5 text-slate-800 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-brand-blue"
          autoComplete="organization"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-7 font-semibold text-white transition hover:brightness-110"
        >
          Search
        </button>
      </form>
      {state.status !== "idle" && <NameCheckResult state={state} />}
      {state.status === "available" && (
        <button
          type="button"
          onClick={goOn}
          className="mt-4 rounded-md bg-[#2b8a2b] px-7 py-3.5 font-semibold text-white transition hover:brightness-110"
        >
          Choose a Package
        </button>
      )}
    </div>
  )
}
