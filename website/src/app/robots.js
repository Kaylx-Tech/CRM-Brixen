import { SITE } from "@/lib/site"

/** /robots.txt. While the new site runs on a test address it is hidden from search engines; set SITE_LIVE=1 on the
 *  real brixenconsultants.com deploy to let them in. */
export default function robots() {
  if (process.env.SITE_LIVE !== "1") {
    return { rules: { userAgent: "*", disallow: "/" } }
  }
  return { rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE.url}/sitemap.xml` }
}
