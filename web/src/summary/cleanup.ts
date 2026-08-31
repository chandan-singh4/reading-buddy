/**
 * The one-time clearing of old summaries.
 *
 * The library had summaries written for books the reader never asked about —
 * the queue used to run ahead on its own, and the results piled up. The reader
 * wants one book's summaries kept and the rest gone, so that from here on every
 * summary in the app is one they said yes to.
 *
 * A sweep, not a migration. It touches no schema and no shape; it only removes
 * rows. It runs once, records that it ran in `localStorage`, and never runs
 * again — so a summary written *after* the sweep is safe, whichever book it is
 * for.
 */

import type { BookId } from '../structure/index.ts'
import { repository } from '../storage/index.ts'
import { alertStore, summaryStore } from '../storage/summaries.ts'

/** The one book whose summaries survive. Matched loosely — see `keeps`. */
const KEEP_TITLE = 'man and his symbols'

const FLAG = 'reading-buddy.summaries-cleared.v1'

/**
 * Does this title name the book we keep?
 *
 * Loose on purpose. The same book arrives as "Man and His Symbols", with a
 * subtitle, or with the editor's name attached, depending on where the file
 * came from. An exact match would drop the very summaries this sweep exists to
 * protect, and a false keep costs the reader nothing.
 */
export function keeps(title: string): boolean {
  return title.toLowerCase().includes(KEEP_TITLE)
}

/**
 * Delete every summary except the kept book's, and the `ready` lines that
 * pointed at them.
 *
 * Safe to call on every launch: the flag makes every call after the first a
 * no-op.
 */
export interface CleanupStores {
  listBooks: typeof repository.listBooks
  summaries: Pick<typeof summaryStore, 'all' | 'remove'>
  alerts: Pick<typeof alertStore, 'list' | 'remove'>
}

/*
 * The app-wide stores, taken as an argument so a test can hand it a scratch
 * database. Nothing in the app passes this.
 */
const LIVE: CleanupStores = {
  listBooks: () => repository.listBooks(),
  summaries: summaryStore,
  alerts: alertStore,
}

export async function clearOldSummaries(stores: CleanupStores = LIVE): Promise<void> {
  if (localStorage.getItem(FLAG)) return

  const books = await stores.listBooks()
  const kept = new Set<BookId>()
  for (const book of books) if (keeps(book.title)) kept.add(book.id)

  const summaries = await stores.summaries.all()
  for (const row of summaries) {
    if (kept.has(row.bookId)) continue
    await stores.summaries.remove(row.bookId, row.chapterId)
  }

  // The bell would otherwise keep offering "Read the summary" on a summary that
  // is no longer there. Only `ready` lines are cleared: an `approval` is still a
  // live question, and a `pending` is a yes the reader is still owed.
  const alerts = await stores.alerts.list()
  for (const alert of alerts) {
    if (alert.kind !== 'ready') continue
    if (kept.has(alert.bookId)) continue
    await stores.alerts.remove(alert.id)
  }

  localStorage.setItem(FLAG, new Date().toISOString())
}
