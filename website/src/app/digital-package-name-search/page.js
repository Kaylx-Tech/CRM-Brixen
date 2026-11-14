import NameSearchPage, { nameSearchMetadata } from "@/components/order/NameSearchPage"

export const metadata = nameSearchMetadata("digital")

export default function Page() {
  return <NameSearchPage slug="digital" />
}
