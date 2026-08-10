/**
 * The cloud library, readable with no signal (WP-58).
 *
 * Wraps the cloud repository and the offline copy in `storage/cache.ts` behind
 * the same `Repository` interface, so the ~30 screens that import `repository`
 * never learn this exists — the same trick that let the cloud backend land at
 * all.
 *
 * ## The rule
 *
 * **Try the cloud. If the failure looks like a lost signal, answer from the
 * copy.** Not the other way round: the cloud is the source of truth, and a
 * reader who has just bookmarked something on their laptop should see it on
 * their phone, not a cached shelf from this morning.
 *
 * Asking the network first costs nothing when it is genuinely gone — `fetch`
 * fails in about a millisecond with no interface to try, rather than sitting on
 * a timeout. Reading `navigator.onLine` and skipping straight to the copy would
 * save that millisecond and buy a real hazard: the flag reports the network
 * card, not the internet, so it is false on some machines that are perfectly
 * online, and the reader would silently get yesterday's library.
 *
 * ## What is *not* here
 *
 * Writing offline. Position, highlights and bookmarks still go straight to the
 * cloud and still fail when it is unreachable — the queue that fixes that is
 * the next step of WP-58. This is deliberate rather than unfinished: a
 * bookmark that appears to save and is then lost is worse than one that says it
 * couldn't.
 */

import type { BookId, BookMeta, Manifest, SectionPath } from '../../structure/index.ts'
import { cacheRepository } from '../cache.ts'
import type {
  ReadingPosition,
  StoredBookmark,
  StoredChapterIndex,
  StoredFolder,
  StoredQuote,
  StoredSection,
} from '../db.ts'
import type { Repository } from '../repository.ts'
import { copyBook, copyFolders } from '../transfer.ts'

/**
 * The wordings browsers use for "there is no network", one per engine.
 *
 * Safari's is `Load failed`, which is both the vaguest and the one that matters
 * most here — it is what an iPhone says, and an iPhone on a train is the entire
 * reason this waypoint exists.
 */
const OFFLINE_HINTS = [
  'failed to fetch',
  'networkerror',
  'network request failed',
  'load failed',
  'the internet connection appears to be offline',
]

/**
 * Whether this failure is a missing network rather than a real answer.
 *
 * The distinction is load-bearing. A lost signal should fall back to the copy;
 * a book that was deleted on another device, or a row the security policy
 * refuses, must surface — falling back there would resurrect deleted books from
 * the cache and never stop.
 *
 * `CloudError` keeps the original in `cause`, so the chain is walked rather
 * than just the top message. Five links is far more than any real chain and
 * stops a cyclic `cause` from hanging the reader.
 */
