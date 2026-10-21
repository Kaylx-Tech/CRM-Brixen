import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.jsx'
import { IS_FINSTAP } from './lib/workspace'
import Trace from '@react-trace/kit'

// The Finstap build names its own tab (index.html carries the Brixen title) and switches to its
// colours (index.css: [data-product="finstap"])
if (IS_FINSTAP) {
  document.title = 'Finstap — Practice management CRM'
  document.documentElement.dataset.product = 'finstap'
  // Finstap's own tab icons (index.html links the Brixen ones)
  const icons = [
    ['link[rel="icon"][sizes="32x32"]', '/finstap-favicon-32.png'],
    ['link[rel="icon"][sizes="192x192"]', '/finstap-favicon-192.png'],
    ['link[rel="shortcut icon"]', '/finstap-favicon.ico'],
    ['link[rel="apple-touch-icon"]', '/finstap-apple-touch-icon.png'],
  ]
  for (const [selector, href] of icons) {
    const link = document.querySelector(selector)
    if (link) link.href = href
  }
}

// Detect Apple devices (macOS, iOS, iPadOS) and set root class
if (typeof window !== 'undefined') {
  const isApple = /Mac|iPhone|iPod|iPad/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '')
  if (isApple) {
    document.documentElement.classList.add('is-apple')
    document.documentElement.classList.remove('is-non-apple')
  } else {
    document.documentElement.classList.add('is-non-apple')
    document.documentElement.classList.remove('is-apple')
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    {import.meta.env.DEV && <Trace root={import.meta.env.VITE_ROOT} />}
  </StrictMode>,
)
