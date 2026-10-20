import whiteLogo from "../assets/white-logo.webp"
import { IconCircleCheck } from "@tabler/icons-react"
import { FieldDescription } from "@/components/ui/field"
import { FinstapLogo } from "@/components/finstap-brand"
import { IS_FINSTAP } from "@/lib/workspace"

const FINSTAP_POINTS = [
  "Clients, companies and directors in one place",
  "Orders, invoices and payments that track themselves",
  "Companies House deadlines and reminders",
]

function BrandPanel() {
  if (IS_FINSTAP) {
    return (
      <div className="max-w-[480px] space-y-5">
        <FinstapLogo light className="mb-6" />
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.2]">
          Run your whole practice
          <br />
          on Finstap
        </h1>
        <ul className="space-y-2.5 text-blue-100/85">
          {FINSTAP_POINTS.map((p) => (
            <li key={p} className="flex items-start gap-2.5">
              <IconCircleCheck className="mt-0.5 size-5 shrink-0 text-blue-200" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <div className="max-w-[480px] space-y-4">
      <img src={whiteLogo} alt="Brixen Logo" className="w-auto mb-6 h-16" />
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.2]">
        Grow your practice with
        <br />
        the Brixen portal
      </h1>
      <p className="text-md text-blue-100/80">
        Access your CRM dashboard to track orders, manage clients, and run compliance work in
        one place.
      </p>
    </div>
  )
}

// Same split screen as the login page: brand panel on the left half, the card content on the right
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen w-full md:grid-cols-2">
      <div className="relative hidden md:flex flex-col justify-center p-12 lg:p-16 bg-linear-to-br from-slate-900 via-blue-900 to-blue-950 text-white">
        <BrandPanel />
      </div>
      <div className="flex flex-col items-center justify-center gap-6 p-6 md:p-10">
        {IS_FINSTAP && <FinstapLogo className="md:hidden" />}
        <div className="w-full max-w-sm">
          <div className="flex flex-col py-8 items-center gap-2 text-center">
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-balance text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer}
        <FieldDescription className="px-6 text-center">
          {IS_FINSTAP ? "© 2026 Finstap. All rights reserved." : "© 2026 Brixen Consultants Ltd. All rights reserved."}
        </FieldDescription>
      </div>
    </div>
  )
}
