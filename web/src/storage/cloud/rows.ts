/**
 * Postgres rows in, app objects out — and back again.
 *
 * Every difference between what the app holds in memory and what the database
 * holds on disk is settled here, and nowhere else. There are three of them:
 *
 * 1. **`camelCase` ↔ `snake_case`.** Postgres convention against JavaScript
 *    convention. Neither side bends, so the translation is explicit.
 *
 * 2. **`null` ↔ absent.** SQL has no notion of a missing column, only of a null
 *    one; the app's types are full of optional fields whose *absence* is
 *    meaningful — `folderIds` absent means "loose in the library", and the
 *    Dexie repository goes to some trouble to delete the key rather than store
 *    an empty array. So reads omit rather than assign `undefined`, keeping the
 *    objects byte-identical to the ones IndexedDB hands back.
 *
 * 3. **Timestamps.** Postgres returns `timestamptz` as
 *    `2026-08-09T10:00:00+00:00`; the app has always written
 *    `new Date().toISOString()`, which is `2026-08-09T10:00:00.000Z`. Both name
 *    the same instant and they sort differently as strings — and the library
 *    screen does sort them as strings. Every timestamp is therefore normalised
 *    on the way in, so nothing downstream can tell which storage layer it came
 *    from.
 *
 * Pure functions, no I/O, so the mapping can be tested without a database —
 * which matters, because a field silently dropped here is a field the reader
 * loses.
 */

import type {
  Anchor,
  BookId,
  BookMeta,
  BookType,
  ChapterIndexEntry,
  ChapterPath,
  Manifest,
  ManifestChapter,
  Paragraph,
  Section,
  SectionPath,
  Shelf,
  SourceFormat,
} from '../../structure/index.ts'
// Types only, and from inside the storage layer itself — `db.ts` is where the
// "domain object plus its bookId" shapes are declared, and duplicating them
// here would be a second answer to what a stored row is.
import type {
  ReadingPosition,
  StoredBookmark,
  StoredChapterIndex,
  StoredFolder,
  StoredQuote,
  StoredSection,
} from '../db.ts'

// --- Row shapes --------------------------------------------------------------

export interface BookRow {
  id: string
  title: string
  author: string | null
  source: string
  type: string
  subject: string | null
  type_overridden: boolean | null
  shelf: string | null
  shelf_overridden: boolean | null
  folder_ids: string[] | null
  content_hash: string | null
  text_signature: string | null
  parser_version: number | null
  imported_at: string
  rating: number | null
  notes: string | null
  title_overridden: boolean | null
  title_clean_version: number | null
}

export interface ManifestRow {
  book_id: string
  title: string
  chapters: ManifestChapter[]
}

export interface ChapterRow {
  book_id: string
  chapter: number
  title: string
  path: string
  sections: ChapterIndexEntry[]
}

export interface SectionRow {
  book_id: string
  path: string
  chapter: number
  section: number
  title: string | null
  paragraphs: Paragraph[]
}

export interface PositionRow {
  book_id: string
  anchor: string
  at: string
  percent: number | null
}

export interface SourceRow {
  book_id: string
  r2_key: string
  filename: string
  size: number
  content_type: string | null
}

export interface AssetRow {
  book_id: string
  path: string
  r2_key: string
  content_type: string | null
  size: number
}

export interface QuoteRow {
  book_id: string
  id: string
  text: string
  added_at: string
}

export interface FolderRow {
  id: string
  name: string
  created_at: string
}

export interface BookmarkRow {
  book_id: string
  id: string
  anchor: string
  label: string
  added_at: string
}

// --- Helpers -----------------------------------------------------------------

/**
 * One timestamp shape throughout the app, whatever Postgres hands back. Falls
 * back to the original string if it isn't a date at all — a slightly odd value
 * on screen beats an `Invalid Date` where a sort key should be.
 */
export function isoFrom(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

/** `null` is how SQL spells "the app didn't set this". */
function orNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : value
}

// --- Books -------------------------------------------------------------------

export function bookFromRow(row: BookRow): BookMeta {
  const meta: BookMeta = {
    id: row.id as BookId,
    title: row.title,
    source: row.source as SourceFormat,
    type: row.type as BookType,
    importedAt: isoFrom(row.imported_at),
  }

  if (row.author !== null) meta.author = row.author
  if (row.subject !== null) meta.subject = row.subject
  if (row.type_overridden !== null) meta.typeOverridden = row.type_overridden
  if (row.shelf !== null) meta.shelf = row.shelf as Shelf
  if (row.shelf_overridden !== null) meta.shelfOverridden = row.shelf_overridden
  // Absent, not empty — `folderIds: []` and no `folderIds` at all mean the same
  // thing to the library, but only one of them matches what Dexie stores.
  if (row.folder_ids !== null && row.folder_ids.length > 0) meta.folderIds = row.folder_ids
  if (row.content_hash !== null) meta.contentHash = row.content_hash
  if (row.text_signature !== null) meta.textSignature = row.text_signature
  if (row.parser_version !== null) meta.parserVersion = row.parser_version
  if (row.rating !== null) meta.rating = row.rating
  if (row.notes !== null) meta.notes = row.notes
  if (row.title_overridden !== null) meta.titleOverridden = row.title_overridden
  if (row.title_clean_version !== null) meta.titleCleanVersion = row.title_clean_version

  return meta
}

