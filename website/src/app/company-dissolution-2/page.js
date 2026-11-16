import ServicePage, { serviceMetadata } from "@/components/ServicePage"
import { serviceByPath } from "@/lib/services"

const service = serviceByPath("/company-dissolution-2/")
export const metadata = serviceMetadata(service)

export default function Page() {
  return <ServicePage service={service} />
}
