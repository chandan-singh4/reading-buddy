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
 * With one exception, added after the first real test on a phone. This file
 * originally argued that asking the doomed network first was free — that `fetch`
 * fails instantly with no interface to try. On a phone with the Wi-Fi switched
 * off it is not free: opening the app is dozens of requests, each with its own
 * DNS attempt and its own teardown, and the reader watched the library take
 * seconds to appear. So `navigator.onLine === false` now goes straight to the
 * copy.
 *
 * That is safe in the direction it is used, and only that direction. The flag is
 * specified as a promise about failure, not about success: `false` means the
 * browser knows it has no connection at all, while `true` merely means it has an
 * interface — which is why a captive portal still reports `true`. So `false` is
 * trustworthy enough to skip the network, and `true` is not trustworthy enough
 * to skip the copy. The `catch` below is what covers the second case.
 *
 * ## Writing, which is the mirror of the same rule
 *
 * **Try the cloud. If the failure looks like a lost signal, write it to the copy
 * and put it in the outbox.** The reader sees the bookmark straight away because
 * the copy is what they are reading from anyway, and `outbox.ts` tells the cloud
 * when there is a signal to tell it with.
 *
 * Three writes go through that path — position, bookmarks, saved passages —
 * because those three merge with another device's without anyone being asked.
 * **Deleting a book still refuses**, and says why: a delete racing an edit
 * elsewhere can only be resolved by asking, and a reading app should not have a
 * conflict UI. Importing, re-parsing and renaming a folder still need the source
 * of truth by definition, and still fail as they always did.
 */

import type { Anchor, BookId, BookMeta, Manifest, SectionPath } from '../../structure/index.ts'
import {
  cacheRepository,
  cachedBookIds,
  evictLeastRecent,
  evictOverflow,
  forgetCachedBooks,
  looksFull,
  touchCachedBook,
} from '../cache.ts'
import type {
  ReadingPosition,
  StoredBookmark,
  StoredChapterIndex,
  StoredFolder,
  StoredQuote,
  StoredSection,
  StoredSource,
} from '../db.ts'
import type { Repository } from '../repository.ts'
import { copyBook, copyFolders } from '../transfer.ts'
import { CloudError } from './client.ts'
import { knownOffline, looksOffline } from './offline.ts'
import { forgetFromShelf, rememberShelf, rememberedShelf } from './shelf.ts'
import {
  drainOutbox,
  enqueue,
  forgetQueued,
  outboxDb,
  pendingCount,
  type OutboxDB,
} from './outbox.ts'

// Both were first written here and are still imported from here by their tests
// and by `outbox.ts`'s callers. They live in `offline.ts` only so that this file
// and the queue can share them without importing each other.
export { knownOffline, looksOffline } from './offline.ts'

/** Books whose copy is being made right now, so a page turn doesn't start a second. */
const filling = new Set<BookId>()

/**
 * Whether the last shelf the app drew came from the copy rather than the cloud.
 *
 * Recorded rather than re-derived, because the honest question is "did that read
 * actually reach the cloud?" and `navigator.onLine` cannot answer it — `true`
 * only means there is an interface, which is what a captive portal reports. The
 * read either got through or it didn't, and this is that fact.
 */
let servedFromCopy = false

/**
 * Which books the reader can open right now, or `null` when that is all of them.
 *
 * `null` rather than "every id" so the caller can tell "everything is available"
 * from "nothing is" without knowing the shelf — and so the device-library
 * backend, which is never in this position, costs nothing to ask.
 */
export async function openableOffline(
  cache: Repository = cacheRepository,
): Promise<ReadonlySet<string> | null> {
  if (!servedFromCopy) return null
  try {
    return await cachedBookIds(cache)
  } catch {
    // The copy is unreadable, which is not a reason to grey the shelf out —
    // better to let every row be tapped and fail honestly one at a time.
    return null
  }
}

