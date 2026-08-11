/**
 * Cover art kept on the device, so a launch never waits on the network for it.
 *
 * ## The launch this exists to fix
 *
 * `useCovers` caches object URLs in memory, which removes the flash on every
 * navigation *within* a session and nothing at all across one — a closed app
 * takes its `Map` with it. So the first paint of every session starts with no
 * covers and has to read them again, and on the cloud backend "read them again"
 * means Supabase and then R2, over whatever signal the phone has. Home waits
 * `COVER_WAIT_MS` for that and then gives up and paints placeholders, which is
 * the couple of seconds of coloured letters resolving into artwork that the
 * reader sees on the shelf every single time they open the app.
 *
 * The bytes were already on the device the whole time. They just weren't kept
 * anywhere that survived the process.
 *
 * ## Why a database of its own rather than the offline copy
 *
 * `reading-buddy-cache` holds whole books — and only books the reader has
 * actually *opened*, deliberately, because a shelf that downloads thirty-two
 * books because it was scrolled past is a bug the reader pays for in data. But
 * every book on the shelf shows its cover, opened or not, so a cover store that
 * only covered the opened books would miss most of the shelf.
 *
 * This is the same argument that gave the shelf listing its own home in
 * `cloud/shelf.ts`: a cover is tens of kilobytes where a book is megabytes, so
 * the thing that is too expensive to keep for all thirty-three books is not the
 * thing being kept here. Separate lifetimes, separate stores. Entangling covers
 * with the book copy would also confuse `openableOffline`, which answers "can
 * this book be read?" from what is in that database.
 *
 * ## Staleness
 *
 * There is no revalidation and no version tag, on purpose. A cover changes for
 * exactly one reason — the book was re-parsed, re-imported or deleted — and
 * every one of those paths already has to call `forgetCovers()`, which now
 * clears this store too. Adding a token would be a second, weaker copy of an
 * invalidation rule the app already keeps.
 *
 * Every operation here is best-effort. The store is unavailable in private mode
 * and can be evicted by the browser at any time; failing means the covers are
 * fetched the old way, which is a complete and working outcome.
 */

import Dexie, { type Table } from 'dexie'

import type { BookId } from '../structure/index.ts'

/** Adjacent to `reading-buddy` and `reading-buddy-cache`, and visible beside them. */
export const COVER_DB_NAME = 'reading-buddy-covers'

/**
 * One row per book.
 *
 * `blob: null` is a real answer and not an empty row: it records "this book has
 * no cover", which is the common case — PDF, docx and plain text have no cover
 * step at all. Without it, every launch would re-ask the network about every
 * book that was never going to have one.
 */
interface StoredCover {
  bookId: BookId
  blob: Blob | null
}

interface CoverDB extends Dexie {
  covers: Table<StoredCover, BookId>
}

let db: CoverDB | undefined

/** Opened lazily, so importing this module can't fail in an environment without IndexedDB. */
function database(): CoverDB | undefined {
  if (db) return db
  try {
    const opened = new Dexie(COVER_DB_NAME) as CoverDB
    opened.version(1).stores({ covers: 'bookId' })
    db = opened
    return db
  } catch {
    return undefined
  }
}

/**
 * What the device already has for these books.
 *
 * A book missing from the result has never been looked up; a book present with
 * `null` is known to have no cover. The caller has to tell those apart, which is
 * why this is a map of `Blob | null` rather than a map that quietly drops one.
 */
export async function readStoredCovers(
  bookIds: readonly BookId[],
): Promise<Map<BookId, Blob | null>> {
  const found = new Map<BookId, Blob | null>()
  if (bookIds.length === 0) return found

  const store = database()
  if (!store) return found

  try {
    // One indexed read for the whole shelf rather than one per tile.
    const rows = await store.covers.bulkGet([...bookIds])
    for (const row of rows) {
      if (row) found.set(row.bookId, row.blob)
    }
  } catch {
    // Unreadable store. The covers get fetched instead, exactly as before.
  }
  return found
}

/** Keep this cover — or the fact that there isn't one. Never awaited by callers. */
export async function storeCover(bookId: BookId, blob: Blob | null): Promise<void> {
  const store = database()
  if (!store) return
  try {
    await store.covers.put({ bookId, blob })
  } catch {
    // Full, or unavailable. This is a cache; the reader is unaffected.
  }
}

/**
 * Drop what is kept for these books, or for all of them when called bare.
 *
 * Called by `forgetCovers`, which is the one invalidation point — see the note
 * at the top about why there is no version tag.
 */
export async function dropStoredCovers(bookIds?: readonly BookId[]): Promise<void> {
  const store = database()
  if (!store) return
  try {
    if (bookIds) await store.covers.bulkDelete([...bookIds])
    else await store.covers.clear()
  } catch {
    // A cover that couldn't be dropped is a stale cover, which the next
    // re-import will overwrite anyway.
  }
}
