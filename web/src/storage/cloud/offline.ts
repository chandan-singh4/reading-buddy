/**
 * Telling "there is no network" apart from "the answer is no".
 *
 * Lifted out of `cached.ts` so the write queue can use it too without the two
 * files importing each other. Both are still re-exported from `cached.ts`,
 * which is where they were first written and where they read most naturally.
 */

/**
 * The wordings browsers use for "there is no network", one per engine.
 *
 * Safari's is `Load failed`, which is both the vaguest and the one that matters
 * most here — it is what an iPhone says, and an iPhone on a train is the entire
 * reason this waypoint exists.
 */
const OFFLINE_HINTS = [
  'failed to fetch',
  'networkerror',
  'network request failed',
  'load failed',
  'the internet connection appears to be offline',
]

/**
 * Whether this failure is a missing network rather than a real answer.
 *
 * The distinction is load-bearing, and it is load-bearing twice over now. On the
 * read side, a lost signal should fall back to the copy while a book deleted on
 * another device must surface — falling back there would resurrect deleted books
 * and never stop. On the write side it decides whether a queued write is *kept*
 * and retried or *dropped*: a write the cloud genuinely refuses (a row RLS won't
 * have, a book that has since gone) would otherwise be retried for ever.
 *
 * `CloudError` keeps the original in `cause`, so the chain is walked rather
 * than just the top message. Five links is far more than any real chain and
 * stops a cyclic `cause` from hanging the reader.
 */
export function looksOffline(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; current && depth < 5; depth += 1) {
    // What `fetch` itself throws with nothing to connect to.
    if (current instanceof TypeError) return true
    const message = (current as { message?: unknown }).message
    if (typeof message === 'string') {
      const lower = message.toLowerCase()
      if (OFFLINE_HINTS.some((hint) => lower.includes(hint))) return true
    }
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/**
 * Whether the browser has already told us there is no connection.
 *
 * Guarded for the tests and for anything running outside a browser, where there
 * is no `navigator` — absent means "don't know", which correctly falls through
 * to asking the network.
 */
export function knownOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
