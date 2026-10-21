import { useEffect, useState } from "react"
import { cn } from "cn"
import { FinstapLogo, FINSTAP_GRADIENT } from "@/components/finstap-brand"

// Messages that rotate on the brand panel (the dots underneath switch them)
const SLIDES = [
  { title: "Your whole practice in one place", text: "Clients, companies and directors together in an easy dashboard." },
  { title: "Orders that track themselves", text: "Invoices, payments and progress updates without the paperwork." },
  { title: "Never miss a deadline", text: "Companies House accounts and confirmation statements on time, every time." },
]

function BrandPanel() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setActive((i) => (i + 1) % SLIDES.length), 6000)
    return () => clearInterval(timer)
  }, [active])

  const slide = SLIDES[active]
  return (
    <div className={cn("relative flex w-full flex-col overflow-hidden p-6 lg:p-10", FINSTAP_GRADIENT)}>
      {/* Soft light shapes behind the glass card */}
      <span aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-white/15 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 size-96 rounded-full bg-[#297bff]/40 blur-3xl" />

      <div className="relative flex flex-1 flex-col rounded-[2rem] border border-white/25 bg-white/10 p-8 shadow-2xl shadow-indigo-950/20 backdrop-blur-md lg:p-10">
        {/* Space kept for the illustration */}
        <div className="min-h-64 flex-1" data-slot="auth-illustration" />

        <div className="text-white">
          <h2 className="text-2xl font-bold tracking-tight lg:text-3xl">{slide.title}</h2>
          <p className="mt-2 max-w-md text-white/80">{slide.text}</p>
          <div className="mt-6 flex items-center gap-2">
            {SLIDES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                aria-label={`Show message ${i + 1}`}
                onClick={() => setActive(i)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === active ? "w-8 bg-white" : "w-2 bg-white/50 hover:bg-white/75"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Finstap sign-in pages: the form on the left half, the brand panel on the right half. */
export function FinstapAuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen w-full bg-background md:grid-cols-2">
      <div className="flex flex-col items-center justify-center px-6 py-10 md:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            {/* Dark text logo on light pages, white text logo in dark mode */}
            <FinstapLogo className="mb-6 h-9 dark:hidden" />
            <FinstapLogo light className="mb-6 hidden h-9 dark:block" />
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-balance text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
        <p className="mt-10 text-xs text-muted-foreground">© 2026 Finstap. All rights reserved.</p>
      </div>
      {/* Stays one screen tall while a long form (signup) scrolls */}
      <div className="hidden md:sticky md:top-0 md:flex md:h-screen">
        <BrandPanel />
      </div>
    </div>
  )
}

/** The brand gradient for the main button on Finstap sign-in pages. */
export const FINSTAP_CTA = "border-0 bg-linear-to-r from-[#297bff] to-[#834aff] text-white hover:opacity-90"
