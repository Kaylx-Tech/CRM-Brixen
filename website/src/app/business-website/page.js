import ServicePage, { serviceMetadata } from "@/components/ServicePage"
import { serviceByPath } from "@/lib/services"

const service = serviceByPath("/business-website/")
export const metadata = serviceMetadata(service)

export default function Page() {
  return <ServicePage service={service} />
}
