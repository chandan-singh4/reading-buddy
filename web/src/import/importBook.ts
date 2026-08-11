/**
 * Import: the seam between a file the reader picked and a book in the library.
 *
 * One job, in four steps — read the bytes, choose a parser by extension, parse,
 * save. Everything clever already lives elsewhere (`@/parse` builds the
 * structure, `@/storage` writes it atomically); this module only routes and,
 * crucially, *explains failure*. A file that won't import must always say why.
 *
 * Parsers are reached through dynamic `import()` on purpose. The library screen
 * imports this module eagerly, and a static import here would drag pdf.js and
 * mammoth into the main bundle for every reader who never opens a PDF.
 */

import type { ParsedBook, Repository } from '../storage/index.ts'
import { repository as defaultRepository } from '../storage/index.ts'
import { PARSER_VERSION } from '../parse/version.ts'
import type { BookId, BookMeta, SourceFormat } from '../structure/index.ts'
import { FILE_METADATA_KEYS } from '../structure/index.ts'
import { shelfFor } from './shelf.ts'

// --- Failure ----------------------------------------------------------------

/**
 * Why an import failed, in the terms the *reader* experiences it — not in the
 * terms the parser threw it. The UI switches on `code`; `message` is already
 * plain language and safe to show as-is.
 */
export type ImportErrorCode =
  | 'unsupported-format'
  | 'unreadable-file'
  | 'no-text'
  | 'save-failed'
  | 'duplicate'
  /** Asked to re-parse a book whose original file was never kept. */
  | 'no-source'

export class ImportError extends Error {
  readonly code: ImportErrorCode

  constructor(code: ImportErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ImportError'
    this.code = code
  }
}

// --- Format routing ---------------------------------------------------------

/** Extension → format. `.markdown` is the one alias worth honouring. */
const FORMAT_BY_EXTENSION: Readonly<Record<string, SourceFormat>> = {
  epub: 'epub',
  pdf: 'pdf',
  md: 'md',
  markdown: 'md',
  txt: 'txt',
  docx: 'docx',
}

/** The `accept` attribute for the file picker, kept next to the routing table. */
export const ACCEPTED_EXTENSIONS = '.epub,.pdf,.md,.markdown,.txt,.docx'

/** Formats read as bytes; the rest are read as text. */
const BINARY_FORMATS: ReadonlySet<SourceFormat> = new Set<SourceFormat>(['epub', 'pdf', 'docx'])

export function formatFromFilename(filename: string): SourceFormat | undefined {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return undefined
  return FORMAT_BY_EXTENSION[filename.slice(dot + 1).toLowerCase()]
}

/**
 * A first-guess title from the filename: drop the extension, and turn the
 * underscores and hyphens that survive most downloads back into spaces.
 * Renaming a book properly is a later waypoint's job.
 */
