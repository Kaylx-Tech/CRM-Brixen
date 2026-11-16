import Image from "next/image"
import Link from "next/link"
import ServiceOrderForm from "@/components/order/ServiceOrderForm"
import { Marquee } from "@/components/sections"
import { money } from "@/lib/services"

const STEPS = ["Your Service", "File Details", "Checkout"]

/** Metadata for a service's order form page; kept out of search results (it is reached from the service page),
 *  except the forms that are the only page of their service. */
export function orderMetadata(service) {
  return {
    title: service.formOnly ? service.name : `${service.name}: Order`,
    description: service.intro || `Order ${service.name} (${money(service.price)}) from Brixen Consultants: fill in the details and pay securely by card.`,
    alternates: { canonical: service.details },
    robots: service.formOnly ? undefined : { index: false, follow: true },
  }
}

/** A service's order form ("details" page), as on WordPress: steps, the form, then card payment on Stripe. */
export default function ServiceOrderPage({ service }) {
  return (
    <>
      <Marquee />
      <section className="relative isolate overflow-hidden">
        <Image src="/home/pckg-banner.jpg" alt="" fill priority sizes="100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/85" />
        <div className="mx-auto max-w-4xl px-4 py-14 text-center text-white sm:px-6 sm:py-16">
          <ol className="mx-auto flex max-w-xl justify-center gap-3 text-xs font-semibold sm:gap-6 sm:text-sm">
            {STEPS.map((step, i) => (
              <li key={step} aria-current={i === 1 ? "step" : undefined} className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${i === 1 ? "bg-brand-blue" : i < 1 ? "bg-white/15" : "bg-white/5 text-white/60"}`}>
                <span>{i + 1}.</span> {step}
              </li>
            ))}
          </ol>
          <h1 className="mt-8 text-3xl font-bold leading-tight sm:text-5xl">{service.name}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-white/85">
            {service.intro ||
              "Please complete our online application form and pay by credit or debit card. Within 3 to 5 working hours we will email you to confirm we have started working on your order."}
          </p>
          {!service.formOnly && (
            <p className="mt-4 text-sm text-white/70">
              <Link href={service.path} className="underline-offset-2 hover:underline">
                ← About this service
              </Link>
            </p>
          )}
        </div>
      </section>
      <section className="bg-brand-mist py-12 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <ServiceOrderForm orderKey={service.order} name={service.name} price={service.price} />
        </div>
      </section>
    </>
  )
}
