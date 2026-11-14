import Image from "next/image"
import Link from "next/link"
import ConsultationForm from "@/components/home/ConsultationForm"
import { BANKS, FAQS, MARQUEE, PACKAGES, REVIEWS, STATS } from "@/lib/home"

/** Sections shared by the home page and the packages page (the WordPress site repeats them too). */

export function Check({ ok = true }) {
  return ok ? (
    <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-brand-navy" aria-label="Included">
      <path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-red-500" aria-label="Not included">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function SectionTitle({ eyebrow, title, text }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && <p className="text-sm font-bold uppercase tracking-widest text-brand-teal">{eyebrow}</p>}
      <h2 className="mt-2 text-3xl font-extrabold leading-tight text-brand-navy sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-brand-slate">{text}</p>}
    </div>
  )
}

/** What Brixen does, scrolling along under the header. */
export function Marquee() {
  return (
    <div className="overflow-hidden bg-linear-to-r from-brand-navy to-brand-blue py-3 text-white" aria-label="Our services">
      <div className="marquee flex w-max gap-10 whitespace-nowrap text-sm font-semibold uppercase tracking-wider">
        {[...MARQUEE, ...MARQUEE].map((item, i) => (
          <span key={i} className="flex items-center gap-10" aria-hidden={i >= MARQUEE.length}>
            {item}
            <span className="text-white/40">✦</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** The Google and Facebook rating boxes: white outline on the dark hero. */
export function RatingBoxes() {
  return (
    <div className="mt-8 grid max-w-md grid-cols-2 gap-3 sm:gap-5">
      {[["/home/google.png", "Google"], ["/home/fb.png", "Facebook"]].map(([src, label]) => (
        <div key={label} className="flex flex-col items-center rounded-2xl border-2 border-white/90 px-3 py-4 text-center text-white">
          <Image src={src} alt={label} width={150} height={55} className="h-7 w-auto" />
          <p className="mt-2 text-sm font-semibold sm:text-[15px]">
            Rated 4.8 <span className="text-amber-400">★★★★★</span>
          </p>
          <p className="text-sm font-semibold">Out of 5.0</p>
        </div>
      ))}
    </div>
  )
}

/** The three formation packages; `name` (from the name search) is carried into the chosen package's next step. */
export function PackageCards({ name = "" }) {
  const suffix = name ? `?name=${encodeURIComponent(name)}` : ""
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        {PACKAGES.map((p) => (
          <div
            key={p.name}
            className={`relative flex flex-col overflow-hidden rounded-3xl bg-white p-8 ${
              p.popular ? "shadow-[0_30px_60px_-30px_rgba(0,57,113,0.6)] ring-2 ring-brand-blue" : "shadow-[0_20px_40px_-30px_rgba(0,57,113,0.45)] ring-1 ring-slate-100"
            }`}
          >
            {p.popular && (
              <span className="absolute -left-12 top-7 w-44 -rotate-45 bg-linear-to-r from-brand-navy to-brand-blue py-1.5 text-center text-xs font-bold text-white shadow">
                Most Popular
              </span>
            )}
            <h3 className="text-center text-2xl font-extrabold text-brand-navy">{p.name}</h3>
            <p className="mt-3 text-center text-5xl font-extrabold text-brand-blue">{p.price}</p>
            <p className="mt-3 text-center text-sm text-brand-slate">{p.text}</p>
            <ul className="mt-6 space-y-2.5 border-t border-slate-100 pt-6 text-sm">
              {p.features.map(([f, ok]) => (
                <li key={f} className={`flex gap-2.5 ${ok ? "text-slate-800" : "text-slate-400"}`}>
                  <Check ok={ok} /> {f}
                </li>
              ))}
            </ul>
            <Link
              href={`${p.href}${suffix}`}
              className="mt-8 inline-flex justify-center rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-6 py-3.5 font-semibold text-white transition hover:brightness-110"
            >
              Launch Now
            </Link>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-col items-center gap-3">
        <p className="text-sm text-brand-slate">Secure card payments</p>
        <Image src="/home/all-card.png" alt="Mastercard, American Express, Maestro, Visa, JCB, Diners Club, Discover" width={808} height={86} className="h-auto w-full max-w-md" />
      </div>
    </>
  )
}

export function BankPartners() {
  return (
    <section className="border-y border-slate-100 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <p className="text-center text-sm font-bold uppercase tracking-widest text-brand-teal">Banking Partners & Affiliates</p>
        <p className="mt-2 text-center font-semibold text-brand-slate">We help you open business accounts with leading UK banks</p>
        <div className="mt-8 grid grid-cols-3 items-center gap-6 sm:grid-cols-4 lg:grid-cols-7">
          {BANKS.map(([name, logo, href]) => (
            <Link key={name} href={href} className="flex h-14 items-center justify-center opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0" title={`${name} business account`}>
              <Image src={logo} alt={name} width={130} height={48} className="max-h-12 w-auto object-contain" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Reviews() {
  return (
    <section className="bg-brand-mist py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionTitle
          eyebrow="Reviews"
          title="See What Our Customers Are Saying on Google & Facebook"
          text="Don't just take our word for it: check out our verified reviews, live on Google and Facebook."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {REVIEWS.map(([name, source, text]) => (
            <figure key={name} className="flex flex-col rounded-3xl bg-white p-7 ring-1 ring-slate-100">
              <div className="text-amber-400" aria-label="5 out of 5 stars">★★★★★</div>
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-slate-700">“{text}”</blockquote>
              <figcaption className="mt-5 text-sm">
                <b className="text-brand-navy">{name}</b>
                <span className="text-brand-slate"> · {source}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Trust() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <SectionTitle
        title="Why Clients Trust Brixen Consultants"
        text="Successfully guiding over 700 clients from more than 8 countries toward their goals with unmatched efficiency."
      />
      <div className="mt-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {STATS.map(([value, label]) => (
          <div key={label} className="rounded-3xl bg-linear-to-br from-brand-navy to-brand-blue p-7 text-center text-white">
            <p className="text-4xl font-extrabold">{value}</p>
            <p className="mt-2 text-sm text-white/80">{label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function FaqConsult() {
  return (
    <section className="bg-brand-mist py-20">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-brand-teal">FAQs</p>
          <h2 className="mt-2 text-3xl font-extrabold text-brand-navy sm:text-4xl">Frequently Asked Questions</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map(([q, a]) => (
              <details key={q} className="group rounded-2xl bg-white p-5 ring-1 ring-slate-100 open:ring-brand-blue/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-brand-navy">
                  {q}
                  <span className="text-xl text-brand-blue transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-brand-slate">{a}</p>
              </details>
            ))}
          </div>
        </div>
        <div className="self-start rounded-3xl bg-white p-8 shadow-[0_30px_60px_-35px_rgba(0,57,113,0.5)] ring-1 ring-slate-100">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-teal">Get In Touch</p>
          <h2 className="mt-2 text-3xl font-extrabold text-brand-navy">Book a Free Consultation</h2>
          <p className="mt-3 text-sm text-brand-slate">Tell us what you need and we&apos;ll reply on WhatsApp.</p>
          <div className="mt-6">
            <ConsultationForm />
          </div>
        </div>
      </div>
    </section>
  )
}
