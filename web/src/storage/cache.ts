/**
 * The offline copy of the cloud library (WP-58) — a second, throwaway database.
 *
 * ## Why a separate database rather than the device library
 *
 * The obvious shortcut is to cache cloud books into `reading-buddy`, the
 * library that is already sitting there. It would be fewer lines and it would
 * be quietly catastrophic. The whole design rests on the two shelves being
 * genuinely separate — Settings says "32 books here" under the option you did
 * *not* pick, and that number is only meaningful if nothing else writes to it.
 * Cache into it and a reader who switches back finds books they never imported,
 * with no way to tell which are theirs.
 *
 * So: same schema, different name. `reading-buddy-cache` holds only what the
 * cloud already has, which makes it the one store in the app that is safe to
 * delete at any moment — worst case, the next read fetches it again.
 *
 * ## Why it's a full `Repository` and not a bespoke cache API
 *
 * Because then filling it is `copyBook(cloud, cache, …)` — the engine written
 * for WP-57's copy button, which was deliberately written against the interface
 * so it would never learn which direction it was pointing. A cache with its own
 * shape would have needed its own copier, its own tests, and its own bugs.
 */

import type { BookId } from '../structure/index.ts'
import { createDb, type ReadingBuddyDB } from './db.ts'
import { createRepository, type Repository } from './repository.ts'

/** Deliberately adjacent to `DB_NAME`, so both are visible in DevTools. */
export const CACHE_DB_NAME = 'reading-buddy-cache'

/** Tests build their own; the app uses the instance below. */
export function createCacheDb(name: string = CACHE_DB_NAME): ReadingBuddyDB {
  return createDb(name)
}

/**
 * The offline copy, as a repository.
 *
 * Nothing outside `storage/` should import this. A screen that reads it
 * directly is a screen showing yesterday's library while the cloud is
 * reachable — the wrapper in `cloud/cached.ts` is what decides that.
 */
export const cacheRepository: Repository = createRepository(createCacheDb())

/**
 * Which books have a complete offline copy.
 *
 * "Complete" is the operative word: a book is only listed here once
 * `saveParsedBook` has committed it, so a copy interrupted halfway leaves
 * nothing to find rather than a book that opens and won't turn.
 */
export async function cachedBookIds(
  cache: Repository = cacheRepository,
): Promise<Set<string>> {
  const books = await cache.listBooks()
  return new Set(books.map((book) => book.id))
}

// --- Keeping the copy from growing for ever ----------------------------------

/**
 * When each cached book was last read, as `{ bookId: milliseconds }`.
 *
 * In `localStorage` rather than a table of its own, for two reasons. Adding a
 * table means a schema version, and the schema is shared with the *device*
 * library — a migration would run on the reader's 32 real books to support a
 * cache that can be thrown away. And this is read on every page turn, where
 * `localStorage` is synchronous and an IndexedDB round trip is not.
 */
const TOUCH_KEY = 'rb.cache.read'

/**
 * How many books stay readable offline.
 *
 * A count rather than a size in megabytes, because a count is the thing a
 * reader could be told and would understand. Twenty is chosen to be past what
 * anyone has in flight — nobody is part-way through twenty books — so in normal
 * use nothing is ever dropped and this whole mechanism is invisible.
 */
export const MAX_CACHED_BOOKS = 20

/** At most one write a minute per book: a page turn shouldn't cost a save. */
const TOUCH_INTERVAL_MS = 60_000

function readTouches(): Record<string, number> {
  try {
    const raw = localStorage.getItem(TOUCH_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, number>
  } catch {
    // Unavailable in private mode, or corrupt. Losing the reading order costs
    // an arbitrary eviction one day; throwing here would cost the page turn.
    return {}
  }
}

function writeTouches(touches: Record<string, number>): void {
  try {
    localStorage.setItem(TOUCH_KEY, JSON.stringify(touches))
  } catch {
    // Full or unavailable. See above: this is bookkeeping, not the book.
  }
}

/** Note that this book has just been read. Cheap enough for every page turn. */
export function touchCachedBook(bookId: BookId, now: number = Date.now()): void {
  const touches = readTouches()
  if (now - (touches[bookId] ?? 0) < TOUCH_INTERVAL_MS) return
  touches[bookId] = now
  writeTouches(touches)
}

/** Drop the bookkeeping for books that are no longer in the copy. */
export function forgetCachedBooks(bookIds: readonly BookId[]): void {
  if (bookIds.length === 0) return
  const touches = readTouches()
  for (const id of bookIds) delete touches[id]
  writeTouches(touches)
}

/**
 * The cached books, least recently read first — the order they get dropped in.
 *
 * A book with no record sorts to the front. That is the right way round: it has
 * either never been opened since it was copied, or its record was lost, and in
 * both cases it is the safest thing in the store to lose.
 */
async function byLeastRecentlyRead(cache: Repository): Promise<BookId[]> {
  const [books, touches] = [await cache.listBooks(), readTouches()]
  return [...books]
    .sort((a, b) => (touches[a.id] ?? 0) - (touches[b.id] ?? 0))
    .map((book) => book.id)
}

/** Drop the least recently read books until only `limit` are left. */
export async function evictOverflow(
  cache: Repository = cacheRepository,
  limit: number = MAX_CACHED_BOOKS,
): Promise<BookId[]> {
  const order = await byLeastRecentlyRead(cache)
  if (order.length <= limit) return []
  return dropBooks(cache, order.slice(0, order.length - limit))
}

/**
 * Drop the least recently read book, whatever the count.
 *
 * This is the pressure valve rather than the routine one: it runs when the
 * browser has actually refused a write for want of room, which can happen well
 * under the twenty-book cap if the books are scanned PDFs full of plates.
 */
export async function evictLeastRecent(
  cache: Repository = cacheRepository,
  count = 1,
): Promise<BookId[]> {
  const order = await byLeastRecentlyRead(cache)
  return dropBooks(cache, order.slice(0, count))
}

async function dropBooks(cache: Repository, bookIds: BookId[]): Promise<BookId[]> {
  if (bookIds.length === 0) return []
  await cache.deleteBooks(bookIds)
  forgetCachedBooks(bookIds)
  return bookIds
}

/**
 * Whether this failure is the browser saying "there is no more room".
 *
 * Worth telling apart from every other write failure: the answer to a full disk
 * is to make room and let the next page turn try again, while the answer to
 * anything else is to leave well alone. Firefox has its own name for it.
 */
export function looksFull(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; current && depth < 5; depth += 1) {
    const { name, message } = current as { name?: unknown; message?: unknown }
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
    if (typeof message === 'string' && message.toLowerCase().includes('quota')) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