export function looksOffline(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; current && depth < 5; depth += 1) {
    // What `fetch` itself throws with nothing to connect to.
    if (current instanceof TypeError) return true
    const message = (current as { message?: unknown }).message
    if (typeof message === 'string') {
      const lower = message.toLowerCase()
      if (OFFLINE_HINTS.some((hint) => lower.includes(hint))) return true
    }
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/** Books whose copy is being made right now, so a page turn doesn't start a second. */
const filling = new Set<BookId>()

/**
 * Start keeping this book offline, if it isn't already. Never awaited.
 *
 * Fired when the reader asks for a *section* rather than when a book's details
 * are fetched, because that is the moment they are unambiguously reading it —
 * the library screen touches every book on the shelf, and a shelf that quietly
 * downloaded thirty-two books because it was scrolled past would be a bug the
 * reader pays for in data.
 */
function keepOffline(cloud: Repository, cache: Repository, bookId: BookId): void {
  if (filling.has(bookId)) return
  filling.add(bookId)

  void (async () => {
    try {
      if (await cache.getBook(bookId)) return
      const meta = await cloud.getBook(bookId)
      if (!meta) return
      // Folders first, or the book lands loose on the offline shelf.
      const folders = await copyFolders(cloud, cache)
      await copyBook(cloud, cache, meta, folders)
    } catch {
      // The copy is a convenience. A reader who is reading successfully must
      // never see an error about a background download — and leaving the id out
      // of `filling` means the next page turn simply tries again.
    } finally {
      filling.delete(bookId)
    }
  })()
}

/**
 * The cloud, with the offline copy behind it.
 *
 * Everything not named below is spread through to the cloud untouched and
 * fails, correctly, with no signal: importing a book, deleting one, renaming a
 * folder. Those need the source of truth by definition. The methods that *are*
 * overridden are exactly the ones a reader uses to read.
 */
export function createCachedRepository(
  cloud: Repository,
  cache: Repository = cacheRepository,
): Repository {
  async function readThrough<T>(
    fromCloud: () => Promise<T>,
    fromCache: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fromCloud()
    } catch (error) {
      if (!looksOffline(error)) throw error
      return await fromCache()
    }
  }

  return {
    ...cloud,

    // --- The shelf ---------------------------------------------------------

    async listBooks(): Promise<BookMeta[]> {
      return readThrough(
        () => cloud.listBooks(),
        () => cache.listBooks(),
      )
    },

    async getBook(id: BookId): Promise<BookMeta | undefined> {
      return readThrough(
        () => cloud.getBook(id),
        () => cache.getBook(id),
      )
    },

    async listFolders(): Promise<StoredFolder[]> {
      return readThrough(
        () => cloud.listFolders(),
        () => cache.listFolders(),
      )
    },

    async listPositions(): Promise<ReadingPosition[]> {
      return readThrough(
        () => cloud.listPositions(),
        () => cache.listPositions(),
      )
    },

    // --- The book ----------------------------------------------------------

    async getManifest(bookId: BookId): Promise<Manifest | undefined> {
      return readThrough(
        () => cloud.getManifest(bookId),
        () => cache.getManifest(bookId),
      )
    },

    async listChapterIndexes(bookId: BookId): Promise<StoredChapterIndex[]> {
      return readThrough(
        () => cloud.listChapterIndexes(bookId),
        () => cache.listChapterIndexes(bookId),
      )
    },

    async getChapterIndex(
      bookId: BookId,
      chapter: number,
    ): Promise<StoredChapterIndex | undefined> {
      return readThrough(
        () => cloud.getChapterIndex(bookId, chapter),
        () => cache.getChapterIndex(bookId, chapter),
      )
    },

    // --- The words ---------------------------------------------------------

    async getSection(
      bookId: BookId,
      path: SectionPath,
    ): Promise<StoredSection | undefined> {
      keepOffline(cloud, cache, bookId)
      return readThrough(
        () => cloud.getSection(bookId, path),
        () => cache.getSection(bookId, path),
      )
    },

    async getSectionByAnchor(
      bookId: BookId,
      anchor: string,
    ): Promise<StoredSection | undefined> {
      keepOffline(cloud, cache, bookId)
      return readThrough(
        () => cloud.getSectionByAnchor(bookId, anchor),
        () => cache.getSectionByAnchor(bookId, anchor),
      )
    },

    async listSections(bookId: BookId): Promise<StoredSection[]> {
      return readThrough(
        () => cloud.listSections(bookId),
        () => cache.listSections(bookId),
      )
    },

    async countSections(bookId: BookId): Promise<number> {
      return readThrough(
        () => cloud.countSections(bookId),
        () => cache.countSections(bookId),
      )
    },

    // --- The pictures ------------------------------------------------------

    async getAssets(
      bookId: BookId,
      paths: readonly string[],
    ): Promise<Map<string, Blob>> {
      return readThrough(
        () => cloud.getAssets(bookId, paths),
        () => cache.getAssets(bookId, paths),
      )
    },

    async listAssetPaths(bookId: BookId): Promise<string[]> {
      return readThrough(
        () => cloud.listAssetPaths(bookId),
        () => cache.listAssetPaths(bookId),
      )
    },

    // --- What the reader has added -----------------------------------------

    async getPosition(bookId: BookId): Promise<ReadingPosition | undefined> {
      return readThrough(
        () => cloud.getPosition(bookId),
        () => cache.getPosition(bookId),
      )
    },

    async listQuotes(bookId: BookId): Promise<StoredQuote[]> {
      return readThrough(
        () => cloud.listQuotes(bookId),
        () => cache.listQuotes(bookId),
      )
    },

    async listBookmarks(bookId: BookId): Promise<StoredBookmark[]> {
      return readThrough(
        () => cloud.listBookmarks(bookId),
        () => cache.listBookmarks(bookId),
      )
    },
  }
}

/** Exported for the tests, which need a clean slate between cases. */
export function forgetFillsInFlight(): void {
  filling.clear()
}
