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

/** One chapter, or one titled section of one, that could be summarised. */
export interface Job {
  bookId: BookId
  chapter: number
  /**
   * The titled section this job covers, when it covers one.
   *
   * Absent means the whole chapter. Both are wanted: the chapter recap is the
   * paragraph that ties the chapter together, and the section summaries sit
   * under it. See `titledSections` for why untitled parts are never jobs.
   */
  section?: number
  /** The section's title. Present exactly when `section` is. */
  sectionTitle?: string
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
    const spine = chaptersOf(bookId)

    for (const chapter of finishedChapters(spine, position)) {
      const automatic = index === 0
      // The chapter first, and not only for tidiness: the Librarian adds new
      // concept names to the canonical list as it goes, and the chapter-wide
      // pass is the one most likely to raise them. Sections that follow then
      // match against a list that already has them.
      if (!alreadyDone.has(`${bookId}:${chapter}`)) {
        jobs.push({ bookId, chapter, automatic })
      }

      const entry = spine.find((row) => row.chapter === chapter)
      for (const part of titledSections(entry)) {
        if (alreadyDone.has(`${bookId}:${chapter}:${part.section}`)) continue
        jobs.push({
          bookId,
          chapter,
          section: part.section,
          sectionTitle: part.title,
          automatic,
        })
      }
    }

    /*
     * The named parts the reader has finished inside the chapter they are still
     * reading.
     *
     * A chapter is not summarised until it is finished, and that is right: its
     * recap has to cover the whole of it. A named part is not the same thing. A
     * reader four parts into a seven-part chapter has genuinely finished those
     * four, and the reader asked for parts to be treated as chapters in their
     * own right. Without this, the one chapter they are actually working
     * through is the one chapter that offers them nothing.
     */
    for (const part of readSections(chaptersOf(bookId), position)) {
      if (alreadyDone.has(`${bookId}:${part.chapter}:${part.section}`)) continue
      jobs.push({
        bookId,
        chapter: part.chapter,
        section: part.section,
        sectionTitle: part.title,
        automatic: index === 0,
      })
    }
  })

  return jobs
}

/**
 * The named parts finished inside the chapter the reader is still in.
 *
 * Strictly before the part holding the anchor, for the reason `finishedChapters`
 * gives: being on the last page of a part is not the same as having finished
 * it, and a summary bought halfway through goes stale within the hour.
 *
 * Empty for a finished chapter — those parts come through the loop above, and
 * offering them twice would be two lines and two calls for one summary.
 */
export function readSections(
  chapters: ChapterIndex[],
  position?: ReadingPosition,
): { chapter: number; section: number; title: string }[] {
  if (!position) return []
  const parts = tryParseAnchor(position.anchor)
  if (!parts) return []
  // At 100 percent the chapter itself is finished, so its parts are already
  // offered above.
  if (position.percent === 100) return []

  const entry = chapters.find((row) => row.chapter === parts.chapter)
  return titledSections(entry)
    .filter((part) => part.section < parts.section)
    .map((part) => ({ chapter: parts.chapter, section: part.section, title: part.title }))
}

/**
 * The sections of a chapter that are worth a summary of their own.
 *
 * A section qualifies only if it has a title. Two reasons, and the reader chose
 * both. A titled section is a thing the author named and the contents page
 * lists, so a summary of it has something to be called; an untitled one is a
 * scene break, and a row reading "Chapter 4, part 3" is worse than no row.
 * And every summary is a paid call — a book of unnamed breaks would multiply
 * the bill for a list nobody can navigate.
 *
 * A chapter with one titled section is skipped too: a lone section covers the
 * same ground as the chapter recap above it, so it would be the same call
 * charged twice for near-identical words.
 */
export function titledSections(
  chapter: ChapterIndex | undefined,
): { section: number; title: string }[] {
  if (!chapter) return []
  const titled = chapter.sections
    .filter((entry): entry is typeof entry & { title: string } => {
      return typeof entry.title === 'string' && entry.title.trim().length > 0
    })
    .map((entry) => ({ section: entry.section, title: entry.title.trim() }))
    .sort((a, b) => a.section - b.section)

  return titled.length > 1 ? titled : []
}

/**
 * What `plan` checks against.
 *
 * Keys are `${bookId}:${chapter}` for a chapter and
 * `${bookId}:${chapter}:${section}` for a section, so the two can never be
 * mistaken for one another. A `Set` in practice; named for what it means.
 */
export type ReadySet = { has(key: string): boolean }
