import Image from "next/image"
import Link from "next/link"
import { Inline, RichBlocks } from "@/components/PageParts"
import { BankPartners, Check, FaqConsult, Marquee, Reviews, Trust } from "@/components/sections"
import { SERVICE_CONTENT } from "@/lib/service-content"
import { GROUP_TITLES, SERVICE_PAGES, money } from "@/lib/services"
import { SITE } from "@/lib/site"

const WHATSAPP = `https://wa.me/${SITE.phoneHref.replace("tel:+", "")}`
const BANKS = SERVICE_PAGES.filter((s) => s.group === "banking" && s.order)

const firstSentence = (text) => {
  const plain = String(text || "").replace(/\*\*|\[|\]\([^)]*\)/g, "")
  const cut = plain.match(/^(.{60,170}?[.!?])\s/)
  return (cut ? cut[1] : plain.slice(0, 160)).trim()
}

/** Metadata for a service page from its WordPress text. */
export function serviceMetadata(service) {
  const c = SERVICE_CONTENT[service.content] || {}
  const price = service.price ? ` From ${money(service.price)}.` : ""
  return {
    title: service.name,
    description: `${firstSentence(c.intro || c.body?.find((b) => b[0] === "p")?.[1])}${price}`.slice(0, 300),
    alternates: { canonical: service.path },
  }
}

/** A service or bank page (as on WordPress): banner with price and Buy Now, what is included, the full text,
 *  "How it works" / documents, WhatsApp, then the shared sections. */
export default function ServicePage({ service }) {
  const c = SERVICE_CONTENT[service.content]
  const [ctaLabel, ctaHref] = service.cta || ["Buy Now", service.details]
  const price = service.price ? money(service.price) : service.priceFrom ? `from ${service.priceFrom}` : null
  const others = service.group === "banking" ? BANKS.filter((b) => b.path !== service.path) : SERVICE_PAGES.filter((s) => s.group === service.group && s.path !== service.path && !s.formOnly)

  const ld = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.name,
    description: c.intro,
    provider: { "@type": "ProfessionalService", name: SITE.legalName, url: SITE.url },
    areaServed: "GB",
    ...(service.price ? { offers: { "@type": "Offer", price: service.price.toFixed(2), priceCurrency: "GBP", url: `${SITE.url}${service.details}` } } : {}),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Marquee />

      <section className="relative isolate overflow-hidden">
        <Image src="/home/cf.jpg" alt="" fill priority sizes="100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/85" />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 text-white sm:px-6 sm:py-20 lg:grid-cols-[1fr_400px] lg:items-center">
          <div>
            <p className="text-lg font-semibold text-brand-blue">{GROUP_TITLES[service.group]}</p>
            <h1 className="mt-2 flex flex-wrap items-center gap-4 text-4xl font-bold leading-tight sm:text-5xl">
              {service.icon && <Image src={service.icon} alt="" width={500} height={500} sizes="64px" className="size-14 rounded-xl sm:size-16" />}
              {c.title}
            </h1>
            {c.intro && (
              <p className="mt-5 max-w-2xl text-lg text-white/85">
                <Inline text={c.intro} />
              </p>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href={ctaHref} className="rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-8 py-4 text-lg font-semibold text-white ring-1 ring-white/20 transition hover:brightness-110">
                {ctaLabel}
              </Link>
              <a href={WHATSAPP} target="_blank" rel="noreferrer" className="rounded-md border-2 border-white/80 px-6 py-3.5 font-semibold transition hover:bg-white hover:text-brand-navy">
                Ask on WhatsApp
              </a>
            </div>
          </div>
          <div className="rounded-3xl bg-white p-7 text-slate-800 shadow-2xl">
            {price && (
              <p className="flex items-baseline justify-between border-b border-slate-100 pb-5">
                <span className="font-semibold text-brand-slate">Price</span>
                <span className="text-4xl font-extrabold text-brand-blue">{price}</span>
              </p>
            )}
            <p className="mt-5 font-display text-lg font-bold text-brand-navy">{c.includes.length ? "Includes" : "Why choose Brixen"}</p>
            <ul className="mt-3 space-y-2.5 text-sm">
              {(c.includes.length ? c.includes : ["Fast, friendly support 24/7", "Over 700 clients from 8+ countries", "Secure card payment"]).map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Check /> <Inline text={item} />
                </li>
              ))}
            </ul>
            <Link href={ctaHref} className="mt-6 flex justify-center rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-6 py-3.5 font-semibold text-white transition hover:brightness-110">
              {ctaLabel}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_360px]">
        <article className="min-w-0 break-words leading-relaxed text-slate-700 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0">
          <RichBlocks blocks={c.body} />
        </article>
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          {c.list && c.list.items.length > 0 && (
            <div className="rounded-3xl bg-brand-mist p-7">
              <h2 className="text-xl font-bold text-brand-navy">{c.list.title}</h2>
              <ol className="mt-4 space-y-3 text-sm text-slate-700">
                {c.list.items.map((item, i) => (
                  <li key={item} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs font-bold text-white">{i + 1}</span>
                    <span>
                      <Inline text={item} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="rounded-3xl bg-brand-navy p-7 text-white">
            <h2 className="text-xl font-bold">
              Prefer to Order by <span className="text-[#25d366]">WhatsApp</span>?
            </h2>
            <p className="mt-2 text-sm text-white/80">If you are not confident completing your order online, message our friendly team and we will complete it with you on WhatsApp.</p>
            <a href={WHATSAPP} target="_blank" rel="noreferrer" className="mt-5 flex justify-center rounded-md bg-[#25d366] px-5 py-3 font-semibold transition hover:brightness-110">
              Chat on WhatsApp
            </a>
          </div>
          {others.length > 0 && (
            <div className="rounded-3xl p-7 ring-1 ring-slate-100">
              <h2 className="text-xl font-bold text-brand-navy">{service.group === "banking" ? "Financial Services" : `More ${GROUP_TITLES[service.group]}`}</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {others.map((o) => (
                  <li key={o.path}>
                    <Link href={o.path} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 font-medium text-slate-700 hover:bg-brand-mist hover:text-brand-blue">
                      {o.name}
                      {o.price ? <span className="text-brand-slate">{money(o.price)}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </section>

      <BankPartners />
      <Reviews />
      <Trust />
      <FaqConsult />
    </>
  )
}
