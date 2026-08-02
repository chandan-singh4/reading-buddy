/**
 * Which shelf an imported file belongs on.
 *
 * This is a *guess*, and it is treated as one everywhere: the reader can move
 * any book, and a moved book is never re-guessed (see `shelfOverridden`). That
 * escape hatch is what lets the rules below stay simple and slightly bold —
 * without it they would have to be so cautious as to be useless.
 *
 * Deliberately not a model call. Classification by Claude is WP-10's job and
 * costs tokens on every import; sorting a paper from a book needs neither.
 */

import type { ParsedBook } from '../storage/index.ts'
import type { Shelf, SourceFormat } from '../structure/index.ts'

/**
 * Where each format lands when the text says nothing useful.
 *
 * An EPUB is a book — the format exists for books and nothing else publishes
 * papers in it. Markdown and plain text are almost always notes rather than
 * either. PDF and DOCX are the genuinely ambiguous pair, and they are the two
 * the text signals below actually run on.
 */
const DEFAULT_SHELF: Readonly<Record<SourceFormat, Shelf>> = {
  epub: 'book',
  pdf: 'book',
  docx: 'document',
  md: 'document',
  txt: 'document',
}

/** Formats worth inspecting. A signal in an EPUB is likelier a quote than a paper. */
const INSPECTED: ReadonlySet<SourceFormat> = new Set<SourceFormat>(['pdf', 'docx'])

/**
 * Papers announce themselves in their first page, which is why only the opening
 * is searched: a *book* about research will mention "doi" and "et al." too, just
 * not in its first few hundred words.
 */
const OPENING_BLOCKS = 40

/**
 * Each of these is close to conclusive on a first page. A DOI or an arXiv id is
 * issued to papers and not to books; "abstract" as an opening heading is a
 * convention no book follows.
 */
const STRONG_SIGNALS: readonly RegExp[] = [
  /\bdoi\s*:/i,
  /\bdoi\.org\//i,
  /\barxiv\s*:/i,
  /\bissn\b/i,
  /\babstract\b/i,
  /\bkeywords\s*:/i,
  /\bpreprint\b/i,
  /\bsupplementary\s+(material|information)\b/i,
]

/**
 * Suggestive but not decisive — a book's front matter can carry any one of
 * these, so two are required together.
 */
const WEAK_SIGNALS: readonly RegExp[] = [
  /\bet\s+al\b/i,
  /\breceived\s*:/i,
  /\baccepted\s*:/i,
  /\bpublished\s*:/i,
  /\bcorresponding\s+author\b/i,
  /\buniversity\b/i,
  /\bdepartment\s+of\b/i,
  /\bcitation\s*:/i,
  /\bpeer[-\s]review/i,
]

function openingTextOf(book: ParsedBook): string {
  const blocks: string[] = []

  for (const section of book.sections) {
    for (const paragraph of section.paragraphs) {
      blocks.push(paragraph.text)
      if (blocks.length >= OPENING_BLOCKS) return blocks.join('\n')
    }
  }

  return blocks.join('\n')
}

function countMatches(text: string, patterns: readonly RegExp[]): number {
  return patterns.reduce((total, pattern) => (pattern.test(text) ? total + 1 : total), 0)
}

/**
 * The shelf for a freshly parsed file. One strong signal is enough; otherwise
 * two weak ones. A single weak signal is ignored on purpose — "University"
 * appears on the copyright page of a great many perfectly ordinary books.
 */
export function shelfFor(format: SourceFormat, book: ParsedBook): Shelf {
  const fallback = DEFAULT_SHELF[format]
  if (!INSPECTED.has(format)) return fallback

  const opening = openingTextOf(book)
  if (countMatches(opening, STRONG_SIGNALS) >= 1) return 'paper'
  if (countMatches(opening, WEAK_SIGNALS) >= 2) return 'paper'

  return fallback
}

/**
 * The shelf to *display* a book on. Books imported before shelves existed carry
 * none, so they fall back to their format's default rather than needing a
 * migration — the guess is cheap and the reader can move it either way.
 */
export function shelfOf(book: { shelf?: Shelf; source: SourceFormat }): Shelf {
  return book.shelf ?? DEFAULT_SHELF[book.source]
}