export function titleFromFilename(filename: string): string {
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  const cleaned = stem
    .replace(/[_-]+/g, ' ')
    .replace(/\b[0-9a-f]{16,40}\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned === '' ? 'Untitled' : cleaned
}

// --- Parsers ----------------------------------------------------------------

type Parser = (data: ArrayBuffer | string, meta: BookMeta) => Promise<ParsedBook>

export type ParserTable = Readonly<Record<SourceFormat, Parser>>

// The casts are safe by construction: `BINARY_FORMATS` decides how the file was
// read, so a binary parser is only ever handed an ArrayBuffer.
const defaultParsers: ParserTable = {
  epub: async (data, meta) =>
    (await import('../parse/epub.ts')).parseEpub(data as ArrayBuffer, meta),
  pdf: async (data, meta) => (await import('../parse/pdf.ts')).parsePdf(data as ArrayBuffer, meta),
  docx: async (data, meta) =>
    (await import('../parse/docx.ts')).parseDocx(data as ArrayBuffer, meta),
  md: async (data, meta) =>
    (await import('../parse/markdown.ts')).parseMarkdown(data as string, meta),
  txt: async (data, meta) => (await import('../parse/txt.ts')).parseTxt(data as string, meta),
}

// --- Progress ---------------------------------------------------------------

/** Coarse stages, enough for an honest status line. */
export type ImportStage = 'reading' | 'parsing' | 'saving'

export interface ImportOptions {
  repository?: Repository
  parsers?: ParserTable
  onStage?: (stage: ImportStage) => void
  /** Injectable for tests; defaults to a fresh uuid. */
  newId?: () => string
  /** Injectable for tests; defaults to now. */
  now?: () => Date
}

// --- Messages ---------------------------------------------------------------

/**
 * Kept in one place because these strings *are* the feature. A reader whose
 * file won't open needs to know whether to convert it, re-download it, or give
 * up on it — and each of those is a different sentence.
 */
const UNREADABLE_MESSAGE: Readonly<Record<SourceFormat, string>> = {
  epub: 'This EPUB couldn’t be opened. It may be copy-protected (DRM) or damaged — try re-downloading it, or open it in Calibre and export a clean copy.',
  pdf: 'This PDF couldn’t be opened. It may be password-protected or damaged.',
  docx: 'This Word file couldn’t be opened. It may be damaged, or saved in the older .doc format — re-save it as .docx and try again.',
  md: 'This Markdown file couldn’t be read.',
  txt: 'This text file couldn’t be read.',
}

const NO_TEXT_MESSAGE: Readonly<Record<SourceFormat, string>> = {
  // The one failure most likely to be mistaken for a bug: the import "worked",
  // and the book is still empty.
  pdf: 'No text found in this PDF. It’s most likely a scan — a picture of each page rather than real text. Reading Buddy can’t read scans yet; a text-based PDF or an EPUB of the same book will work.',
  epub: 'This EPUB has no readable text in it.',
  docx: 'This Word file has no readable text in it.',
  md: 'This file is empty.',
  txt: 'This file is empty.',
}

// --- Fingerprinting -----------------------------------------------------------

/**
 * SHA-256 of what we just read. The bytes are already in memory for parsing, so
 * this costs one pass over them and nothing extra in I/O.
 *
 * Hashing the *file* rather than matching on title is the whole point: a title
 * match would refuse a second edition or a different translation, which are
 * real, separate books. The same download twice — under two names, from two
 * folders — is not.
 *
 * Returns undefined where `crypto.subtle` isn't available (it needs a secure
 * context). Import then proceeds without the check, because failing to import
 * a book is a far worse outcome than importing it twice.
 */
export async function fingerprint(data: ArrayBuffer | string): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return undefined

  try {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
    const digest = await subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return undefined
  }
}

/**
 * How much of the opening text the signature is taken from. Enough to be
 * distinctive, little enough that it's the same work for a pamphlet and for a
 * 600-page book.
 */
const SIGNATURE_PARAGRAPHS = 20

/**
 * Below this many characters the opening isn't distinctive enough to judge by —
 * a title page reading "Contents" would collide with every other book that
 * starts the same way, and a false "already on your shelf" locks a real book
 * out of the library. No signature means no claim.
 */
const SIGNATURE_MIN_CHARS = 200

