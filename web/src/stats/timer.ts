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
import type { SessionActivity } from '../storage/db.ts'
import type { BookId } from '../structure/index.ts'

/** How often the growing row is written back. */
export const FLUSH_MS = 30_000

export interface ReadingSession {
  /** Write the final row and stop flushing. Safe to call twice. */
  stop: () => void
}

/**
 * What the reader is doing, when it is not turning pages.
 *
 * `reading` is the absence of an answer as much as an answer: the pages are
 * what a book is for, so a session settles on `reading` unless the reader spent
 * most of the visit somewhere else in the book.
 */
export type Activity = SessionActivity

/** Where the reader is, asked for fresh at every write. */
export interface Place {
  chapterTitle?: string
  sectionTitle?: string
  activity?: Activity
}

interface Options {
  store?: SessionStore
  now?: () => number
  /*
   * A function, not a value, and that is the whole point. The Reader starts one
   * session per visit and must not restart it every time a page turns — so the
   * position cannot be an argument or a dependency. Asking for it at each flush
   * keeps one long session that knows where it ended up.
   */
  place?: () => Place | undefined
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

  /*
   * Which screen of the book had the reader's time, and for how long.
   *
   * The session cannot be labelled by where it *ends*, which is what the last
   * write would give. A reader who reads a chapter and glances at the notes on
   * the way out read a chapter. So the active milliseconds between two writes
   * go to whatever screen was open at the first of them, and the longest total
   * names the session. The grain is one flush, which is coarse and enough — a
   * screen that held the reader for less than half a minute is not what the
   * visit was about.
   */
  /*
   * The reader opened the book, so the book opening is itself a sign of life.
   */
  let lastSeenAt = clock.openedAt

  const spent = new Map<Activity, number>()
  // Asked once here as well as at every write. Without it the first stretch of
  // every visit would go to the pages, and a reader who opened the book details
  // and nothing else would have half the visit filed as reading.
  let current: Activity = options.place?.()?.activity ?? 'reading'
  let counted = 0

  /** The screen with the most of the visit, or `undefined` for the pages. */
  const busiest = (): Activity | undefined => {
    let best: Activity | undefined
    let most = 0
    for (const [activity, ms] of spent) {
      if (ms > most) {
        most = ms
        best = activity
      }
    }
    return best === 'reading' ? undefined : best
  }

  const write = (): void => {
    const at = now()
    // The furthest the session got, not where it started: each write overwrites
    // the last, so the row ends up naming the place the reader left off.
    const place = options.place?.()

    const active = total(clock, at)
    spent.set(current, (spent.get(current) ?? 0) + (active - counted))
    counted = active
    current = place?.activity ?? 'reading'
    const activity = busiest()
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
      activeMs: active,
      // Spread conditionally: an absent title has to stay absent rather than
      // become `undefined`, which Dexie would store as a real field.
      ...(place?.chapterTitle ? { chapterTitle: place.chapterTitle } : {}),
      ...(place?.sectionTitle ? { sectionTitle: place.sectionTitle } : {}),
      ...(activity ? { activity } : {}),
      lastSeenAt,
    })
  }

  /*
   * The last touch, watched at the document rather than reported by each
   * screen. A page turn, a tap on the lamp, a word typed to Veda and a scroll
   * are all the same fact here — the reader is awake and holding the phone —
   * and one listener catches every one of them without a screen having to
   * remember to say so.
   *
   * Passive and on the capture phase, so nothing in the app can stop it and
   * nothing waits on it.
   */
  const touched = (): void => {
    lastSeenAt = now()
  }
  const TOUCHES = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
  for (const kind of TOUCHES) {
    document.addEventListener(kind, touched, { capture: true, passive: true })
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
    for (const kind of TOUCHES) {
      document.removeEventListener(kind, touched, { capture: true })
    }
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', write)
    write()
  }

  return { stop }
}
