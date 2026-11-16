"use client"

import Link from "next/link"
import { removeFromCart, useCart } from "@/lib/cart"
import { SITE } from "@/lib/site"

/** The unfinished orders saved in this browser, each with Continue (back to its form) and Remove. */
export default function CartList() {
  const items = useCart()

  if (!items.length) {
    return (
      <div className="rounded-3xl bg-white px-6 py-14 text-center ring-1 ring-slate-100">
        <p className="font-display text-2xl font-bold text-brand-navy">Your cart is empty</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-brand-slate">
          Orders you start on this website and have not paid for yet are kept here, so you can finish them later.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/packages/" className="rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-6 py-3 font-semibold text-white hover:brightness-110">
            View Packages
          </Link>
          <Link href="/services/" className="rounded-md px-6 py-3 font-semibold text-brand-blue ring-1 ring-brand-blue/30 hover:bg-brand-mist">
            All Services
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-3xl bg-white ring-1 ring-slate-100">
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.key} className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-7">
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold text-brand-navy">{item.name}</p>
              {item.detail && <p className="truncate text-sm text-brand-slate">{item.detail}</p>}
            </div>
            {item.price && <p className="text-xl font-extrabold text-brand-blue">{item.price}</p>}
            <div className="flex w-full gap-2 sm:w-auto">
              <Link href={item.href} className="flex-1 rounded-md bg-linear-to-br from-brand-navy from-20% to-brand-blue px-5 py-2.5 text-center text-sm font-semibold text-white hover:brightness-110 sm:flex-none">
                Continue order
              </Link>
              <button type="button" onClick={() => removeFromCart(item.key)} className="rounded-md px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-red-600">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-slate-100 px-5 py-4 text-xs text-brand-slate sm:px-7">
        Your details are kept only in this browser until you pay. Paid orders are in{" "}
        <a href={`${SITE.portalUrl}/portal/orders`} className="font-semibold text-brand-blue hover:underline">
          My Orders
        </a>
        .
      </p>
    </div>
  )
}
