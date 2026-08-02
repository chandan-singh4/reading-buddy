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

export type SourceFormat = 'epub' | 'pdf' | 'md' | 'txt' | 'docx'

/**
 * Which shelf a book is filed on. Purely about *what kind of thing* it is, so
 * a paper doesn't sit among novels — unrelated to `BookType`, which is about
 * how the tutor should behave. A single PDF can be a `paper` and
 * `dense-technical` at once, and usually is.
 */
export type Shelf = 'book' | 'paper' | 'document'

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
  /**
   * Which shelf it's filed on. Guessed at import from the format and the first
   * page (see `import/shelf.ts`). Absent on books imported before shelves
   * existed — read it through `shelfOf`, which falls back to the format's
   * default rather than requiring a migration.
   */
  shelf?: Shelf
  /**
   * True once the reader has moved it by hand. The guess must never overrule a
   * correction, so re-importing or any future re-classification leaves it be.
   */
  shelfOverridden?: boolean
  /**
   * SHA-256 of the imported file's bytes — the book's fingerprint, used to
   * recognise a re-import. Identity is the *file*, not the title: two editions
   * of the same book are genuinely different books, while the same file
   * downloaded twice under two names is not. Absent on books imported before
   * this was recorded, and when the platform offers no crypto.
   */
  contentHash?: string
  /**
   * SHA-256 of the opening of the book's *text*, once parsed. The second line
   * of duplicate defence, and the one that can be worked out after the fact:
   * the original file is never kept, but the text always is — so a book
   * imported before fingerprinting existed can still be given one of these.
   *
   * It also catches what `contentHash` can't: the same book from a *different*
   * file — re-downloaded, re-wrapped, or converted — where the bytes differ but
   * the words don't.
   */
  textSignature?: string
  /**
   * Which build of the parser produced this book's text.
   *
   * A book keeps whatever parse it got on the day it was imported — forever,
   * and silently. That has now cost three rounds of "the fix didn't work":
   * links didn't appear on already-imported books, then table links didn't
   * either, and there was no way to tell from the shelf. This is the flag that
   * makes it visible. Compared against `PARSER_VERSION` (`parse/version.ts`);
   * anything lower, or absent, means the book predates a parser improvement and
   * can be brought up to date.
   *
   * Absent on every book imported before this existed — which is exactly the
   * set that most needs re-parsing, so absent is treated as "out of date".
   */
  parserVersion?: number
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
  /**
   * Words in this chapter — the sum of its sections. What lets the reader show
   * a page number without laying anything out or loading a single section.
   *
   * Optional only because books imported before word counts existed don't have
   * it; `undefined` is precisely the signal the backfill looks for. Treat it as
   * required for anything imported from now on.
   */
  words?: number
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
  /**
   * Words in this section. The finer half of the page number: the manifest gets
   * you to the start of the chapter, this gets you to the right place inside it.
   * See `words` on `ManifestChapter` for why it's optional.
   */
  words?: number
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

/**
 * What a block *is*, not what it looks like. Ten values on purpose: enough to
 * stop destroying non-prose content, few enough to keep in your head. Finer
 * distinctions (epigraph vs. pull quote vs. sidebar) go in `label`, because the
 * renderer and the tutor treat them the same way.
 *
 * `furniture` is the odd one out: it marks content that is *not* part of the
 * book — running headers, page numbers, the table of contents, the index. It is
 * recognised so it can be dropped before anchors are assigned, never stored.
 */
export type BlockKind =
  | 'prose'
  | 'heading'
  | 'quote'
  | 'list'
  | 'code'
  | 'figure'
  | 'table'
  | 'formula'
  | 'note'
  | 'furniture'

/** A figure's image. `src` is resolved by the parser; see `kind: 'figure'`. */
export interface FigureImage {
  /**
   * Where the bytes are. An archive path for epub (`OEBPS/images/fig1.png`), a
   * `data:` URI for docx, or a URL for markdown. The reader resolves it; the
   * parser only records it.
   */
  src: string
  alt?: string
}

/**
 * The atom of anchoring. Every block carries `text` — a readable form that is
 * always safe to render or send to the tutor — plus the structure needed to do
 * better when we can. A table has both a flattened `text` *and* its `rows`; a
 * figure has a caption in `text` *and* its `image`.
 *
 * That redundancy is deliberate. It means nothing downstream has to special-case
 * a block kind it doesn't understand yet.
 */
/**
 * A link inside a paragraph — a range of its text, and where it goes.
 *
 * `target` is an `Anchor` when the link points somewhere inside this book
 * (a footnote, a cross-reference, an entry in the book's own contents), and a
 * URL when it points out of it. Which one it is decides what a tap does, so
 * the two are kept as separate fields rather than one string that has to be
 * sniffed at read time.
 *
 * Offsets, not a copy of the link's text: a paragraph can easily contain the
 * same word twice, and "the second occurrence of 'ibid.'" is not something a
 * renderer should have to work out.
 */
export interface ParagraphLink {
  start: number
  end: number
  /** Somewhere in this book. */
  anchor?: Anchor
  /** Somewhere outside it. */
  url?: string
}

export interface Paragraph {
  anchor: Anchor
  text: string
  kind: BlockKind
  /**
   * Links found in `text`. Absent on the overwhelming majority of paragraphs,
   * which contain none.
   */
  links?: ParagraphLink[]
  /**
   * Ids the source markup carried here — what links point at. Import-time only:
   * `parse/links.ts` uses them to resolve every link in the book and then
   * removes them, so they never reach storage. A book has thousands of these
   * and nothing reads them once the links are resolved.
   */
  ids?: string[]
  /** Finer-grained type when it matters: `epigraph`, `pull-quote`, `footnote`… */
  label?: string
  /** `kind: 'table'` — rows of cells. The first row is often, not always, a header. */
  rows?: string[][]
  /** `kind: 'figure'` — the image itself, when the source format carries one. */
  image?: FigureImage
}
