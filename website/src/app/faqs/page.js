import Link from "next/link"
import ConsultationForm from "@/components/home/ConsultationForm"
import { PageHero } from "@/components/PageParts"
import { Reviews } from "@/components/sections"
import { FAQS } from "@/lib/home"

export const metadata = {
  title: "FAQs",
  description:
    "Answers to common questions about UK company formation, UTR numbers, business bank accounts for non-residents, Stripe and support after formation with Brixen Consultants.",
  alternates: { canonical: "/faqs/" },
}

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
}

export default function FaqsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <PageHero eyebrow="FAQs" title="Frequently Asked" highlight="Questions" text="Quick answers about forming your UK company and opening a business bank account." />

      <section className="bg-brand-mist py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_400px]">
          <div className="space-y-3">
            {FAQS.map(([q, a], i) => (
              <details key={q} open={i === 0} className="group rounded-2xl bg-white p-6 ring-1 ring-slate-100 open:ring-brand-blue/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-brand-navy">
                  {q}
                  <span className="text-2xl text-brand-blue transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 leading-relaxed text-brand-slate">{a}</p>
              </details>
            ))}
          </div>
          <aside className="self-start rounded-3xl bg-white p-8 ring-1 ring-slate-100">
            <p className="text-sm font-bold uppercase tracking-widest text-brand-teal">Still have a question?</p>
            <h2 className="mt-2 text-2xl font-bold text-brand-navy">Ask us directly</h2>
            <p className="mt-2 text-sm text-brand-slate">
              Send your question and we&apos;ll reply on WhatsApp, or see our{" "}
              <Link href="/packages/" className="font-semibold text-brand-blue hover:underline">
                packages
              </Link>
              .
            </p>
            <div className="mt-6">
              <ConsultationForm />
            </div>
          </aside>
        </div>
      </section>

      <Reviews />
    </>
  )
}
