import Image from "next/image"
import Link from "next/link"
import CompanyNameCheck from "@/components/order/CompanyNameCheck"
import { FaqConsult, Marquee, OrderSteps, PackageCard, Reviews } from "@/components/sections"
import { PACKAGES } from "@/lib/home"
import { SITE, pageByPath } from "@/lib/site"

export const packageBySlug = (slug) => PACKAGES.find((p) => p.slug === slug)

/** Page metadata for a package's name search page (index or not as in the WordPress list in lib/site.js). */
export function nameSearchMetadata(slug) {
  const p = packageBySlug(slug)
  const page = pageByPath(p.href)
  return {
    title: `${p.name} Package: Company Name Search`,
    description: `Check if your company name is available at Companies House and start your ${p.name} company formation package (${p.price}) with ${SITE.name}.`,
    alternates: { canonical: p.href },
    robots: page?.index === false ? { index: false, follow: true } : undefined,
  }
}

/** Step 2 of an order (Name Check) for one package, as on the WordPress site. */
export default function NameSearchPage({ slug }) {
  const p = packageBySlug(slug)
  return (
    <>
      <Marquee />

      <section className="relative isolate overflow-hidden">
        <Image src="/home/pckg-banner.jpg" alt="" fill priority sizes="100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/85" />
        <div className="mx-auto max-w-5xl px-4 py-14 text-center text-white sm:px-6 sm:py-20">
          <OrderSteps active={1} />
          <h1 className="mx-auto mt-12 max-w-3xl text-2xl font-bold leading-snug sm:text-5xl sm:leading-tight">
            You have chosen the <span className="text-brand-blue">{p.name.toUpperCase()} PACKAGE</span>.
            <br />
            Now check your company name.
          </h1>
          <CompanyNameCheck pkg={{ next: p.next, button: p.button }} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-md">
          <h2 className="text-center text-3xl font-extrabold text-brand-navy">Your package</h2>
          <p className="mt-2 text-center text-sm text-brand-slate">
            Not the right one?{" "}
            <Link href="/packages/" className="font-semibold text-brand-blue hover:underline">
              Change package
            </Link>
          </p>
          <div className="mt-8">
            <PackageCard p={p} href="/packages/" cta="Compare packages" />
          </div>
        </div>
      </section>

      <Reviews />
      <FaqConsult />
    </>
  )
}
