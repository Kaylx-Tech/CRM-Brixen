import { fileURLToPath, URL } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import tailwindcss from '@tailwindcss/vite'
import { jsxcanvas } from '@jsxcanvas/vite'

const FINSTAP_TITLE = 'Finstap — Practice management CRM'
const FINSTAP_DESCRIPTION = 'Practice management CRM for accountants: customers, UK companies, orders, invoices and compliance deadlines in one place.'

/**
 * The Finstap build writes its own name, tab icons and link-preview tags into index.html itself, so the
 * Brixen ones never show while the app loads, and WhatsApp / Slack / Google (which do not run the app's
 * JavaScript) see Finstap when a link is shared.
 */
function productHtml(env) {
  const domain = env.VITE_TENANT_DOMAIN || 'finstap.com'
  const image = `https://${domain}/finstap-og.png`
  return {
    name: 'product-html',
    transformIndexHtml(html) {
      if (env.VITE_PRODUCT !== 'finstap') return html
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
      const meta = [
        `<meta name="description" content="${esc(FINSTAP_DESCRIPTION)}" />`,
        '<meta name="theme-color" content="#6559ff" />',
        '<meta property="og:type" content="website" />',
        '<meta property="og:site_name" content="Finstap" />',
        `<meta property="og:title" content="${esc(FINSTAP_TITLE)}" />`,
        `<meta property="og:description" content="${esc(FINSTAP_DESCRIPTION)}" />`,
        `<meta property="og:image" content="${image}" />`,
        '<meta property="og:image:width" content="1200" />',
        '<meta property="og:image:height" content="630" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        `<meta name="twitter:title" content="${esc(FINSTAP_TITLE)}" />`,
        `<meta name="twitter:description" content="${esc(FINSTAP_DESCRIPTION)}" />`,
        `<meta name="twitter:image" content="${image}" />`,
      ].join('\n    ')
      return html
        // Tags may carry extra attributes (dev tools add some), so match the tag, not exact text
        .replace(/<html\b/, '<html data-product="finstap"')
        .replace(/<title\b[^>]*>[^<]*<\/title>/, `<title>${esc(FINSTAP_TITLE)}</title>\n    ${meta}`)
        .replace(/href="\/(favicon-32\.png|favicon-192\.png|favicon\.ico|apple-touch-icon\.png)"/g, 'href="/finstap-$1"')
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), jsxcanvas(), productHtml(loadEnv(mode, process.cwd(), ''))],
  define: {
    'import.meta.env.VITE_ROOT': JSON.stringify(process.cwd()),
  },
  optimizeDeps: {
    include: ['@react-trace/kit', 'react-is'],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL('./src', import.meta.url)),
      // Route all `sonner` imports to the app toast system (loading / action / Undo)
      sonner: fileURLToPath(new URL('./src/components/ui/toast.jsx', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Local tests of Finstap company subdomains (acme.localhost) need these names accepted
    allowedHosts: ['.localhost'],
    proxy: {
      '/api': {
        // VITE_PROXY_TARGET lets a second local API run alongside (e.g. a Finstap test backend)
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:5050',
        changeOrigin: true,
        secure: false,
      },
    },
    watch: {
      // Ignore binary font files — fixes EBUSY lock error on Windows
      ignored: ['**/*.OTF', '**/*.TTF', '**/*.WOFF', '**/*.WOFF2'],
    },
  },
}))