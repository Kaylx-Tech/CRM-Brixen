import Link from "next/link"

export const metadata = { title: "Page Not Found", robots: { index: false } }

export default function NotFound() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-28 text-center">
      <p className="text-6xl font-extrabold text-brand-blue">404</p>
      <h1 className="mt-4 text-3xl font-extrabold text-brand-navy">Page Not Found</h1>
      <p className="mt-3 text-brand-slate">The page you are looking for has moved or no longer exists.</p>
      <Link href="/" className="mt-8 inline-flex rounded-full bg-brand-blue px-6 py-3 font-semibold text-white hover:bg-brand-navy">
        Back to Home
      </Link>
    </section>
  )
}
