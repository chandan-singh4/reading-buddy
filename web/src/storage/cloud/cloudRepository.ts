/**
 * The same `Repository`, backed by Supabase Postgres and Cloudflare R2.
 *
 * Every read and write the app makes still goes through the shape declared in
 * `../repository.ts` — this module is declared as returning `Repository`, so if
 * a method is missed or its signature drifts, the build fails rather than the
 * app. Swapping backends is then one line in `../index.ts`.
 *
 * ## What changes, and what deliberately doesn't
 *
 * **Doesn't:** the read path. `getManifest` + `getChapterIndex` + one
 * `getSection` is still the whole of it, and there is still no `loadBook()`.
 * That rule was never about IndexedDB — it is about not pulling a 600-page book
 * into memory to show one page — and it matters *more* over a network, where
 * the same mistake costs a download rather than a memory spike.
 *
 * **Does:** three things, each forced by the medium.
 *
 * 1. **Transactions become RPCs.** IndexedDB let the repository span four
 *    tables in one `transaction`. HTTP gives one statement per request, so
 *    anything that must not half-happen lives in a Postgres function — see
 *    `supabase/migrations/0002_functions.sql`.
 *
 * 2. **A new import is written in three steps, a re-parse in one.** A large
 *    book's sections do not reliably fit in a single request. A *new* book can
 *    therefore be written hidden (`ready = false`), filled in, and revealed —
 *    if it fails, nothing existed to lose. A *re-parse* cannot: the reader
 *    already has that book, and `reparseBook` promises a failure leaves it
 *    exactly as it was. So that one pays for a single atomic call and fails
 *    cleanly if the book is enormous.
 *
 * 3. **Blobs live elsewhere — including the text.** `sources`, `assets` *and*
 *    `sections` keep a key; the bytes are in R2. Deletion is therefore two
 *    steps, and the order matters — see `deleteBooks`.
 *
 *    Postgres holds what the app queries: reading order, section titles, how
 *    many there are. It does not hold a single paragraph. One R2 object carries
 *    a whole chapter's prose, so a page turn is one row plus one object, and a
 *    600-page book costs the database tens of kilobytes rather than most of a
 *    megabyte. See `keys.ts` for why the grain is a chapter and what the parse
 *    token in the key is for.
 *
 * ## What this does not do
 *
 * **There is no offline.** Every call here is a network call, so a phone in a
 * tunnel has no library. The Dexie repository is still the default for exactly
 * that reason. A cache that reads locally and writes through to here is the
 * natural next layer, and this file is written to sit underneath one — nothing
 * in it holds state between calls.
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
} from '../../structure/index.ts'
import { countWordsIn, sectionPathOf } from '../../structure/index.ts'
import { cleanTitle, TITLE_CLEAN_VERSION } from '../../parse/cleanTitle.ts'
import { isSystemFolder } from '../../library/systemFolders.ts'
import type {
  ReadingPosition,
  StoredBookmark,
  StoredChapterIndex,
  StoredFolder,
  StoredQuote,
  StoredSection,
  StoredSource,
} from '../db.ts'
import type { BookAsset, ParsedBook, Repository } from '../repository.ts'
import { CloudError, cloudClient, requireUserId, unwrap } from './client.ts'
import { createR2BlobStore, type BlobEntry, type BlobStore } from './blobs.ts'
import { assetKey, chapterTextKey, sourceKey } from './keys.ts'
import {
  bookFromRow,
  bookToRow,
  bookmarkFromRow,
  chapterFromRow,
  chapterTextOf,
  chunkSections,
  folderFromRow,
  manifestFromRow,
  positionFromRow,
  quoteFromRow,
  readChapterText,
  sectionFromRow,
  sectionToPayload,
  type ChapterText,
  type SectionPayload,
  type AssetRow,
  type BookRow,
  type BookmarkRow,
  type ChapterRow,
  type FolderRow,
  type ManifestRow,
  type PositionRow,
  type QuoteRow,
  type SectionRow,
  type SourceRow,
} from './rows.ts'

/**
 * How many rows to ask for at a time when reading a whole table's worth.
 *
 * PostgREST caps a response, and the cap is invisible: you get 1000 rows and no
 * indication there were 1200. Every unbounded read here therefore pages
 * explicitly. It matters most for `listSections`, which feeds in-book search —
 * a silently truncated book would simply stop matching half way through, with
 * nothing anywhere to say why.
 */
const PAGE_SIZE = 500

interface QueryResult<T> {
  data: T[] | null
  error: { message: string } | null
}

