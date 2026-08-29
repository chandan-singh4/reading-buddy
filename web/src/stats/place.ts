/**
 * Where the reader is, shared between the screen that knows and the clock that
 * records.
 *
 * A module-level variable, which is normally the wrong tool and is the right
 * one here. The reading clock now runs above the router (`useReadingClock`),
 * because a visit to a book is one session across the reading screen, the book
 * details, the chapter summaries and the rest. Only the reading screen knows
 * which chapter is open — and it unmounts every time the reader taps into one
 * of the others, so React state cannot carry the fact across.
 *
 * Kept with the book id it describes. Without that, closing one book and
 * opening another would file the first book's chapter against the second
 * book's session for as long as it took the new screen to render.
 */

import type { Place } from './timer.ts'
import type { BookId } from '../structure/index.ts'

let current: { bookId: BookId; place: Place } | undefined

/** Called by the reading screen whenever the page turns. */
export function reportPlace(bookId: BookId, place: Place): void {
  current = { bookId, place }
}

/** The place, but only if it is a place in `bookId`. */
export function placeIn(bookId: BookId): Place | undefined {
  return current?.bookId === bookId ? current.place : undefined
}

/** Tests only — the variable outlives a test file otherwise. */
export function forgetPlace(): void {
  current = undefined
}
