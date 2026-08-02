/// <reference types="vitest/config" />
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Local HTTPS, if certificates have been made (see `docs/phone.md`).
 *
 * A phone will not install a PWA, register a service worker, or run one over
 * plain HTTP — `localhost` is the single exemption, and the phone is not
 * localhost. So reaching the app from a phone means a certificate the phone
 * trusts, which is what mkcert produces.
 *
 * Optional rather than required: the certificates are gitignored and
 * machine-specific, so a checkout without them must still run `npm run dev`.
 */
function localHttps(): { key: Buffer; cert: Buffer } | undefined {
  const certs = fileURLToPath(new URL('./certs/', import.meta.url))
  const key = `${certs}dev-key.pem`
  const cert = `${certs}dev-cert.pem`

  if (!existsSync(key) || !existsSync(cert)) return undefined
  return { key: readFileSync(key), cert: readFileSync(cert) }
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The service worker is generated for us (Workbox `generateSW`). Writing
      // one by hand would mean owning cache invalidation, and a reading app
      // that serves a stale build after an update is a bug with no visible
      // cause.
      registerType: 'autoUpdate',

      // We register the worker ourselves (`app/updates.ts`). The script this
      // would otherwise inject only checks for updates on the `load` event —
      // and an installed app that is suspended and resumed never loads again,
      // so it would never update. See that file.
      injectRegister: null,

      // The books live in IndexedDB, which the service worker never touches.
      // This precache is only the app *shell* — the code needed to open a book
      // that is already on the phone.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // pdf.js is 434 kB and mammoth 500 kB. Precaching them would triple the
        // install download to support importing a format this reader may never
        // use again on the phone; they stay fetched-on-demand, which is what
        // the lazy `import()` already arranges.
        globIgnores: ['**/pdf-*.js', '**/mammoth*.js'],
        // Any deep link (`/book/abc`) must resolve to the app shell offline —
        // otherwise reopening an installed app on the reader screen 404s.
        navigateFallback: 'index.html',
      },

      // Off during development on purpose. A service worker that caches while
      // you are editing is a source of "why didn't my change appear?" that
      // costs more time than it saves.
      devOptions: { enabled: false },

      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],

      manifest: {
        name: 'Reading Buddy',
        // What fits under a home-screen icon — anything longer is truncated by
        // the launcher anyway.
        short_name: 'Reading',
        description: 'A quiet reading desk, with a tutor when you want one.',
        // Relative, so the app works served from a subpath as well as a root.
        start_url: '.',
        scope: '.',
        // No browser chrome: the reading screen is the whole point, and an
        // address bar eating 60 px of a phone screen is 60 px of book.
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#14130f',
        theme_color: '#14130f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            // Android crops icons to the launcher's own shape. Without a
            // maskable icon it crops the normal one and clips the mark.
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
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
  server: {
    // The phone reaches the dev server over the LAN, so it must not bind to
    // localhost only. See `docs/phone.md` for the certificate half.
    host: true,
    https: localHttps(),
  },
  // The same on `vite preview`, which is how the *built* app — the one with a
  // real service worker — gets tested on the phone. `npm run dev` never has one.
  preview: {
    host: true,
    https: localHttps(),
  },
  test: {
    // Node is enough for now: the structure layer is pure functions. Swap to
    // 'jsdom' when the first component test lands.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