/** Exported for the tests, which need each case to start with no history. */
export function forgetShelfSource(): void {
  servedFromCopy = false
}

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
      // Marked read whether or not it needs copying — this is the record the
      // eviction order is built from, so it has to be kept on every visit, not
      // only on the first one. Otherwise the book you read every day would
      // still look, to the cache, like the oldest thing in it.
      touchCachedBook(bookId)
      if (await cache.getBook(bookId)) return

      const meta = await cloud.getBook(bookId)
      if (!meta) return
      // Folders first, or the book lands loose on the offline shelf.
      const folders = await copyFolders(cloud, cache)
      await copyBook(cloud, cache, meta, folders)
      await evictOverflow(cache)
    } catch (error) {
      // The copy is a convenience. A reader who is reading successfully must
      // never see an error about a background download — and leaving the id out
      // of `filling` means the next page turn simply tries again.
      //
      // Out of room is the one failure worth acting on: make room now, and that
      // retry has somewhere to go. A half-written book is left behind, which is
      // why the *next* attempt starts by evicting rather than by trusting it.
      if (looksFull(error)) {
        await dropPartial(cache, bookId)
      }
    } finally {
      filling.delete(bookId)
    }
  })()
}

/**
 * Clear up after a copy that ran out of room.
 *
 * The half-written book goes first — it is unreadable and it is occupying the
 * space the retry needs — and then one more, because a fill that failed on a
 * full disk will fail again against the same disk.
 */
