import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.jsx'
import Trace from '@react-trace/kit'

// The Finstap build's title, tab icons, link-preview tags and colours (data-product="finstap") are
// written into index.html at build time (vite.config.js productHtml), so nothing is swapped here

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
