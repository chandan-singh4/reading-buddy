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
  BookId,
  BookMeta,
  ChapterIndex,
  Manifest,
  Section,
  SectionPath,
} from '../structure/index.ts'
import { sectionPathOf } from '../structure/index.ts'
import {
  db as defaultDb,
  type ReadingBuddyDB,
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

    // --- Deletion --------------------------------------------------------

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
        async () => {
          await database.sections.where('bookId').equals(bookId).delete()
          await database.chapters.where('bookId').equals(bookId).delete()
          await database.manifests.delete(bookId)
          await database.books.delete(bookId)
        },
      )
    },
  }
}

export type Repository = ReturnType<typeof createRepository>

/** The app-wide repository. Tests build their own against a scratch database. */
export const repository: Repository = createRepository()
