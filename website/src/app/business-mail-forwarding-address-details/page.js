import ServiceOrderPage, { orderMetadata } from "@/components/order/ServiceOrderPage"
import { serviceByOrder } from "@/lib/services"

const service = serviceByOrder("business-mail-forwarding-address")
export const metadata = orderMetadata(service)

export default function Page() {
  return <ServiceOrderPage service={service} />
}
