/**
 * Bringing books up to date a book at a time, instead of all at once.
 *
 * A parser change stamps every book on the shelf as behind (see
 * `parse/version.ts`). The first answer to that was a panel that re-read the
 * whole library the moment the app started: with 32 books that is a minute of
 * a frozen phone before anything can be read, and it gets worse with every
 * book added. The work is also the *wrong* work — most of those books will not
 * be opened today, and re-reading them buys nothing until they are.
 *
 * So the work is split in two, and neither half is a wall:
 *
 * - **On open.** Opening a book that is behind re-reads that one book first.
 *   It is the one moment the wait is worth something, and the reading screen
 *   already holds a cover over the page until it is ready, so there is nothing
 *   new to look at — the book simply takes a moment longer to open.
 * - **The trickle.** While the app sits idle it quietly brings one stale book
 *   up to date, waits, then takes the next. Given a few minutes of the app
 *   being open, most books are already done by the time they are opened, and
 *   the on-open path finds nothing to do.
 *
 * ## Why everything goes through one queue
 *
 * Parsing runs on the main thread — it is DOMParser, mammoth and pdf.js, none
 * of which are in a worker. Two re-parses at once would not merely be slow,
 * they would both write to the same tables. So every path here goes through a
 * single promise chain: a book being opened waits for the trickle's current
 * book to finish, and the trickle never starts one while a book is opening.
 *
 * ## Why a failure is remembered
 *
 * A book whose source file has gone, or whose file the parser now chokes on,
 * stays behind forever. Without a memory the trickle would pick that same book
 * every time it looked, and never reach the ones it could actually fix. The
 * memory lives for the session only: a fresh launch is allowed to try again.
 */

import { reparseBook } from '../import/index.ts'
import { repository } from '../storage/index.ts'
import type { BookId, BookMeta } from '../structure/index.ts'

import { findOutdated } from './bookUpdate.ts'
import { forgetLibraryMemory } from './libraryMemory.ts'
import { forgetShelfMemory } from './shelfMemory.ts'
import { forgetCovers } from './useCovers.ts'

/** How long after launch the trickle takes its first book. */
const FIRST_DELAY = 8_000
/** How long it rests between books, so reading never competes with parsing. */
const BETWEEN_DELAY = 20_000
/** How long it waits before looking again while the tab is in the background. */
const ASLEEP_DELAY = 30_000

/**
 * The one lane all re-parsing runs in. Every job is chained onto the last,
 * whichever half of the module asked for it.
 */
let lane: Promise<unknown> = Promise.resolve()

/** Books this session has already tried and failed to rebuild. */
const givenUp = new Set<BookId>()

function inLane<T>(work: () => Promise<T>): Promise<T> {
  // `then(work, work)` rather than `then(work)`: a job that threw must not
  // stop every job behind it from ever running.
  const run = lane.then(work, work)
  lane = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/**
 * Re-read one book, and tell the rest of the app what it can no longer trust.
 *
 * Returns the book's new record, or `null` if it could not be rebuilt —
 * `reparseBook` leaves a book it failed on exactly as it was, so a `null` here
 * means "still the old version", never "damaged".
 */
async function rebuild(bookId: BookId): Promise<BookMeta | null> {
  try {
    await reparseBook(bookId)
  } catch {
    givenUp.add(bookId)
    return null
  }

  // The shelf is holding this book's cover art and its row position, both
  // taken from the version that has just been replaced. Named rather than
  // wholesale: every other book's cover is still good.
  forgetCovers([bookId])
  forgetShelfMemory()
  forgetLibraryMemory()

  return (await repository.getBook(bookId)) ?? null
}

/**
 * Called as a book opens, with the record the reading screen just read.
 *
 * Returns a fresher record when the book was rebuilt, and `null` when there
 * was nothing to do — which is the ordinary case, and costs nothing.
 */
export function catchUpOnOpen(book: BookMeta): Promise<BookMeta | null> {
  if (givenUp.has(book.id)) return Promise.resolve(null)

  return inLane(async () => {
    // Checked inside the lane, not outside it: the trickle may have rebuilt
    // this very book while we were waiting our turn.
    const current = await repository.getBook(book.id)
    if (!current) return null

    const { updatable } = await findOutdated()
    if (!updatable.some((one) => one.id === current.id)) return null

    return await rebuild(current.id)
  }).catch(() => null)
}

/** The next book worth trickling, or `undefined` when the shelf is caught up. */
async function nextStale(): Promise<BookMeta | undefined> {
  const { updatable } = await findOutdated()
  return updatable.find((book) => !givenUp.has(book.id))
}

/**
 * Start the background trickle. Returns a function that stops it.
 *
 * `eager` skips the opening pause — used on the launch that follows an
 * accepted app update, where the reader has just said yes to exactly this.
 */
export function startCatchUp(eager = false): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  /** True from the moment a tick is scheduled until it has finished or given up. */
  let busy = false

  const later = (delay: number) => {
    if (stopped) return
    busy = true
    timer = setTimeout(() => void tick(), delay)
  }

  const tick = async () => {
    timer = undefined
    if (stopped) {
      busy = false
      return
    }

    // Nothing happens behind a hidden tab. A phone with the app in the
    // background is a phone doing something else, and parsing there is both
    // rude and, on iOS, likely to be killed mid-write.
    if (typeof document !== 'undefined' && document.hidden) {
      later(ASLEEP_DELAY)
      return
    }

    let book: BookMeta | undefined
    try {
      book = await nextStale()
    } catch {
      busy = false
      return
    }

    // Caught up, or shut down mid-look. Nothing is scheduled: `visibilitychange`
    // below is what wakes this again if the shelf ever falls behind afresh.
    if (stopped || !book) {
      busy = false
      return
    }

    await inLane(() => rebuild(book.id)).catch(() => null)
    busy = false
    later(BETWEEN_DELAY)
  }

  const onVisible = () => {
    if (!stopped && !document.hidden && !busy) later(BETWEEN_DELAY)
  }

  later(eager ? 0 : FIRST_DELAY)
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
