import { fileURLToPath, URL } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import tailwindcss from '@tailwindcss/vite'
import { jsxcanvas } from '@jsxcanvas/vite'

export default defineConfig({
  plugins: [react(), tailwindcss(), jsxcanvas()],
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
})