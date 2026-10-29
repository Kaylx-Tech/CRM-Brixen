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
    // Dev only: the JSXCanvas overlay loads Monaco, which sets a global AMD `define`. Libraries with a
    // UMD wrapper (recharts' decimal.js-light) then register there instead of exporting, and charts crash
    // with "import_decimal.default is not a constructor". Pre-bundled libraries never see `define`.
    rolldownOptions: {
      transform: { define: { define: 'undefined' } },
    },
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
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5050',
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