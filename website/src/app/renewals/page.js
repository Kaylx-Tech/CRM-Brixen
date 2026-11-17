import Link from "next/link"
import { PageHero, RichBlocks } from "@/components/PageParts"
import { FaqConsult } from "@/components/sections"
import { SERVICE_CONTENT } from "@/lib/service-content"
import { SITE } from "@/lib/site"

export const metadata = {
  title: "Renewals",
  description:
    "Renew your Brixen Consultants services in one place: registered office address, identity verification, confirmation statements, dormant accounts and more. Stay compliant and avoid penalties.",
  alternates: { canonical: "/renewals/" },
}

export default function RenewalsPage() {
  const c = SERVICE_CONTENT.renewals
  return (
    <>
      <PageHero eyebrow="Renew to remain new" title="Service" highlight="Renewals" text={c.intro} />
      <section className="bg-brand-mist py-12 sm:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_320px]">
          <article className="min-w-0 break-words rounded-3xl bg-white px-6 py-10 leading-relaxed text-slate-700 ring-1 ring-slate-100 sm:px-10 [&_h3:first-child]:mt-0">
            <RichBlocks blocks={c.body} />
          </article>
          <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-3xl bg-brand-navy p-7 text-white">
              <h2 className="text-xl font-bold">Renew in your account</h2>
              <p className="mt-2 text-sm text-white/80">Log in to My Account to see your active and expired services and renew them with a click.</p>
              <a href="/my-account/?tab=orders" className="mt-5 flex justify-center rounded-md bg-linear-to-br from-brand-blue to-brand-navy px-5 py-3 font-semibold ring-1 ring-white/20 hover:brightness-110">
                Go to My Account
              </a>
            </div>
            <div className="rounded-3xl bg-white p-7 ring-1 ring-slate-100">
              <h2 className="text-xl font-bold text-brand-navy">Order again</h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {[
                  ["Registered Office Address", "/registered-office-address-service/"],
                  ["Identity Verification (KYC)", "/kyc-identity-verification/"],
                  ["Confirmation Statement", "/confirmation-statement-service/"],
                  ["Dormant Company Accounts", "/dormant-company-accounts-service/"],
                  ["VAT Registration", "/vat-registration/"],
                ].map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="font-medium text-brand-blue hover:underline">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </section>
      <FaqConsult />
    </>
  )
}
