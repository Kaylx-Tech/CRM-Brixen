import Link from "next/link"
import { NAV } from "@/lib/site"

export const metadata = {
  title: { absolute: "Brixen Consultants | UK Company Formation & Business Services" },
  alternates: { canonical: "/" },
}

const services = NAV.find((n) => n.label === "Services").groups

/** Home page skeleton: the real home page (hero, packages, reviews, banks…) is built next, section by section. */
export default function Home() {
  return (
    <>
      <section className="bg-linear-to-b from-brand-mist to-white">
        <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-teal">Brixen Consultants</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-extrabold leading-tight text-brand-navy sm:text-6xl">
            Set Up a Limited Company in the UK
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-brand-slate">
            Company formation, registered office address, business bank accounts and company compliance, handled for you.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/packages/" className="rounded-full bg-brand-blue px-7 py-3.5 font-semibold text-white shadow-sm hover:bg-brand-navy">
              View Packages
            </Link>
            <Link href="/contact/" className="rounded-full border border-slate-200 bg-white px-7 py-3.5 font-semibold text-brand-navy hover:border-brand-blue">
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold text-brand-navy">Our Services</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((group) => (
            <div key={group.title} className="rounded-2xl bg-white p-6 shadow-[0_10px_30px_-18px_rgba(0,57,113,0.35)] ring-1 ring-slate-100">
              <h3 className="text-lg font-bold text-brand-navy">{group.title}</h3>
              <ul className="mt-4 space-y-2 text-sm">
                {group.items.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-brand-slate hover:text-brand-blue">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
