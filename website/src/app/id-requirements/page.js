import { LegalDocument, PageHero } from "@/components/PageParts"
import { SERVICE_CONTENT } from "@/lib/service-content"

export const metadata = {
  title: "ID Requirements",
  description:
    "Which identity, KYC and anti-money laundering checks Brixen Consultants carries out, who must supply ID, and which documents we accept.",
  alternates: { canonical: "/id-requirements/" },
}

export default function IdRequirementsPage() {
  return (
    <>
      <PageHero eyebrow="Know Your Customer" title="ID" highlight="Requirements" text="The checks the law asks us to carry out, who needs to supply ID, and which documents we accept." />
      <LegalDocument blocks={SERVICE_CONTENT["id-requirements"].body} />
    </>
  )
}
