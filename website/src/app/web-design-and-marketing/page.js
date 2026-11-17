import Link from "next/link"
import { PageHero } from "@/components/PageParts"
import { Check, FaqConsult, Reviews } from "@/components/sections"
import { SITE } from "@/lib/site"

export const metadata = {
  title: "Web Design and Marketing",
  description:
    "WordPress and Shopify websites and Facebook & Instagram marketing for UK businesses. Basic £199, Standard £399, Premium £699.",
  alternates: { canonical: "/web-design-and-marketing/" },
}

const WHATSAPP = `https://wa.me/${SITE.phoneHref.replace("tel:+", "")}`

const SERVICES = [
  ["WordPress Website Development", "Custom WordPress design with SEO optimization, responsive layouts, and powerful functionality tailored to your brand.", ["Custom Theme Design", "SEO Optimization", "Mobile Responsive", "E-commerce Integration"]],
  ["Shopify Website Development", "Complete Shopify setup from scratch including product upload, payment integration, and mobile-friendly design.", ["Store Setup", "Product Management", "Payment Integration", "Mobile Optimization"]],
  ["Facebook & Instagram Marketing", "Strategic ad campaign setup with precise audience targeting, conversion tracking, and detailed monthly reports.", ["Campaign Strategy", "Audience Targeting", "Conversion Tracking", "Performance Reports"]],
]
const PLANS = [
  ["Basic", "£199", ["1 Page Website", "Basic SEO Setup", "WhatsApp Chat Integration", "Mobile Responsive Design", "1 Month Support"]],
  ["Standard", "£399", ["5 Pages Website", "Blog Setup", "Advanced SEO", "Basic Facebook Marketing Setup", "Contact Form Integration", "3 Months Support"], true],
  ["Premium", "£699", ["Full Website (Unlimited Pages)", "Advanced SEO Optimization", "Facebook Ad Campaign", "6 Months Priority Support"]],
]

export default function WebDesignPage() {
  return (
    <>
      <PageHero eyebrow="Business Services" title="Web Design &" highlight="Marketing" text="Websites that sell and campaigns that bring customers: WordPress, Shopify and social media marketing." />

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {SERVICES.map(([title, text, points]) => (
            <div key={title} className="rounded-3xl bg-white p-8 shadow-[0_20px_40px_-30px_rgba(0,57,113,0.45)] ring-1 ring-slate-100">
              <h2 className="text-2xl font-bold text-brand-navy">{title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-brand-slate">{text}</p>
              <ul className="mt-5 space-y-2 text-sm">
                {points.map((p) => (
                  <li key={p} className="flex gap-2.5">
                    <Check /> {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-brand-mist py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-bold text-black sm:text-4xl">
            Transparent <span className="text-brand-blue">Pricing</span>
          </h2>
          <p className="mt-3 text-center text-brand-slate">Choose the perfect plan for your business needs</p>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {PLANS.map(([name, price, points, popular]) => (
              <div key={name} className={`flex flex-col rounded-3xl bg-white p-8 ${popular ? "ring-2 ring-brand-blue shadow-[0_30px_60px_-30px_rgba(0,57,113,0.6)]" : "ring-1 ring-slate-100"}`}>
                {popular && <span className="self-start rounded-full bg-brand-blue px-3 py-1 text-xs font-bold text-white">Most Popular</span>}
                <h3 className="mt-3 text-2xl font-extrabold text-brand-navy">{name}</h3>
                <p className="mt-2 text-5xl font-extrabold text-brand-blue">{price}</p>
                <ul className="mt-6 flex-1 space-y-2.5 border-t border-slate-100 pt-6 text-sm">
                  {points.map((p) => (
                    <li key={p} className="flex gap-2.5">
                      <Check /> {p}
                    </li>
                  ))}
                </ul>
                <a
                  href={`${WHATSAPP}?text=${encodeURIComponent(`Hello Brixen, I am interested in the ${name} website plan (${price}).`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-8 inline-flex justify-center rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-6 py-3.5 font-semibold text-white hover:brightness-110"
                >
                  Get Started
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Reviews />
      <FaqConsult />
    </>
  )
}
