"use client"

import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { NAV, SITE, TOP_LINKS } from "@/lib/site"

function Chevron({ open }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/** The dropdown under "Packages" (a short list) or "Services" (four columns: company, business, address, banking). */
function Dropdown({ entry }) {
  if (entry.groups) {
    return (
      <div className="grid w-[min(56rem,92vw)] grid-cols-2 gap-6 p-6 lg:grid-cols-4">
        {entry.groups.map((group) => (
          <div key={group.title}>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-teal">{group.title}</p>
            <ul className="mt-3 space-y-2">
              {group.items.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-slate-700 hover:text-brand-blue">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    )
  }
  return (
    <ul className="w-64 space-y-1 p-3">
      {entry.items.map(([label, href]) => (
        <li key={href}>
          <Link href={href} className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-brand-mist hover:text-brand-blue">
            {label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Top strip (about, FAQ, My Account), then the logo and the main menu; on phones the menu folds into a button. */
export default function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState(null)

  return (
    <header className="sticky top-0 z-40 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="hidden bg-brand-navy text-white md:block">
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-between px-6 text-xs">
          <a href={SITE.phoneHref} className="opacity-90 hover:opacity-100">
            Call {SITE.phone}
          </a>
          <nav className="flex items-center gap-5">
            {TOP_LINKS.map(([label, href]) => (
              <Link key={label} href={href} className="opacity-90 hover:opacity-100">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Brixen Consultants home">
          <Image src="/brand/brixen-logo.png" alt="Brixen Consultants" width={52} height={52} priority />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main menu">
          {NAV.map((entry) =>
            entry.items || entry.groups ? (
              <div key={entry.label} className="group relative">
                <Link
                  href={entry.href}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-[15px] font-semibold text-slate-800 hover:text-brand-blue"
                >
                  {entry.label} <Chevron />
                </Link>
                <div className="invisible absolute left-1/2 top-full -translate-x-1/2 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <div className="rounded-2xl bg-white shadow-[0_20px_50px_-20px_rgba(0,57,113,0.35)] ring-1 ring-slate-200">
                    <Dropdown entry={entry} />
                  </div>
                </div>
              </div>
            ) : (
              <Link
                key={entry.label}
                href={entry.href}
                className="rounded-lg px-3 py-2 text-[15px] font-semibold text-slate-800 hover:text-brand-blue"
              >
                {entry.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/packages/"
            className="hidden rounded-full bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy sm:inline-flex"
          >
            View Packages
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="flex size-10 items-center justify-center rounded-lg text-slate-800 hover:bg-brand-mist lg:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
              {mobileOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="max-h-[75vh] overflow-y-auto border-t border-slate-100 px-4 pb-6 lg:hidden" aria-label="Mobile menu">
          {NAV.map((entry) => {
            const children = entry.groups ? entry.groups.flatMap((g) => g.items) : entry.items
            if (!children) {
              return (
                <Link key={entry.label} href={entry.href} onClick={() => setMobileOpen(false)} className="block border-b border-slate-100 py-3 font-semibold text-slate-800">
                  {entry.label}
                </Link>
              )
            }
            const open = openGroup === entry.label
            return (
              <div key={entry.label} className="border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : entry.label)}
                  className="flex w-full items-center justify-between py-3 font-semibold text-slate-800"
                  aria-expanded={open}
                >
                  {entry.label} <Chevron open={open} />
                </button>
                {open && (
                  <ul className="pb-3 pl-3">
                    {children.map(([label, href]) => (
                      <li key={href}>
                        <Link href={href} onClick={() => setMobileOpen(false)} className="block py-2 text-sm text-slate-600">
                          {label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href={`${SITE.portalUrl}/`} className="rounded-full border border-slate-200 py-2.5 text-center text-sm font-semibold text-slate-800">
              My Account
            </Link>
            <Link href="/packages/" onClick={() => setMobileOpen(false)} className="rounded-full bg-brand-blue py-2.5 text-center text-sm font-semibold text-white">
              View Packages
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}
