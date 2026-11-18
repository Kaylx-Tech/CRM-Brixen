import Image from "next/image"
import Link from "next/link"
import { PageHero } from "@/components/PageParts"
import { BankPartners, Reviews, SectionTitle, Trust } from "@/components/sections"
import { SITE } from "@/lib/site"

export const metadata = {
  title: "About Us",
  description:
    "Brixen Consultants helps entrepreneurs in the UK and abroad form a UK limited company, open business bank accounts and stay compliant. Our mission, vision and team.",
  alternates: { canonical: "/about/" },
}

const WHATSAPP = `https://wa.me/${SITE.whatsapp}`

// "Your support and trust makes us the best company formation agent in the UK" (WordPress about page)
const POINTS = [
  [
    "Best in Business",
    "At Brixen Consultants, excellence is not just a goal – it is our commitment. Our dedication to quality, attention to detail and customer-centric approach make us a trusted partner for businesses across the UK.",
  ],
  [
    "Our Success",
    "The success of our clients measures our success. We have played a part in the journey of many businesses and watched them grow. Your success story is our success.",
  ],
  [
    "Award",
    "Brixen Consultants has been honoured for its work in company formation. These accolades underline our commitment to top-notch service and to setting benchmarks in the industry.",
  ],
  [
    "History",
    "Founded on integrity and innovation, Brixen Consultants has a history of guiding businesses towards success, marked by milestones that reflect our dedication to excellence.",
  ],
]

function Block({ eyebrow, title, highlight, children, image, reverse }) {
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16">
      <div className={reverse ? "lg:order-2" : ""}>
        {eyebrow && <p className="text-sm font-bold uppercase tracking-widest text-brand-teal">{eyebrow}</p>}
        <h2 className="mt-2 text-3xl font-bold leading-tight text-black sm:text-4xl">
          {title} <span className="text-brand-blue">{highlight}</span>
        </h2>
        <div className="mt-5 space-y-4 leading-relaxed text-brand-slate">{children}</div>
      </div>
      {image}
    </section>
  )
}

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="Introduction" title="About" highlight="Us" text="Your premier partner in UK company formation." image="/home/cf.jpg" />

      <Block
        eyebrow="Introduction"
        title="Overview of"
        highlight="Brixen Consultants"
        image={<Image src="/home/cards-962x1024.webp" alt="Business bank cards from our banking partners" width={962} height={1024} className="mx-auto w-full max-w-md" />}
      >
        <p className="font-semibold text-slate-800">Welcome to Brixen Consultants – your premier partner in UK company formation.</p>
        <p>
          We take pride in being at the forefront of company formation services, helping entrepreneurs and business owners through
          the process of establishing their companies in the United Kingdom. With a wealth of experience and a commitment to
          excellence, we have become a trusted name in the industry.
        </p>
        <p>
          Our journey is rooted in a passion for helping businesses thrive. With a customer-centric approach we provide complete
          solutions for a smooth and efficient company formation. From startups to established businesses, we offer services
          tailored to what each client needs.
        </p>
        <p className="font-semibold text-brand-navy">Discover the Brixen Consultants advantage – where expertise meets excellence.</p>
      </Block>

      <section className="bg-brand-mist">
        <Block
          eyebrow="Our Mission"
          title="Our"
          highlight="Mission"
          reverse
          image={
            <div className="grid gap-5 sm:grid-cols-2">
              {[
                ["UK Limited Company", "Company formation for UK residents and non-residents"],
                ["Business Bank Accounts", "Tide, Wise, Monzo and other leading partners"],
                ["Registered Office", "A professional UK address for your company"],
                ["VAT & Web Presence", "VAT registration, websites and marketing"],
              ].map(([t, d]) => (
                <div key={t} className="rounded-2xl bg-white p-6 ring-1 ring-slate-100">
                  <p className="font-display text-lg font-bold text-brand-navy">{t}</p>
                  <p className="mt-1.5 text-sm text-brand-slate">{d}</p>
                </div>
              ))}
            </div>
          }
        >
          <p>
            Our mission is to empower entrepreneurs, startups and established businesses with complete support that takes the
            complexity out of company formation, compliance and growth. We deliver streamlined, professional services that help
            businesses set up in the UK and thrive in a competitive global market.
          </p>
          <p>
            Every business journey begins with a vision, but success is built through execution, guidance and the right partners.
            Whether it is setting up a <b className="text-slate-800">UK Limited Company</b>, opening{" "}
            <b className="text-slate-800">business bank accounts with leading financial partners</b> such as Tide, Wise and Monzo,
            or providing registered office addresses, VAT registration and web presence, we support you at every stage.
          </p>
          <p>Thank you for choosing Brixen Consultants. We look forward to helping you achieve your vision with confidence.</p>
        </Block>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            [
              "What We Do",
              "Our vision is to be the catalyst for your business success: every entrepreneur should be able to start their business with confidence, supported by a reliable partner. We simplify and streamline company formation so our clients can thrive in the UK.",
            ],
            [
              "Who We Are",
              "A team of experienced people helping clients across the globe form companies in the UK. We also advise on corporate governance and reporting requirements, so you can focus on running and growing your business.",
            ],
            [
              "Our Vision",
              "To improve our clients' businesses with a complete service that covers both the legal and the general procedures, helps with the documents and makes company formation easy.",
            ],
          ].map(([title, text]) => (
            <div key={title} className="rounded-3xl bg-white p-8 shadow-[0_20px_40px_-30px_rgba(0,57,113,0.45)] ring-1 ring-slate-100">
              <h3 className="text-2xl font-bold text-brand-navy">{title}</h3>
              <p className="mt-3 leading-relaxed text-brand-slate">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-brand-navy">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-12 text-white sm:px-6 md:flex-row">
          <h2 className="text-center text-3xl font-bold md:text-left">
            Prefer to Order by <span className="text-[#25d366]">WhatsApp</span>?
          </h2>
          <a href={WHATSAPP} target="_blank" rel="noreferrer" className="rounded-md bg-[#25d366] px-7 py-3.5 font-semibold text-white transition hover:brightness-110">
            Chat with us on WhatsApp
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionTitle eyebrow="Client's Satisfaction" title="Your Support and Trust Makes Us The Best Company Formation Agent in The UK" />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map(([title, text]) => (
            <div key={title} className="rounded-3xl bg-brand-mist p-7">
              <h3 className="text-xl font-bold text-brand-navy">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-brand-slate">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center">
          <Link href="/packages/" className="inline-flex rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-7 py-3.5 font-semibold text-white hover:brightness-110">
            View Packages
          </Link>
        </p>
      </section>

      <Trust />
      <BankPartners />
      <Reviews />
    </>
  )
}
