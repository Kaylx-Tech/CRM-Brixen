import MyAccount from "@/components/account/MyAccount"
import { PageHero } from "@/components/PageParts"

export const metadata = {
  title: "My Account",
  description: "Sign in to your Brixen Consultants account: your orders, invoices, messages and files.",
  alternates: { canonical: "/my-account/" },
  robots: { index: false, follow: true },
}

export default function MyAccountPage() {
  return (
    <>
      <PageHero eyebrow="Client Panel" title="My" highlight="Account" text="Your orders, invoices, messages and files in one place." />
      <section className="bg-brand-mist py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <MyAccount />
        </div>
      </section>
    </>
  )
}
