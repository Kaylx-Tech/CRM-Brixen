import Image from "next/image"
import PackagesWithName from "@/components/home/PackagesWithName"
import { BankPartners, FaqConsult, Marquee, OrderSteps, Reviews, Trust } from "@/components/sections"

export const metadata = {
  title: "Company Formation Packages",
  description:
    "Compare Brixen Consultants' UK company formation packages: Digital £170, Professional £300 and All Inclusive £450, with registered office address, business bank account, UTR and more.",
  alternates: { canonical: "/packages/" },
}

export default function PackagesPage() {
  return (
    <>
      <Marquee />

      <section className="relative isolate overflow-hidden">
        <Image src="/home/pckg-banner.jpg" alt="" fill priority sizes="100vw" className="-z-10 object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/85" />
        <div className="mx-auto max-w-5xl px-4 py-16 text-center text-white sm:px-6 sm:py-20">
          <p className="text-lg font-semibold text-brand-blue">Packages</p>
          <h1 className="mt-2 text-4xl font-bold sm:text-5xl">UK Company Formation Packages</h1>
          <OrderSteps active={0} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-extrabold leading-tight text-brand-navy sm:text-4xl">Choose your company formation package below</h2>
          <p className="mt-4 text-brand-slate">
            Rated excellent by our customers on Google <span className="text-amber-400">★★★★★</span>
            <br />
            <b className="text-brand-navy">Hundreds Of Happy Clients!</b>
          </p>
        </div>
        <div className="mt-12">
          <PackagesWithName />
        </div>
      </section>

      <Reviews />
      <BankPartners />
      <Trust />
      <FaqConsult />
    </>
  )
}
