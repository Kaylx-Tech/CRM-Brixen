import RegistrationPage, { registrationMetadata } from "@/components/order/RegistrationPage"

export const metadata = registrationMetadata("digital")

export default function Page() {
  return <RegistrationPage slug="digital" />
}
