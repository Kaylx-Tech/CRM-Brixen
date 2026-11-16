import { LegalDocument, PageHero } from "@/components/PageParts"
import { LEGAL, legalMetadata } from "@/lib/legal"

export const metadata = legalMetadata("gdpr-privacy-policy")

export default function Page() {
  const page = LEGAL["gdpr-privacy-policy"]
  return (
    <>
      <PageHero eyebrow="Legal" title={page.title} highlight={page.highlight} />
      <LegalDocument blocks={page.blocks} />
    </>
  )
}
