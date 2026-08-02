/**
 * The single public API for persistence. Every read and write in the app goes
 * through here, so the database can be reshaped later without touching callers.
 *
 * Reads are deliberately narrow: `getManifest` + `getChapterIndex` + one
 * `getSection` is the whole retrieval path. There is no "load the book"
 * function, and that omission is the point — the token strategy depends on
 * never pulling a whole book into memory.
 */

import type {
  Anchor,
  BookId,
  BookMeta,
  ChapterIndex,
  Manifest,
  Section,
  SectionPath,
} from '../structure/index.ts'
import { countWordsIn, sectionPathOf } from '../structure/index.ts'
import {
  db as defaultDb,
  type ReadingBuddyDB,
  type ReadingPosition,
  type StoredChapterIndex,
  type StoredSection,
} from './db.ts'

/** Everything a parser produces for one book, written atomically. */
export interface ParsedBook {
  meta: BookMeta
  manifest: Manifest
  chapters: ChapterIndex[]
  sections: Section[]
}

export function createRepository(database: ReadingBuddyDB = defaultDb) {
  return {
    // --- Books ---------------------------------------------------------

    async saveBook(meta: BookMeta): Promise<void> {
      await database.books.put(meta)
    },

    async getBook(id: BookId): Promise<BookMeta | undefined> {
      return database.books.get(id)
    },

    /** Newest import first — the order the library screen wants. */
    async listBooks(): Promise<BookMeta[]> {
      const books = await database.books.orderBy('importedAt').toArray()
      return books.reverse()
    },

    /**
     * The book with this file fingerprint, if it's already on the shelf.
     * Indexed, so this stays a lookup rather than a scan as the library grows.
     */
    async findByContentHash(hash: string): Promise<BookMeta | undefined> {
      return database.books.where('contentHash').equals(hash).first()
    },

    /** The same, by the fingerprint of the book's opening text. */
    async findByTextSignature(signature: string): Promise<BookMeta | undefined> {
      return database.books.where('textSignature').equals(signature).first()
    },

    /** Books with no text fingerprint yet — imported before it was recorded. */
    async listBooksWithoutTextSignature(): Promise<BookMeta[]> {
      return database.books.filter((book) => book.textSignature === undefined).toArray()
    },

    // --- Import --------------------------------------------------------

    /**
     * Write a freshly parsed book in one transaction. All-or-nothing on
     * purpose: a phone that dies mid-import should leave no half-parsed book
     * in the library.
     */
    async saveParsedBook(book: ParsedBook): Promise<void> {
      const { meta, manifest, chapters, sections } = book
      const bookId = meta.id

      await database.transaction(
        'rw',
        database.books,
        database.manifests,
        database.chapters,
        database.sections,
        async () => {
          await database.books.put(meta)
          await database.manifests.put({ ...manifest, bookId })
          await database.chapters.bulkPut(
            chapters.map((chapter): StoredChapterIndex => ({ ...chapter, bookId })),
          )
          await database.sections.bulkPut(
            sections.map((section): StoredSection => ({ ...section, bookId })),
          )
        },
      )
    },

    // --- Manifest & chapter index ---------------------------------------

    async saveManifest(manifest: Manifest): Promise<void> {
      await database.manifests.put(manifest)
    },

    async getManifest(bookId: BookId): Promise<Manifest | undefined> {
      return database.manifests.get(bookId)
    },

    async saveChapterIndex(bookId: BookId, index: ChapterIndex): Promise<void> {
      await database.chapters.put({ ...index, bookId })
    },

    async getChapterIndex(
      bookId: BookId,
      chapter: number,
    ): Promise<StoredChapterIndex | undefined> {
      return database.chapters.get([bookId, chapter])
    },

    /**
     * Every chapter index for a book, in order.
     *
     * This is *not* the "load the book" call the module header rules out. A
     * chapter index is a list of section titles and paths — no prose ever lives
     * here — so this is one small row per chapter, the same order of magnitude
     * as the manifest sitting beside it. The Jung epub returns 12 rows.
     *
     * It exists because a page number and a one-page-at-a-time slider need to
     * know how long *every* section is, not just the ones in the chapter being
     * read. Contrast `backfillWordCounts`, which does touch prose and is
     * therefore fenced off as a one-shot migration.
     */
    async listChapterIndexes(bookId: BookId): Promise<StoredChapterIndex[]> {
      const chapters = await database.chapters.where('bookId').equals(bookId).toArray()
      return chapters.sort((a, b) => a.chapter - b.chapter)
    },

    // --- Sections --------------------------------------------------------

    /** Bulk write — one round trip for a whole book's worth of sections. */
    async saveSections(bookId: BookId, sections: Section[]): Promise<void> {
      await database.sections.bulkPut(
        sections.map((section): StoredSection => ({ ...section, bookId })),
      )
    },

    /** The hot path: fetch exactly one section by its address. */
    async getSection(
      bookId: BookId,
      path: SectionPath,
    ): Promise<StoredSection | undefined> {
      return database.sections.get([bookId, path])
    },

    /**
     * Fetch the section an anchor points into. Throws on a malformed anchor
     * (see `structure/anchor.ts`) rather than quietly missing.
     */
    async getSectionByAnchor(
      bookId: BookId,
      anchor: string,
    ): Promise<StoredSection | undefined> {
      return database.sections.get([bookId, sectionPathOf(anchor)])
    },

    /** Section count, for progress and sanity checks. Doesn't load the rows. */
    async countSections(bookId: BookId): Promise<number> {
      return database.sections.where('bookId').equals(bookId).count()
    },

    // --- Where you stopped reading ---------------------------------------

    /**
     * Remember where reading stopped. Overwrites the previous position — there
     * is one per book, not a history; going back to somewhere you've been is
     * WP-13's contents list, not this.
     *
     * Called repeatedly while reading, so it stays a single-row `put` with no
     * transaction and no read-before-write.
     */
    async savePosition(bookId: BookId, anchor: Anchor): Promise<void> {
      await database.positions.put({ bookId, anchor, at: new Date().toISOString() })
    },

    async getPosition(bookId: BookId): Promise<ReadingPosition | undefined> {
      return database.positions.get(bookId)
    },

    /** Most recently read first — what "Continue reading" (WP-24) will want. */
    async listPositions(): Promise<ReadingPosition[]> {
      const positions = await database.positions.orderBy('at').toArray()
      return positions.reverse()
    },

    async forgetPosition(bookId: BookId): Promise<void> {
      await database.positions.delete(bookId)
    },

    // --- One-shot migrations ---------------------------------------------

    /**
     * Fill in word counts for a book imported before they were recorded.
     *
     * **This is the one function that reads an entire book, and it must stay
     * the only one.** `getManifest` → `getChapterIndex` → `getSection` is the
     * read path; nothing in normal reading may call this. It costs no tokens —
     * the token rule governs what reaches Claude, not what reaches the browser —
     * but it does pull every section of a 15 MB epub into memory, which is
     * exactly the shape the storage layer was built to avoid. Acceptable once,
     * per book, never again: it writes the counts back, so the `undefined` that
     * triggers it is gone afterwards.
     *
     * Safe to run on a book that already has counts — it returns immediately.
     * Safe to interrupt: nothing is written until every count is in hand, and
     * the write is one transaction, so a phone that dies mid-migration simply
     * runs it again next time.
     *
     * Word counts are metadata. Unlike WP-38's block kinds, adding them moves no
     * anchor and renumbers no paragraph, which is why this can happen after
     * books exist at all.
     *
     * @returns the updated manifest, or `undefined` if there was nothing to do
     *   or no such book.
     */
    async backfillWordCounts(bookId: BookId): Promise<Manifest | undefined> {
      const manifest = await database.manifests.get(bookId)
      if (!manifest) return undefined
      if (manifest.chapters.every((chapter) => chapter.words !== undefined)) return undefined

      const [sections, chapters] = await Promise.all([
        database.sections.where('bookId').equals(bookId).toArray(),
        database.chapters.where('bookId').equals(bookId).toArray(),
      ])

      // path → words, so the chapter indexes can be updated by lookup rather
      // than by re-deriving which sections belong to which chapter.
      const wordsByPath = new Map<SectionPath, number>()
      for (const section of sections) {
        wordsByPath.set(
          section.path,
          countWordsIn(section.paragraphs.map((paragraph) => paragraph.text)),
        )
      }

      const updatedChapters = chapters.map((chapter): StoredChapterIndex => ({
        ...chapter,
        sections: chapter.sections.map((entry) => ({
          ...entry,
          words: wordsByPath.get(entry.path) ?? 0,
        })),
      }))

      const totalsByChapter = new Map<number, number>()
      for (const chapter of updatedChapters) {
        let total = 0
        for (const entry of chapter.sections) total += entry.words ?? 0
        totalsByChapter.set(chapter.chapter, total)
      }

      const updatedManifest: Manifest = {
        ...manifest,
        chapters: manifest.chapters.map((chapter) => ({
          ...chapter,
          words: totalsByChapter.get(chapter.chapter) ?? 0,
        })),
      }

      let written = false
      await database.transaction(
        'rw',
        database.books,
        database.manifests,
        database.chapters,
        async () => {
          // The book can be deleted while this is counting — a reader who backs
          // out of a long book and removes it. Writing anyway would resurrect a
          // manifest and a set of chapter indexes for a book that no longer
          // exists, which `deleteBook` cascades specifically to prevent. Checked
          // inside the transaction so the answer can't go stale between the
          // check and the write.
          if (!(await database.books.get(bookId))) return
          await database.manifests.put({ ...updatedManifest, bookId })
          await database.chapters.bulkPut(updatedChapters)
          written = true
        },
      )

      return written ? updatedManifest : undefined
    },

    // --- Deletion --------------------------------------------------------

    /**
     * Remove several books at once.
     *
     * One transaction for the lot, rather than a loop of `deleteBook`. Clearing
     * a shelf of thirty-five books is thirty-five transactions otherwise, each
     * with its own round trip, and a failure halfway would leave the reader
     * looking at an arbitrary subset with no way to tell which. Here it either
     * all happens or none of it does.
     *
     * Deleting by `bookId` index rather than by collecting keys first: a book
     * can hold thousands of sections, and pulling them all into memory just to
     * delete them is exactly the whole-book read the storage layer avoids.
     */
    async deleteBooks(bookIds: readonly BookId[]): Promise<void> {
      if (bookIds.length === 0) return

      await database.transaction(
        'rw',
        database.books,
        database.manifests,
        database.chapters,
        database.sections,
        database.positions,
        async () => {
          for (const bookId of bookIds) {
            await database.sections.where('bookId').equals(bookId).delete()
            await database.chapters.where('bookId').equals(bookId).delete()
            await database.manifests.delete(bookId)
            await database.positions.delete(bookId)
            await database.books.delete(bookId)
          }
        },
      )
    },

    /**
     * Remove a book and everything belonging to it, in one transaction.
     * Cascading matters: orphaned sections are invisible, unreachable, and
     * would quietly eat a phone's storage quota forever.
     */
    async deleteBook(bookId: BookId): Promise<void> {
      await database.transaction(
        'rw',
        database.books,
        database.manifests,
        database.chapters,
        database.sections,
        database.positions,
        async () => {
          await database.sections.where('bookId').equals(bookId).delete()
          await database.chapters.where('bookId').equals(bookId).delete()
          await database.manifests.delete(bookId)
          await database.positions.delete(bookId)
          await database.books.delete(bookId)
        },
      )
    },
  }
}

export type Repository = ReturnType<typeof createRepository>

/** The app-wide repository. Tests build their own against a scratch database. */
export const repository: Repository = createRepository()
