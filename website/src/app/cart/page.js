import CartList from "@/components/order/CartList"
import { PageHero } from "@/components/PageParts"

export const metadata = {
  title: "My Cart",
  description: "Finish the Brixen Consultants orders you started: company formation packages and services.",
  alternates: { canonical: "/cart/" },
  robots: { index: false, follow: true },
}

export default function CartPage() {
  return (
    <>
      <PageHero eyebrow="My Account" title="My" highlight="Cart" text="The orders you started and have not paid for yet. Continue where you left off." />
      <section className="bg-brand-mist py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <CartList />
        </div>
      </section>
    </>
  )
}
