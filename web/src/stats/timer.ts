/**
 * Starts a reading session when a book opens and stops it when the book
 * closes. The one thing in the app that writes to `sessions`.
 *
 * ## Why it writes repeatedly instead of once at the end
 *
 * A phone can kill a suspended tab without running any teardown at all. If the
 * row were written only on close, every session ended by the operating system
 * would vanish — and those are the long ones, at night, which is exactly the
 * reading the reader most wants counted.
 *
 * So the same row is written every `FLUSH_MS`, each time a little longer, and
 * once more on the way out. The id never changes, so this is one session that
 * grows, not a trail of fragments. A kill costs at most one flush interval.
 *
 * `visibilitychange` flushes too, because backgrounding is the last moment the
 * page is reliably alive — but it does **not** stop the session. Switching
 * apps for ten seconds mid-chapter is not closing the book.
 */

import { openClock, total, type Clock } from './clock.ts'
import { dayKey, sessionStore, type SessionStore } from './sessions.ts'
import type { BookId } from '../structure/index.ts'

/** How often the growing row is written back. */
export const FLUSH_MS = 30_000

export interface ReadingSession {
  /** Write the final row and stop flushing. Safe to call twice. */
  stop: () => void
}

interface Options {
  store?: SessionStore
  now?: () => number
}

/**
 * Begin a session for `bookId`. Call `stop()` when the book closes — the
 * Reader does this from an effect cleanup, so a back-swipe, a route change and
 * an unmount all end the session by the same path.
 */
export function startSession(bookId: BookId, options: Options = {}): ReadingSession {
  const store = options.store ?? sessionStore
  const now = options.now ?? Date.now

  const clock: Clock = openClock(now())
  const id = crypto.randomUUID()
  const day = dayKey(clock.openedAt)
  let stopped = false

  const write = (): void => {
    const at = now()
    // Deliberately not awaited anywhere. A flush that loses a race with the
    // next flush writes an older, shorter total over a newer one and is
    // corrected 30 seconds later; a flush that blocks the reading screen is a
    // stutter the reader can feel. The final write in `stop` is the one that
    // matters, and nothing races it.
    void store.put({
      id,
      bookId,
      day,
      startedAt: clock.openedAt,
      endedAt: at,
      activeMs: total(clock, at),
    })
  }

  const interval = setInterval(write, FLUSH_MS)

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') write()
  }
  document.addEventListener('visibilitychange', onVisibility)
  // `pagehide` rather than `beforeunload`: iOS Safari fires the former on a
  // real navigation away and frequently skips the latter altogether.
  window.addEventListener('pagehide', write)

  const stop = (): void => {
    if (stopped) return
    stopped = true
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', write)
    write()
  }

  return { stop }
}
