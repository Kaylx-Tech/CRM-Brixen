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
