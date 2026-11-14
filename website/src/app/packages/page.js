import Image from "next/image"
import PackagesWithName from "@/components/home/PackagesWithName"
import { BankPartners, FaqConsult, Marquee, Reviews, Trust } from "@/components/sections"

export const metadata = {
  title: "Company Formation Packages",
  description:
    "Compare Brixen Consultants' UK company formation packages: Digital £170, Professional £300 and All Inclusive £450, with registered office address, business bank account, UTR and more.",
  alternates: { canonical: "/packages/" },
}

// The four steps of an order; this page is step 1
const STEPS = [
  ["Select Pack", "/home/selection-1.png"],
  ["Name Check", "/home/search.png"],
  ["File Details", "/home/search-1.png"],
  ["Checkout", "/home/security.png"],
]

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
          <ol className="mx-auto mt-10 grid max-w-3xl grid-cols-4 gap-2 sm:gap-6">
            {STEPS.map(([label, icon], i) => (
              <li key={label} className="relative flex flex-col items-center">
                {i > 0 && <span className="absolute right-1/2 top-7 -z-10 h-0.5 w-full bg-white/25" aria-hidden />}
                <span
                  className={`flex size-14 items-center justify-center rounded-full ${
                    i === 0 ? "bg-linear-to-br from-brand-navy from-20% to-brand-blue ring-4 ring-brand-blue/30" : "bg-white/15"
                  }`}
                >
                  <Image src={icon} alt="" width={512} height={512} className={`size-7 ${i === 0 ? "brightness-0 invert" : "opacity-70 brightness-0 invert"}`} />
                </span>
                <span className={`mt-3 text-xs font-semibold sm:text-sm ${i === 0 ? "text-white" : "text-white/60"}`}>
                  {i + 1}. {label}
                </span>
              </li>
            ))}
          </ol>
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
