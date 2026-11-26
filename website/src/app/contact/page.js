import ConsultationForm from "@/components/home/ConsultationForm"
import { PageHero } from "@/components/PageParts"
import { BankPartners } from "@/components/sections"
import { SITE } from "@/lib/site"

export const metadata = {
  title: "Contact Us",
  description: `Contact Brixen Consultants: call or WhatsApp ${SITE.phone}, email ${SITE.email}, or send us your question. Open 24 hours, 7 days a week.`,
  alternates: { canonical: "/contact/" },
}

const WHATSAPP = `https://wa.me/${SITE.whatsapp}`

function Icon({ d }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand-navy from-20% to-brand-blue text-white">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </span>
  )
}

const ICONS = {
  address: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  hours: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z",
  email: "M4 6h16v12H4zM4 7l8 6 8-6",
  company: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M3 21h18",
  shield: "M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Zm-3 9 2 2 4-4",
}

const contactLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  url: `${SITE.url}/contact/`,
  mainEntity: {
    "@type": "ProfessionalService",
    name: SITE.legalName,
    telephone: SITE.phone,
    email: SITE.email,
    openingHours: "Mo-Su 00:00-23:59",
    address: { "@type": "PostalAddress", streetAddress: "57 Wellesley Road", addressLocality: "Ilford", postalCode: "IG1 4JZ", addressCountry: "GB" },
  },
}

export default function ContactPage() {
  const rows = [
    ["address", "Address", <a key="a" href={SITE.mapUrl} target="_blank" rel="noreferrer" className="hover:text-brand-blue">{SITE.address}</a>],
    ["hours", "Office Hours", SITE.officeHours],
    [
      "phone",
      "Call Us",
      <span key="p" className="flex flex-col">
        <a href={SITE.phoneHref} className="hover:text-brand-blue">{SITE.phone}</a>
      </span>,
    ],
    ["email", "Email Us", <a key="e" href={`mailto:${SITE.email}`} className="break-all hover:text-brand-blue">{SITE.email}</a>],
    ["company", "Company Nr", SITE.companyNumber],
    ["shield", "ICO Reg. ref", SITE.icoNumber],
  ]
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(contactLd) }} />
      <PageHero eyebrow="Get in Touch" title="Contact" highlight="Us" text="Having queries? Our executives are working 24x7 to address your requirements." />

      <section className="bg-brand-mist py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_420px]">
          <div className="rounded-3xl bg-white p-7 shadow-[0_30px_60px_-40px_rgba(0,57,113,0.5)] ring-1 ring-slate-100 sm:p-10">
            <p className="text-sm font-bold uppercase tracking-widest text-brand-teal">Get In Touch</p>
            <h2 className="mt-2 text-3xl font-bold text-black">
              Send us your <span className="text-brand-blue">question</span>
            </h2>
            <p className="mt-3 text-sm text-brand-slate">Tell us what you need and we&apos;ll reply by email or WhatsApp.</p>
            <div className="mt-7">
              <ConsultationForm />
            </div>
          </div>

          <aside className="self-start rounded-3xl bg-white p-7 ring-1 ring-slate-100 sm:p-9">
            <p className="text-sm font-bold uppercase tracking-widest text-brand-teal">Reach Us</p>
            <h2 className="mt-2 text-2xl font-bold text-black">
              Contact us and make company formation <span className="text-brand-blue">easy</span>.
            </h2>
            <dl className="mt-7 space-y-5">
              {rows.map(([icon, label, value]) => (
                <div key={label} className="flex gap-4">
                  <Icon d={ICONS[icon]} />
                  <div className="min-w-0">
                    <dt className="font-display font-bold text-brand-navy">{label}</dt>
                    <dd className="mt-0.5 text-slate-700">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
            <a href={WHATSAPP} target="_blank" rel="noreferrer" className="mt-8 flex justify-center rounded-md bg-[#25d366] px-6 py-3.5 font-semibold text-white transition hover:brightness-110">
              Chat on WhatsApp
            </a>
          </aside>
        </div>
      </section>

      <BankPartners />
    </>
  )
}
