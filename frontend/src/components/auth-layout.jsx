import whiteLogo from "../assets/white-logo.webp"
import brixenLogoDark from "../assets/brixen-logo.png"
import { FieldDescription } from "@/components/ui/field"
import { useLightOnly } from "@/hooks/theme-provider"

// Same split screen as the login page: brand panel on the left half, the card content on the right.
// Always light, like the login page.
export function AuthLayout({ title, subtitle, children }) {
  useLightOnly()
  return (
    <div className="grid min-h-screen w-full bg-background md:grid-cols-2">
      <div className="relative hidden md:flex flex-col justify-center p-12 lg:p-16 bg-linear-to-br from-slate-900 via-blue-900 to-blue-950 text-white">
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
      </div>
      <div className="flex flex-col items-center justify-center gap-6 p-6 md:p-10">
        <div className="w-full max-w-sm">
          <div className="flex flex-col py-8 items-center gap-2 text-center">
            {/* Phones hide the blue brand panel, so the logo sits above the form */}
            <img src={brixenLogoDark} alt="Brixen" className="mb-4 h-12 w-auto md:hidden" />
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-balance text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
        <FieldDescription className="px-6 text-center">
          © 2026 Brixen Consultants Ltd. All rights reserved.
        </FieldDescription>
      </div>
    </div>
  )
}
