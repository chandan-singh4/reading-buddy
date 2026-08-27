import type { ReadingPosition } from '../storage/db.ts'
import { type BookId, type ChapterIndex, tryParseAnchor } from '../structure/index.ts'

/**
 * Which chapters are finished, which book goes first, and which books have to
 * ask permission before spending a call.
 *
 * Pure functions over data the app already stores. Nothing here reads the
 * database or talks to a model — `summary/engine.ts` does both, and it is much
 * harder to test. Every rule the reader stated lives in this file so it can be
 * checked without a browser.
 */

/**
 * The chapters a reader has finished, by number.
 *
 * Worked out from where they stopped, because nothing records chapter
 * completion directly. The anchor says which chapter they are *inside*, so
 * every chapter before it is done. The one they are in is not — being on the
 * last page of chapter four is not the same as having finished it, and
 * summarising a chapter the reader is halfway through would spend a call on a
 * summary that goes stale within the hour.
 *
 * The exception is a finished book. At 100 percent there is no chapter still in
 * progress, so the chapter holding the anchor counts too. Without this, the last
 * chapter of every book the reader ever finishes would never be summarised.
 *
 * A book with no position has been imported and not opened. Nothing is finished.
 */
export function finishedChapters(chapters: ChapterIndex[], position?: ReadingPosition): number[] {
  if (!position) return []

  const parts = tryParseAnchor(position.anchor)
  if (!parts) return []

  const done = position.percent === 100
  return chapters
    .map((entry) => entry.chapter)
    .filter((chapter) => (done ? chapter <= parts.chapter : chapter < parts.chapter))
    .sort((a, b) => a - b)
}

/**
 * The books, most recently opened first.
 *
 * A book with no position sorts last: it has never been opened, so it is the
 * least likely thing the reader wants summarised now.
 */
export function booksByRecency(positions: ReadingPosition[]): BookId[] {
  return [...positions]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map((position) => position.bookId)
}

/** One chapter that could be summarised. */
export interface Job {
  bookId: BookId
  chapter: number
  /**
   * Whether this may run without being asked.
   *
   * True only for the book the reader opened last. Everything else waits in the
   * bell for a yes. That is the reader's own rule, and the reason for it is
   * money: a shelf of forty half-read books would otherwise fire off a hundred
   * calls the first time the app came up.
   */
  automatic: boolean
}

/**
 * Everything that could be summarised, in the order to do it.
 *
 * The most recently opened book comes first and is the only one marked
 * automatic. Within a book, chapters run in reading order, because a later
 * chapter's concepts should be matched against a vocabulary that already has
 * the earlier chapter's in it — both prompts are built on the list being
 * current, and running chapter nine before chapter four would hand the
 * Librarian a list missing names it should have matched.
 *
 * `alreadyDone` is the set of `${bookId}:${chapter}` pairs that have a summary.
 * They are skipped: a summary is a paid call, and rebuilding one that nothing
 * changed is money for the same words back.
 */
export function plan(
  positions: ReadingPosition[],
  chaptersOf: (book: BookId) => ChapterIndex[],
  alreadyDone: ReadySet,
): Job[] {
  const order = booksByRecency(positions)
  const jobs: Job[] = []

  order.forEach((bookId, index) => {
    const position = positions.find((row) => row.bookId === bookId)
    for (const chapter of finishedChapters(chaptersOf(bookId), position)) {
      if (alreadyDone.has(`${bookId}:${chapter}`)) continue
      jobs.push({ bookId, chapter, automatic: index === 0 })
    }
  })

  return jobs
}

/** What `plan` checks against. A `Set` in practice; named for what it means. */
export type ReadySet = { has(key: string): boolean }
