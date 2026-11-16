"use client"

import Link from "next/link"
import { ACCOUNT_MENU } from "@/lib/site"
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

/** How many unfinished orders are in "My Cart" (shown as a small number). */
export function CartCount({ className = "" }) {
  const items = useCart()
  if (!items.length) return null
  return (
    <span className={`flex min-w-5 items-center justify-center rounded-full bg-brand-teal px-1.5 text-[11px] font-bold leading-5 text-white ${className}`}>
      {items.length}
    </span>
  )
}

/** One row of the menu: the portal pages open the CRM client portal, "My Cart" stays on the website. */
function Row({ label, href, icon, onClick }) {
  const inner = (
    <>
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-mist text-brand-blue">
        <Icon d={icon} />
      </span>
      <span className="flex-1">{label}</span>
      {href === "/cart/" && <CartCount />}
    </>
  )
  const cls = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-brand-mist hover:text-brand-blue"
  return href.startsWith("/") ? (
    <Link href={href} onClick={onClick} className={cls}>
      {inner}
    </Link>
  ) : (
    <a href={href} onClick={onClick} className={cls}>
      {inner}
    </a>
  )
}

/** "My Account" in the top strip with its dropdown (as WordPress: account home, orders, files, account, log out). */
export default function AccountMenu() {
  return (
    <div className="group relative">
      <a href={ACCOUNT_MENU[0][1]} className="flex items-center gap-1.5 opacity-90 hover:opacity-100">
        <Icon d={USER_ICON} className="size-3.5" />
        My Account
        <CartCount className="!min-w-4 !px-1 !text-[10px] !leading-4" />
        <svg aria-hidden viewBox="0 0 20 20" className="size-3.5 transition-transform group-hover:rotate-180">
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </a>
      <div className="invisible absolute right-0 top-full z-50 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <div className="w-64 rounded-2xl bg-white p-2 text-slate-800 shadow-[0_20px_50px_-20px_rgba(0,57,113,0.45)] ring-1 ring-slate-200">
          {ACCOUNT_MENU.map(([label, href, icon]) => (
            <Row key={label} label={label} href={href} icon={icon} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** The same links in the phone menu. */
export function AccountLinks({ onClick }) {
  return (
    <div className="grid gap-1">
      {ACCOUNT_MENU.map(([label, href, icon]) => (
        <Row key={label} label={label} href={href} icon={icon} onClick={onClick} />
      ))}
    </div>
  )
}
