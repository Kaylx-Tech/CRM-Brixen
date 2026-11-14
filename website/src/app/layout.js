import { Inter, Red_Hat_Display } from "next/font/google"
import SiteHeader from "@/components/SiteHeader"
import SiteFooter from "@/components/SiteFooter"
import WhatsAppButton from "@/components/WhatsAppButton"
import { SITE } from "@/lib/site"
import "./globals.css"

// The WordPress site's fonts: Inter for text, Red Hat Display for headings
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" })
const redHat = Red_Hat_Display({ variable: "--font-heading", subsets: ["latin"], display: "swap" })

export const metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} | UK Company Formation & Business Services`,
    template: `%s | ${SITE.name}`,
  },
  description:
    "Form a UK limited company, get a registered office address, open a business bank account and keep your company compliant with Brixen Consultants.",
  openGraph: { siteName: SITE.name, type: "website", locale: "en_GB" },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${redHat.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <WhatsAppButton />
      </body>
    </html>
  )
}
