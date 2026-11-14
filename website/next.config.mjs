const PORTAL = process.env.NEXT_PUBLIC_PORTAL_URL || "https://portal.brixenconsultants.com"

// WordPress pages that are not rebuilt: theme demos and old account pages. Each sends visitors (and Google) to the
// right place with a permanent redirect, so old links keep working.
const DEMO_PAGES = [
  "/blog/", "/blog-grid/", "/blog-grid-2-columns/", "/blog-grid-4-columns-full-width/", "/blog-carousel/",
  "/portfolio-grid/", "/portfolio-grid-2-columns/", "/portfolio-grid-3-columns/", "/portfolio-carousel/",
  "/wishlist/", "/shop/", "/cart/",
]
const ACCOUNT_PAGES = [
  "/login/", "/login-2/", "/login-3/", "/register/", "/registration/", "/my-account/", "/my-account-2/",
  "/client-panel/", "/user/", "/lost-password/", "/password-reset/", "/logout/",
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker (website/Dockerfile): a small server with only the files it needs
  output: "standalone",
  // The same addresses as WordPress (/about/, /contact/ …), ending in a slash
  trailingSlash: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      { source: "/home-2/", destination: "/", permanent: true },
      ...DEMO_PAGES.map((source) => ({ source, destination: "/", permanent: true })),
      { source: "/customer-area/:path*", destination: `${PORTAL}/`, permanent: true },
      ...ACCOUNT_PAGES.map((source) => ({ source, destination: `${PORTAL}/`, permanent: false })),
    ]
  },
}

export default nextConfig
