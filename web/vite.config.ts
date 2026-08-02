/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// PWA is wired but intentionally left unconfigured — manifest, icons, caching
// strategy and offline behaviour are a later waypoint. `devOptions.enabled` is
// off so the service worker never gets in the way during development.
export default defineConfig({
  plugins: [react(), VitePWA({ devOptions: { enabled: false } })],
  resolve: {
    alias: {
      // mammoth's default entry is its Node build, which reads docx files from
      // disk and rejects the ArrayBuffer a browser file picker gives us. Point
      // at the prebuilt browser bundle instead — in the app *and* under test,
      // so the tests exercise the same code path the phone will run.
      // TypeScript still resolves the package's own types from the main entry.
      mammoth: 'mammoth/mammoth.browser.js',
    },
  },
  test: {
    // Node is enough for now: the structure layer is pure functions. Swap to
    // 'jsdom' when the first component test lands.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
