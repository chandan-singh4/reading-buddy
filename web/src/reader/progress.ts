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
 *
 * ## `pagesInto`, and why the offset arrives in pages
 *
 * An anchor names the paragraph the visible page *begins in*, and a paragraph
 * can run over many columns — a long closing paragraph can be forty pages on its
 * own. Reading through one moved nothing here, so the page number stood still,
 * the percentage stood still, and the chapter countdown stood still, all while
 * the reader was visibly turning pages. The screen already measures the missing
 * half (`withinHere`, how many pages past that paragraph's first column the
 * reader is) — it just had nowhere to put it.
 *
 * It arrives in *pages* because that is the only unit the column layout can
 * report: the browser knows which column is showing, and nothing on the screen
 * knows how many words are in it. Converting at `WORDS_PER_PAGE` is exact rather
 * than approximate, because in this model that constant is the *definition* of a
 * page — the same one `pagesAt` divides by on the way back out. One page of
 * offset in is one page of page number out.
 *
 * Kept as an addition to the words rather than added to the finished page number
 * for the same reason the rest of this file exists: every figure on the screen is
 * derived from this one total, so adding it here moves the page, the percentage
 * and the countdown together. Adding it afterwards would move the page number
 * alone and leave the other two disagreeing with it.
 */
export function wordsAt(
  spine: Spine,
  here: SectionRef,
  section?: Section,
  anchor?: Anchor,
  pagesInto = 0,
): number {
  const entry = spine.entries[indexOfRef(spine, here)]
  const base = entry?.startWords ?? 0
  const offset = Math.max(0, pagesInto) * WORDS_PER_PAGE
  if (!section || !anchor) return base + offset

  const within = paragraphStarts(section).find((start) => start.anchor === anchor)
  return base + (within?.startWords ?? 0) + offset
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
  // `at` counts the words *behind* you, so you're on the next page.
  const page = Math.min(pageCount, Math.floor(at / WORDS_PER_PAGE) + 1)

  return {
    page,
    pageCount,
    /*
     * The last page is 100%, stated rather than divided for.
     *
     * `at` is where the paragraph at the top of the screen *starts*, so there
     * is always some book after it and the division can only approach 100
     * without arriving — on the final page of a real book it returns 99. That
     * was invisible as a readout and load-bearing everywhere else: "finished"
     * is defined as 100% in both `homeShelves.ts` and `library/status.ts`, so
     * nothing was ever finished, the Home shelf stayed empty, and the
     * library's Finished filter matched nothing. Reaching the last page is
     * what finishing a book is; the percentage now says so.
     *
     * A book short enough to be one page is finished the moment it is opened.
     * That is the right answer rather than an edge case to guard: at one page,
     * the whole text is on the screen.
     */
    percent: page >= pageCount ? 100 : Math.round((at / spine.totalWords) * 100),
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

/**
 * The page each chapter opens on, keyed by chapter number.
 *
 * The contents list wants what a printed table of contents has always had: a
 * page beside every title. A chapter's first section already carries the words
 * behind it, and a page *is* a fixed slice of words in this model, so the figure
 * is the same arithmetic `pagesAt` does — read off the chapter's opening instead
 * of the reader's position. No layout, no measuring, nothing loaded.
 */
export function chapterPages(spine: Spine): Map<number, number> {
  const pageCount = pagesIn(spine.totalWords)
  const pages = new Map<number, number>()

  for (const entry of spine.entries) {
    // The first entry of a chapter is where the chapter starts. Later sections
    // of the same chapter start further in, so they must not overwrite it.
    if (pages.has(entry.chapter)) continue
    pages.set(
      entry.chapter,
      Math.min(pageCount, Math.floor(entry.startWords / WORDS_PER_PAGE) + 1),
    )
  }

  return pages
}

// --- The contents, to the depth the book actually has ------------------------

/** One line of the contents page: a chapter, or a titled section inside one. */
export interface OutlineEntry {
  chapter: number
  /** Absent on a chapter's own row. Present on every row indented under it. */
  section?: number
  title: string
  /** The page this division opens on. */
  page: number
}

/**
 * The contents page, with the book's sections shown under its chapters.
 *
 * ## Why a flat list of chapters was not enough
 *
 * Two reasons, and the second is the one that turned it from thin into broken.
 *
 * The plain one: a chapter is a long way. A contents list that offers page 1 and
 * then page 300 is a list you cannot *navigate* with — the point of a contents
 * page is to land near the thing you want, and a book's sections are the only
 * finer division it has.
 *
 * The sharp one: which heading level becomes a "chapter" is resolved from the
 * whole document, and it is the shallowest level present (`parse/assemble.ts`).
 * Plenty of real books print their front and back matter — CONTENTS, NOTES,
 * GLOSSARY, ACKNOWLEDGMENTS — at `<h1>` and their actual chapters at `<h2>`. In
 * such a book every chapter is a *section*, and a contents page that lists only
 * chapters shows six lines of furniture and not one chapter of the book. That is
 * a real book on the reader's shelf, not a hypothetical.
 *
 * Showing both levels answers that book without re-parsing anything, which
 * matters: the alternative fixes the shelf only after every book has been
 * rebuilt, and it can only ever be a better guess at the same question. The
 * chapter titles were in storage the whole time — `listChapterIndexes` already
 * loads them for the spine and threw them away.
 *
 * ## What earns a row
 *
 * Only a section the book gave a *name*. An untitled section is one the parser
 * made — the implicit bucket that holds prose appearing before the first
 * heading, or a slice of the heading-free fallback. Those are real divisions of
 * the text and they are not things the book calls anything, so a contents page
 * has nothing to print beside their page number.
 *
 * A chapter of one section is left as a single row for the same reason a printed
 * contents page does not indent a line under itself: the row would repeat what
 * is directly above it and add a page number equal to it.
 */
export function contentsOutline(
  manifest: Manifest,
  chapterIndexes: readonly ChapterIndex[],
  spine: Spine | null,
): OutlineEntry[] {
  const pageCount = spine ? pagesIn(spine.totalWords) : 0

  /**
   * The page a division opens on, from the words behind it — the same
   * arithmetic `pagesAt` does, read off the division's start rather than off the
   * reader's position. Page 1 when the book does not know its own length, which
   * is honest: the list still navigates, it simply cannot number itself.
   */
  const pageOf = (chapter: number, section: number): number => {
    if (!spine) return 1
    const entry = spine.entries.find(
      (candidate) => candidate.chapter === chapter && candidate.section === section,
    )
    if (!entry) return 1
    return Math.min(pageCount, Math.floor(entry.startWords / WORDS_PER_PAGE) + 1)
  }

  const byChapter = new Map(chapterIndexes.map((index) => [index.chapter, index]))
  const rows: OutlineEntry[] = []

  for (const chapter of manifest.chapters) {
    rows.push({
      chapter: chapter.chapter,
      title: chapter.title || `Chapter ${chapter.chapter}`,
      page: pageOf(chapter.chapter, 1),
    })

    const sections = byChapter.get(chapter.chapter)?.sections ?? []
    // A chapter that is one section is one row. See the note above.
    if (sections.length <= 1) continue

    for (const section of sections) {
      // Untitled sections are the parser's, not the book's. Nothing to print.
      if (!section.title) continue
      rows.push({
        chapter: chapter.chapter,
        section: section.section,
        title: section.title,
        page: pageOf(chapter.chapter, section.section),
      })
    }
  }

  return rows
}

/** Which chapter a slider position means. The inverse of `progressOf`. */
export function chapterAt(manifest: Manifest, fraction: number): number {
  const chapterCount = manifest.chapters.length
  if (chapterCount <= 1) return 1

  const raw = Math.round(fraction * (chapterCount - 1)) + 1
  return clamp(raw, 1, chapterCount)
}
