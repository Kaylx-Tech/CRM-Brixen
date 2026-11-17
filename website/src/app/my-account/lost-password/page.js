import { LostPassword } from "@/components/account/PasswordForms"
import { PageHero } from "@/components/PageParts"

export const metadata = {
  title: "Forgot Your Password",
  description: "Choose a new password for your Brixen Consultants account.",
  alternates: { canonical: "/my-account/lost-password/" },
  robots: { index: false, follow: true },
}

export default function LostPasswordPage() {
  return (
    <>
      <PageHero eyebrow="My Account" title="Forgot your" highlight="password?" text="We will email you a link to choose a new one." />
      <section className="bg-brand-mist py-12 sm:py-16">
        <div className="px-4 sm:px-6">
          <LostPassword />
        </div>
      </section>
    </>
  )
}