async function dropPartial(cache: Repository, bookId: BookId): Promise<void> {
  try {
    await cache.deleteBooks([bookId])
    forgetCachedBooks([bookId])
    await evictLeastRecent(cache)
  } catch {
    // Nothing left to try. The reader is still reading from the cloud.
  }
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
  outbox: OutboxDB = outboxDb,
): Repository {
  async function readThrough<T>(
    fromCloud: () => Promise<T>,
    fromCache: () => Promise<T>,
  ): Promise<T> {
    // See the header: `false` is a promise that the network cannot work, so
    // there is nothing to gain by proving it a few dozen times per screen.
    if (knownOffline()) return fromCache()
    try {
      return await fromCloud()
    } catch (error) {
      if (!looksOffline(error)) throw error
      return await fromCache()
    }
  }

  /**
   * The write rule, and the exact mirror of `readThrough`.
   *
   * The order inside `offline` matters and is the same order the read side uses
   * for its own priorities: **queue first, then show.** Recording the write is
   * what makes it true; showing it in the copy is what makes it visible. If the
   * queue itself can't be written the reader is told, because a bookmark that
   * looks saved and is then lost is worse than one that says it couldn't be.
   */
  async function writeThrough<T>(
    toCloud: () => Promise<T>,
    offline: () => Promise<T>,
  ): Promise<T> {
    if (knownOffline()) return offline()
    try {
      const result = await toCloud()
      // A write that got through is the best evidence there is that the signal
      // is back — better than the `online` event, which fires for a joined
      // network that cannot reach anything.
      void drainQuietly()
      return result
    } catch (error) {
      if (!looksOffline(error)) throw error
      return offline()
    }
  }

  /**
   * Apply a write to the copy so the reader can see it. Never fatal: the write
   * is already recorded, and a copy that couldn't take it is a copy that will be
   * rebuilt from the cloud anyway.
   */
  async function mirror(apply: () => Promise<unknown>): Promise<void> {
    try {
      await apply()
    } catch {
      // See above. The cloud is still going to hear about this.
    }
  }

  async function drainQuietly(): Promise<void> {
    try {
      if ((await pendingCount(outbox)) === 0) return
      await drainOutbox(cloud, outbox)
    } catch {
      // Draining is housekeeping. A reader who is reading successfully must
      // never see an error about it; the next trigger tries again.
    }
  }

  // Two triggers, because neither is sufficient alone. `online` catches the
  // reader walking out of the tunnel with the app open, which is the case this
  // whole waypoint is about; the opening drain catches the app being started
  // fresh with a queue left over from yesterday.
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void drainQuietly())
  }
  void drainQuietly()

  /** Refusing a delete, in the reader's words rather than the network's. */
  function noDeleteOffline(): never {
    throw new CloudError(
      'You need a connection to delete a book. Everything else you do offline is saved and sent when you’re back.',
    )
  }

  return {
    ...cloud,

    // --- The shelf ---------------------------------------------------------

    /**
     * The shelf, which is the one read where the copy is not enough.
     *
     * Everywhere else in this file the fallback is complete: the copy either has
     * the section or the reader wasn't going to get it anyway. Here it is a
     * *subset* by design — the copy holds only opened books — so answering from
     * it alone told the reader their library had shrunk to one book. So the
     * listing is remembered separately, in full, and that is what a lost signal
     * falls back to. Which of those rows can actually be opened is a different
     * question, asked by `openableOffline` below.
     */
    async listBooks(): Promise<BookMeta[]> {
      return readThrough(
        async () => {
          const books = await cloud.listBooks()
          rememberShelf(books)
          servedFromCopy = false
          return books
        },
        async () => {
          servedFromCopy = true
          const remembered = rememberedShelf()
          // No remembered listing means this reader has never once loaded the
          // shelf with a signal. The copy is then the honest answer, and the
          // greying below correctly greys nothing.
          return remembered ?? (await cache.listBooks())
        },
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

    /**
     * Which books could be re-parsed — not a reading question, but a fatal one.
     *
     * The library screen opens with four reads in a single `Promise.all`, and
     * this is one of them. Leaving it out meant three good answers were thrown
     * away because the fourth — a check about the *Update* button, which the
     * reader had not pressed — could not reach the network. The whole screen
     * showed "Couldn't open your library" with a `TypeError` under it.
     *
     * The lesson is worth more than the fix: it is not enough for the reading
     * path to survive offline. Everything the reading path is *bundled with*
     * has to survive too, because `Promise.all` fails as a group.
     */
    async booksWithSource(): Promise<Set<BookId>> {
      return readThrough(
        () => cloud.booksWithSource(),
        () => cache.booksWithSource(),
      )
    },

    async sourcesSize(): Promise<number> {
      return readThrough(
        () => cloud.sourcesSize(),
        () => cache.sourcesSize(),
      )
    },

    async getSource(bookId: BookId): Promise<StoredSource | undefined> {
      return readThrough(
        () => cloud.getSource(bookId),
        () => cache.getSource(bookId),
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

    // --- What the reader adds, with or without a signal ---------------------

    /**
     * Where reading stopped. The one write that happens by itself, constantly,
     * which is why the queue keeps only the newest per book rather than an
     * hour's worth of increasingly stale versions of one fact.
     */
    async savePosition(
      bookId: BookId,
      anchor: Anchor,
      percent?: number,
      at: string = new Date().toISOString(),
    ): Promise<void> {
      return writeThrough(
        () => cloud.savePosition(bookId, anchor, percent, at),
        async () => {
          await enqueue({ kind: 'savePosition', bookId, anchor, percent, at }, outbox)
          await mirror(() => cache.savePosition(bookId, anchor, percent, at))
        },
      )
    },

    /**
     * Finishing a book, signal or no signal.
     *
     * The one write here that does **not** need a queue entry of its own, and
     * the reason is worth keeping: the fact is recoverable from evidence that
     * *is* queued. A page turn to 100% goes into the outbox like any other, so
     * a finish made in a tunnel arrives as a position, and the next launch's
     * `backfillFinishedAt` turns it back into a date. Offline, writing to the
     * copy is enough to keep this device honest until then.
     */
    async markFinished(bookId: BookId, at: string = new Date().toISOString()): Promise<void> {
      return writeThrough(
        () => cloud.markFinished(bookId, at),
        () => mirror(() => cache.markFinished(bookId, at)),
      )
    },

    /** @see `cloudRepository.backfillFinishedAt` — a no-op with no signal. */
    async backfillFinishedAt(): Promise<number> {
      return readThrough(
        () => cloud.backfillFinishedAt(),
        () => cache.backfillFinishedAt(),
      )
    },

    /**
     * Mark a place, signal or no signal.
     *
     * Offline the *copy* mints the id, and that is deliberate rather than
     * incidental: the reader is reading from the copy, so the row they can see
     * and the row the queue names have to be the same row, or tapping the ribbon
     * again would fail to un-mark the page it just marked. The cloud's own id
     * arrives when the queue drains, and everything still queued is repointed at
     * it then — see `outbox.ts`.
     */
    async addBookmark(bookId: BookId, anchor: Anchor, label: string): Promise<StoredBookmark> {
      return writeThrough(
        () => cloud.addBookmark(bookId, anchor, label),
        async () => {
          const bookmark = await cache
            .addBookmark(bookId, anchor, label)
            .catch((): StoredBookmark => ({
              // The book isn't in the copy, or the copy is full. The bookmark is
              // still real and still going to the cloud; it just has nowhere
              // local to be listed from until it gets there.
              bookId,
              id: crypto.randomUUID(),
              anchor,
              label,
              addedAt: new Date().toISOString(),
            }))
          await enqueue({ kind: 'addBookmark', bookId, id: bookmark.id, anchor, label }, outbox)
          return bookmark
        },
      )
    },

    async deleteBookmark(bookId: BookId, id: string): Promise<void> {
      return writeThrough(
        () => cloud.deleteBookmark(bookId, id),
        async () => {
          await enqueue({ kind: 'deleteBookmark', bookId, id }, outbox)
          await mirror(() => cache.deleteBookmark(bookId, id))
        },
      )
    },

    async renameBookmark(bookId: BookId, id: string, label: string): Promise<void> {
      return writeThrough(
        () => cloud.renameBookmark(bookId, id, label),
        async () => {
          await enqueue({ kind: 'renameBookmark', bookId, id, label }, outbox)
          await mirror(() => cache.renameBookmark(bookId, id, label))
        },
      )
    },

    /** A saved passage. Additive, like a bookmark, so it queues the same way. */
    async addQuote(bookId: BookId, text: string): Promise<StoredQuote> {
      return writeThrough(
        () => cloud.addQuote(bookId, text),
        async () => {
          const quote = await cache.addQuote(bookId, text).catch((): StoredQuote => ({
            bookId,
            id: crypto.randomUUID(),
            text,
            addedAt: new Date().toISOString(),
          }))
          await enqueue({ kind: 'addQuote', bookId, id: quote.id, text }, outbox)
          return quote
        },
      )
    },

    async deleteQuote(bookId: BookId, id: string): Promise<void> {
      return writeThrough(
        () => cloud.deleteQuote(bookId, id),
        async () => {
          await enqueue({ kind: 'deleteQuote', bookId, id }, outbox)
          await mirror(() => cache.deleteQuote(bookId, id))
        },
      )
    },

    // --- What still needs a signal ------------------------------------------

    /**
     * Deleting a book is the one action with no honest automatic merge, so it
     * refuses rather than queues — and says so in words about books rather than
     * about the network, because "couldn't reach your library" invites the
     * reader to try again in a minute at something that will never work offline.
     *
     * On success the book's queued writes go too. A bookmark waiting to be sent
     * to a book that has just been deleted would drain into a rejection, be
     * dropped, and cost a round trip to learn nothing.
     */
    async deleteBooks(bookIds: readonly BookId[]): Promise<void> {
      if (knownOffline()) noDeleteOffline()
      try {
        await cloud.deleteBooks(bookIds)
      } catch (error) {
        if (looksOffline(error)) noDeleteOffline()
        throw error
      }
      await mirror(() => forgetQueued(bookIds, outbox))
      // And out of the remembered listing, or the next offline shelf would show
      // a greyed-out row for a book that no longer exists anywhere.
      forgetFromShelf(bookIds)
    },

    async deleteBook(bookId: BookId): Promise<void> {
      await this.deleteBooks([bookId])
    },
  }
}

/**
 * Whether a book's offline copy is still being made. For the tests.
 *
 * They need it because the copy is started and never awaited, and it writes in
 * order — sections, then pictures, then the source file, then the position and
 * marks. Waiting for any one of those is waiting for the middle of it, which is
 * how a test came to cut the signal half way through a copy and fail once in
 * every few runs.
 */
export function copyInFlight(bookId: BookId): boolean {
  return filling.has(bookId)
}

/** Exported for the tests, which need a clean slate between cases. */
export function forgetFillsInFlight(): void {
  filling.clear()
}
