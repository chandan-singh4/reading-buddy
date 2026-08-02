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
import type { BookId, BookMeta, SourceFormat } from '../structure/index.ts'

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
  const cleaned = stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
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

  const meta: BookMeta = {
    id: newId() as BookId,
    title: titleFromFilename(file.name),
    source: format,
    // WP-10 classifies for real. Until then every book gets the richer of the
    // two modes — a wrong "dense" costs a reader nothing but extra options.
    type: 'dense-technical',
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

  onStage?.('saving')
  try {
    await repository.saveParsedBook(parsed)
  } catch (cause) {
    throw new ImportError(
      'save-failed',
      'The book was read, but couldn’t be saved. Your device may be out of storage space.',
      { cause },
    )
  }

  return parsed.meta
}
