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
   * The reader's own folders this book sits in (`StoredFolder.id`), if any.
   *
   * Absent or empty means "loose in the library" — the state every book starts
   * in and most stay in.
   *
   * **A list, and it did not used to be.** This was a single `folderId` on the
   * settled reasoning that a book in several places is a *tag* and tags are a
   * different feature. The reader overruled it: they want one book filed under
   * "Philosophy" and "For the course" at once, without a second copy of it. So
   * membership is many, and the thing that makes it still a folder rather than a
   * tag is that the library shows a book **once** however many folders it is in —
   * the folder list narrows the shelf, it does not multiply it.
   *
   * Indexed `*folderIds` (multiEntry), so "show me this folder" stays a lookup.
   *
   * A dangling id is survivable by design. Deleting a folder strips it from
   * every book in one transaction, but if that ever half-fails the book simply
   * reads as loose rather than disappearing from the library — see `foldersOf`.
   */
  folderIds?: string[]
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
  /*
   * --- What the file already said about itself ------------------------------
   *
   * An epub's package file carries a Dublin Core record, and the parser read
   * two lines of it — `dc:title` and `dc:creator` — then walked past the rest.
   * The six fields below are the rest, and they cost nothing: no network, no
   * key, no guessing. The book has been telling us all along.
   *
   * `isbn` is the load-bearing one. It turns the catalogue lookup that follows
   * into an *exact* fetch rather than a title search, which confidently returns
   * the wrong edition, an audiobook, or a study guide.
   *
   * All six are absent rather than empty when the file doesn't say — the same
   * rule the rest of this interface follows, and the reason the cloud row
   * helpers go to the trouble of omitting keys rather than nulling them.
   *
   * They are also absent on every book imported before this existed. Nothing
   * backfills them, because unlike `finishedAt` they cannot be derived from
   * anything already stored — only from the original file, via the shelf's
   * Update button.
   */
  /**
   * ISBN-13 where the file offers one, ISBN-10 otherwise, digits only.
   *
   * `dc:identifier` is *required* in an epub and is very often not an ISBN at
   * all: a UUID, a Calibre id, a publisher's internal reference. Those are
   * ignored rather than stored, because a lookup key that is silently wrong is
   * worse than no key — it returns a confident answer about a different book.
   * The check is the real ISBN checksum, not a shape match.
   */
  isbn?: string
  /** `dc:publisher`, verbatim. */
  publisher?: string
  /**
   * When the edition was published: `2019`, `2019-03` or `2019-03-14`.
   *
   * Deliberately not a full ISO timestamp. Most epubs give a year and nothing
   * more, and widening that to `2019-01-01T00:00:00Z` would invent a day and a
   * month the file never claimed. Stored as written, to whatever precision the
   * publisher offered.
   *
   * Not to be confused with `importedAt` (when *you* got it) or `finishedAt`
   * (when you read it) — this one belongs to the book, not to the reader.
   */
  published?: string
  /** `dc:language` as a BCP-47 tag, lowercased: `en`, `en-gb`, `de`. */
  language?: string
  /** The publisher's blurb, tags stripped and whitespace collapsed. */
  description?: string
  /**
   * The publisher's own subject headings — usually BISAC ("Science / Life
   * Sciences / Marine Biology"), sometimes free text.
   *
   * **Not the same thing as `subject` above**, and the near-collision is worth
   * reading twice. `subject` is the app's single domain tag for the tutor,
   * assigned by classification and overridable by the reader. This is a *list*,
   * belongs to the publisher, and is never edited. Stats will want both: these
   * are finer than the coarse categories a catalogue returns, and they are free.
   */
  subjects?: string[]
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
  /**
   * ISO 8601 — the day the book was finished, written **once and never again.**
   *
   * "Finished" is otherwise derived: a position row that reached 100%. That is
   * enough to file a book on the Finished shelf, where only the fact matters,
   * but not to say *when* — a position's `at` is the last page turn, so opening
   * a finished book months later to check a quote silently moves the day it was
   * finished. Harmless on a shelf; a lie in a yearly total, and the kind that
   * moves a book from one year into the next.
   *
   * So it follows the rule `titleOverridden` and `shelfOverridden` already set:
   * once a fact is established, no later automatic pass may overwrite it.
   * Re-reading a book does not clear this, because it did not un-finish it.
   *
   * Absent on every book finished before this existed — `backfillFinishedAt`
   * fills those from the position's own date, which is the best evidence there
   * is and is exactly right for a book not opened since.
   */
  finishedAt?: string
  /**
   * The reader's own 1–5 verdict on the whole book, set from the detail page
   * (WP-47). Absent until rated — there is no default of "unrated is zero
   * stars", so this must stay optional rather than defaulting to `0`.
   */
  rating?: number
  /** Free-text reflections, set from the detail page (WP-49). */
  notes?: string
  /**
   * True once the reader has retyped the title by hand, on the detail page.
   *
   * The same rule as `shelfOverridden`, for the same reason: the automatic
   * cleanup must never overrule a correction. A reader only reaches for the
   * pencil when the guess was wrong, so a later, cleverer guess re-running over
   * the top of their answer would undo the one title in the library that is
   * certainly right.
   */
  titleOverridden?: boolean
  /**
   * Which build of the title cleanup produced this book's title — compared
   * against `TITLE_CLEAN_VERSION` (`parse/cleanTitle.ts`) at boot.
   *
   * Kept apart from `parserVersion` deliberately. A title can be recomputed
   * from the string already stored; the *text* can only be fixed by re-reading
   * the original file. Absent means "cleaned before this was tracked, or not at
   * all", which is exactly the set worth re-cleaning.
   */
  titleCleanVersion?: number
}

/**
 * The fields that belong to the *file*, not to the reader.
 *
 * A re-parse deliberately keeps the existing `BookMeta` and throws the parser's
 * away, so that a cleverer parse can never overrule a title the reader fixed or
 * a shelf they chose. These six are the exception, and the list exists so the
 * exception is stated in one place: they are the publisher's record, the reader
 * never edits them, and re-reading the file is the *only* way to obtain them.
 */
export const FILE_METADATA_KEYS = [
  'isbn',
  'publisher',
  'published',
  'language',
  'description',
  'subjects',
] as const satisfies readonly (keyof BookMeta)[]

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
  /**
   * This block opened a new document in the source, so it opens a new page in
   * the reader.
   *
   * An epub is not one file — it is a spine of separate XHTML documents, and the
   * publisher's own division. The cover is one, the copyright page is one, the
   * dedication is one, the preface is one. Every other reader starts each of them
   * on a fresh page; flattening the spine into one stream is what made a cover
   * plate run straight into the title, and the dedication run into the preface.
   *
   * A boundary, not a break instruction: the parser records where the source
   * divided, and `Reader.module.css` decides what that looks like. Deliberately
   * *not* a section boundary — sections are the navigation and anchor grammar,
   * and books that split one chapter across three files would fragment the
   * contents list into nonsense.
   *
   * `true` or absent, never `false`: most blocks are not boundaries and shouldn't
   * pay a field for it in storage.
   */
  startsPage?: true
  /** Finer-grained type when it matters: `epigraph`, `pull-quote`, `footnote`… */
  label?: string
  /** `kind: 'table'` — rows of cells. The first row is often, not always, a header. */
  rows?: string[][]
  /** `kind: 'figure'` — the image itself, when the source format carries one. */
  image?: FigureImage
}
