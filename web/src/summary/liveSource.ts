import { repository } from '../storage/index.ts'
import { summaryStore } from '../storage/summaries.ts'
import type { BookId } from '../structure/index.ts'
import type { SummaryDataSource } from './dataSource.ts'
import type { ChapterListEntry, ChapterSummary, SectionSummary } from './types.ts'

/**
 * The real source: what the Librarian and the Scribe actually wrote.
 *
 * Replaces `fixtureDataSource` once the engine is running. The page cannot tell
 * the difference, which is the whole point of the seam.
 *
 * ## What the page shows, and what it does not
 *
 * The Librarian returns a recap and a list of concepts; both are shown, the
 * concepts as the chips under the summary.
 *
 * The Scribe returns a *list* of claims, each with a concept and a pointer back
 * to the book. The page has one section for them, so they are laid out one to a
 * line. They are deliberately not welded into a single paragraph: the
 * connective sentences would have to be invented, and nothing in this app may
 * write words and present them as a model's.
 *
 * The concept names and the anchors are not drawn at all here. They are not
 * wasted — they are what the Obsidian export is built from, where a concept
 * name becomes a link between notes. See `docs/decisions.md`.
 */
export const liveDataSource: SummaryDataSource = {
  async getChapterList(book: string): Promise<ChapterListEntry[]> {
    const bookId = book as BookId
    const spine = await repository.listChapterIndexes(bookId)
    const summaries = await summaryStore.list(bookId)
    // Only chapter-wide rows mark a chapter as distilled. A chapter with one
    // section summarised and no recap has not been done, and the rail must not
    // claim that it has.
    const done = new Set(
      summaries.filter((row) => row.section === undefined).map((row) => row.chapter),
    )

    return spine
      .sort((a, b) => a.chapter - b.chapter)
      .map((entry) => ({
        chapter: entry.chapter,
        chapterTitle: entry.title,
        distilled: done.has(entry.chapter),
      }))
  },

  async getChapter(book: string, chapter: string | number): Promise<ChapterSummary | undefined> {
    const bookId = book as BookId
    const wanted = Number(chapter)
    if (!Number.isFinite(wanted)) return undefined

    const rows = await summaryStore.list(bookId)
    const row = rows.find((entry) => entry.chapter === wanted && entry.section === undefined)
    if (!row) return undefined

    const sections: SectionSummary[] = rows
      .filter((entry) => entry.chapter === wanted && entry.section !== undefined)
      .sort((a, b) => (a.section ?? 0) - (b.section ?? 0))
      .map((entry) => ({
        section: entry.section ?? 0,
        title: entry.sectionTitle ?? '',
        recapText: entry.recap,
        tags: entry.concepts.map((concept) => concept.name),
        ...(entry.recapModel ? { recapModel: entry.recapModel } : {}),
        ...(entry.itemsModel ? { itemsModel: entry.itemsModel } : {}),
        ...(entry.items && entry.items.length > 0
          ? { qaText: entry.items.map((item) => item.claim).join('\n\n') }
          : {}),
      }))

    const meta = await repository.getBook(bookId)

    return {
      book: meta?.title ?? '',
      chapter: row.chapter,
      chapterTitle: row.chapterTitle,
      recapText: row.recap,
      tags: row.concepts.map((concept) => concept.name),
      ...(row.recapModel ? { recapModel: row.recapModel } : {}),
      ...(row.itemsModel ? { itemsModel: row.itemsModel } : {}),
      ...(row.items && row.items.length > 0
        ? { qaText: row.items.map((item) => item.claim).join('\n\n') }
        : {}),
      ...(sections.length > 0 ? { sections } : {}),
    }
  },
}
