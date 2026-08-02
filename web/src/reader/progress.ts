/**
 * Where you are in a book, said honestly.
 *
 * Two answers live here, and the bottom bar cycles between them:
 *
 * - **Chapters** (`progressLabel`) — "Chapter 5 of 12 · Reason and Contemplation".
 * - **Pages** (`pagesOf`) — "Page 250 of 338", counted in the book's own *words*.
 *
 * The original rule was that page numbers are never shown, because a page
 * derived from the *screen* changes with the font and so describes the device
 * rather than the book. That diagnosis still holds and this module still obeys
 * it: nothing here measures or lays out anything. A word-page is a fixed slice
 * of the text, so the total is a property of the book. See `structure/words.ts`
 * for the reasoning and `decisions.md` (session 3) for the reversal.
 *
 * Everything is derived from the manifest — one line per chapter, already in
 * memory — plus, for the finer half, the current chapter's index, which the
 * reader has already loaded to navigate. Nothing here loads a section.
 */

import { WORDS_PER_PAGE, countWords, pagesIn } from '../structure/index.ts'
import type { Anchor, ChapterIndex, Manifest, Section } from '../structure/index.ts'
import type { SectionRef } from './navigation.ts'

export interface Progress {
  /** 1-based, and clamped to the book — a stale position can't point past the end. */
  chapter: number
  chapterCount: number
  /** 0 to 1, for the slider. Start of chapter 1 is 0; start of the last is 1. */
  fraction: number
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function progressOf(manifest: Manifest, here: SectionRef): Progress {
  const chapterCount = manifest.chapters.length
  const chapter = clamp(here.chapter, 1, Math.max(chapterCount, 1))

  // A single-chapter book is entirely "at the start": there is nowhere to
  // slide to, and 0/0 would otherwise be a division by zero.
  const fraction = chapterCount <= 1 ? 0 : (chapter - 1) / (chapterCount - 1)

  return { chapter, chapterCount, fraction }
}

/**
 * The one line shown under the slider. Deliberately says *chapter*, not page,
 * and not a percentage — a percentage over chapters would imply chapters are
 * the same length, which they never are.
 */
export function progressLabel(manifest: Manifest, here: SectionRef): string {
  const { chapter, chapterCount } = progressOf(manifest, here)
  const title = manifest.chapters.find((entry) => entry.chapter === chapter)?.title

  const position = `Chapter ${chapter} of ${chapterCount}`
  return title ? `${position} · ${title}` : position
}

// --- Pages, counted in words ------------------------------------------------

export interface Pages {
  /** 1-based, and always at least 1 — you are never on page 0 of a book. */
  page: number
  pageCount: number
  /** 0–100, whole numbers. The figure shown at the right of the bar. */
  percent: number
  /** Pages from here to the end of this chapter, counting the one you're on. */
  leftInChapter: number
}

/**
 * Every section of the book with its length and its running start — the flat
 * list that makes both the page number and the one-page-at-a-time slider
 * possible.
 *
 * Built from the manifest plus every chapter *index*. That sounds like the
 * whole-book read the architecture forbids, and isn't: a chapter index holds
 * section titles and paths, never prose. See `repository.listChapterIndexes`.
 */
export interface SpineEntry {
  chapter: number
  section: number
  words: number
  /** Words in the book before this section starts. */
  startWords: number
}

export interface Spine {
  entries: SpineEntry[]
  totalWords: number
}

/**
 * Whether a book knows its own length yet.
 *
 * `false` means it was imported before word counts existed and hasn't been
 * backfilled — see `repository.backfillWordCounts`. The bar must fall back to
 * chapters rather than invent a page number.
 */
export function hasWordCounts(manifest: Manifest): boolean {
  return (
    manifest.chapters.length > 0 &&
    manifest.chapters.every((entry) => entry.words !== undefined)
  )
}

/**
 * Flatten the book into sections with running word offsets.
 *
 * Returns `null` when the book doesn't know its own length — imported before
 * word counts existed and not yet backfilled. Every caller treats `null` as
 * "show chapters instead", so a missing count degrades to the old behaviour
 * rather than to a wrong number.
 */
export function buildSpine(
  manifest: Manifest,
  chapterIndexes: readonly ChapterIndex[],
): Spine | null {
  if (!hasWordCounts(manifest)) return null

  const byChapter = new Map(chapterIndexes.map((index) => [index.chapter, index]))
  const entries: SpineEntry[] = []
  let running = 0

  for (const chapter of manifest.chapters) {
    const index = byChapter.get(chapter.chapter)

    // A chapter whose index didn't load still has to occupy its own length, or
    // every page number after it would be short. It becomes one coarse entry —
    // you can still slide through it, just not section by section.
    const sections = index?.sections ?? [{ section: 1, words: chapter.words ?? 0 }]

    for (const section of sections) {
      const words = section.words ?? 0
      entries.push({ chapter: chapter.chapter, section: section.section, words, startWords: running })
      running += words
    }
  }

  if (running <= 0) return null
  return { entries, totalWords: running }
}

/** Where in the spine a position sits. `-1` if the book is empty. */
function indexOfRef(spine: Spine, here: SectionRef): number {
  const exact = spine.entries.findIndex(
    (entry) => entry.chapter === here.chapter && entry.section === here.section,
  )
  if (exact !== -1) return exact

  // A section the spine doesn't know (a stale position, or an index that failed
  // to load) still deserves a sane answer: fall back to the start of its chapter.
  const chapterStart = spine.entries.findIndex((entry) => entry.chapter === here.chapter)
  return chapterStart !== -1 ? chapterStart : 0
}

/**
 * Where each paragraph of a section starts, in words from the section's own
 * beginning.
 *
 * Sections are long — a chapter of the Jung epub is often a single one running
 * fourteen pages — so a position that can only name a section is not a page
 * position at all. The paragraphs are already in memory and already carry
 * anchors, so this needs no schema change and no second pass over the book.
 */
export function paragraphStarts(section: Section): { anchor: Anchor; startWords: number }[] {
  const starts: { anchor: Anchor; startWords: number }[] = []
  let running = 0
  for (const paragraph of section.paragraphs) {
    starts.push({ anchor: paragraph.anchor, startWords: running })
    running += countWords(paragraph.text)
  }
  return starts
}

/**
 * Words in the book before a given spot: the start of a section, or — when the
 * section and one of its anchors are handed over — the start of that paragraph.
 *
 * The single number every page figure is derived from. Keeping it one number is
 * what stops the bar, the slider and the chapter countdown from disagreeing
 * about where you are.
 */
export function wordsAt(
  spine: Spine,
  here: SectionRef,
  section?: Section,
  anchor?: Anchor,
): number {
  const entry = spine.entries[indexOfRef(spine, here)]
  const base = entry?.startWords ?? 0
  if (!section || !anchor) return base

  const within = paragraphStarts(section).find((start) => start.anchor === anchor)
  return base + (within?.startWords ?? 0)
}

/**
 * "Page 250 of 338", plus the percentage and the pages left in this chapter.
 *
 * `position` is words into the book — see `wordsAt`. Passing the start of the
 * current section gives the old section-granular answer; passing the paragraph
 * actually on screen gives a page number that moves as you read.
 */
export function pagesAt(spine: Spine, here: SectionRef, position: number): Pages {
  const entry = spine.entries[indexOfRef(spine, here)]

  let chapterEnd = 0
  for (const other of spine.entries) {
    if (other.chapter === entry?.chapter) chapterEnd = other.startWords + other.words
  }

  const pageCount = pagesIn(spine.totalWords)
  const at = clamp(position, 0, spine.totalWords)

  return {
    // `at` counts the words *behind* you, so you're on the next page.
    page: Math.min(pageCount, Math.floor(at / WORDS_PER_PAGE) + 1),
    pageCount,
    percent: Math.round((at / spine.totalWords) * 100),
    // At least 1: standing anywhere in a chapter, there is always this page.
    leftInChapter: Math.max(1, pagesIn(chapterEnd - at)),
  }
}

/** The section-granular answer — where you are when nothing finer is known. */
export function pagesOf(spine: Spine, here: SectionRef): Pages {
  return pagesAt(spine, here, wordsAt(spine, here))
}

/** Words into the book that a page number begins at. */
export function wordsAtPage(spine: Spine, page: number): number {
  const pageCount = pagesIn(spine.totalWords)
  return (clamp(page, 1, Math.max(pageCount, 1)) - 1) * WORDS_PER_PAGE
}

/**
 * Which section a page number lands in — what the fine slider needs.
 *
 * Section-granular, so it is only half the answer: a chapter of a real book is
 * often a single section running a dozen pages, and stopping here made the
 * slider do nothing at all until it crossed into the next chapter. Pair it with
 * `anchorAtPage` once that section is loaded.
 */
export function refAtPage(spine: Spine, page: number): SectionRef {
  const targetWords = wordsAtPage(spine, page)

  // The last section that starts at or before the target — walking forward and
  // keeping the last match, so a zero-length section can't win over real text.
  let best = spine.entries[0]
  for (const entry of spine.entries) {
    if (entry.startWords <= targetWords) best = entry
    else break
  }

  return { chapter: best?.chapter ?? 1, section: best?.section ?? 1 }
}

/**
 * Which paragraph *within* a section a page begins at — the other half of
 * `refAtPage`, and what makes the slider move one page at a time through a long
 * chapter instead of sitting still.
 *
 * Returns `undefined` when the page doesn't fall inside this section, so a
 * caller that has loaded the wrong section scrolls nowhere rather than to a
 * misleading spot.
 */
export function anchorAtPage(
  spine: Spine,
  here: SectionRef,
  section: Section,
  page: number,
): Anchor | undefined {
  const entry = spine.entries[indexOfRef(spine, here)]
  if (!entry) return undefined

  const offset = wordsAtPage(spine, page) - entry.startWords
  if (offset < 0 || offset > entry.words) return undefined

  let best: Anchor | undefined
  for (const start of paragraphStarts(section)) {
    if (start.startWords <= offset) best = start.anchor
    else break
  }
  return best
}

/** Which chapter a slider position means. The inverse of `progressOf`. */
export function chapterAt(manifest: Manifest, fraction: number): number {
  const chapterCount = manifest.chapters.length
  if (chapterCount <= 1) return 1

  const raw = Math.round(fraction * (chapterCount - 1)) + 1
  return clamp(raw, 1, chapterCount)
}
