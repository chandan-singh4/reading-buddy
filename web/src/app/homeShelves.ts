/**
 * Which shelf each book belongs to on the Home screen, and in what order.
 *
 * Pure and tested on its own, the same way `reader/columns.ts` and
 * `reader/progress.ts` are — the arithmetic here is what would go subtly
 * wrong: a finished book still showing as "reading", or the wrong book
 * landing in Currently Reading when two were opened moments apart.
 */

import type { BookMeta } from '../structure/index.ts'
import type { ReadingPosition } from '../storage/db.ts'

/** At or above this percent, a book counts as finished rather than in progress. */
const FINISHED_AT = 100

/** How many books "Up Next" holds, after Currently Reading. */
const UP_NEXT_COUNT = 3

/** How many books the Unread shelf shows before "See all books" takes over. */
const UNREAD_LIMIT = 10

/** A book paired with how far into it the reader has got. */
export interface ShelfEntry {
  book: BookMeta
  /** `undefined` when the position predates percent, or the spine hadn't built yet. */
  percent?: number
}

export interface HomeShelves {
  currentlyReading: ShelfEntry | undefined
  upNext: ShelfEntry[]
  unread: BookMeta[]
  /** How many books are unread in total — `unread` itself is capped at 10. */
  unreadTotal: number
  finished: BookMeta[]
}

function isFinished(position: ReadingPosition): boolean {
  return position.percent !== undefined && position.percent >= FINISHED_AT
}

/**
 * Builds every shelf in one pass over `positions`.
 *
 * `positions` must already be most-recently-opened first — exactly what
 * `repository.listPositions()` returns — because nothing here re-sorts; doing
 * the ordering twice would be one more place for the two to quietly disagree.
 */
export function shelvesOf(
  books: readonly BookMeta[],
  positions: readonly ReadingPosition[],
): HomeShelves {
  const byId = new Map(books.map((book) => [book.id, book]))

  const reading: ShelfEntry[] = []
  const finished: BookMeta[] = []

  for (const position of positions) {
    // A position can outlive its book for one render if a delete is still
    // settling — `deleteBook`/`deleteBooks` remove both in the same
    // transaction, so this is a defensive skip, not the normal path.
    const book = byId.get(position.bookId)
    if (!book) continue

    if (isFinished(position)) finished.push(book)
    else reading.push({ book, percent: position.percent })
  }

  const openedIds = new Set(positions.map((position) => position.bookId))
  const unread = books.filter((book) => !openedIds.has(book.id))

  return {
    currentlyReading: reading[0],
    upNext: reading.slice(1, 1 + UP_NEXT_COUNT),
    unread: unread.slice(0, UNREAD_LIMIT),
    unreadTotal: unread.length,
    finished,
  }
}
