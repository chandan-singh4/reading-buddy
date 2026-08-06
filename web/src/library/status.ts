/**
 * How far the reader has got with each book — the one derived fact the library
 * screen filters, sorts and labels on.
 *
 * Pure and tested on its own, like `app/homeShelves.ts`, and for the same
 * reason: this is the arithmetic that goes subtly wrong. A finished book still
 * offering "45% read", or a book never opened counted as "currently reading",
 * is the kind of bug that is invisible in a screenshot and obvious on a shelf.
 *
 * The definition of "finished" lives here and in `homeShelves.ts`, which
 * deliberately keeps its own copy of the threshold rather than importing this:
 * Home is about *shelving* books and the library is about *filtering* them, and
 * a future "mark as finished by hand" belongs to one of them before the other.
 */

import type { BookId, BookMeta } from '../structure/index.ts'
import type { ReadingPosition } from '../storage/index.ts'

/** At or above this percent, a book counts as finished rather than in progress. */
const FINISHED_AT = 100

export type ReadingStatus = 'unread' | 'reading' | 'finished'

/** What the library knows about one book's progress. */
export interface BookProgress {
  status: ReadingStatus
  /**
   * Whole-number percent, when it is known. `undefined` on a book that was
   * opened before percentages were recorded, or before its spine had built —
   * which is *not* the same as 0%, and must not be shown as one.
   */
  percent?: number
  /** ISO 8601, when the book was last opened. `undefined` if never. */
  openedAt?: string
}

const UNREAD: BookProgress = { status: 'unread' }

/**
 * Progress for every book that has ever been opened, keyed by id.
 *
 * Books never opened are deliberately absent rather than present as "unread":
 * `progressOf` supplies that, so the map stays a record of what actually
 * happened and callers can't accidentally iterate it as if it were the library.
 */
export function progressMap(
  positions: readonly ReadingPosition[],
): ReadonlyMap<BookId, BookProgress> {
  const map = new Map<BookId, BookProgress>()

  for (const position of positions) {
    const finished = position.percent !== undefined && position.percent >= FINISHED_AT
    map.set(position.bookId, {
      status: finished ? 'finished' : 'reading',
      ...(position.percent === undefined ? {} : { percent: position.percent }),
      openedAt: position.at,
    })
  }

  return map
}

/** One book's progress, treating "never opened" as unread. */
export function progressOf(
  book: BookMeta,
  progress: ReadonlyMap<BookId, BookProgress>,
): BookProgress {
  return progress.get(book.id) ?? UNREAD
}
