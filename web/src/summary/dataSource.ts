import { liveDataSource } from './liveSource.ts'
import type { ChapterListEntry, ChapterSummary } from './types.ts'

/**
 * The one seam between the chapter pages and whatever produces their content.
 *
 * `liveDataSource` reads what the Librarian and the Scribe actually wrote.
 * `fixtureDataSource` is hand-written sample text, kept for the tests. The page
 * never learns which one it got.
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

let current: SummaryDataSource = liveDataSource

/** The source the page reads. */
export function summaryData(): SummaryDataSource {
  return current
}

/**
 * Swap the source. Tests call this to install their own data, and hand it back
 * afterwards — the source is module-level by design, because it has to outlive
 * a component.
 */
export function setSummaryData(source: SummaryDataSource): void {
  current = source
}
