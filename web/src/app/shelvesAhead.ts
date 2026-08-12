/**
 * Rearrange the shelves *while the book is still open*, so closing it lands on
 * a shelf that is already right.
 *
 * ## Why this is better than animating the move
 *
 * `app/shelfTransition.ts` made a book changing shelf glide instead of blink,
 * and that was the right fix for the flash. But it still answers a question the
 * reader never asked: they open a book, read, come back — and are shown a
 * 300 ms performance of a fact they already know, because opening the book is
 * what put it on Current Reading in the first place.
 *
 * The move is only visible because of *when* it is computed. Home and Library
 * both paint their first frame from a module-level memory left over from the
 * last visit, then re-read the store and correct themselves a tick later. That
 * memory was written before the book was opened, so the correction is always the
 * rearrangement — every single time.
 *
 * Refresh the memory while the reader is inside the book and the whole sequence
 * disappears. Home mounts, seeds from an already-correct memory, paints the
 * final arrangement on frame one; its own re-read then computes the same
 * arrangement, `moved` is false, and no crossing runs at all. Same for Library,
 * whose row-scroll (`useRowMemory`) now lands on a list that is already in its
 * final order rather than chasing one that is still settling — which is what
 * made coming back feel rushed.
 *
 * `moveBooks` stays, and stays worth having. It is now the answer for
 * rearrangements this module cannot get ahead of: a sweep that re-parses books,
 * a second device syncing, a refresh that was still in flight when the reader
 * closed the book. The common path stops needing it; the uncommon path is still
 * covered.
 *
 * ## Not `forget`
 *
 * The obvious-looking alternative — clear both memories on opening a book, so
 * nothing stale can be painted — is worse than the bug. An empty memory makes
 * Home paint *nothing* and then pop the whole shelf in. Refreshing keeps the
 * first frame full; it just makes it true.
 */

import { shelvesOf } from './homeShelves.ts'
import { readLibraryMemory, writeLibraryMemory } from './libraryMemory.ts'
import { readShelfMemory, writeShelfMemory } from './shelfMemory.ts'
import { progressMap } from '../library/status.ts'
import { repository, unavailableBooks } from '../storage/index.ts'
import type { BookId, BookMeta } from '../structure/index.ts'

/**
 * One round of reads, feeding both memories.
 *
 * Deliberately a single round rather than calling each screen's own loader:
 * Home needs books and positions, the library needs those plus sources and
 * folders, and running the two separately would read the same two tables twice
 * — on the cloud backend, twice over the network — for one answer.
 */
async function rebuild(): Promise<void> {
  const [books, sources, positions, folders] = await Promise.all([
    repository.listBooks(),
    repository.booksWithSource(),
    repository.listPositions(),
    repository.listFolders(),
  ])
  // After the round, not in it: local-only, documented never to throw, and
  // keeping it out means it can't become a fifth way for the group to reject.
  const unavailable = await unavailableBooks(books)

  writeLibraryMemory({ books, sources, progress: progressMap(positions), folders, unavailable })

  // Home leaves out what this device can't open, where the library lists it
  // greyed. Mirrors `Home.tsx` exactly — including `total` counting the books
  // Home will actually draw, not everything owned.
  const open = unavailable.size === 0 ? books : books.filter((book) => !unavailable.has(book.id))
  writeShelfMemory({ shelves: shelvesOf(open, positions), total: open.length })
}

/**
 * What the shelves' order actually depends on, as far as the reader can change
 * it from inside a book: which book was touched last, and whether it is done.
 *
 * Everything else a page turn changes — the percentage, the anchor — moves
 * nothing on either screen's ordering. Without this, the reader's position is
 * written once per paragraph and each write would drag four table reads behind
 * it for the rest of the book.
 */
let lastSeen = ''

/** Only ever one rebuild in flight; a second request waits for the first. */
let running: Promise<void> | null = null

/**
 * Tell the shelves that this book has just been read to this point.
 *
 * Called from the reader after a position is saved. Cheap and silent when
 * nothing that matters has changed, which is nearly every call.
 */
export function noteReading(bookId: BookId, percent: number | undefined): void {
  const signature = `${bookId}|${percent === 100 ? 'done' : 'reading'}`
  if (signature === lastSeen) return
  lastSeen = signature

  // Chained rather than dropped. Reaching 100% fires a second, different
  // signature moments after the first, and the finished shelf is the one that
  // most needs to be right by the time the book closes.
  const next = running ?? Promise.resolve()
  running = next.then(rebuild, rebuild).catch(() => {
    // A failed refresh is not a failure: both screens re-read on arrival, and
    // `moveBooks` makes the correction they then compute a glide rather than a
    // flash. This is an optimisation, and it degrades to the old behaviour.
  })
}

/**
 * What is already known about a book, without asking the store.
 *
 * The reading screen needs a title and an id on its *first* frame, to draw the
 * cover it opens on (`pages/Opening.tsx`) — and `repository.getBook` is a
 * promise, so anything waiting on it has already missed that frame. These two
 * memories were filled before the book was tapped and hold every book the
 * reader owns, so the answer is sitting in the page already.
 *
 * `undefined` is a fine answer and the screen is built for it: a deep link into
 * a book on a cold start reaches nothing here, and the opening cover is drawn
 * blank for the moment before the real one loads.
 */
export function knownBook(id: BookId): BookMeta | undefined {
  const library = readLibraryMemory()
  const listed = library?.books.find((book) => book.id === id)
  if (listed) return listed

  // Home's memory is the narrower of the two — four shelves, and Unread capped
  // at ten — so it is the fallback rather than the first look. It is filled in
  // the one case the library's is not: a reader who opened the app and went
  // straight into a book before the library warm had finished.
  const shelf = readShelfMemory()
  if (!shelf) return undefined
  const onShelves = [
    ...(shelf.shelves.currentlyReading ? [shelf.shelves.currentlyReading.book] : []),
    ...shelf.shelves.upNext.map((entry) => entry.book),
    ...shelf.shelves.unread,
    ...shelf.shelves.finished,
  ]
  return onShelves.find((book) => book.id === id)
}

/** Forget what was last seen. Tests only — the flag is module-level. */
export function resetReadingNote(): void {
  lastSeen = ''
  running = null
}
