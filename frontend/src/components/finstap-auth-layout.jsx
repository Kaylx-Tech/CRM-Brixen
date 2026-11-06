import { FinstapLogo } from "@/components/finstap-brand"
import { subdomainWorkspace } from "@/lib/workspace"
import { LegalLinks } from "@/Pages/Legal/LegalLayout"

/**
 * Finstap sign-in pages (login, signup, password): one card in the middle of the page with the logo above it,
 * on a quiet background with a faint glow of the logo's blue and purple; the legal links at the bottom.
 * The card floats like the modals (fs-auth-card in index.css).
 */
export function FinstapAuthLayout({ title, subtitle, children, footer }) {
  const companyPage = Boolean(subdomainWorkspace())
  return (
    <div className="fs-auth-page relative flex min-h-screen w-full flex-col items-center bg-muted/40 px-4 py-10 sm:py-14">
      <div className="flex w-full flex-1 flex-col items-center justify-center">
        {/* Dark text logo on light pages, white text logo in dark mode; a company's own address
            (acme.finstap.com) shows that company's logo once it has uploaded one */}
        <FinstapLogo company={companyPage} className="mb-7 h-12 max-w-[220px] dark:hidden" />
        <FinstapLogo company={companyPage} light className="mb-7 hidden h-12 max-w-[220px] dark:block" />

        <div className="fs-auth-card w-full max-w-[420px] rounded-3xl bg-card p-7 sm:p-8">
          <div className="mb-6 flex flex-col items-center gap-1.5 text-center">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-balance text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
      <div className="mt-10 flex flex-col items-center gap-2 text-xs text-muted-foreground">
        <LegalLinks />
        <p>© 2026 Finstap. All rights reserved.</p>
      </div>
    </div>
  )
}

/** The brand gradient for the main button on Finstap sign-in pages. */
export const FINSTAP_CTA =
  "border-0 bg-linear-to-r from-[#297bff] to-[#834aff] text-white hover:opacity-90"
