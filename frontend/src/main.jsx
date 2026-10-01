import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.jsx'

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
  </StrictMode>,
)
