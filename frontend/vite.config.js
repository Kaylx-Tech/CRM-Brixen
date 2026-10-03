import { fileURLToPath, URL } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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