import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { watchForUpdates } from './app/updates.ts'
import { applyStoredTheme } from './reader/readerSettings.ts'
import './index.css'

watchForUpdates()

// Before React renders anything, not after — see `applyStoredTheme`'s doc
// comment for why this used to only happen once a book was opened.
applyStoredTheme()

// The app restores its own position (`useRowMemory`). The browser's attempt
// runs while a screen is still loading and therefore still short, so what it
// restores is clamped to a page that doesn't exist yet — which is how coming
// back from a book landed at the bottom of the shelf.
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
