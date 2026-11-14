import RegistrationPage, { registrationMetadata } from "@/components/order/RegistrationPage"

export const metadata = registrationMetadata("professional")

export default function Page() {
  return <RegistrationPage slug="professional" />
}
