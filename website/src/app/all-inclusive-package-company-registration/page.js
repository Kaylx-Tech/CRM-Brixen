import RegistrationPage, { registrationMetadata } from "@/components/order/RegistrationPage"

export const metadata = registrationMetadata("all-inclusive")

export default function Page() {
  return <RegistrationPage slug="all-inclusive" />
}
