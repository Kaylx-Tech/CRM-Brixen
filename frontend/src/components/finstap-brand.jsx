import { cn } from "cn"
import finstapLogo from "@/assets/finstap-logo.svg"
import finstapLogoLight from "@/assets/finstap-logo-light.svg"
import finstapMark from "@/assets/finstap-mark.svg"

// Brand gradient from the logo: blue → violet
export const FINSTAP_GRADIENT = "bg-linear-to-br from-[#297bff] via-[#5f5cff] to-[#834aff]"

/** Finstap logo: full wordmark (dark text, or white with `light`), or the symbol alone with `mark`. */
export function FinstapLogo({ className, light = false, mark = false }) {
  const src = mark ? finstapMark : light ? finstapLogoLight : finstapLogo
  return <img src={src} alt="Finstap" className={cn(mark ? "h-10 w-auto" : "h-9 w-auto", className)} />
}
