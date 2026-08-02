/**
 * Keeping an installed app up to date.
 *
 * The bug this fixes, found on a real phone: a new build was published, the
 * reader closed the app and reopened it, and still saw the old version. Only
 * pulling down to refresh brought the new one.
 *
 * The reason is that closing an installed app doesn't end it. It is suspended
 * and resumed, so the page never loads again — and the generated registration
 * script only ran `navigator.serviceWorker.register` on the `load` event. No
 * load, no check, no update, forever. Pull-to-refresh worked because it forced
 * the load that closing the app never did.
 *
 * So the check has to be tied to something that *does* happen when someone
 * comes back to the app: the page becoming visible again.
 *
 * The reload itself is automatic (`registerType: 'autoUpdate'`, which lets the
 * new worker take over immediately). That is only tolerable because WP-15
 * exists — a reload puts the reader back on the same paragraph. Without saved
 * positions this would have to be a "new version available" prompt instead.
 */

import { registerSW } from 'virtual:pwa-register'

/**
 * A slow background check, for the reader who leaves the app open for hours.
 * Hourly rather than every few minutes: the cost of being an hour behind is
 * nil, and every check is a network request made on someone's phone battery.
 */
const CHECK_EVERY_MS = 60 * 60 * 1000

export function watchForUpdates(): void {
  if (!('serviceWorker' in navigator)) return

  registerSW({
    immediate: true,

    onRegisteredSW(_url, registration) {
      if (!registration) return

      const check = () => {
        void registration.update().catch(() => {
          // Offline, most likely — which is a normal state for this app, not a
          // problem. The next check will find it.
        })
      }

      // The one that actually matters. Returning to a suspended app fires this
      // and nothing else.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })

      window.setInterval(check, CHECK_EVERY_MS)
    },
  })
}