/**
 * A book on its way to Postgres.
 *
 * `ready` is deliberately absent. PostgREST builds its `on conflict do update`
 * from the keys actually present, so leaving it out means an upsert can never
 * flip a book that is mid-import to visible, nor a finished one back to hidden.
 */
export function bookToRow(meta: BookMeta): BookRow {
  return {
    id: meta.id,
    title: meta.title,
    author: orNull(meta.author),
    source: meta.source,
    type: meta.type,
    subject: orNull(meta.subject),
    type_overridden: orNull(meta.typeOverridden),
    shelf: orNull(meta.shelf),
    shelf_overridden: orNull(meta.shelfOverridden),
    folder_ids: meta.folderIds && meta.folderIds.length > 0 ? meta.folderIds : null,
    content_hash: orNull(meta.contentHash),
    text_signature: orNull(meta.textSignature),
    parser_version: orNull(meta.parserVersion),
    imported_at: meta.importedAt,
    rating: orNull(meta.rating),
    notes: orNull(meta.notes),
    title_overridden: orNull(meta.titleOverridden),
    title_clean_version: orNull(meta.titleCleanVersion),
  }
}

// --- Manifest, chapters, sections --------------------------------------------

export function manifestFromRow(row: ManifestRow): Manifest {
  return {
    bookId: row.book_id as BookId,
    title: row.title,
    chapters: row.chapters ?? [],
  }
}

export function chapterFromRow(row: ChapterRow): StoredChapterIndex {
  return {
    bookId: row.book_id as BookId,
    chapter: row.chapter,
    title: row.title,
    path: row.path as ChapterPath,
    sections: row.sections ?? [],
  }
}

export function sectionFromRow(row: SectionRow): StoredSection {
  const section: StoredSection = {
    bookId: row.book_id as BookId,
    chapter: row.chapter,
    section: row.section,
    path: row.path as SectionPath,
    paragraphs: row.paragraphs ?? [],
  }
  if (row.title !== null) section.title = row.title
  return section
}

// --- Position ----------------------------------------------------------------

export function positionFromRow(row: PositionRow): ReadingPosition {
  const position: ReadingPosition = {
    bookId: row.book_id as BookId,
    anchor: row.anchor as Anchor,
    at: isoFrom(row.at),
  }
  if (row.percent !== null) position.percent = row.percent
  return position
}

// --- The reader's own additions ----------------------------------------------

export function quoteFromRow(row: QuoteRow): StoredQuote {
  return {
    bookId: row.book_id as BookId,
    id: row.id,
    text: row.text,
    addedAt: isoFrom(row.added_at),
  }
}

export function folderFromRow(row: FolderRow): StoredFolder {
  return {
    id: row.id,
    name: row.name,
    createdAt: isoFrom(row.created_at),
  }
}

export function bookmarkFromRow(row: BookmarkRow): StoredBookmark {
  return {
    bookId: row.book_id as BookId,
    id: row.id,
    anchor: row.anchor as Anchor,
    label: row.label,
    addedAt: isoFrom(row.added_at),
  }
}

// --- Chunking ----------------------------------------------------------------

/**
 * How much section JSON to put in one request. A 600-page book runs to a few
 * megabytes of paragraphs, and sending it as one body is a single point of
 * failure on exactly the connection least able to bear it — a phone, on mobile
 * data, at the end of a long import.
 *
 * A megabyte is well inside every limit in the path and small enough that a
 * retry is cheap.
 */
export const MAX_CHUNK_BYTES = 1_000_000

/**
 * Split sections into request-sized batches, measured by their actual JSON
 * length rather than by counting rows.
 *
 * Counting would be the obvious thing and it is wrong here: sections are wildly
 * uneven. A chapter opening is two lines and a dense middle section is forty
 * paragraphs, so "fifty sections" is somewhere between 20 KB and 4 MB depending
 * on where in the book you are.
 *
 * A single section larger than the limit still goes on its own — there is
 * nothing smaller to split it into, and refusing would lose the book.
 */
export function chunkSections(
  sections: readonly Section[],
  maxBytes: number = MAX_CHUNK_BYTES,
): Section[][] {
  const chunks: Section[][] = []
  let current: Section[] = []
  let bytes = 0

  for (const section of sections) {
    const size = JSON.stringify(section).length
    if (current.length > 0 && bytes + size > maxBytes) {
      chunks.push(current)
      current = []
      bytes = 0
    }
    current.push(section)
    bytes += size
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}
