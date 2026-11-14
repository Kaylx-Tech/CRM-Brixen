import Link from "next/link"
import { notFound } from "next/navigation"
import { PAGES, SITE, pageByPath } from "@/lib/site"

// Every page from the WordPress site keeps its address. Until its real content is built (one page at a time, each in
// its own folder, which then takes over from this one), the address shows a short holding page.
export const dynamicParams = false

export function generateStaticParams() {
  return PAGES.map((p) => ({ slug: p.path.split("/").filter(Boolean) }))
}

const pathOf = (slug) => `/${slug.join("/")}/`

export async function generateMetadata({ params }) {
  const { slug } = await params
  const page = pageByPath(pathOf(slug))
  if (!page) return {}
  return {
    title: page.title,
    description: `${page.title} from ${SITE.name}: ${SITE.tagline}.`,
    alternates: { canonical: page.path },
    robots: page.index ? undefined : { index: false, follow: true },
  }
}

export default async function HoldingPage({ params }) {
  const { slug } = await params
  const page = pageByPath(pathOf(slug))
  if (!page) notFound()
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
      <p className="text-sm font-bold uppercase tracking-widest text-brand-teal">Brixen Consultants</p>
      <h1 className="mt-3 text-4xl font-extrabold text-brand-navy">{page.title}</h1>
      <p className="mt-4 text-brand-slate">This page is being moved to our new website. Please contact us in the meantime.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/contact/" className="rounded-full bg-brand-blue px-6 py-3 font-semibold text-white hover:bg-brand-navy">
          Contact Us
        </Link>
        <a href={SITE.phoneHref} className="rounded-full border border-slate-200 px-6 py-3 font-semibold text-brand-navy">
          {SITE.phone}
        </a>
      </div>
    </section>
  )
}
