import Link from "next/link"
import { PageHero } from "@/components/PageParts"
import { FaqConsult, Reviews, Trust } from "@/components/sections"
import { SERVICE_CONTENT } from "@/lib/service-content"
import { GROUP_TITLES, SERVICE_PAGES, money } from "@/lib/services"

export const metadata = {
  title: "Our Services",
  description:
    "All Brixen Consultants services: UK company formation, identity verification, confirmation statements, company changes, registered office and director addresses, VAT, websites and business bank accounts.",
  alternates: { canonical: "/services/" },
}

export default function ServicesPage() {
  const groups = Object.keys(GROUP_TITLES)
  return (
    <>
      <PageHero eyebrow="Global Entrepreneur" title="Our" highlight="Services" text="Everything you need to start and run your UK business, from company registration to ongoing compliance and support." />
      <section className="bg-brand-mist py-16 sm:py-20">
        <div className="mx-auto max-w-7xl space-y-16 px-4 sm:px-6">
          {groups.map((g) => (
            <div key={g}>
              <h2 className="text-3xl font-bold text-black">
                {GROUP_TITLES[g].split(" ")[0]} <span className="text-brand-blue">{GROUP_TITLES[g].split(" ").slice(1).join(" ")}</span>
              </h2>
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {SERVICE_PAGES.filter((s) => s.group === g).map((s) => {
                  const intro = s.intro || SERVICE_CONTENT[s.content]?.intro || ""
                  return (
                    <Link key={s.path} href={s.path} className="group flex flex-col rounded-3xl bg-white p-7 ring-1 ring-slate-100 transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-25px_rgba(0,57,113,0.5)] hover:ring-brand-blue/40">
                      <span className="flex items-start justify-between gap-3">
                        <span className="font-display text-xl font-bold text-brand-navy group-hover:text-brand-blue">{s.name}</span>
                        {(s.price || s.priceFrom) && <span className="shrink-0 rounded-full bg-brand-mist px-3 py-1 text-sm font-bold text-brand-blue">{s.price ? money(s.price) : `from ${s.priceFrom}`}</span>}
                      </span>
                      <span className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-brand-slate">{intro.replace(/\*\*/g, "")}</span>
                      <span className="mt-5 text-sm font-semibold text-brand-blue">Learn more →</span>
                    </Link>
                  )
                })}
                {g === "business" && (
                  <Link href="/web-design-and-marketing/" className="group flex flex-col rounded-3xl bg-white p-7 ring-1 ring-slate-100 transition hover:-translate-y-1 hover:ring-brand-blue/40">
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-display text-xl font-bold text-brand-navy group-hover:text-brand-blue">Web Design & Marketing</span>
                      <span className="shrink-0 rounded-full bg-brand-mist px-3 py-1 text-sm font-bold text-brand-blue">from £199</span>
                    </span>
                    <span className="mt-3 flex-1 text-sm leading-relaxed text-brand-slate">WordPress and Shopify websites, and Facebook & Instagram marketing for your business.</span>
                    <span className="mt-5 text-sm font-semibold text-brand-blue">Learn more →</span>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      <Trust />
      <Reviews />
      <FaqConsult />
    </>
  )
}
