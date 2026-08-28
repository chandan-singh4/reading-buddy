/**
 * The reading clock. Pure arithmetic — no timers, no DOM, no storage.
 *
 * ## One session is one visit to a book
 *
 * It starts when the book opens and stops when the book closes. That is the
 * whole rule, and it is the reader's own: a half-hour spent arguing with Veda
 * about one paragraph is reading, and an idle-detector would have thrown it
 * away for looking like an idle phone.
 *
 * An earlier build paused after two minutes without a page turn. It was
 * removed on the reader's instruction. The trade is stated so nobody
 * reintroduces it by accident: this counts time *in the book*, which means a
 * book left open on a table counts too. See `MAX_SESSION_MS`.
 *
 * ## Why there is no interval
 *
 * Nothing here ticks. The total is a function of two timestamps, so a phone
 * that suspends the tab cannot accumulate anything on its own, and asking for
 * the total twice gives the same answer both times. `timer.ts` writes the row
 * repeatedly while a book is open, and each write simply overwrites the last
 * with a longer, still-truthful number.
 */

/**
 * The one guard on an open-ended clock: a single session is never credited
 * with more than this.
 *
 * Without it, a book left open overnight reports eight hours and every number
 * downstream is fiction. Six hours is above any real sitting and far below a
 * night, so it catches the phone-on-the-nightstand case and no honest one.
 *
 * It is a cap, not a pause — a reader who genuinely reads for seven hours is
 * credited with six, which is a far smaller error than crediting a sleeper.
 */
export const MAX_SESSION_MS = 6 * 60 * 60 * 1000

/**
 * The clock's whole state. A plain object rather than a class so it can be
 * snapshotted and rebuilt, which is what the flush in `timer.ts` relies on.
 */
export interface Clock {
  /** Epoch ms the book was opened. */
  readonly openedAt: number
}

export function openClock(now: number): Clock {
  return { openedAt: now }
}

/**
 * Milliseconds read as of `now`, capped.
 *
 * Tolerates a clock that went backwards — a device time change mid-session is
 * rare and real, and it must produce zero rather than a negative session.
 */
export function total(clock: Clock, now: number): number {
  return Math.min(Math.max(0, now - clock.openedAt), MAX_SESSION_MS)
}
