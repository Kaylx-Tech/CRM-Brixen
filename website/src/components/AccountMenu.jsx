"use client"

import Link from "next/link"
import { useCart } from "@/lib/cart"

function Icon({ d, className = "size-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}

export const USER_ICON = "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"
export const CART_ICON = "M3 4h2l2.4 11h10.2L20 8H6.2M10 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm7 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"

/** How many unfinished orders are in "My Cart" (shown as a small number on the cart icon). */
export function CartCount({ className = "" }) {
  const items = useCart()
  if (!items.length) return null
  return (
    <span className={`flex min-w-5 items-center justify-center rounded-full bg-brand-teal px-1.5 text-[11px] font-bold leading-5 text-white ${className}`}>
      {items.length}
    </span>
  )
}

/** "My Account" in the top strip: a plain link to the My Account page (sign in there, or the account when signed in). */
export default function AccountMenu() {
  return (
    <Link href="/my-account/" className="flex items-center gap-1.5 opacity-90 hover:opacity-100">
      <Icon d={USER_ICON} className="size-3.5" />
      My Account
    </Link>
  )
}
