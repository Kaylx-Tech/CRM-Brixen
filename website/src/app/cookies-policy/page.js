import { LegalDocument, PageHero } from "@/components/PageParts"
import { LEGAL, legalMetadata } from "@/lib/legal"

export const metadata = legalMetadata("cookies-policy")

export default function Page() {
  const page = LEGAL["cookies-policy"]
  return (
    <>
      <PageHero eyebrow="Legal" title={page.title} highlight={page.highlight} />
      <LegalDocument blocks={page.blocks} />
    </>
  )
}
