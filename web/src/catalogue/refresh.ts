/**
 * Asking the catalogue about one book, or about the whole shelf.
 *
 * The last layer, and the only one that writes anything. `lookup.ts` decides
 * what is true, `apply.ts` decides what may be stored, and this moves the bytes:
 * saves the book, and fetches the cover where there is one worth having.
 *
 * ## Why the backfill stops on the first failure
 *
 * Because failures here are never about one book. The way this fails in real
 * life is the daily quota running out, and then every remaining request fails
 * too — so carrying on means 30 more requests that cannot succeed, against a
 * limit that is already the problem. Stopping leaves the rest unstamped, which
 * is exactly the state that brings them back tomorrow.
 */
import {
  COVER_ASSET_PATH,
  FETCHED_COVER_ASSET_PATH,
  type createRepository,
} from '../storage/index.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import { applied } from './apply.ts'
import { lookupBook, type Catalogue, type Outcome } from './lookup.ts'

type Repository = ReturnType<typeof createRepository>

export interface RefreshDeps {
  repository: Pick<Repository, 'saveBook' | 'listBooks' | 'saveAssets' | 'listAssetPaths'>
  catalogue: Catalogue
  /** Cover bytes, or `undefined`. Never throws — a missing picture is not a failure. */
  fetchCover(url: string): Promise<Blob | undefined>
  /** Injectable so tests don't depend on the clock. */
  now?(): string
}

/**
 * Ask about one book and store whatever came back.
 *
 * Returns the outcome so a caller can say what happened — the difference
 * between "not in Google Books" and "couldn't reach Google Books" matters just
 * as much on screen as it does in the database.
 */
export async function refreshBook(book: BookMeta, deps: RefreshDeps): Promise<Outcome> {
  const outcome = await lookupBook(book, deps.catalogue)

  const updated = applied(book, outcome, deps.now?.() ?? new Date().toISOString())
  if (!updated) return outcome // Failed: nothing is written. See `apply.ts`.

  await deps.repository.saveBook(updated)

  if (outcome.status === 'matched' && outcome.coverUrl) {
    await storeCover(book.id, outcome.coverUrl, deps)
  }
  return outcome
}

/**
 * Fetch and keep a cover, unless the book already has its own.
 *
 * A cover that came out of the epub always wins on screen — it is the edition
 * actually in hand — so downloading Google's picture for a book that has one
 * would be spending a phone's data on an image nothing will ever display.
 */
async function storeCover(bookId: BookId, url: string, deps: RefreshDeps): Promise<void> {
  const paths = await deps.repository.listAssetPaths(bookId)
  if (paths.includes(COVER_ASSET_PATH)) return

  const blob = await deps.fetchCover(url)
  if (!blob) return

  await deps.repository.saveAssets(bookId, [{ path: FETCHED_COVER_ASSET_PATH, data: blob }])
}

export interface BackfillReport {
  /** Books that got catalogue data. */
  matched: number
  /** Books the catalogue genuinely has no record of. Stamped, so not re-asked. */
  unmatched: number
  /** Why it stopped early, if it did. */
  stopped?: string
}

/**
 * A book nobody has successfully asked about yet.
 *
 * `metadataFetchedAt` is the only test, and it is deliberately not
 * "`googleVolumeId` is missing": a book that is genuinely not in the catalogue
 * has no volume id and never will, and asking about it nightly forever is how
 * a quota gets spent on a guaranteed answer of no.
 */
export function needsLookup(book: BookMeta): boolean {
  return !book.metadataFetchedAt
}

/**
 * Work through every book that has never been asked about.
 *
 * One at a time on purpose. This is a background chore against somebody else's
 * rate limit, and there is nothing waiting on it finishing quickly.
 */
export async function backfill(deps: RefreshDeps, limit = Infinity): Promise<BackfillReport> {
  const books = (await deps.repository.listBooks()).filter(needsLookup).slice(0, limit)

  const report: BackfillReport = { matched: 0, unmatched: 0 }

  for (const book of books) {
    const outcome = await refreshBook(book, deps)

    if (outcome.status === 'matched') report.matched += 1
    else if (outcome.status === 'unmatched') report.unmatched += 1
    else {
      report.stopped = outcome.reason
      break
    }
  }

  return report
}
