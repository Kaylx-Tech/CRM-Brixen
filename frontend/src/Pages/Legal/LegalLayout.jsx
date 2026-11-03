import { useEffect } from "react"
import { Link, NavLink } from "react-router-dom"
import { cn } from "cn"
import finstapLogo from "@/assets/finstap-logo.svg"

export const CONTACT_EMAIL = "contact@finstap.com"
export const LAST_UPDATED = "27 October 2026"

export const LEGAL_PAGES = [
  ["Privacy Policy", "/privacy"],
  ["Terms of Service", "/terms"],
  ["Security & Compliance", "/security"],
]

/** The three legal page links, for footers (signup, login, landing page). */
export function LegalLinks({ className, linkClassName }) {
  return (
    <nav className={cn("flex flex-wrap justify-center gap-x-4 gap-y-1", className)}>
      {LEGAL_PAGES.map(([label, to]) => (
        <Link key={to} to={to} className={cn("hover:text-[#1A69F8] hover:underline underline-offset-4", linkClassName)}>
          {label}
        </Link>
      ))}
    </nav>
  )
}

export function Mail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[#1A69F8] underline-offset-4 hover:underline">
      {CONTACT_EMAIL}
    </a>
  )
}

/**
 * One section's body: strings are paragraphs, { list: [...] } is a bullet list, { rows: [[a, b], ...],
 * head: [a, b] } is a two-or-more column table and React elements are shown as they are.
 */
function Body({ items }) {
  return items.map((item, i) => {
    if (typeof item === "string") return <p key={i}>{item}</p>
    if (item?.list) {
      return (
        <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-[#1A69F8]">
          {item.list.map((li, j) => <li key={j}>{li}</li>)}
        </ul>
      )
    }
    if (item?.rows) {
      return (
        <div key={i} className="overflow-x-auto rounded-xl border border-[#e8e8ed]">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-[#fbfbfd] text-[#424245]">
              <tr>{item.head.map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {item.rows.map((row, r) => (
                <tr key={r} className="border-t border-[#e8e8ed] align-top">
                  {row.map((cell, c) => (
                    <td key={c} className={cn("px-4 py-2.5", c === 0 && "font-medium text-[#1d1d1f]")}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    return <div key={i}>{item}</div>
  })
}

/**
 * A Finstap legal page: header with the three pages, title, contents list (desktop) and the numbered
 * sections. Always light, like the landing page. sections = [{ id, title, body: [...] }].
 */
export default function LegalLayout({ title, intro, sections }) {
  useEffect(() => {
    const before = document.title
    document.title = `${title} · Finstap`
    // A link to a section (/terms#data-processing) opens at that section, otherwise at the top
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1))
    if (target) target.scrollIntoView()
    else window.scrollTo(0, 0)
    return () => {
      document.title = before
    }
  }, [title])

  return (
    <div className="min-h-screen bg-white text-[#424245] [color-scheme:light]">
      <header className="sticky top-0 z-30 border-b border-[#e8e8ed]/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center">
            <img src={finstapLogo} alt="Finstap" className="h-8 w-auto" />
          </Link>
          <nav className="flex gap-1 overflow-x-auto text-sm">
            {LEGAL_PAGES.map(([label, to]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition",
                    isActive ? "bg-[#1A69F8]/10 text-[#1A69F8]" : "text-[#6e6e73] hover:text-[#1A69F8]",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <div className="bg-[#f5f5f7]">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16">
          <p className="text-sm font-semibold text-[#1A69F8]">Last updated {LAST_UPDATED}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#1d1d1f] sm:text-4xl">{title}</h1>
          {intro && <p className="mt-4 max-w-3xl text-base leading-7 text-[#6e6e73]">{intro}</p>}
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-20 sm:px-6 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1 border-l border-[#e8e8ed] text-sm">
            {sections.map((s, i) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="-ml-px block border-l border-transparent py-1 pl-4 text-[#86868b] hover:border-[#1A69F8] hover:text-[#1A69F8]"
              >
                {i + 1}. {s.title}
              </a>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 max-w-3xl">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-b border-[#f5f5f7] py-8 first:pt-0 last:border-0">
              <h2 className="text-xl font-semibold tracking-tight text-[#1d1d1f]">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-4 space-y-4 text-[15px] leading-7">
                <Body items={s.body} />
              </div>
            </section>
          ))}
        </main>
      </div>

      <footer className="border-t border-[#e8e8ed]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-[#86868b] sm:flex-row sm:px-6">
          <p>© 2026 Finstap. All rights reserved.</p>
          <LegalLinks />
          <Mail />
        </div>
      </footer>
    </div>
  )
}
