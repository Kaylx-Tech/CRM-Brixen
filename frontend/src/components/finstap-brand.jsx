import { cn } from "cn"
import finstapLogo from "@/assets/finstap-logo.svg"
import finstapLogoLight from "@/assets/finstap-logo-light.svg"
import finstapMark from "@/assets/finstap-mark.svg"
import { useBranding } from "@/lib/branding"

// Brand gradient from the logo: blue → violet
export const FINSTAP_GRADIENT = "bg-linear-to-br from-[#297bff] via-[#5f5cff] to-[#834aff]"

/**
 * Finstap logo: full wordmark (dark text, or white with `light`), or the symbol alone with `mark`.
 * When the company uploaded its own logo (Settings → Branding) that is shown instead, unless
 * `company` is false: with `light` (dark backgrounds) its dark-background logo, or the normal logo
 * on a white chip so dark text stays readable.
 */
export function FinstapLogo({ className, light = false, mark = false, company = true }) {
  const brand = useBranding()
  const own = company ? (mark ? brand.icon || brand.logo : light ? brand.logoDark || brand.logo : brand.logo) : ""

  if (own) {
    const onChip = light && !mark && !brand.logoDark
    const img = (
      <img
        src={own}
        alt="Company logo"
        className={cn("w-auto max-w-[180px] object-contain", mark ? "h-10" : "h-9", !onChip && className)}
      />
    )
    // The chip keeps the caller's spacing and visibility classes; the image keeps the height
    const chipClass = String(className || "").split(/\s+/).filter((c) => c && !/^h-/.test(c)).join(" ")
    return onChip ? (
      <span className={cn("rounded-md bg-white px-3 py-1.5", chipClass || "inline-block")}>{img}</span>
    ) : img
  }

  const src = mark ? finstapMark : light ? finstapLogoLight : finstapLogo
  return (
    <img
      src={src}
      alt="Finstap"
      className={cn(mark ? "h-10 w-auto" : "h-9 w-auto", className, "h-11")}
    />
  )
}

/**
 * The logo at the top of the menu: large, with room around it and a soft shadow so it stands out on
 * the menu colour. A company logo made for light backgrounds sits on a white card.
 */
export function FinstapMenuLogo() {
  const brand = useBranding()
  const onCard = brand.logo && !brand.logoDark
  const src = brand.logoDark || brand.logo || finstapLogoLight

  return (
    <div className="flex w-full items-center justify-center px-1 pt-5 pb-4">
      {onCard ? (
        <span className="rounded-xl bg-white px-4 py-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.28)] ring-1 ring-white/30">
          <img src={src} alt="Company logo" className="block h-10 w-auto max-w-[180px] object-contain" />
        </span>
      ) : (
        <img
          src={src}
          alt={brand.logoDark ? "Company logo" : "Finstap"}
          className="h-12 w-auto max-w-[200px] object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.35)]"
        />
      )}
    </div>
  )
}
