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
      // `prompt`, not `autoUpdate`. Under `autoUpdate` the new worker takes over
      // and the page reloads on its own — the app simply blinks and the reader
      // is somewhere slightly different with no idea why. Asking first is both
      // calmer and honest about what is happening, and it is the only mode that
      // calls `onNeedRefresh`, which is what the update panel waits on.
      registerType: 'prompt',

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

        // The narrator's worker bundles kokoro-js and is past Workbox's 2 MB
        // default. Precaching it is the point: the *weights* are runtime-cached
        // below, and a cached model with no code to run it is no narrator.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,

        /*
         * What makes the reading voice work with no connection.
         *
         * The model is not part of this build. Its weights come from the
         * Hugging Face hub and the ONNX runtime comes from a CDN, both fetched
         * by the worker the first time a reader presses Read aloud. Precaching
         * them is not an option — they are 86 MB, and an app install must not
         * cost that for a feature the reader may never use.
         *
         * So they are cached on the way past instead. First use downloads
         * them; every use after that, online or not, is served from here.
         *
         * `CacheFirst` and not `StaleWhileRevalidate`: these files are named by
         * a fixed model revision and never change under that name. Revalidating
         * them would be a network round trip per sentence, for an answer that
         * is always "unchanged".
         */
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) =>
              url.hostname === 'huggingface.co' || url.hostname === 'cdn-lfs.huggingface.co',
            handler: 'CacheFirst',
            options: {
              cacheName: 'narrator-model',
              // A year. The revision in the path is the real cache key; this is
              // only a floor under how long the browser may keep it.
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 365 },
              // The hub answers with a 200 or a redirect chain ending in one.
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            /*
             * The ONNX runtime, which Vite bundles from our own origin.
             *
             * 21 MB, and it must not be precached — that would put it in the
             * app's install, so every reader would download a speech runtime
             * whether or not they ever ask to be read to. Cached on the way
             * past instead, like the weights: paid for once by the reader who
             * presses Read aloud, free and offline for them ever after.
             */
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin && url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'narrator-runtime',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }: { url: URL }) => url.hostname === 'cdn.jsdelivr.net',
            handler: 'CacheFirst',
            options: {
              cacheName: 'narrator-runtime',
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      /*
       * ## Cross-origin isolation is deliberately NOT switched on
       *
       * Multithreaded wasm needs `COOP: same-origin` and `COEP`, and it would
       * make CPU synthesis several times faster. It is still off, for two
       * reasons that are worth writing down because the temptation to switch
       * it on will come back.
       *
       * `require-corp` would make the model unreachable: under it every
       * cross-origin response must carry a CORP header of its own, and the
       * Hugging Face hub does not send one. `credentialless` avoids that, and
       * is the version worth revisiting — but Safari ignores it, and switching
       * it on changes how *every* cross-origin request in the app is made, for
       * a speed-up that could not be measured here. The preview pane embeds the
       * page, so COOP never applied and `crossOriginIsolated` stayed false.
       *
       * Until it can be measured on a real device, the app runs single-threaded
       * wasm — which needs no headers at all — and WebGPU where the phone has
       * it. Both work. See `docs/decisions.md` for the measurement that is
       * still outstanding.
       */

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
  // `.env` lives at the repo root, next to `.env.example` — one file for the
  // whole project, because the same Supabase URL and key are read twice: by the
  // browser here, and by `api/r2/sign.ts` on the server, which has no idea
  // `web/` exists. Without this, Vite looks only in `web/` and silently finds
  // nothing, so the cloud option stays greyed out with every value filled in
  // correctly — a failure with no error message anywhere.
  //
  // This does not widen what reaches the browser. Vite still only exposes
  // `VITE_`-prefixed variables; `R2_SECRET_ACCESS_KEY` sitting in the same file
  // is loaded into the dev server's process and never compiled into the bundle.
  envDir: '..',
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
    /*
     * Four workers, not one per core.
     *
     * The component tests wait on real timers — a page turn, a fade, an indexed
     * read — with the generous-but-finite timeouts Testing Library gives them.
     * Run flat out, this suite starves its own workers: a different one or two
     * cases time out on each run, every one of them passes in isolation, and the
     * gate stops meaning anything. That has been true for a while and was
     * written down as "timing-sensitive under load"; adding a file finally made
     * it the common case rather than the occasional one.
     *
     * Capping the pool costs a few seconds and buys back the property the suite
     * is *for*: **a red run is now a real failure.** If one fails here, do not
     * re-run it hoping — find it.
     */
    maxWorkers: 4,
  },
})
