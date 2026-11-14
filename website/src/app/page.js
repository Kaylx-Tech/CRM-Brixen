import Image from "next/image"
import Link from "next/link"
import NameSearch from "@/components/home/NameSearch"
import { BankPartners, Check, FaqConsult, Marquee, PackageCards, RatingBoxes, Reviews, SectionTitle, Trust } from "@/components/sections"
import { FAQS, SERVICES } from "@/lib/home"
import { SITE } from "@/lib/site"

export const metadata = {
  title: { absolute: "UK Company Formation & Business Bank Accounts | Brixen Consultants" },
  description:
    "Set up a limited company in the UK with Brixen Consultants: company formation from £60, registered office address, Tide, Wise and Monzo business bank accounts, KYC and VAT registration.",
  alternates: { canonical: "/" },
}

// Search engines read the company and the FAQ from this (structured data)
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: SITE.legalName,
    url: SITE.url,
    logo: `${SITE.url}/brand/brixen-logo.png`,
    telephone: SITE.phone,
    email: SITE.email,
    address: { "@type": "PostalAddress", streetAddress: "57 Wellesley Road", addressLocality: "Ilford", postalCode: "IG1 4JZ", addressCountry: "GB" },
    sameAs: SITE.social.map(([, href]) => href),
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
]

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Marquee />

      {/* Hero: dark photo, name search, cash back, cards and the ratings */}
      <section className="relative isolate overflow-hidden">
        <Image src="/home/cf.jpg" alt="" fill priority sizes="100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/85" />
        <div className="mx-auto max-w-7xl px-4 py-16 text-white sm:px-6 sm:py-24">
          <p className="text-lg font-semibold text-brand-blue">Company Formation</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
            Set up a Limited Company in <span className="text-brand-blue">UK</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/85">
            Physical & Virtual Bank Accounts covering registration, tax support, marketing, and website creation services!
          </p>
          <NameSearch />
          <p className="mt-5 text-white/90">
            Choose a banking partner during the process & earn <b className="text-white">up to £55* Cash Back</b>.
          </p>
          <Image
            src="/home/laptop-cards-n.png"
            alt="Business bank cards from our banking partners"
            width={1140}
            height={123}
            className="mt-6 hidden h-auto w-full max-w-3xl sm:block"
          />
          <Image
            src="/home/mb-cards-1.png"
            alt="Business bank cards from our banking partners"
            width={690}
            height={320}
            className="mt-6 h-auto w-full max-w-sm sm:hidden"
          />
          <RatingBoxes />
        </div>
      </section>

      <BankPartners />

      {/* Free banking */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-brand-teal">Free Business Banking</p>
          <h2 className="mt-2 text-3xl font-extrabold leading-tight text-brand-navy sm:text-4xl">
            Free Banking for Your New Company Registration in the UK
          </h2>
          <p className="mt-5 font-semibold text-slate-800">
            Seamlessly set up your company and enjoy the benefits of a free business bank account with our comprehensive company
            formation services.
          </p>
          <p className="mt-4 text-brand-slate">
            Your business deserves a stress-free start. With our expert company formation services, you can set up a company in the UK
            and pick a free business bank account that suits your needs, all without the usual stress and paperwork. After your limited
            company registration, choose from a range of top banking options and get your account up and running in no time, so you
            can focus on what really matters: growing your business. Let us handle the details while you take the lead.
          </p>
          <Link
            href="/business-bank-accounts/"
            className="mt-8 inline-flex rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-7 py-3.5 font-semibold text-white transition hover:brightness-110"
          >
            Banking Services
          </Link>
        </div>
        <Image src="/home/cards-962x1024.webp" alt="Business bank cards" width={962} height={1024} className="mx-auto w-full max-w-md" />
      </section>

      {/* Services */}
      <section className="bg-brand-mist py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle
            eyebrow="Our Services"
            title="Complete UK Business Formation Services"
            text="Everything you need to start and run your UK business successfully, from company registration to ongoing compliance and support."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <div key={s.title} className={`relative flex flex-col rounded-3xl bg-white p-7 shadow-[0_20px_40px_-28px_rgba(0,57,113,0.45)] ${s.popular ? "ring-2 ring-brand-blue" : "ring-1 ring-slate-100"}`}>
                {s.popular && <span className="absolute -top-3 left-7 rounded-full bg-brand-blue px-3 py-1 text-xs font-bold text-white">Most Popular</span>}
                <h3 className="text-xl font-bold text-brand-navy">{s.title}</h3>
                <p className="mt-3 text-3xl font-extrabold text-brand-blue">
                  {s.price}
                  {s.priceNote && <span className="ml-1 text-sm font-semibold text-brand-slate">{s.priceNote}</span>}
                </p>
                <p className="mt-3 text-sm text-brand-slate">{s.text}</p>
                <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
                  {s.points.map((p) => (
                    <li key={p} className="flex gap-2.5">
                      <Check /> {p}
                    </li>
                  ))}
                </ul>
                <Link href={s.href} className="mt-7 inline-flex justify-center rounded-md border-2 border-brand-blue px-5 py-2.5 font-semibold text-brand-blue transition hover:bg-brand-blue hover:text-white">
                  Start Process
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionTitle
          eyebrow="Packages"
          title="UK Company Formation Packages"
          text="Choose from a range of company formation packages to suit most budgets and business structures."
        />
        <div className="mt-12">
          <PackageCards />
        </div>
        <p className="mt-8 text-center">
          <Link href="/packages/" className="font-semibold text-brand-blue hover:underline">
            Compare all packages →
          </Link>
        </p>
      </section>

      <Reviews />
      <Trust />
      <FaqConsult />
    </>
  )
}
