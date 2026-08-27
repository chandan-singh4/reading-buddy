import { fixtureDataSource } from './fixture.ts'
import type { ChapterListEntry, ChapterSummary, Concept, VedaNote } from './types.ts'

/**
 * The one seam between the summary views and whatever produces their data.
 *
 * Today the only implementation is `fixtureDataSource` — hand-written sample
 * content, so both pages render standalone. Tomorrow a second implementation
 * reads what the Scribe/Librarian engine wrote to storage. The views never
 * learn which one they got.
 *
 * Every method is async even though the fixture answers instantly. A real
 * source reads IndexedDB, and changing a signature later would touch every
 * caller; paying the `await` now costs nothing and saves that.
 */
export interface SummaryDataSource {
  /** Every heading in the Commonplace Book, across all books. */
  getConcepts(): Promise<Concept[]>
  /** One heading and the passages filed under it. `undefined` if unknown. */
  getConcept(name: string): Promise<Concept | undefined>
  /** The chapters of one book that have been distilled, in reading order. */
  getChapterList(book: string): Promise<ChapterListEntry[]>
  /** One chapter's recap and items. `undefined` if that chapter has none. */
  getChapter(book: string, chapter: string | number): Promise<ChapterSummary | undefined>
  /**
   * The running controlled vocabulary for one book — the names the chapter
   * pass has extracted so far. The views do not draw this yet; it is here
   * because the engine's passes read and append to it, and the interface is
   * the place that contract belongs.
   */
  getConceptList(book: string): Promise<string[]>
  /** Veda's marginal note for a heading, if she wrote one. */
  getVedaNote(concept: string): Promise<VedaNote | undefined>
}

/*
 * TODO: Scribe/Librarian engine.
 *
 * Everything that *produces* the data above is separate work and deliberately
 * absent. When it lands, it replaces the fixture below with a storage-backed
 * source and adds, in this order:
 *
 *   1. The **chapter pass** — reads one chapter, returns the plain-language
 *      recap and the concepts it extracts. Runs first.
 *   2. The **concept-list store** — the running controlled vocabulary the
 *      passes read and append to, carried forward across chapters so chapter 9
 *      reuses chapter 4's canonical names. `getConceptList` is its read side.
 *   3. The **Q&A pass** — runs after the chapter pass, so the list is current.
 *      Distils that chapter's Q&A into items and tags each against the list,
 *      flagging anything off-list as `candidate` rather than inventing a node.
 *   4. **Model routing and orchestration** — best-available model by preference
 *      order via OpenRouter, the chapter-end trigger, the storage writes, and
 *      the Obsidian markdown export.
 *   5. The **approval flow** — promoting a `candidate` concept to `linked`,
 *      or merging it into an existing heading. Until then a candidate item
 *      shows in the Chapter View and stays out of the Commonplace Book.
 */

let current: SummaryDataSource = fixtureDataSource

/** The source the views read. */
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
