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
  Shelf,
} from '../structure/index.ts'
import { countWordsIn, sectionPathOf } from '../structure/index.ts'
import { cleanTitle, TITLE_CLEAN_VERSION } from '../parse/cleanTitle.ts'
import { isSystemFolder } from '../library/systemFolders.ts'
import {
  db as defaultDb,
  type ReadingBuddyDB,
  type ReadingPosition,
  type StoredChapterIndex,
  type StoredAsset,
  type StoredBookmark,
  type StoredFolder,
  type StoredQuote,
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

/**
 * The reserved asset path a parser writes a book's cover image under, when it
 * finds one. Not a real archive path — a fixed key, so the shelf can ask for
 * "this book's cover" with `getAssets(bookId, [COVER_ASSET_PATH])` without
 * knowing anything about the book's format or internal file layout. Absent
 * entirely for a book with no extractable cover; the shelf falls back to a
 * generated placeholder in that case.
 */
export const COVER_ASSET_PATH = '__cover__'

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

/**
 * A book with no folders at all.
 *
 * The key is **removed** rather than set to an empty array. `folderIds` is a
 * multiEntry index, and Dexie's own rule is that an absent key and a present-but-
 * empty one are not the same thing to a `where('folderIds')` query — the same
 * trap the single `folderId` had, in its multi-valued form. An empty array also
 * costs a row of storage on every book in the library to say nothing.
 */
function unfiled(book: BookMeta): BookMeta {
  const { folderIds: _dropped, ...rest } = book
  return rest
}

/** The same book, out of one folder — and out of *all* folders if it was its last. */
function withoutFolder(book: BookMeta, folderId: string): BookMeta {
  const kept = (book.folderIds ?? []).filter((id) => id !== folderId)
  return kept.length === 0 ? unfiled(book) : { ...book, folderIds: kept }
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

    /** Set or clear (`undefined`) the reader's 1–5 rating for a book (WP-47). */
    async rateBook(id: BookId, rating: number | undefined): Promise<void> {
      const book = await database.books.get(id)
      if (!book) return
      await database.books.put({ ...book, rating })
    },

    /**
     * Overwrite a book's title by hand — the escape hatch for metadata a
     * parser couldn't fully clean. Some epubs (often ones that passed through
     * a download/conversion pipeline) carry a `<dc:title>` with a subtitle
     * mashed straight into the real title with no punctuation between them;
     * the parser can strip a trailing hash, ISBN or author, but can't tell a
     * subtitle apart from a title algorithmically. This is how a reader fixes
     * the rest by hand, once, from the book's detail page.
     */
    async renameBook(id: BookId, title: string): Promise<void> {
      const trimmed = title.trim()
      if (!trimmed) return
      const book = await database.books.get(id)
      if (!book) return
      // `titleOverridden` is what stops the automatic cleanup (`healTitles`)
      // from ever running back over this answer — see the field's note.
      await database.books.put({ ...book, title: trimmed, titleOverridden: true })
    },

    /**
     * Re-run the title cleanup over books already on the shelf, and report how
     * many titles actually changed.
     *
     * This is the fix for a class of bug that had cost several rounds of "you
     * said you fixed it": a title is computed once, at import, and then stored.
     * Improving the cleanup rules therefore did nothing for any book already
     * imported — the reader had to still own the source file and know to press
     * Update, and if the automatic rules still couldn't crack that particular
     * title, even that achieved nothing visible. Two devices could sit on the
     * same version of the app showing two different titles for the same book,
     * purely because of what each had been asked to re-import.
     *
     * A title doesn't need any of that ceremony. It is one short string, and
     * everything needed to recompute it — the stored title and author — is
     * already in the row. So this runs at boot, offline, over metadata only,
     * and never touches a section.
     *
     * Two things it will not do:
     *   - **Overrule a manual rename** (`titleOverridden`). The reader only
     *     reaches for the pencil when the guess was wrong.
     *   - **Blank a title.** If the rules would cut the whole string away, the
     *     existing title is kept. A book with a bad name is findable; a book
     *     with no name is lost on the shelf.
     *
     * Books are stamped with `TITLE_CLEAN_VERSION` whether or not their title
     * changed, so this is a no-op on every boot after the first.
     */
    async healTitles(): Promise<number> {
      const books = await database.books.toArray()

      const rewritten: BookMeta[] = []
      let changed = 0

      for (const book of books) {
        if (book.titleOverridden) continue
        if (book.titleCleanVersion === TITLE_CLEAN_VERSION) continue

        const cleaned = cleanTitle(book.title, book.author)
        const keepsMeaning = cleaned && cleaned !== book.title
        if (keepsMeaning) changed += 1

        rewritten.push({
          ...book,
          title: keepsMeaning ? cleaned : book.title,
          titleCleanVersion: TITLE_CLEAN_VERSION,
        })
      }

      if (rewritten.length > 0) await database.books.bulkPut(rewritten)
      return changed
    },

    /** Set or clear (`undefined`) a book's free-text reflections (WP-49). */
    async setNotes(id: BookId, notes: string | undefined): Promise<void> {
      const book = await database.books.get(id)
      if (!book) return
      await database.books.put({ ...book, notes: notes || undefined })
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

    /**
     * Which pictures this book has — the paths only, never the bytes.
     *
     * The counterpart `getAssets` deliberately lacks: it makes the caller name
     * what it wants, which is right for the reading screen and useless to
     * anything that has to move a whole book. Copying a library needs to ask
     * "what is here?" before it can ask for any of it, and pulling every blob
     * just to learn their names would be the largest read in the app.
     */
    async listAssetPaths(bookId: BookId): Promise<string[]> {
      const rows = await database.assets.where('bookId').equals(bookId).toArray()
      return rows.map((row) => row.path)
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

    /**
     * Every section of a book, in reading order — the whole of its prose.
     *
     * The one call in here that deliberately loads a book's entire text, and it
     * exists for in-book search (WP-14), which cannot answer "where does this
     * word appear" from anything less. Everything else reads one section at a
     * time, and should go on doing so: this is the expensive door, and it is
     * named so that using it is a decision rather than an accident.
     *
     * Sorted here rather than left to the index. `[bookId+path]` orders by the
     * *text* of the path, which is right only while the numbers are zero-padded
     * to the same width — true today, and a silent reordering the day a book has
     * more than 99 chapters. Sorting on the numbers cannot drift.
     */
    async listSections(bookId: BookId): Promise<StoredSection[]> {
      const sections = await database.sections.where('bookId').equals(bookId).toArray()
      return sections.sort((a, b) => a.chapter - b.chapter || a.section - b.section)
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
     *
     * `at` defaults to now and is passed in by exactly one caller: the offline
     * write queue, replaying a page turn made in a tunnel. It has to be the
     * moment the reader turned the page rather than the moment the signal came
     * back, or "most recent write wins" would mean "most recently reconnected
     * wins" and a stale queue would beat a laptop read made since.
     */
    async savePosition(
      bookId: BookId,
      anchor: Anchor,
      percent?: number,
      at: string = new Date().toISOString(),
    ): Promise<void> {
      await database.positions.put({
        bookId,
        anchor,
        at,
        ...(percent === undefined ? {} : { percent }),
      })
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
      // variadic overload stops at five tables, and this touches eight.
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
          database.quotes,
          database.bookmarks,
        ],
        async () => {
          for (const bookId of bookIds) {
            await database.sections.where('bookId').equals(bookId).delete()
            await database.chapters.where('bookId').equals(bookId).delete()
            await database.manifests.delete(bookId)
            await database.positions.delete(bookId)
            await database.sources.delete(bookId)
            await database.assets.where('bookId').equals(bookId).delete()
            await database.quotes.where('bookId').equals(bookId).delete()
            await database.bookmarks.where('bookId').equals(bookId).delete()
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
      // Eight tables, so the array form — see `deleteBooks` above.
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
          database.quotes,
          database.bookmarks,
        ],
        async () => {
          await database.sections.where('bookId').equals(bookId).delete()
          await database.chapters.where('bookId').equals(bookId).delete()
          await database.manifests.delete(bookId)
          await database.positions.delete(bookId)
          await database.sources.delete(bookId)
          await database.assets.where('bookId').equals(bookId).delete()
          await database.quotes.where('bookId').equals(bookId).delete()
          await database.bookmarks.where('bookId').equals(bookId).delete()
          await database.books.delete(bookId)
        },
      )
    },

    // --- Quotes ----------------------------------------------------------

    /**
     * Save a favorite passage, typed in from the detail page (WP-48).
     *
     * Returns the row, exactly as `addBookmark` does and for the same reason:
     * the id is invented in here, and the offline write queue needs to know
     * which row it just made so a later "delete that one" can name it.
     */
    async addQuote(bookId: BookId, text: string): Promise<StoredQuote> {
      const quote: StoredQuote = {
        bookId,
        id: crypto.randomUUID(),
        text,
        addedAt: new Date().toISOString(),
      }
      await database.quotes.put(quote)
      return quote
    },

    /** Newest first — how the detail page lists them. */
    async listQuotes(bookId: BookId): Promise<StoredQuote[]> {
      const quotes = await database.quotes.where('bookId').equals(bookId).toArray()
      return quotes.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    },

    async deleteQuote(bookId: BookId, id: string): Promise<void> {
      await database.quotes.delete([bookId, id])
    },

    // --- Bookmarks ---------------------------------------------------------

    /**
     * Mark a place (WP-14). Returns the row, so the caller can show it without
     * a second read.
     *
     * Deliberately not de-duplicated here. Two bookmarks on one paragraph is a
     * question about what the *ribbon* does, and the ribbon answers it by
     * removing rather than adding when the page is already marked — see
     * `bookmarks.ts`. A repository that silently refused a write would make
     * that rule invisible from the place it is actually decided.
     */
    async addBookmark(bookId: BookId, anchor: Anchor, label: string): Promise<StoredBookmark> {
      const bookmark: StoredBookmark = {
        bookId,
        id: crypto.randomUUID(),
        anchor,
        label,
        addedAt: new Date().toISOString(),
      }
      await database.bookmarks.put(bookmark)
      return bookmark
    },

    /**
     * Every bookmark in a book, unordered.
     *
     * Ordering is the caller's, and it is not `addedAt`: a bookmark list is a
     * way of moving around a book, so it reads in the book's own order. That
     * needs the anchor parsed, which is `reader/bookmarks.ts`'s job — see
     * `inBookOrder`.
     */
    async listBookmarks(bookId: BookId): Promise<StoredBookmark[]> {
      return database.bookmarks.where('bookId').equals(bookId).toArray()
    },

    async deleteBookmark(bookId: BookId, id: string): Promise<void> {
      await database.bookmarks.delete([bookId, id])
    },

    /**
     * Give a bookmark a different name.
     *
     * A no-op on a bookmark that has since been deleted, rather than recreating
     * it: renaming a row that is gone is a rename that lost a race, and putting
     * it back would resurrect something the reader removed.
     */
    async renameBookmark(bookId: BookId, id: string, label: string): Promise<void> {
      await database.bookmarks.update([bookId, id], { label })
    },

    // --- Folders -----------------------------------------------------------

    /**
     * Make a folder, or hand back the one that already has this name.
     *
     * Returning the existing folder rather than refusing, or making a second
     * one, is the only behaviour that isn't a small betrayal: a reader typing
     * "Philosophy" into "new folder" for the second time means the philosophy
     * folder, and two folders with one name is a library they can no longer
     * reason about. Matched case-insensitively for the same reason.
     */
    async createFolder(name: string): Promise<StoredFolder | undefined> {
      const trimmed = name.trim()
      if (!trimmed) return undefined

      const existing = await database.folders
        .filter((folder) => folder.name.toLowerCase() === trimmed.toLowerCase())
        .first()
      if (existing) return existing

      const folder: StoredFolder = {
        id: crypto.randomUUID(),
        name: trimmed,
        createdAt: new Date().toISOString(),
      }
      await database.folders.put(folder)
      return folder
    },

    /** Alphabetical, which is the only order a folder list is ever wanted in. */
    async listFolders(): Promise<StoredFolder[]> {
      const folders = await database.folders.toArray()
      return folders.sort((a, b) => a.name.localeCompare(b.name))
    },

    async renameFolder(id: string, name: string): Promise<void> {
      const trimmed = name.trim()
      if (!trimmed) return
      const folder = await database.folders.get(id)
      if (!folder) return
      await database.folders.put({ ...folder, name: trimmed })
    },

    /**
     * Delete a folder — the folder only, never the books in it.
     *
     * A folder is a label on a shelf, not a box with a bottom. Taking the label
     * away must leave the books standing loose in the library; deleting them
     * with it would be the single most destructive misreading this screen could
     * make, and there is no undo. The books are unfiled in the same transaction
     * so no book is ever left pointing at a folder that has gone.
     */
    async deleteFolder(id: string): Promise<void> {
      if (isSystemFolder(id)) return

      await database.transaction('rw', [database.folders, database.books], async () => {
        const inside = await database.books.where('folderIds').equals(id).toArray()
        if (inside.length > 0) {
          await database.books.bulkPut(inside.map((book) => withoutFolder(book, id)))
        }
        await database.folders.delete(id)
      })
    },

    /**
     * Put books into a folder, leaving whatever other folders they are in alone.
     *
     * "Add", not "move", and that is the whole change from the version that
     * shipped: a book can be in Philosophy *and* For the course, so filing it
     * somewhere must not silently unfile it from where it already was. The way
     * back out is `removeBooksFromFolder`, and the way all the way out is
     * `clearFoldersFor` — both offered on the same menu, because a one-way door
     * on an organising feature is how a library stops being trusted.
     *
     * Takes a list because that is how the library's selection mode works —
     * thirty books filed in one transaction rather than thirty round trips that
     * can fail halfway and leave the reader guessing which moved.
     *
     * A system folder is refused outright rather than quietly ignored at the
     * last moment: Unread and Finished are worked out from reading progress, and
     * an id written into a book would be a second, disagreeing answer to a
     * question that already has one. See `library/systemFolders.ts`.
     */
    async addBooksToFolder(bookIds: readonly BookId[], folderId: string): Promise<void> {
      if (bookIds.length === 0 || isSystemFolder(folderId)) return

      await database.transaction('rw', database.books, async () => {
        const books = await database.books.bulkGet([...bookIds])
        const updated = books
          .filter((book): book is BookMeta => book !== undefined)
          .filter((book) => !(book.folderIds ?? []).includes(folderId))
          .map((book) => ({ ...book, folderIds: [...(book.folderIds ?? []), folderId] }))
        if (updated.length > 0) await database.books.bulkPut(updated)
      })
    },

    /** Take books out of one folder, leaving the others they are in untouched. */
    async removeBooksFromFolder(bookIds: readonly BookId[], folderId: string): Promise<void> {
      if (bookIds.length === 0 || isSystemFolder(folderId)) return

      await database.transaction('rw', database.books, async () => {
        const books = await database.books.bulkGet([...bookIds])
        const updated = books
          .filter((book): book is BookMeta => book !== undefined)
          .filter((book) => (book.folderIds ?? []).includes(folderId))
          .map((book) => withoutFolder(book, folderId))
        if (updated.length > 0) await database.books.bulkPut(updated)
      })
    },

    /** Turn books loose again — out of every folder at once. */
    async clearFoldersFor(bookIds: readonly BookId[]): Promise<void> {
      if (bookIds.length === 0) return

      await database.transaction('rw', database.books, async () => {
        const books = await database.books.bulkGet([...bookIds])
        const updated = books
          .filter((book): book is BookMeta => book !== undefined)
          .filter((book) => (book.folderIds ?? []).length > 0)
          .map((book) => unfiled(book))
        if (updated.length > 0) await database.books.bulkPut(updated)
      })
    },

    /**
     * Set the shelf (Book / Research paper / Document) on several books at once.
     *
     * Always recorded as an override, exactly as the single-book `move` on the
     * library screen has always been: nothing later gets to re-guess a shelf
     * the reader has corrected by hand.
     */
    async setShelfFor(bookIds: readonly BookId[], shelf: Shelf): Promise<void> {
      if (bookIds.length === 0) return

      await database.transaction('rw', database.books, async () => {
        const books = await database.books.bulkGet([...bookIds])
        const updated = books
          .filter((book): book is BookMeta => book !== undefined)
          .map((book) => ({ ...book, shelf, shelfOverridden: true as const }))
        if (updated.length > 0) await database.books.bulkPut(updated)
      })
    },
  }
}

export type Repository = ReturnType<typeof createRepository>

/** The app-wide repository. Tests build their own against a scratch database. */
export const repository: Repository = createRepository()
