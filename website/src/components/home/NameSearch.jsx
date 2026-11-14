"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

/** "Search" a company name in the hero: opens the packages page with the name, which each package then carries into
 *  its name search step (the live Companies House check comes with the order forms). */
export default function NameSearch() {
  const router = useRouter()
  const [name, setName] = useState("")
  const submit = (e) => {
    e.preventDefault()
    const value = name.trim()
    router.push(value ? `/packages/?name=${encodeURIComponent(value)}` : "/packages/")
  }
  return (
    <form onSubmit={submit} className="mt-8 flex w-full max-w-[650px] gap-3">
      <label htmlFor="company-name" className="sr-only">
        Company name
      </label>
      <input
        id="company-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter company name"
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
  )
}
