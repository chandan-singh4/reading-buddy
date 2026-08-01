import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// PWA is wired but intentionally left unconfigured — manifest, icons, caching
// strategy and offline behaviour are a later waypoint. `devOptions.enabled` is
// off so the service worker never gets in the way during development.
export default defineConfig({
  plugins: [react(), VitePWA({ devOptions: { enabled: false } })],
})
