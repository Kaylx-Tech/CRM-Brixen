"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

/** "Search" a company name in the hero: opens the name search step of the formation packages with the name filled in
 *  (the live Companies House check comes with the order forms). */
export default function NameSearch() {
  const router = useRouter()
  const [name, setName] = useState("")
  const submit = (e) => {
    e.preventDefault()
    const value = name.trim()
    router.push(value ? `/packages/?name=${encodeURIComponent(value)}` : "/packages/")
  }
  return (
    <form onSubmit={submit} className="mt-8 flex w-full max-w-xl gap-2 rounded-full bg-white p-1.5 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)]">
      <label htmlFor="company-name" className="sr-only">
        Company name
      </label>
      <input
        id="company-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter your company name"
        className="min-w-0 flex-1 rounded-full px-5 text-slate-800 outline-none placeholder:text-slate-400"
        autoComplete="organization"
      />
      <button type="submit" className="shrink-0 rounded-full bg-brand-blue px-6 py-3 font-semibold text-white transition hover:bg-brand-navy">
        Search
      </button>
    </form>
  )
}
