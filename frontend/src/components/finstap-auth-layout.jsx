import { cn } from "cn"
import { FinstapLogo, FINSTAP_GRADIENT } from "@/components/finstap-brand"
import { subdomainWorkspace } from "@/lib/workspace"
import authIllustration from "@/assets/finstap-auth-illustration.png"
import { LegalLinks } from "@/Pages/Legal/LegalLayout"

function BrandPanel() {
  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden p-6 lg:p-10",
        FINSTAP_GRADIENT,
      )}
    >
      {/* Soft light shapes behind the card */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-white/15 blur-3xl"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-20 size-96 rounded-full bg-[#297bff]/40 blur-3xl"
      />

      {/* The illustration card carries its own heading and dots */}
      <img
        src={authIllustration}
        alt="Accounting made simple: track your numbers with confidence"
        className="relative max-h-full w-auto max-w-full object-contain drop-shadow-2xl"
      />
    </div>
  )
}

/** Finstap sign-in pages: the form on the left half, the brand panel on the right half. */
export function FinstapAuthLayout({ title, subtitle, children, footer }) {
  const companyPage = Boolean(subdomainWorkspace())
  return (
    <div className="grid min-h-screen w-full bg-background md:grid-cols-2">
      <div className="flex flex-col items-center justify-center px-6 py-10 md:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            {/* Dark text logo on light pages, white text logo in dark mode; a company's own address
                (acme.finstap.com) shows that company's logo once it has uploaded one */}
            <FinstapLogo company={companyPage} className="mb-6 h-9 dark:hidden" />
            <FinstapLogo company={companyPage} light className="mb-6 hidden h-9 dark:block" />
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-balance text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
        <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground mt-20">
          <LegalLinks />
          <p>© 2026 Finstap. All rights reserved.</p>
        </div>
      </div>
      {/* Stays one screen tall while a long form (signup) scrolls */}
      <div className="hidden md:sticky md:top-0 md:flex md:h-screen">
        <BrandPanel />
      </div>
    </div>
  )
}

/** The brand gradient for the main button on Finstap sign-in pages. */
export const FINSTAP_CTA =
  "border-0 bg-linear-to-r from-[#297bff] to-[#834aff] text-white hover:opacity-90"
