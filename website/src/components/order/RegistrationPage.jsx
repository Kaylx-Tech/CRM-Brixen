import Image from "next/image"
import FormationForm from "@/components/order/FormationForm"
import { packageBySlug } from "@/components/order/NameSearchPage"
import { Marquee, OrderSteps } from "@/components/sections"
import { SITE, pageByPath } from "@/lib/site"

/** Page metadata for a package's company registration (details) page; not for search engines, like WordPress. */
export function registrationMetadata(slug) {
  const p = packageBySlug(slug)
  const page = pageByPath(p.next)
  return {
    title: `${p.name} Package: Company Registration`,
    description: `File your company details for the ${p.name} company formation package (${p.price}) with ${SITE.name}.`,
    alternates: { canonical: p.next },
    robots: page?.index ? undefined : { index: false, follow: true },
  }
}

/** Step 3 of an order (File Details) for one package, then card payment on Stripe (step 4). */
export default function RegistrationPage({ slug }) {
  const p = packageBySlug(slug)
  return (
    <>
      <Marquee />
      <section className="relative isolate overflow-hidden">
        <Image src="/home/pckg-banner.jpg" alt="" fill priority sizes="100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/85" />
        <div className="mx-auto max-w-5xl px-4 py-14 text-center text-white sm:px-6 sm:py-20">
          <OrderSteps active={2} />
          <h1 className="mx-auto mt-12 max-w-3xl text-2xl font-bold leading-snug sm:text-5xl sm:leading-tight">
            You have chosen the <span className="text-brand-blue">{p.name.toUpperCase()} PACKAGE</span>.
            <br />
            Now file your company details.
          </h1>
        </div>
      </section>
      <section className="bg-brand-mist py-12 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <FormationForm pkg={{ slug: p.slug, name: p.name, price: p.price }} />
        </div>
      </section>
    </>
  )
}
