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
