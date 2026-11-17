import { ResetPassword } from "@/components/account/PasswordForms"
import { PageHero } from "@/components/PageParts"

export const metadata = {
  title: "Choose Your Password",
  description: "Choose a password for your Brixen Consultants account.",
  robots: { index: false, follow: false },
}

export default function ResetPasswordPage() {
  return (
    <>
      <PageHero eyebrow="My Account" title="Choose your" highlight="password" text="Then you go straight to your account." />
      <section className="bg-brand-mist py-12 sm:py-16">
        <div className="px-4 sm:px-6">
          <ResetPassword />
        </div>
      </section>
    </>
  )
}