function normaliseForSignature(texts: readonly string[]): string {
  return texts
    .slice(0, SIGNATURE_PARAGRAPHS)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Fingerprint the opening of a book's text. Undefined when there isn't enough
 * of it to be sure — see `SIGNATURE_MIN_CHARS`.
 */
export async function textSignatureOf(texts: readonly string[]): Promise<string | undefined> {
  const opening = normaliseForSignature(texts)
  if (opening.length < SIGNATURE_MIN_CHARS) return undefined
  return fingerprint(opening)
}

/** The same rule applied to a freshly parsed book: its first section's prose. */
function openingOf(book: ParsedBook): string[] {
  return (book.sections[0]?.paragraphs ?? []).map((paragraph) => paragraph.text)
}

/**
 * Give a text fingerprint to every book that hasn't got one — the books that
 * were imported before fingerprinting existed. Their original files are long
 * gone, but their text is in storage, so the same opening rule can be applied
 * to it after the fact.
 *
 * Without this, an older book is invisible to the duplicate check forever, and
 * re-importing it quietly makes a second copy.
 */
export async function backfillTextSignatures(repository: Repository): Promise<number> {
  const pending = await repository.listBooksWithoutTextSignature()
  let filled = 0

  for (const book of pending) {
    const section = await repository.getSection(book.id, 'ch01/s01' as never)
    if (!section) continue

    const signature = await textSignatureOf(section.paragraphs.map((p) => p.text))
    if (signature === undefined) continue

    await repository.saveBook({ ...book, textSignature: signature })
    filled += 1
  }

  return filled
}

/**
 * Run the backfill before a duplicate check, swallowing any failure.
 *
 * Deliberately *not* memoised per repository. Caching it was the first thing I
 * reached for and it was wrong: it makes the result depend on whether some
 * earlier import in the same page load happened to run it, which is exactly the
 * kind of "worked the third time" behaviour this whole change exists to kill.
 * The query behind it only scans the books table, which holds one small row per
 * book — cheap enough to pay every time and be certain.
 */
async function backfillQuietly(repository: Repository): Promise<void> {
  try {
    await backfillTextSignatures(repository)
  } catch {
    // Never block an import: worst case the older books stay unrecognised,
    // which is where we started.
  }
}

/**
 * Store a book's pictures, and never let them take the book down with them.
 *
 * Same standing as the kept file below: a book whose plates wouldn't fit is a
 * book with captions, which is exactly what every book looked like before
 * WP-39. A book that failed to import because of a plate is a regression.
 *
 * **Quiet to the reader, not quiet to the console.** This used to catch and say
 * nothing at all, which is a different and worse thing. On the first live cloud
 * import every one of Jung's 141 plates was dropped here — the signing endpoint
 * was returning 404 because `api/` wasn't in the deployment — and the only
 * evidence anywhere was a placeholder cover. Diagnosing it took a bucket
 * dashboard, a table editor and a network trace to reach a fact this line now
 * states outright. Swallowing the failure is still right; swallowing the
 * *reason* never was.
 */
async function saveAssetsQuietly(repository: Repository, book: ParsedBook): Promise<void> {
  const assets = book.assets ?? []
  try {
    await repository.saveAssets(book.meta.id, assets)
  } catch (error) {
    console.warn(
      `Reading Buddy: kept “${book.meta.title}” but couldn’t store its ${assets.length} picture(s). ` +
        `They will show as captions. Reason:`,
      error,
    )
  }
}

function countParagraphs(book: ParsedBook): number {
  return book.sections.reduce((total, section) => total + section.paragraphs.length, 0)
}

// --- The import ---------------------------------------------------------------

/**
 * Import one file into the library, and return the book's metadata.
 *
 * Atomic by delegation: the only write is `saveParsedBook`, which is a single
 * transaction. Every earlier step is pure, so a failure part-way leaves nothing
 * behind to clean up.
 *
 * Throws `ImportError` — never a raw parser error — so a caller can show the
 * message it carries without translating anything.
 */
export async function importBook(file: File, options: ImportOptions = {}): Promise<BookMeta> {
  const {
    repository = defaultRepository,
    parsers = defaultParsers,
    onStage,
    newId = () => crypto.randomUUID(),
    now = () => new Date(),
  } = options

  const format = formatFromFilename(file.name)
  if (format === undefined) {
    throw new ImportError(
      'unsupported-format',
      `Reading Buddy can’t open “${file.name}”. Supported formats are EPUB, PDF, Markdown, plain text and Word (.docx).`,
    )
  }

  onStage?.('reading')
  let data: ArrayBuffer | string
  try {
    data = BINARY_FORMATS.has(format) ? await file.arrayBuffer() : await file.text()
  } catch (cause) {
    throw new ImportError('unreadable-file', UNREADABLE_MESSAGE[format], { cause })
  }

  // Older books have no fingerprint of their own; give them one before asking
  // any "have I seen this?" question, or they can never answer it.
  await backfillQuietly(repository)

  // First check, before parsing: identical bytes. Re-dropping a folder of books
  // you already have should cost a hash each, not a full re-parse each.
  const contentHash = await fingerprint(data)
  if (contentHash !== undefined) {
    const existing = await repository.findByContentHash(contentHash)
    if (existing) throw duplicateOf(existing)
  }

  const meta: BookMeta = {
    id: newId() as BookId,
    title: titleFromFilename(file.name),
    source: format,
    ...(contentHash === undefined ? {} : { contentHash }),
    // WP-10 classifies for real. Until then every book gets the richer of the
    // two modes — a wrong "dense" costs a reader nothing but extra options.
    type: 'dense-technical',
    parserVersion: PARSER_VERSION,
    importedAt: now().toISOString(),
  }

  onStage?.('parsing')
  let parsed: ParsedBook
  try {
    parsed = await parsers[format](data, meta)
  } catch (cause) {
    throw new ImportError('unreadable-file', UNREADABLE_MESSAGE[format], { cause })
  }

  if (countParagraphs(parsed) === 0) {
    throw new ImportError('no-text', NO_TEXT_MESSAGE[format])
  }

  // Second check, now that there is text to compare. This is the one that
  // recognises a book imported before fingerprinting existed, and the same book
  // arriving as a different file.
  const textSignature = await textSignatureOf(openingOf(parsed))
  if (textSignature !== undefined) {
    const existing = await repository.findByTextSignature(textSignature)
    if (existing) throw duplicateOf(existing)
  }

  // Filed once the text exists, since the first page is what tells a paper from
  // a book. A guess, and shown as one — the library lets any book be moved.
  const toSave: ParsedBook = {
    ...parsed,
    meta: {
      ...parsed.meta,
      shelf: shelfFor(format, parsed),
      ...(textSignature === undefined ? {} : { textSignature }),
    },
  }

  onStage?.('saving')
  try {
    await repository.saveParsedBook(toSave)
  } catch (cause) {
    throw new ImportError(
      'save-failed',
      'The book was read, but couldn’t be saved. Your device may be out of storage space.',
      { cause },
    )
  }

  await saveAssetsQuietly(repository, toSave)

  // Kept *after* the book is safely stored, and never allowed to undo it. The
  // file is what makes a future parser fix one tap instead of a delete and a
  // re-import; it is not what makes the book. A phone too full to hold it
  // should still end up with the book — see `repository.saveSource`.
  try {
    await repository.saveSource(toSave.meta.id, file, file.name)
  } catch {
    // Silent on purpose. Nothing the reader can act on, and nothing they have
    // lost that they had a moment ago.
  }

  return toSave.meta
}

/**
 * The publisher's own fields out of a fresh parse, and nothing else.
 *
 * A re-parse keeps the *existing* meta and discards the parser's, so that a
 * later, cleverer parse can never overrule a title the reader corrected. That
 * rule is right for everything the reader can touch and wrong for these six:
 * they exist only in the file, so discarding them means a re-parse reads them
 * and then throws them away — which is exactly what happened to the first run
 * of updates after `PARSER_VERSION` 10.
 *
 * Absent keys stay absent: an epub with no ISBN must not gain `isbn: undefined`,
 * and a book that had one must not lose it to a parse that found none.
 */
function fileMetadataOf(parsed: BookMeta): Partial<BookMeta> {
  const found: Record<string, unknown> = {}
  for (const key of FILE_METADATA_KEYS) {
    const value = parsed[key]
    if (value !== undefined) found[key] = value
  }
  return found as Partial<BookMeta>
}

// --- Re-parsing an existing book ----------------------------------------------

/**
 * Whether a book was made by an older parser than the one running now.
 *
 * Unstamped counts as behind: `parserVersion` was added alongside the kept
 * file, so anything without one predates both and is certainly older than the
 * current build.
 */
export function isOutOfDate(book: BookMeta): boolean {
  return (book.parserVersion ?? 0) < PARSER_VERSION
}

/**
 * Read a book's text again from the file it came from.
 *
 * This is the whole point of keeping that file. A parsed book is a snapshot: no
 * amount of improving the parser changes a book already on the shelf, so before
 * this existed every parser fix meant deleting the book and finding the file
 * again — three times over, on the same book, in three sessions.
 *
 * What it keeps: the book's id, its title, the shelf it is filed on, its place
 * in the list, and where the reader had got to. What it replaces: every
 * paragraph, anchor, link and chapter division. What it never does: leave the
 * book damaged — the new parse has to succeed *and* contain text before
 * anything is written, so a failure leaves the old book exactly as it was.
 */
export async function reparseBook(
  bookId: BookId,
  options: ImportOptions = {},
): Promise<BookMeta> {
  const { repository = defaultRepository, parsers = defaultParsers, onStage } = options

  const book = await repository.getBook(bookId)
  if (!book) {
    throw new ImportError('no-source', 'That book isn’t in your library any more.')
  }

  onStage?.('reading')
  const source = await repository.getSource(bookId)
  if (!source) {
    throw new ImportError(
      'no-source',
      `“${book.title}” was imported before Reading Buddy started keeping the original file, so it can’t be updated on its own. Remove it and import the file again to bring it up to date.`,
    )
  }

  // The filename is what chose the parser at import, so it is what must choose
  // it again — `book.source` is the same answer, but derived rather than
  // recorded, and a mismatch between the two is a bug worth not hiding.
  const format = formatFromFilename(source.filename) ?? book.source

  let data: ArrayBuffer | string
  try {
    data = BINARY_FORMATS.has(format)
      ? await source.file.arrayBuffer()
      : await source.file.text()
  } catch (cause) {
    throw new ImportError('unreadable-file', UNREADABLE_MESSAGE[format], { cause })
  }

  // The meta handed to the parser is the *existing* one, carrying everything a
  // reader has decided about this book — its title, its shelf, whether they
  // moved it — with only the parser stamp moving forward. Re-guessing any of
  // that would let an update quietly overrule a correction.
  const meta: BookMeta = { ...book, parserVersion: PARSER_VERSION }

  onStage?.('parsing')
  let parsed: ParsedBook
  try {
    parsed = await parsers[format](data, meta)
  } catch (cause) {
    throw new ImportError('unreadable-file', UNREADABLE_MESSAGE[format], { cause })
  }

  if (countParagraphs(parsed) === 0) {
    throw new ImportError('no-text', NO_TEXT_MESSAGE[format])
  }

  // Re-derived because the text itself may have changed — a parser that keeps
  // furniture it used to drop, or drops some it used to keep, moves the opening
  // this is taken from. A stale signature would make the book invisible to the
  // duplicate check, or match a book it isn't.
  const textSignature = await textSignatureOf(openingOf(parsed))

  const toSave: ParsedBook = {
    ...parsed,
    meta: {
      ...meta,
      ...fileMetadataOf(parsed.meta),
      ...(textSignature === undefined ? {} : { textSignature }),
    },
  }

  onStage?.('saving')
  try {
    await repository.replaceParsedBook(toSave)
  } catch (cause) {
    throw new ImportError(
      'save-failed',
      'The book was read, but the update couldn’t be saved. Your device may be out of storage space.',
      { cause },
    )
  }

  // Cleared and rewritten, not merged: a fresh parse decides afresh which
  // pictures the book shows, and the old set may name files it no longer does.
  await saveAssetsQuietly(repository, toSave)

  return toSave.meta
}

/** What became of one book in a re-parse run. */
export type ReparseOutcome =
  | { bookId: BookId; title: string; status: 'updated'; meta: BookMeta }
  | { bookId: BookId; title: string; status: 'failed'; message: string }

export interface ReparseProgress {
  /** 1-based. */
  index: number
  total: number
  title: string
  stage: ImportStage
}

/**
 * Bring several books up to date, one after another.
 *
 * Sequential and failure-tolerant, for the same reasons `importBooks` is: the
 * parse is CPU-bound and would fight itself for the one main thread, and "11 of
 * 12 updated" is a far more useful outcome than one thrown error and no idea
 * which books made it.
 */
export async function reparseBooks(
  books: readonly BookMeta[],
  options: ImportOptions & { onProgress?: (progress: ReparseProgress) => void } = {},
): Promise<ReparseOutcome[]> {
  const { onProgress, ...single } = options
  const outcomes: ReparseOutcome[] = []

  for (const [position, book] of books.entries()) {
    try {
      const meta = await reparseBook(book.id, {
        ...single,
        onStage: (stage) => {
          onProgress?.({
            index: position + 1,
            total: books.length,
            title: book.title,
            stage,
          })
        },
      })
      outcomes.push({ bookId: book.id, title: book.title, status: 'updated', meta })
    } catch (error: unknown) {
      outcomes.push({
        bookId: book.id,
        title: book.title,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return outcomes
}

function duplicateOf(existing: BookMeta): ImportError {
  return new ImportError('duplicate', `“${existing.title}” is already on your shelf.`, {
    cause: existing,
  })
}

// --- Many at a time -----------------------------------------------------------

/**
 * What became of one file in a batch. A duplicate is its own status rather than
 * a failure: nothing went wrong, and lumping "already on your shelf" in with
 * "this file is broken" would make a second folder drop look alarming.
 */
export type ImportOutcome =
  | { filename: string; status: 'imported'; meta: BookMeta }
  | { filename: string; status: 'duplicate'; message: string }
  | { filename: string; status: 'failed'; message: string; code: ImportErrorCode | 'unknown' }

export interface BatchProgress {
  /** 1-based index of the file being worked on. */
  index: number
  total: number
  filename: string
  stage: ImportStage
}

export interface ImportManyOptions extends Omit<ImportOptions, 'onStage'> {
  onProgress?: (progress: BatchProgress) => void
  /**
   * Drop files whose extension we can't read instead of reporting each one as
   * a failure. True when the list came from scanning a folder — a book folder
   * is full of covers, `.DS_Store` and metadata, and forty "can't open this"
   * errors would bury the one that matters. False for a hand-picked list,
   * where an unreadable file is a question the reader actually asked.
   */
  skipUnsupported?: boolean
}

/**
 * Import a list of files one after another, and report on each.
 *
 * Sequential on purpose. Parsing is CPU-bound and largely synchronous once it
 * starts; running a folder's worth in parallel would compete for the one main
 * thread and lock the screen up for the whole batch instead of a moment per
 * book. One at a time is both faster in practice and honest about progress.
 *
 * One bad file never stops the run — the batch resolves with a mixed list of
 * successes and failures, because "9 of 12 imported" is a far more useful
 * outcome than a single thrown error.
 */
export async function importBooks(
  files: readonly File[],
  options: ImportManyOptions = {},
): Promise<ImportOutcome[]> {
  const { onProgress, skipUnsupported = false, ...single } = options

  const queue = skipUnsupported
    ? files.filter((file) => formatFromFilename(file.name) !== undefined)
    : files

  const outcomes: ImportOutcome[] = []

  for (const [position, file] of queue.entries()) {
    try {
      const meta = await importBook(file, {
        ...single,
        onStage: (stage) => {
          onProgress?.({ index: position + 1, total: queue.length, filename: file.name, stage })
        },
      })
      outcomes.push({ filename: file.name, status: 'imported', meta })
    } catch (error: unknown) {
      outcomes.push(
        error instanceof ImportError && error.code === 'duplicate'
          ? { filename: file.name, status: 'duplicate', message: error.message }
          : error instanceof ImportError
          ? { filename: file.name, status: 'failed', message: error.message, code: error.code }
          : {
              filename: file.name,
              status: 'failed',
              code: 'unknown',
              message: error instanceof Error ? error.message : String(error),
            },
      )
    }
  }

  return outcomes
}
