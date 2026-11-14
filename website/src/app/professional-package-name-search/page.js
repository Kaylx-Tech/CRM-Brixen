import NameSearchPage, { nameSearchMetadata } from "@/components/order/NameSearchPage"

export const metadata = nameSearchMetadata("professional")

export default function Page() {
  return <NameSearchPage slug="professional" />
}
