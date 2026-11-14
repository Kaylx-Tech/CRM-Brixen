import Image from "next/image"
import Link from "next/link"
import { FOOTER, SITE } from "@/lib/site"

/** Company details and contact on the left, then the service, package, banking and legal links. */
export default function SiteFooter() {
  return (
    <footer className="mt-auto bg-brand-navy text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
        <div>
          {/* The navy wordmark, turned white on the navy footer */}
          <Image src="/brand/brixen-wordmark.webp" alt="Brixen Consultants" width={790} height={316} className="h-12 w-auto brightness-0 invert" />
          <p className="mt-4 font-semibold">{SITE.legalName}</p>
          <p className="mt-1 text-sm text-white/70">Company Number: {SITE.companyNumber}</p>
          <p className="text-sm text-white/70">ICO Registration Number: {SITE.icoNumber}</p>
          <ul className="mt-5 space-y-2 text-sm text-white/85">
            <li>
              <a href={SITE.phoneHref} className="hover:text-white">
                {SITE.phone}
              </a>
            </li>
            <li>
              <a href={`mailto:${SITE.email}`} className="hover:text-white">
                {SITE.email}
              </a>
            </li>
            <li>
              <a href={SITE.mapUrl} target="_blank" rel="noreferrer" className="hover:text-white">
                {SITE.address}
              </a>
            </li>
          </ul>
          <div className="mt-5 flex gap-4 text-sm">
            {SITE.social.map(([label, href]) => (
              <a key={label} href={href} target="_blank" rel="noreferrer" className="text-white/80 hover:text-white">
                {label}
              </a>
            ))}
          </div>
        </div>
        {FOOTER.map((column) => (
          <div key={column.title}>
            <p className="text-sm font-bold">{column.title}</p>
            <ul className="mt-4 space-y-2 text-sm text-white/75">
              {column.items.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-white/60 sm:px-6">
          © {new Date().getFullYear()} {SITE.name} | All rights reserved.
        </p>
      </div>
    </footer>
  )
}