/** Read every row, a page at a time. */
async function readAll<T>(
  build: (from: number, to: number) => PromiseLike<QueryResult<T>>,
  what: string,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = unwrap(await build(from, from + PAGE_SIZE - 1), what) ?? []
    all.push(...page)
    if (page.length < PAGE_SIZE) return all
  }
}

/** Everything one parse of a book's text turns into: objects, rows, and keys. */
interface TextPlan {
  /** One object per chapter, ready to upload. */
  uploads: BlobEntry[]
  /** One row per section, each pointing at its chapter's object. */
  payloads: SectionPayload[]
  /** Just the keys, for cleaning up when a write doesn't land. */
  keys: string[]
}

/**
 * Turn a parsed book's sections into the objects and rows they will become.
 *
 * Grouped by chapter, in one pass, preserving the order the parser produced —
 * a chapter's object is written in reading order, which matters not at all to
 * the app (it looks sections up by path) and a great deal to anyone who ever
 * has to open one of these files to see what went wrong.
 *
 * Pure but for `Blob`: no network, no clock, no ids invented here. The parse
 * token is passed in so the caller owns the one decision that has to be made
 * once per parse rather than once per chapter.
 */
function planText(
  userId: string,
  bookId: BookId,
  sections: readonly Section[],
  parseToken: string,
): TextPlan {
  const byChapter = new Map<number, Section[]>()
  for (const section of sections) {
    const group = byChapter.get(section.chapter)
    if (group) group.push(section)
    else byChapter.set(section.chapter, [section])
  }

  const uploads: BlobEntry[] = []
  const payloads: SectionPayload[] = []

  for (const [chapter, group] of byChapter) {
    const key = chapterTextKey(userId, bookId, parseToken, chapter)
    uploads.push({
      key,
      // The media type is what makes these readable in the Cloudflare console
      // rather than downloads — worth the eleven characters.
      blob: new Blob([JSON.stringify(chapterTextOf(group))], { type: 'application/json' }),
    })
    for (const section of group) payloads.push(sectionToPayload(section, key))
  }

  return { uploads, payloads, keys: uploads.map((upload) => upload.key) }
}

export interface CloudRepositoryOptions {
  /** Injectable for tests. Defaults to the real R2 store. */
  blobs?: BlobStore
  /** Injectable for tests; defaults to a fresh uuid. */
  newId?: () => string
  /** Injectable for tests; defaults to now. */
  now?: () => Date
}

