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
 * The reload used to be automatic (`registerType: 'autoUpdate'`). It is now
 * asked for: the app blinking and reloading underneath someone reading, with no
 * explanation, is startling however quickly it is over — and the reader asked
 * for the moment to be given some character rather than hidden. So a new build
 * waits behind a panel, and nothing happens until it is accepted.
 *
 * This module is the plumbing only. It knows when an update is ready and how to
 * apply it, and nothing about what that looks like; `app/UpdatePrompt.tsx` is
 * the other half.
 */

import { registerSW } from 'virtual:pwa-register'

/**
 * A slow background check, for the reader who leaves the app open for hours.
 * Hourly rather than every few minutes: the cost of being an hour behind is
 * nil, and every check is a network request made on someone's phone battery.
 */
const CHECK_EVERY_MS = 60 * 60 * 1000

/**
 * Applies the waiting update and reloads. Set once a build is ready, `null`
 * whenever there is nothing to apply — so the panel can never offer a reload
 * that would do nothing.
 */
let apply: (() => void) | null = null

/** Called when a build is ready and waiting. */
export type OnUpdateReady = () => void

const listeners = new Set<OnUpdateReady>()

/**
 * Be told when a new build is ready.
 *
 * Returns an unsubscribe. A listener that arrives *after* the update was found
 * is told immediately rather than waiting for an event that has already been
 * and gone — the check runs at startup, so on a slow first render the panel can
 * easily subscribe second.
 */
export function onUpdateReady(listener: OnUpdateReady): () => void {
  listeners.add(listener)
  if (apply) listener()
  return () => listeners.delete(listener)
}

/**
 * How long to wait for the swap to reload the page before doing it ourselves.
 *
 * Taking an update is not one step but two: the waiting worker is told to take
 * over, and the page reloads once it *has*. The second step is a browser event,
 * and a phone reported it never arriving — leaving a panel that had already done
 * its job sitting there looking broken, however many times it was tapped.
 *
 * Long enough that the normal path always wins the race, short enough that a
 * reader is not left staring at a dead button.
 */
const RELOAD_BY_MS = 4000

/** Take the waiting build. Does nothing if none is waiting. */
export function applyUpdate(): void {
  apply?.()
}

export function watchForUpdates(): void {
  if (!('serviceWorker' in navigator)) return

  const updateSW = registerSW({
    immediate: true,

    // Only ever called under `registerType: 'prompt'`. The new worker is
    // installed and waiting; nothing changes until `applyUpdate` runs.
    onNeedRefresh() {
      apply = () => {
        // Once only. Tapping again cannot help — the worker has already been
        // told — and a reader watching a panel that looks stuck will certainly
        // tap again.
        apply = null

        // `true` tells the waiting worker to take over, which reloads the page.
        // Landing back on the same paragraph is WP-15's doing — without saved
        // positions this would throw the reader back to chapter one.
        void updateSW(true)

        // The safety net. If the takeover reloaded us, this timer died with the
        // page and never ran; if it didn't, the reader gets their reload anyway
        // rather than a panel that no longer does anything.
        window.setTimeout(() => window.location.reload(), RELOAD_BY_MS)
      }
      for (const listener of listeners) listener()
    },

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
