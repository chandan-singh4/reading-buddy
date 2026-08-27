import { fixtureDataSource } from './fixture.ts'
import type { ChapterListEntry, ChapterSummary } from './types.ts'

/**
 * The one seam between the chapter pages and whatever produces their content.
 *
 * Today the only implementation is `fixtureDataSource` — hand-written sample
 * text, so the page renders before either model exists. Tomorrow a second
 * implementation reads what the Librarian and the Scribe wrote to storage. The
 * page never learns which one it got.
 *
 * Every method is async even though the fixture answers instantly. A real
 * source reads IndexedDB, and changing a signature later would touch every
 * caller; paying the `await` now costs nothing and saves that.
 */
export interface SummaryDataSource {
  /** Every chapter of one book, in reading order, read or not. */
  getChapterList(book: string): Promise<ChapterListEntry[]>
  /** One chapter's two sections. `undefined` if it has not been read yet. */
  getChapter(book: string, chapter: string | number): Promise<ChapterSummary | undefined>
}

/*
 * TODO: the Librarian and the Scribe.
 *
 * Two models, two prompts, both still to be written. Neither is started, and
 * nothing below this line calls out to anything.
 *
 *   1. The **Librarian** runs on a chapter. In goes the chapter; out come the
 *      plain-language summary and the tags for it. Fills `recapText` and
 *      `tags`.
 *   2. The **Scribe** runs on the reader's conversation with Veda about that
 *      chapter. In go the questions and answers; out comes a summary of them.
 *      Fills `qaText`.
 *
 * Also unbuilt, and needed before either can run for real:
 *
 *   - **When they run.** Most likely at the end of a chapter, but nothing
 *     triggers them yet.
 *   - **Where the output is kept.** A store keyed by book and chapter, so a
 *     chapter is summarised once and not on every visit.
 *   - **Which model, and through what.** OpenRouter, or the `api/` endpoint
 *     that already holds the Claude key.
 */

let current: SummaryDataSource = fixtureDataSource

/** The source the page reads. */
export function summaryData(): SummaryDataSource {
  return current
}

/**
 * Swap the source. The engine will call this once at startup; tests call it to
 * install their own data and call it again with `fixtureDataSource` to undo.
 */
export function setSummaryData(source: SummaryDataSource): void {
  current = source
}
