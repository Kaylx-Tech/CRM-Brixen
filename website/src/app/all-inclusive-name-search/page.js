import NameSearchPage, { nameSearchMetadata } from "@/components/order/NameSearchPage"

export const metadata = nameSearchMetadata("all-inclusive")

export default function Page() {
  return <NameSearchPage slug="all-inclusive" />
}
