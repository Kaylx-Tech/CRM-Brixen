import ServicePage, { serviceMetadata } from "@/components/ServicePage"
import { serviceByPath } from "@/lib/services"

const service = serviceByPath("/directors-appointment-or-resignation/")
export const metadata = serviceMetadata(service)

export default function Page() {
  return <ServicePage service={service} />
}
