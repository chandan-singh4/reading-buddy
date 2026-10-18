/**
 * Hold the screen awake while the reader is speaking.
 *
 * A phone dims and locks after twenty or thirty seconds of no touching, and
 * speaking is not touching. Without this the screen goes dark mid-thought, and
 * the live transcript — the thing that makes dictation feel like writing —
 * disappears exactly when it is being used.
 *
 * ## The lock does not survive a hidden page
 *
 * The browser takes the lock back whenever the page is hidden: another app, a
 * locked phone, a switched tab. It is not given back on return. So this also
 * listens for the page becoming visible again and asks a second time — which
 * is the difference between a lock that works and a lock that works once.
 *
 * Does nothing where the browser has no Wake Lock API. The dictation still
 * runs; the screen simply dims as it always did.
 */

import { useEffect } from 'react'

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const wakeLock = screenLock()
    if (!wakeLock) return

    let sentinel: WakeLockSentinelLike | null = null
    // The request is a promise, and the effect can be torn down before it
    // settles. Without this the lock would arrive after the reader stopped
    // speaking and nothing would ever release it.
    let finished = false

    async function hold(): Promise<void> {
      try {
        const granted = await wakeLock!.request('screen')
        if (finished) {
          await granted.release()
          return
        }
        sentinel = granted
      } catch {
        // Refused, or the document was not visible at the moment of asking.
        // Nothing to do: the screen dims, and the words are still being kept.
      }
    }

    function onVisibilityChange(): void {
      if (document.visibilityState !== 'visible') return
      if (sentinel && !sentinel.released) return
      void hold()
    }

    void hold()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      finished = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void sentinel?.release().catch(() => {
        // Already gone — the browser takes it back on its own terms.
      })
      sentinel = null
    }
  }, [active])
}

function screenLock(): WakeLockLike | null {
  if (typeof navigator === 'undefined') return null
  const holder = navigator as unknown as { wakeLock?: WakeLockLike }
  return holder.wakeLock ?? null
}

/* ---- the parts of the Screen Wake Lock API this file touches ---- */

interface WakeLockSentinelLike {
  readonly released: boolean
  release(): Promise<void>
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>
}