export function createCloudRepository(options: CloudRepositoryOptions = {}): Repository {
  const {
    blobs = createR2BlobStore(),
    newId = () => crypto.randomUUID(),
    now = () => new Date(),
  } = options

  const db = () => cloudClient()

  /**
   * The distinct objects a book's text currently lives in.
   *
   * Distinct because a chapter's object is pointed at by every section in it,
   * and asking R2 to delete the same key forty times is forty signed URLs for
   * one deletion.
   */
  async function textKeysFor(bookIds: readonly BookId[]): Promise<string[]> {
    if (bookIds.length === 0) return []
    const rows = await readAll<{ r2_key: string }>(
      (from, to) =>
        db().from('sections').select('r2_key').in('book_id', [...bookIds]).range(from, to),
      'find the book’s text',
    )
    return [...new Set(rows.map((row) => row.r2_key))]
  }

  /** Every r2 key belonging to these books — read before the rows go. */
  async function blobKeysFor(bookIds: readonly BookId[]): Promise<string[]> {
    if (bookIds.length === 0) return []
    const ids = [...bookIds]

    const [sources, assets, text] = await Promise.all([
      readAll<{ r2_key: string }>(
        (from, to) => db().from('sources').select('r2_key').in('book_id', ids).range(from, to),
        'find the kept files',
      ),
      readAll<{ r2_key: string }>(
        (from, to) => db().from('assets').select('r2_key').in('book_id', ids).range(from, to),
        'find the pictures',
      ),
      textKeysFor(ids),
    ])

    return [...sources.map((row) => row.r2_key), ...assets.map((row) => row.r2_key), ...text]
  }

  /** One chapter's text, or an empty chapter if the object isn't readable. */
  async function chapterTextAt(key: string): Promise<ChapterText> {
    const blob = await blobs.get(key)
    if (!blob) return {}
    try {
      return readChapterText(JSON.parse(await blob.text()))
    } catch {
      // Truncated or not JSON at all. Treated as absent rather than thrown:
      // every caller here already has to handle a section whose words didn't
      // arrive, and there is nothing extra a parse error tells the reader.
      return {}
    }
  }

  /**
   * Write a book's text: objects first, then the rows that point at them, then
   * the objects nothing points at any more.
   *
   * The same order as `saveAssets`, for the same reason. Uploading first means
   * a failure leaves objects nobody references — a fraction of a penny, and the
   * next parse's sweep collects them. Writing the rows first would mean a
   * failure leaves rows pointing at text that does not exist, which is a book
   * that opens and then has nothing on the page.
   */
  async function writeSections(bookId: BookId, sections: readonly Section[]): Promise<void> {
    const userId = await requireUserId()
    const plan = planText(userId, bookId, sections, newId())
    const previous = await textKeysFor([bookId])

    await writePlan(bookId, plan)

    const kept = new Set(plan.keys)
    await blobs.remove(previous.filter((key) => !kept.has(key)))
  }

  /** The upload-then-rows half of the above, shared with a first-time import. */
  async function writePlan(bookId: BookId, plan: TextPlan): Promise<void> {
    await blobs.putMany(plan.uploads)

    for (const chunk of chunkSections(plan.payloads)) {
      unwrap(
        await db().rpc('rb_save_sections', { p_book_id: bookId, p_sections: chunk }),
        'save the book’s text',
      )
    }
  }

  return {
    // --- Books ---------------------------------------------------------

    async saveBook(meta: BookMeta): Promise<void> {
      await requireUserId()
      unwrap(await db().from('books').upsert(bookToRow(meta)), 'save the book')
    },

    async getBook(id: BookId): Promise<BookMeta | undefined> {
      const row = unwrap(
        await db().from('books').select('*').eq('id', id).maybeSingle(),
        'load the book',
      ) as BookRow | null
      return row ? bookFromRow(row) : undefined
    },

    async rateBook(id: BookId, rating: number | undefined): Promise<void> {
      unwrap(
        await db().from('books').update({ rating: rating ?? null }).eq('id', id),
        'save the rating',
      )
    },

    async renameBook(id: BookId, title: string): Promise<void> {
      const trimmed = title.trim()
      if (!trimmed) return
      unwrap(
        await db()
          .from('books')
          // `title_overridden` is what stops `healTitles` ever running back over
          // this answer — the reader only reaches for the pencil when the guess
          // was wrong.
          .update({ title: trimmed, title_overridden: true })
          .eq('id', id),
        'rename the book',
      )
    },

    async healTitles(): Promise<number> {
      const rows = await readAll<BookRow>(
        (from, to) => db().from('books').select('*').eq('ready', true).range(from, to),
        'load your books',
      )

      const rewritten: BookRow[] = []
      let changed = 0

      for (const row of rows) {
        const book = bookFromRow(row)
        if (book.titleOverridden) continue
        if (book.titleCleanVersion === TITLE_CLEAN_VERSION) continue

        const cleaned = cleanTitle(book.title, book.author)
        // A book with a bad name is findable; a book with no name is lost on the
        // shelf — so a rule that would cut the whole string away is ignored.
        const title = cleaned && cleaned !== book.title ? cleaned : row.title
        if (title !== row.title) changed += 1

        // Stamped whether or not the title changed, so this is a no-op on every
        // boot after the first.
        rewritten.push({ ...row, title, title_clean_version: TITLE_CLEAN_VERSION })
      }

      if (rewritten.length > 0) {
        unwrap(await db().from('books').upsert(rewritten), 'tidy up your titles')
      }
      return changed
    },

    async setNotes(id: BookId, notes: string | undefined): Promise<void> {
      unwrap(
        await db().from('books').update({ notes: notes || null }).eq('id', id),
        'save your notes',
      )
    },

    async listBooks(): Promise<BookMeta[]> {
      const rows = await readAll<BookRow>(
        (from, to) =>
          db()
            .from('books')
            .select('*')
            .eq('ready', true)
            .order('imported_at', { ascending: false })
            .range(from, to),
        'load your library',
      )
      return rows.map(bookFromRow)
    },

    async findByContentHash(hash: string): Promise<BookMeta | undefined> {
      const row = unwrap(
        await db()
          .from('books')
          .select('*')
          .eq('content_hash', hash)
          .eq('ready', true)
          .limit(1)
          .maybeSingle(),
        'check for a duplicate',
      ) as BookRow | null
      return row ? bookFromRow(row) : undefined
    },

    async findByTextSignature(signature: string): Promise<BookMeta | undefined> {
      const row = unwrap(
        await db()
          .from('books')
          .select('*')
          .eq('text_signature', signature)
          .eq('ready', true)
          .limit(1)
          .maybeSingle(),
        'check for a duplicate',
      ) as BookRow | null
      return row ? bookFromRow(row) : undefined
    },

    async listBooksWithoutTextSignature(): Promise<BookMeta[]> {
      const rows = await readAll<BookRow>(
        (from, to) =>
          db()
            .from('books')
            .select('*')
            .eq('ready', true)
            .is('text_signature', null)
            .range(from, to),
        'find books without a fingerprint',
      )
      return rows.map(bookFromRow)
    },

    // --- Import --------------------------------------------------------

    /**
     * Write a freshly parsed book: hidden, filled in, then revealed.
     *
     * The `ready` flag is doing the work the IndexedDB transaction used to do.
     * Nothing reads a book that isn't finished, so a phone that dies part-way
     * leaves an invisible row rather than a half-parsed book on the shelf — and
     * the next attempt at the same file sweeps it up (`rb_save_book_start`).
     */
    async saveParsedBook(book: ParsedBook): Promise<void> {
      const userId = await requireUserId()
      const { meta, manifest, chapters, sections } = book
      const plan = planText(userId, meta.id, sections, newId())

      unwrap(
        await db().rpc('rb_save_book_start', {
          p_book: meta,
          p_manifest: manifest,
          p_chapters: chapters,
        }),
        'start saving the book',
      )

      try {
        await writePlan(meta.id, plan)
        unwrap(
          await db().rpc('rb_save_book_finish', { p_book_id: meta.id }),
          'finish saving the book',
        )
      } catch (cause) {
        // Leave nothing behind. Guarded server-side on `ready = false`, so this
        // can never remove a book that had already finished.
        await db().rpc('rb_save_book_abort', { p_book_id: meta.id })
        // The rows have gone; the objects must follow, or a failed import is
        // paid for in the bucket for ever with nothing left pointing at it.
        // Safe to name them outright — this parse invented its own token, so
        // these keys belong to this attempt and to nothing else.
        await blobs.remove(plan.keys)
        throw cause
      }
    },

    /**
     * Replace a book's text with a fresh parse of the same file — in one call,
     * one transaction, deliberately.
     *
     * This is the guarantee `reparseBook` makes: the new parse has to succeed
     * *and* contain text before anything is written, so a failure leaves the old
     * book exactly as it was. Splitting it across requests would break that the
     * moment the old sections were deleted.
     *
     * The text going to R2 does not weaken that, because of the parse token in
     * every key. The new chapters are uploaded to addresses **nothing points
     * at**, so until the transaction below runs they are invisible and the old
     * book is still whole. The transaction swaps every row to the new keys at
     * once, and only then are the old objects released. Fail at any point
     * before it and the reader still has exactly what they had.
     *
     * It also made the request this has to fit in far smaller: what crosses the
     * wire now is one short row per section, not a book's worth of prose.
     */
    async replaceParsedBook(book: ParsedBook): Promise<void> {
      const userId = await requireUserId()
      const { meta, manifest, chapters, sections } = book
      const plan = planText(userId, meta.id, sections, newId())
      const previous = await textKeysFor([meta.id])

      await blobs.putMany(plan.uploads)

      try {
        unwrap(
          await db().rpc('rb_replace_parsed_book', {
            p_book: meta,
            p_manifest: manifest,
            p_chapters: chapters,
            p_sections: plan.payloads,
          }),
          'update the book',
        )
      } catch (cause) {
        // Nothing references the new objects, and now nothing ever will.
        await blobs.remove(plan.keys)
        throw cause
      }

      const kept = new Set(plan.keys)
      await blobs.remove(previous.filter((key) => !kept.has(key)))
    },

    // --- Pictures ------------------------------------------------------------

    /**
     * Store a book's pictures, replacing any it already had.
     *
     * Ordered so a failure is always survivable: the bytes go up *first*, then
     * the rows are swapped, then the objects nothing points at any more are
     * removed. A row pointing at a missing object shows a caption where a plate
     * should be; an object with no row costs a fraction of a penny. Only one of
     * those is visible to a reader.
     */
    async saveAssets(bookId: BookId, assets: readonly BookAsset[]): Promise<void> {
      const userId = await requireUserId()

      const existing = await readAll<{ r2_key: string }>(
        (from, to) =>
          db().from('assets').select('r2_key').eq('book_id', bookId).range(from, to),
        'find the book’s pictures',
      )

      const rows: AssetRow[] = []
      const uploads: { key: string; blob: Blob }[] = []

      for (const asset of assets) {
        const key = assetKey(userId, bookId, asset.path)
        // An asset whose path is empty or nothing but traversal has no address.
        // Skipped rather than stored at the book's root, where the next such
        // asset would silently overwrite it.
        if (key === undefined) continue
        uploads.push({ key, blob: asset.data })
        rows.push({
          book_id: bookId,
          path: asset.path,
          r2_key: key,
          content_type: asset.data.type || null,
          size: asset.data.size,
        })
      }

      await blobs.putMany(uploads)

      unwrap(
        await db().from('assets').delete().eq('book_id', bookId),
        'clear the book’s old pictures',
      )
      if (rows.length > 0) {
        unwrap(await db().from('assets').insert(rows), 'save the book’s pictures')
      }

      const kept = new Set(rows.map((row) => row.r2_key))
      await blobs.remove(
        existing.map((row) => row.r2_key).filter((key) => !kept.has(key)),
      )
    },

    async getAssets(bookId: BookId, paths: readonly string[]): Promise<Map<string, Blob>> {
      const found = new Map<string, Blob>()
      if (paths.length === 0) return found

      const rows = (unwrap(
        await db()
          .from('assets')
          .select('path, r2_key')
          .eq('book_id', bookId)
          .in('path', [...paths]),
        'load the pictures on this page',
      ) ?? []) as { path: string; r2_key: string }[]

      const byKey = await blobs.getMany(rows.map((row) => row.r2_key))
      for (const row of rows) {
        const blob = byKey.get(row.r2_key)
        if (blob) found.set(row.path, blob)
      }
      return found
    },

    /**
     * Which pictures this book has. Rows only — not one byte leaves R2.
     *
     * Paged, because a heavily illustrated book runs past PostgREST's default
     * limit: *Man and His Symbols* alone has 141 plates.
     */
    async listAssetPaths(bookId: BookId): Promise<string[]> {
      const rows = await readAll<{ path: string }>(
        (from, to) =>
          db().from('assets').select('path').eq('book_id', bookId).range(from, to),
        'find the book’s pictures',
      )
      return rows.map((row) => row.path)
    },

    // --- The original file -------------------------------------------------

    async saveSource(bookId: BookId, file: Blob, filename: string): Promise<void> {
      const userId = await requireUserId()
      const key = sourceKey(userId, bookId, filename)

      await blobs.put(key, file)
      unwrap(
        await db().from('sources').upsert({
          book_id: bookId,
          r2_key: key,
          filename,
          size: file.size,
          content_type: file.type || null,
        }),
        'keep the original file',
      )
    },

    async getSource(bookId: BookId): Promise<StoredSource | undefined> {
      const row = unwrap(
        await db().from('sources').select('*').eq('book_id', bookId).maybeSingle(),
        'find the original file',
      ) as SourceRow | null
      if (!row) return undefined

      const file = await blobs.get(row.r2_key)
      // The row survives but the object doesn't — treated as "no kept file",
      // which is a state `reparseBook` already explains to the reader.
      if (!file) return undefined

      return { bookId, file, filename: row.filename, size: row.size }
    },

    async booksWithSource(): Promise<Set<BookId>> {
      const rows = await readAll<{ book_id: string }>(
        (from, to) => db().from('sources').select('book_id').range(from, to),
        'find which books can be updated',
      )
      return new Set(rows.map((row) => row.book_id as BookId))
    },

    async sourcesSize(): Promise<number> {
      // `size` is denormalised onto the row for exactly this: totalling what the
      // kept files cost must never touch a single object.
      const rows = await readAll<{ size: number }>(
        (from, to) => db().from('sources').select('size').range(from, to),
        'measure the kept files',
      )
      return rows.reduce((total, row) => total + row.size, 0)
    },

    async forgetSources(): Promise<void> {
      const rows = await readAll<{ book_id: string; r2_key: string }>(
        (from, to) => db().from('sources').select('book_id, r2_key').range(from, to),
        'find the kept files',
      )
      if (rows.length === 0) return

      // Filtered by the ids just read rather than deleting unfiltered: PostgREST
      // refuses an unqualified delete, and rightly.
      unwrap(
        await db().from('sources').delete().in('book_id', rows.map((row) => row.book_id)),
        'forget the kept files',
      )
      await blobs.remove(rows.map((row) => row.r2_key))
    },

    // --- Manifest & chapter index ---------------------------------------

    async saveManifest(manifest: Manifest): Promise<void> {
      unwrap(
        await db().from('manifests').upsert({
          book_id: manifest.bookId,
          title: manifest.title,
          chapters: manifest.chapters,
        }),
        'save the contents',
      )
    },

    async getManifest(bookId: BookId): Promise<Manifest | undefined> {
      const row = unwrap(
        await db().from('manifests').select('*').eq('book_id', bookId).maybeSingle(),
        'load the contents',
      ) as ManifestRow | null
      return row ? manifestFromRow(row) : undefined
    },

    async saveChapterIndex(bookId: BookId, index: ChapterIndex): Promise<void> {
      unwrap(
        await db().from('chapters').upsert({
          book_id: bookId,
          chapter: index.chapter,
          title: index.title,
          path: index.path,
          sections: index.sections,
        }),
        'save the chapter',
      )
    },

    async getChapterIndex(
      bookId: BookId,
      chapter: number,
    ): Promise<StoredChapterIndex | undefined> {
      const row = unwrap(
        await db()
          .from('chapters')
          .select('*')
          .eq('book_id', bookId)
          .eq('chapter', chapter)
          .maybeSingle(),
        'load the chapter',
      ) as ChapterRow | null
      return row ? chapterFromRow(row) : undefined
    },

    async listChapterIndexes(bookId: BookId): Promise<StoredChapterIndex[]> {
      const rows = await readAll<ChapterRow>(
        (from, to) =>
          db()
            .from('chapters')
            .select('*')
            .eq('book_id', bookId)
            .order('chapter', { ascending: true })
            .range(from, to),
        'load the chapters',
      )
      return rows.map(chapterFromRow)
    },

    // --- Sections --------------------------------------------------------

    async saveSections(bookId: BookId, sections: Section[]): Promise<void> {
      await writeSections(bookId, sections)
    },

    /**
     * One page: the row that says where its words are, then the words.
     *
     * Two round trips where there used to be one, and the second is the reason
     * `getMany` batches — a chapter's object serves every section in it, so the
     * next dozen page turns are the same key.
     *
     * **A section whose text didn't arrive throws rather than returning empty.**
     * Every other failure in this file already reaches the reader as a
     * `CloudError`, so callers handle it; a section with no paragraphs would
     * instead render as a blank page that looks like the book's own doing. A
     * missing picture can fall back to its caption. Missing words cannot fall
     * back to anything, and saying so is the only honest option.
     */
    async getSection(bookId: BookId, path: SectionPath): Promise<StoredSection | undefined> {
      const row = unwrap(
        await db()
          .from('sections')
          .select('*')
          .eq('book_id', bookId)
          .eq('path', path)
          .maybeSingle(),
        'load the page',
      ) as SectionRow | null
      if (!row) return undefined

      const paragraphs = (await chapterTextAt(row.r2_key))[row.path]
      if (!paragraphs) {
        throw new CloudError(
          'Couldn’t load the words on this page. Check your connection and try again.',
        )
      }
      return sectionFromRow(row, paragraphs)
    },

    async getSectionByAnchor(bookId: BookId, anchor: string): Promise<StoredSection | undefined> {
      return this.getSection(bookId, sectionPathOf(anchor))
    },

    /**
     * Every section of a book, in reading order.
     *
     * The one call that deliberately loads a book's entire text, for in-book
     * search, which cannot answer "where does this word appear" from anything
     * less. It is the expensive door here in a way it never was over IndexedDB —
     * this is a download, not a disk read — and it is named so that using it
     * stays a decision rather than an accident.
     *
     * Ordered by the numbers rather than the path, for the same reason as the
     * Dexie version: `[bookId+path]` sorts by *text*, which is right only while
     * the numbers are zero-padded to the same width.
     */
    async listSections(bookId: BookId): Promise<StoredSection[]> {
      const rows = await readAll<SectionRow>(
        (from, to) =>
          db()
            .from('sections')
            .select('*')
            .eq('book_id', bookId)
            .order('chapter', { ascending: true })
            .order('section', { ascending: true })
            .range(from, to),
        'search this book',
      )

      // One fetch per chapter, not per section — a few dozen objects for a book
      // of a few hundred sections, signed in a couple of round trips and read
      // six at a time.
      const byKey = await blobs.getMany([...new Set(rows.map((row) => row.r2_key))])

      const texts = new Map<string, ChapterText>()
      for (const [key, blob] of byKey) {
        try {
          texts.set(key, readChapterText(JSON.parse(await blob.text())))
        } catch {
          texts.set(key, {})
        }
      }

      // Unlike `getSection`, a chapter that didn't arrive is survivable here:
      // this feeds search, and a book that finds nothing in one chapter is far
      // better than a search that refuses to run at all.
      return rows.map((row) => sectionFromRow(row, texts.get(row.r2_key)?.[row.path] ?? []))
    },

    async countSections(bookId: BookId): Promise<number> {
      const result = await db()
        .from('sections')
        .select('*', { count: 'exact', head: true })
        .eq('book_id', bookId)
      if (result.error) {
        throw new CloudError(`Couldn’t count the pages: ${result.error.message}`, {
          cause: result.error,
        })
      }
      return result.count ?? 0
    },

    // --- Where you stopped reading ---------------------------------------

    async savePosition(bookId: BookId, anchor: Anchor, percent?: number): Promise<void> {
      unwrap(
        await db().from('positions').upsert({
          book_id: bookId,
          anchor,
          at: now().toISOString(),
          percent: percent ?? null,
        }),
        'remember your place',
      )
    },

    async getPosition(bookId: BookId): Promise<ReadingPosition | undefined> {
      const row = unwrap(
        await db().from('positions').select('*').eq('book_id', bookId).maybeSingle(),
        'find your place',
      ) as PositionRow | null
      return row ? positionFromRow(row) : undefined
    },

    async listPositions(): Promise<ReadingPosition[]> {
      const rows = await readAll<PositionRow>(
        (from, to) =>
          db().from('positions').select('*').order('at', { ascending: false }).range(from, to),
        'find what you’ve been reading',
      )
      return rows.map(positionFromRow)
    },

    async forgetPosition(bookId: BookId): Promise<void> {
      unwrap(
        await db().from('positions').delete().eq('book_id', bookId),
        'forget your place',
      )
    },

    // --- One-shot migrations ---------------------------------------------

    /**
     * Fill in word counts for a book imported before they were recorded.
     *
     * Still the one function that reads an entire book, and still the only one
     * allowed to. Safe to interrupt: nothing is written until every count is in
     * hand, and the write is one RPC that re-checks the book still exists —
     * a reader can back out of a long book and delete it while this counts.
     */
    async backfillWordCounts(bookId: BookId): Promise<Manifest | undefined> {
      const manifest = await this.getManifest(bookId)
      if (!manifest) return undefined
      if (manifest.chapters.every((chapter) => chapter.words !== undefined)) return undefined

      const [sections, chapters] = await Promise.all([
        this.listSections(bookId),
        this.listChapterIndexes(bookId),
      ])

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

      const written = unwrap(
        await db().rpc('rb_save_word_counts', {
          p_book_id: bookId,
          p_manifest: updatedManifest,
          p_chapters: updatedChapters,
        }),
        'save the page counts',
      ) as boolean | null

      return written ? updatedManifest : undefined
    },

    // --- Deletion --------------------------------------------------------

    /**
     * Remove books and everything belonging to them.
     *
     * The rows go in one statement — foreign keys cascade from `books`, so
     * sections, chapters, manifest, position, quotes, bookmarks and the two
     * pointer tables all follow atomically, and there is no way to half-delete
     * a book.
     *
     * The objects in R2 go *afterwards*, and are allowed to fail. The order is
     * the whole point: deleting the bytes first would leave a reader with a book
     * on the shelf whose pictures have gone, while this way round the worst case
     * is an unreferenced object nobody is charged much for. A sweep can find
     * those later; a damaged book has to be re-imported.
     */
    async deleteBooks(bookIds: readonly BookId[]): Promise<void> {
      if (bookIds.length === 0) return

      const keys = await blobKeysFor(bookIds)
      unwrap(
        await db().from('books').delete().in('id', [...bookIds]),
        'delete those books',
      )
      await blobs.remove(keys)
    },

    async deleteBook(bookId: BookId): Promise<void> {
      await this.deleteBooks([bookId])
    },

    // --- Quotes ----------------------------------------------------------

    async addQuote(bookId: BookId, text: string): Promise<void> {
      unwrap(
        await db().from('quotes').insert({
          book_id: bookId,
          id: newId(),
          text,
          added_at: now().toISOString(),
        }),
        'save that passage',
      )
    },

    async listQuotes(bookId: BookId): Promise<StoredQuote[]> {
      const rows = await readAll<QuoteRow>(
        (from, to) => db().from('quotes').select('*').eq('book_id', bookId).range(from, to),
        'load your saved passages',
      )
      // Sorted here rather than in SQL so the order matches the Dexie repository
      // exactly — same comparison, same result, whichever backend is in use.
      return rows.map(quoteFromRow).sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    },

    async deleteQuote(bookId: BookId, id: string): Promise<void> {
      unwrap(
        await db().from('quotes').delete().eq('book_id', bookId).eq('id', id),
        'delete that passage',
      )
    },

    // --- Bookmarks ---------------------------------------------------------

    async addBookmark(bookId: BookId, anchor: Anchor, label: string): Promise<StoredBookmark> {
      const row = unwrap(
        await db()
          .from('bookmarks')
          .insert({
            book_id: bookId,
            id: newId(),
            anchor,
            label,
            added_at: now().toISOString(),
          })
          .select()
          .single(),
        'save that bookmark',
      ) as BookmarkRow
      return bookmarkFromRow(row)
    },

    async listBookmarks(bookId: BookId): Promise<StoredBookmark[]> {
      const rows = await readAll<BookmarkRow>(
        (from, to) => db().from('bookmarks').select('*').eq('book_id', bookId).range(from, to),
        'load your bookmarks',
      )
      // Unordered on purpose: a bookmark list is a way of moving around a book,
      // so it reads in the book's own order — which needs the anchor parsed, and
      // that is `reader/bookmarks.ts`'s job.
      return rows.map(bookmarkFromRow)
    },

    async deleteBookmark(bookId: BookId, id: string): Promise<void> {
      unwrap(
        await db().from('bookmarks').delete().eq('book_id', bookId).eq('id', id),
        'delete that bookmark',
      )
    },

    async renameBookmark(bookId: BookId, id: string, label: string): Promise<void> {
      // A no-op on a bookmark that has since been deleted, rather than
      // recreating it — an update matches nothing and nothing comes back.
      unwrap(
        await db().from('bookmarks').update({ label }).eq('book_id', bookId).eq('id', id),
        'rename that bookmark',
      )
    },

    // --- Folders -----------------------------------------------------------

    async createFolder(name: string): Promise<StoredFolder | undefined> {
      const trimmed = name.trim()
      if (!trimmed) return undefined

      // Get-or-create in one statement. Doing it as a read then a write would
      // race with itself, and the unique index would turn that race into an
      // error the reader never caused.
      const row = unwrap(
        await db().rpc('rb_create_folder', { p_id: newId(), p_name: trimmed }),
        'make that folder',
      ) as FolderRow | null
      return row ? folderFromRow(row) : undefined
    },

    async listFolders(): Promise<StoredFolder[]> {
      const rows = await readAll<FolderRow>(
        (from, to) => db().from('folders').select('*').range(from, to),
        'load your folders',
      )
      return rows.map(folderFromRow).sort((a, b) => a.name.localeCompare(b.name))
    },

    async renameFolder(id: string, name: string): Promise<void> {
      const trimmed = name.trim()
      if (!trimmed) return
      unwrap(
        await db().from('folders').update({ name: trimmed }).eq('id', id),
        'rename that folder',
      )
    },

    /**
     * Delete a folder — the folder only, never the books in it. A folder is a
     * label on a shelf, not a box with a bottom. The books are unfiled in the
     * same transaction, so no book is ever left pointing at a folder that has
     * gone.
     */
    async deleteFolder(id: string): Promise<void> {
      if (isSystemFolder(id)) return
      unwrap(await db().rpc('rb_delete_folder', { p_id: id }), 'delete that folder')
    },

    async addBooksToFolder(bookIds: readonly BookId[], folderId: string): Promise<void> {
      if (bookIds.length === 0 || isSystemFolder(folderId)) return
      unwrap(
        await db().rpc('rb_add_books_to_folder', {
          p_book_ids: [...bookIds],
          p_folder_id: folderId,
        }),
        'file those books',
      )
    },

    async removeBooksFromFolder(bookIds: readonly BookId[], folderId: string): Promise<void> {
      if (bookIds.length === 0 || isSystemFolder(folderId)) return
      unwrap(
        await db().rpc('rb_remove_books_from_folder', {
          p_book_ids: [...bookIds],
          p_folder_id: folderId,
        }),
        'take those books out of the folder',
      )
    },

    async clearFoldersFor(bookIds: readonly BookId[]): Promise<void> {
      if (bookIds.length === 0) return
      unwrap(
        await db().rpc('rb_clear_folders_for', { p_book_ids: [...bookIds] }),
        'unfile those books',
      )
    },

    async setShelfFor(bookIds: readonly BookId[], shelf: Shelf): Promise<void> {
      if (bookIds.length === 0) return
      unwrap(
        await db()
          .from('books')
          // Always recorded as an override: nothing later gets to re-guess a
          // shelf the reader has corrected by hand.
          .update({ shelf, shelf_overridden: true })
          .in('id', [...bookIds]),
        'move those books',
      )
    },
  }
}
