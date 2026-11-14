import { PAGES, SITE } from "@/lib/site"

/** /sitemap.xml: the home page and every page offered to search engines (order forms are left out). */
export default function sitemap() {
  return [
    { url: `${SITE.url}/`, changeFrequency: "weekly", priority: 1 },
    ...PAGES.filter((p) => p.index).map((p) => ({
      url: `${SITE.url}${p.path}`,
      changeFrequency: "monthly",
      priority: ["main", "packages"].includes(p.group) ? 0.8 : 0.6,
    })),
  ]
}
