"use client"

import { useSyncExternalStore } from "react"
import { PackageCards } from "@/components/sections"

// The page itself stays static (fast, cached); the name from the address is read in the browser
const subscribe = () => () => {}
const readName = () => (new URLSearchParams(window.location.search).get("name") || "").trim().slice(0, 160)

/** The package cards on /packages/: shows the company name from the hero search and passes it on to the next step. */
export default function PackagesWithName() {
  const name = useSyncExternalStore(subscribe, readName, () => "")
  return (
    <>
      {name && (
        <p className="mb-10 text-center text-brand-slate">
          Company name: <b className="text-brand-navy">{name}</b>. Pick a package and we&apos;ll check this name for you.
        </p>
      )}
      <PackageCards name={name} />
    </>
  )
}
