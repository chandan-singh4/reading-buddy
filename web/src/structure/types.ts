/**
 * The shared parsed-book structure. Every parser writes this shape; the
 * renderer, the storage layer and the retrieval assembler all read it. Nothing
 * here describes *how* a book is stored or parsed — only what it is.
 *
 * See `docs/architecture.md`. The key idea: the path is the address. A query
 * loads the manifest + one chapter index + one section, never the whole book.
 */

// --- Branded primitives -----------------------------------------------------
// These are plain strings at runtime. The brand exists so a raw string can't be
// passed where a validated anchor is expected — you have to go through
// `formatAnchor` / `parseAnchor`, which is the whole point of a permanent id.

declare const brand: unique symbol

/** A canonical anchor in bracketed form, e.g. `[ch02-s03-p013]`. */
export type Anchor = string & { readonly [brand]: 'Anchor' }

/** A section's address, used verbatim as its storage key, e.g. `ch02/s03`. */
export type SectionPath = string & { readonly [brand]: 'SectionPath' }

/** A chapter's address, e.g. `ch02`. */
export type ChapterPath = string & { readonly [brand]: 'ChapterPath' }

/** Stable id for a book within the library. */
export type BookId = string & { readonly [brand]: 'BookId' }

/** The three coordinates an anchor encodes. All 1-based. */
export interface AnchorParts {
  chapter: number
  section: number
  paragraph: number
}

// --- Book-level -------------------------------------------------------------

/**
 * Drives the entire tutor apparatus: a novel gets only Highlight / Copy /
 * Define / Ask, while a dense book unlocks teaching modes and learner tracking.
 * Set at import by classification, always manually overridable.
 */
export type BookType = 'light-fiction' | 'dense-technical'

export type SourceFormat = 'epub' | 'pdf' | 'md'

export interface BookMeta {
  id: BookId
  title: string
  author?: string
  source: SourceFormat
  type: BookType
  /** Domain tag ("cognitive psychology", "distributed systems"). Dense books. */
  subject?: string
  /** True when `type` was set by hand rather than by classification. */
  typeOverridden?: boolean
  /** ISO 8601. */
  importedAt: string
}

// --- Manifest ---------------------------------------------------------------

/**
 * One line per chapter, enough to locate the right chapter without reading any
 * of them. Built once at import.
 */
export interface Manifest {
  bookId: BookId
  title: string
  chapters: ManifestChapter[]
}

export interface ManifestChapter {
  /** 1-based. */
  chapter: number
  title: string
  /** One-line gist. Deliberately short — this is read on every query. */
  summary: string
}

// --- Chapter index ----------------------------------------------------------

/** The second hop: which section within a located chapter. */
export interface ChapterIndex {
  chapter: number
  title: string
  path: ChapterPath
  sections: ChapterIndexEntry[]
}

export interface ChapterIndexEntry {
  /** 1-based, within the chapter. */
  section: number
  title?: string
  summary?: string
  path: SectionPath
  /** Set at import for dense books; absent for light fiction. */
  concepts?: string[]
  vocabulary?: string[]
  themes?: string[]
}

// --- Section (the only unit that holds actual prose) ------------------------

/**
 * The atom of retrieval and of storage — one row per section. Small enough to
 * load alone on a phone, which is what keeps both tokens and memory low.
 */
export interface Section {
  chapter: number
  section: number
  path: SectionPath
  title?: string
  paragraphs: Paragraph[]
}

export interface Paragraph {
  anchor: Anchor
  text: string
}
