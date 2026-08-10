/**
 * The shelf listing, remembered — so an offline library shows every book it has,
 * not only the handful it can open.
 *
 * ## The gap this fills
 *
 * The offline copy in `cache.ts` holds *whole books*, and it only ever holds the
 * ones the reader has actually opened (`keepOffline` in `cached.ts`). That is
 * deliberate and stays: a shelf that downloaded thirty-two books because it was
 * scrolled past is a bug the reader pays for in mobile data.
 *
 * But it left the offline shelf saying something untrue. The reader with 33 books
 * in the cloud and one copied locally opened the app in a tunnel and saw a
 * library of one — not "31 books you can't open right now" but *31 books gone*.
 * Nothing was lost, and it did not look that way.
 *
 * So this remembers the **listing** and nothing else: title, author, shelf, the
 * few facts a row on the shelf is made of. Thirty-three of those is a few
 * kilobytes of text, versus the megabytes a book is — which is the whole reason
 * it can be kept for every book when the books themselves cannot.
 *
 * ## Why `localStorage`
 *
 * Same reasons as the eviction bookkeeping next door in `cache.ts`: a table would
 * mean a schema version, and the schema is shared with the reader's real device
 * library. And this is read on the library screen's opening round, where
 * `localStorage` is synchronous and an IndexedDB round trip is not.
 *
 * It is a convenience, never a source of truth. Every read here is wrapped: a
 * corrupt or unavailable store means the shelf falls back to what it did before
 * — the books it can open — which is worse but not wrong.
 */

import type { BookId, BookMeta } from '../../structure/index.ts'

const SHELF_KEY = 'rb.cache.shelf'

/**
 * The same listing, in memory.
 *
 * Not merely a speed-up. `localStorage` is missing altogether in some
 * environments — private modes, and the test runner — and the point of this file
 * is a shelf that doesn't shrink. In memory it works for the life of the tab
 * regardless; `localStorage` is what carries it across a relaunch.
 */
let inMemory: BookMeta[] | null = null

/** What the cloud last said was on the shelf, or `null` if it never has. */
export function rememberedShelf(): BookMeta[] | null {
  if (inMemory) return inMemory
  try {
    const raw = localStorage.getItem(SHELF_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    // Enough of a check to reject a wrong shape without pretending to validate
    // every field: a row with no id can't be keyed, drawn or opened.
    return parsed.filter(
      (book): book is BookMeta =>
        !!book && typeof book === 'object' && typeof (book as BookMeta).id === 'string',
    )
  } catch {
    return null
  }
}

/** Note the shelf the cloud just gave us. Called on every successful listing. */
export function rememberShelf(books: readonly BookMeta[]): void {
  inMemory = [...books]
  try {
    localStorage.setItem(SHELF_KEY, JSON.stringify(books))
  } catch {
    // Full, or private mode. The shelf is bookkeeping; losing it costs the
    // greyed-out rows and nothing else.
  }
}

/** Drop books from the remembered listing — they have gone from the cloud. */
export function forgetFromShelf(bookIds: readonly BookId[]): void {
  if (bookIds.length === 0) return
  const shelf = rememberedShelf()
  if (!shelf) return
  const gone = new Set<string>(bookIds)
  rememberShelf(shelf.filter((book) => !gone.has(book.id)))
}

/** Forget the lot — on sign-out, when the listing belongs to someone else. */
export function forgetShelfListing(): void {
  inMemory = null
  try {
    localStorage.removeItem(SHELF_KEY)
  } catch {
    // See above.
  }
}
