import Image from "next/image"
import Link from "next/link"
import OrderNumber from "@/components/order/OrderNumber"
import { Marquee, OrderSteps } from "@/components/sections"
import { SITE } from "@/lib/site"

export const metadata = {
  title: "Order Complete",
  description: "Thank you for your order with Brixen Consultants.",
  robots: { index: false, follow: false },
}

// Stripe sends the customer here after paying (services/website_orders.py success_url)
export default function OrderCompletePage() {
  return (
    <>
      <Marquee />
      <section className="relative isolate overflow-hidden">
        <Image src="/home/pckg-banner.jpg" alt="" fill priority sizes="100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/85" />
        <div className="mx-auto max-w-5xl px-4 py-14 text-center text-white sm:px-6 sm:py-20">
          <OrderSteps active={4} />
          <h1 className="mx-auto mt-12 max-w-3xl text-3xl font-bold leading-tight sm:text-5xl">
            Thank you! Your order is <span className="text-brand-blue">complete</span>.
          </h1>
          <OrderNumber />
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold text-brand-navy">What happens next</h2>
        <ol className="mt-10 space-y-5">
          {[
            ["Receipt by email", "You will get the payment receipt by email in a few minutes."],
            ["We check your documents", "Our team reviews your ID and proof of address. If anything is missing we contact you."],
            ["Companies House", "We file your company with Companies House and keep you updated until it is registered."],
          ].map(([title, text], i) => (
            <li key={title} className="flex gap-4 rounded-2xl bg-brand-mist p-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-navy from-20% to-brand-blue font-bold text-white">{i + 1}</span>
              <span>
                <b className="text-brand-navy">{title}</b>
                <span className="mt-1 block text-sm text-brand-slate">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href={`${SITE.portalUrl}/`} className="rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-6 py-3.5 font-semibold text-white hover:brightness-110">
            Go to My Account
          </a>
          <Link href="/" className="rounded-md border-2 border-brand-blue px-6 py-3 font-semibold text-brand-blue hover:bg-brand-blue hover:text-white">
            Back to Home
          </Link>
        </div>
        <p className="mt-8 text-center text-sm text-brand-slate">
          Questions? Call <a href={SITE.phoneHref} className="font-semibold text-brand-blue">{SITE.phone}</a> or message us on WhatsApp.
        </p>
      </section>
    </>
  )
}
