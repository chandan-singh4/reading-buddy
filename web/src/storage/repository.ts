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
  type StoredAsset,
  type StoredSection,
  type StoredSource,
} from './db.ts'

/**
 * A picture a parser pulled out of the file, on its way to storage. The same
 * pair as `StoredAsset` minus the book, which the book itself supplies.
 */
export interface BookAsset {
  path: string
  data: Blob
}

/** Everything a parser produces for one book, written atomically. */
export interface ParsedBook {
  meta: BookMeta
  manifest: Manifest
  chapters: ChapterIndex[]
  sections: Section[]
  /**
   * The book's pictures, keyed by the path its figures point at. Absent from
   * formats that carry their images inline (docx writes `data:` URIs) or not
   * at all (plain text).
   */
  assets?: BookAsset[]
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

    /**
     * Replace a book's text with a fresh parse of the same file.
     *
     * The difference from `saveParsedBook` is the *clearing*. A new parser can
     * divide a book into fewer chapters or fewer sections than the old one did,
     * and a plain `bulkPut` would leave the surplus rows behind — orphan
     * sections that no chapter index mentions, silently eating storage, plus a
     * manifest that disagrees with what is actually there. So the old sections
     * and chapters go first, inside the same transaction.
     *
     * The book keeps its identity: same id, same shelf, same place in the list,
     * same reading position. The position is deliberately *not* cleared — an
     * anchor either still names a paragraph, in which case the reader is put
     * back where they were, or it doesn't, in which case the reading screen
     * already opens at the beginning rather than complaining (WP-15).
     */
    async replaceParsedBook(book: ParsedBook): Promise<void> {
      const { meta, manifest, chapters, sections } = book
      const bookId = meta.id

      await database.transaction(
        'rw',
        database.books,
        database.manifests,
        database.chapters,
        database.sections,
        async () => {
          await database.sections.where('bookId').equals(bookId).delete()
          await database.chapters.where('bookId').equals(bookId).delete()

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

    // --- Pictures ------------------------------------------------------------

    /**
     * Store a book's pictures, replacing any it already had.
     *
     * Outside the `saveParsedBook` transaction, and for the same reason the
     * original file is: **the text is the book and the pictures are a
     * convenience.** A phone too full to hold 141 plates should still end up
     * with a readable book showing captions, which is exactly where it was
     * before this table existed — not with the import rolled back.
     *
     * Always clears first, so a re-parse that finds different images can't
     * leave the old ones orphaned under paths nothing points at any more.
     */
    async saveAssets(bookId: BookId, assets: readonly BookAsset[]): Promise<void> {
      await database.transaction('rw', database.assets, async () => {
        await database.assets.where('bookId').equals(bookId).delete()
        if (assets.length === 0) return
        await database.assets.bulkPut(
          assets.map((asset): StoredAsset => ({ ...asset, bookId })),
        )
      })
    },

    /**
     * The pictures for the paths asked for, and only those.
     *
     * Deliberately *not* "every picture in this book": the reading screen asks
     * for the handful its current page mentions. A whole-book fetch here would
     * be the largest read in the app by an order of magnitude, on the one
     * screen that has to stay smooth.
     */
    async getAssets(bookId: BookId, paths: readonly string[]): Promise<Map<string, Blob>> {
      const found = new Map<string, Blob>()
      if (paths.length === 0) return found

      const rows = await database.assets.bulkGet(paths.map((path) => [bookId, path]))
      for (const row of rows) {
        if (row) found.set(row.path, row.data)
      }
      return found
    },

    // --- The original file -------------------------------------------------

    /**
     * Keep the file a book came from, so it can be parsed again later.
     *
     * Written separately from `saveParsedBook` rather than inside its
     * transaction, and that is the point: **the book matters and the file is a
     * convenience.** If storing a 60 MB blob fails on a full phone, the reader
     * should still get their book — they simply lose the ability to re-parse it
     * without finding the file again, which is exactly where they were before
     * this table existed. Rolling the import back over it would be trading
     * something that matters for something that doesn't.
     */
    async saveSource(bookId: BookId, file: Blob, filename: string): Promise<void> {
      await database.sources.put({ bookId, file, filename, size: file.size })
    },

    async getSource(bookId: BookId): Promise<StoredSource | undefined> {
      return database.sources.get(bookId)
    },

    /**
     * Which of these books still have their original file — asked once for the
     * whole shelf rather than once per row, and answered without touching a
     * single blob. `Dexie.Table.keys()` reads the primary key index only, so
     * this stays cheap however large the files are.
     */
    async booksWithSource(): Promise<Set<BookId>> {
      const keys = await database.sources.toCollection().primaryKeys()
      return new Set(keys)
    },

    /** Total bytes held in kept files — what the shelf offers to reclaim. */
    async sourcesSize(): Promise<number> {
      let total = 0
      await database.sources.each((source) => {
        total += source.size
      })
      return total
    },

    /**
     * Drop the kept files without touching the books themselves. Reclaims the
     * space at the cost of the one-tap update — a trade only the reader can
     * make, so it is offered rather than taken.
     */
    async forgetSources(): Promise<void> {
      await database.sources.clear()
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

      // The table list is an array rather than separate arguments: Dexie's
      // variadic overload stops at five tables, and this touches seven.
      await database.transaction(
        'rw',
        [
          database.books,
          database.manifests,
          database.chapters,
          database.sections,
          database.positions,
          database.sources,
          database.assets,
        ],
        async () => {
          for (const bookId of bookIds) {
            await database.sections.where('bookId').equals(bookId).delete()
            await database.chapters.where('bookId').equals(bookId).delete()
            await database.manifests.delete(bookId)
            await database.positions.delete(bookId)
            await database.sources.delete(bookId)
            await database.assets.where('bookId').equals(bookId).delete()
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
      // Seven tables, so the array form — see `deleteBooks` above.
      await database.transaction(
        'rw',
        [
          database.books,
          database.manifests,
          database.chapters,
          database.sections,
          database.positions,
          database.sources,
          database.assets,
        ],
        async () => {
          await database.sections.where('bookId').equals(bookId).delete()
          await database.chapters.where('bookId').equals(bookId).delete()
          await database.manifests.delete(bookId)
          await database.positions.delete(bookId)
          await database.sources.delete(bookId)
          await database.assets.where('bookId').equals(bookId).delete()
          await database.books.delete(bookId)
        },
      )
    },
  }
}

export type Repository = ReturnType<typeof createRepository>

/** The app-wide repository. Tests build their own against a scratch database. */
export const repository: Repository = createRepository()
