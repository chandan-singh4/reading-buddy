/**
 * The Dexie/IndexedDB database. Declares tables and their indexes — nothing
 * else. All reads and writes go through `repository.ts`; no other module in the
 * app may import this file.
 *
 * Storage mirrors the WP-05 structure: the path *is* the address, realised here
 * as a key. A section lives in its own row keyed `[bookId+path]`, so
 * `ch02/s03` is a direct lookup rather than a scan — which is what lets a
 * 600-page book stay cheap to read on a phone.
 */

import Dexie, { type Table } from 'dexie'

import type {
  Anchor,
  BookId,
  BookMeta,
  ChapterIndex,
  Manifest,
  Section,
  SectionPath,
} from '../structure/index.ts'

/** A chapter index as stored: tagged with its book so tables stay flat. */
export interface StoredChapterIndex extends ChapterIndex {
  bookId: BookId
}

/** A section as stored — the atom of both retrieval and persistence. */
export interface StoredSection extends Section {
  bookId: BookId
}

/**
 * Where the reader stopped, one row per book.
 *
 * A table of its own rather than two more fields on `BookMeta`, for two
 * reasons. This is the only row in the database that is written *while reading*
 * — every few seconds, in the middle of the thing that has to stay smooth — and
 * putting it on the book row would mean rewriting the whole book record, title,
 * fingerprints and all, each time. It also keeps a reading habit separate from
 * what a book *is*: "forget where I was" should not be able to damage the book.
 */
export interface ReadingPosition {
  bookId: BookId
  /** The paragraph at the top of the screen when reading stopped. */
  anchor: Anchor
  /** ISO 8601 — what "Continue reading" and a recently-opened list sort on. */
  at: string
  /**
   * Whole-number percent through the book, 0–100, when it was known at save
   * time. `undefined` on a position saved before this existed, or before the
   * book's spine had built — the Home screen treats either as "still reading"
   * rather than guessing.
   */
  percent?: number
  /**
   * How many pages past the start of `anchor` the reader actually was.
   *
   * The anchor names the paragraph the visible page *begins in*, which is the
   * right thing to write down and the wrong thing to reopen on: a paragraph
   * long enough to run over several columns starts pages earlier than the one
   * being read. Without this, finishing a book and reopening it landed eight
   * pages short of the end — every time, because the last page of a book is
   * usually deep inside its longest closing paragraph.
   *
   * `undefined` on a position saved before this existed, which is treated as
   * zero: the old behaviour, for a place that has no better answer stored.
   */
  within?: number
}

/**
 * The file a book was imported from, kept so it can be parsed again.
 *
 * Until now the original was read once and dropped, on the reasoning that the
 * text is the book and the file is just how it arrived. That was wrong in one
 * specific, repeatedly painful way: a parsed book is a *snapshot*, so every
 * improvement to the parser leaves the existing shelf untouched, and the only
 * way to benefit was to delete each book and find its file again. Keeping the
 * bytes turns that into one tap.
 *
 * Stored as a `Blob`, which IndexedDB persists natively — no base64, no string
 * conversion, and the browser is free to keep it out of memory until asked. The
 * cost is real (roughly the size of the library again) and is why `deleteBook`
 * cascades here, and why the shelf can offer to drop them.
 */
export interface StoredSource {
  bookId: BookId
  /** The original bytes, exactly as imported. */
  file: Blob
  /** What the reader called it — the parser is chosen by this extension. */
  filename: string
  /** Bytes, denormalised so "how much is this costing me?" needs no blob read. */
  size: number
}

/**
 * One picture from a book — a figure, a plate, a diagram.
 *
 * Kept as its own row rather than inlined into the paragraph that mentions it,
 * for the reason every other table here is split the way it is: a section is
 * read on the reading screen's critical path, and a section carrying a
 * megabyte of base64 inside its JSON would be read in full every time the
 * reader turned onto it, image or no image. Here the picture is fetched only
 * by the page that actually shows it.
 *
 * `path` is the archive path the parser recorded in `image.src`
 * (`OEBPS/images/fig1.png`) — the same string the block carries, so the
 * lookup needs nothing resolved at read time.
 */
export interface StoredAsset {
  bookId: BookId
  path: string
  /** The bytes, with their media type, exactly as they were in the file. */
  data: Blob
}

/**
 * A favorite passage, saved from the book detail page (WP-48).
 *
 * Typed in by hand for now rather than selected from the reading screen —
 * the reader's anchors are paragraph-level (see `structure/types.ts`), and a
 * true in-text selection needs a character range *within* an anchor, which is
 * WP-17's job, not this one's. This table's shape doesn't change when that
 * lands; it just gains a second way to be filled.
 */
export interface StoredQuote {
  bookId: BookId
  id: string
  text: string
  /** ISO 8601 — newest first is how the detail page lists them. */
  addedAt: string
}

/**
 * A shelf of the reader's own making — "Philosophy", "For the course", "Lent
 * out". A book can belong to any number of them (`BookMeta.folderIds`).
 *
 * This shipped as "at most one", on the reasoning that a book in three folders
 * is a *tag* and tags are a different feature. The reader asked for many, so
 * many it is — and the one property that keeps it a folder rather than a tag is
 * kept deliberately: **the shelf shows each book once**, however many folders it
 * is in. The folder list narrows the library; it never duplicates it.
 *
 * The cost, paid knowingly: "sort by folder" no longer has a single answer per
 * book, so it sorts on the first of a book's folders alphabetically. That is a
 * real approximation and it is written down in `filter.ts` where it happens.
 *
 * Reading status ("Unread", "Finished") is deliberately **not** stored here.
 * Those two behave like folders on screen but are worked out from progress every
 * time they are asked for — see `library/systemFolders.ts` for why a computed
 * answer is the only one that cannot go stale.
 *
 * `name` is indexed so the library can sort and search by folder without
 * loading every book first.
 */
export interface StoredFolder {
  id: string
  name: string
  /** ISO 8601 — ties a "recently added" ordering to folders too. */
  createdAt: string
}

/**
 * A place the reader marked on purpose (WP-14).
 *
 * Deliberately *not* the same thing as `ReadingPosition`, though both are an
 * anchor in a book. A position is written for you, constantly, and there is one;
 * a bookmark is written by you, rarely, and there are as many as you like. The
 * one that matters: a position is always being overwritten, so storing a
 * bookmark alongside it would put something the reader chose to keep in a row
 * designed to be clobbered every few seconds.
 *
 * `anchor` is the paragraph at the top of the page when the ribbon was tapped,
 * which is what makes a bookmark survive a font change — a stored page *number*
 * would not, since the pages are re-laid-out whenever the type does. The same
 * reasoning as `position.ts`, and the reason there is no `page` field here.
 *
 * The chapter and section are not stored either: they are already inside the
 * anchor (`ch02-s03-p013`), and `reader/bookmarks.ts` reads them back out. A
 * denormalised copy is a second answer to the same question, free to drift.
 *
 * `label` is always a real string — the reader's own words if they gave any, and
 * the opening of the marked paragraph if they didn't. Never empty, because an
 * unnamed row in a list is a row you cannot tell from its neighbours.
 */
export interface StoredBookmark {
  bookId: BookId
  id: string
  /** The paragraph the marked page began on. */
  anchor: Anchor
  /** The reader's name for it, or the paragraph's opening words. */
  label: string
  /** ISO 8601. Kept for "when did I mark this", not for ordering — see below. */
  addedAt: string
}

/**
 * Who wrote a note. Two authors, and the reader can always tell which is which.
 *
 * Kept as a stored field rather than worked out from the text, because the
 * whole point of the distinction is that it must not be guessable: a note the
 * reader wrote and a note the tutor wrote look nothing alike on screen, and a
 * heuristic that got it wrong would put words in someone's mouth.
 */
export type NoteAuthor = 'you' | 'claude'

/**
 * A note against one paragraph — the reader's own, or the tutor's answer.
 *
 * Anchored, not paged, for the reason written out at length on `StoredBookmark`:
 * the page a note sits on changes with the type size, and the paragraph does
 * not. Chapter and section come back out of the anchor the same way too, so
 * they are not copied here.
 *
 * Device-local for now. The cloud backend has no notes table, so `Repository`
 * is deliberately untouched — see `storage/notes.ts` for the whole of that
 * decision.
 */
export interface StoredNote {
  bookId: BookId
  id: string
  /** The paragraph the note is about. */
  anchor: Anchor
  author: NoteAuthor
  text: string
  /** ISO 8601 — shown on the note, not used for ordering. */
  createdAt: string
  /**
   * The words the note is about, where it was made from a selection.
   *
   * Copied rather than pointed at. The anchor names the paragraph, and a
   * paragraph is often long; without this a highlight could not be shown as the
   * sentence the reader marked. It is a copy of the book's own text, so it is
   * never edited.
   */
  quote?: string
  /**
   * A highlight's colour, as CSS — `#f2df6b`.
   *
   * Present only on a highlight. Stored rather than derived, because readers
   * put meaning in the colour: yellow for "important", blue for "look this up".
   * A theme change must not rewrite what somebody meant.
   *
   * Unindexed, so no schema version is needed for it — Dexie only declares the
   * keys it has to search by, and no query asks for notes by colour.
   */
  colour?: string
}

/**
 * One conversation with the tutor about one passage (WP-17's tail).
 *
 * The passage is stored the way every mark in this app is stored: the
 * paragraph's anchor plus the exact words, never offsets — offsets die on the
 * first re-parse, the words are re-found with `rangeOfQuote`. `excerpt` also
 * makes "is there already a thread about these words?" a plain comparison,
 * which is what keeps it to one thread per passage.
 *
 * `messages` ride inside the row rather than in a table of their own. A
 * conversation is only ever read whole — the lamp opens it, the lamp appends
 * to it — and rows that are always fetched together should travel together.
 *
 * Device-local, like notes, and for the same reason — see `storage/tutor.ts`.
 */
export interface StoredTutorThread {
  bookId: BookId
  id: string
  /** The paragraph the passage starts in. */
  anchor: Anchor
  /** The exact words the thread is about, copied from the book. */
  excerpt: string
  /** How the passage is shown under the lamp: one line, or a shadowed block. */
  kind: 'sentence' | 'paragraph'
  messages: {
    role: NoteAuthor
    text: string
    /** The tutor asking back rather than telling — drawn differently. */
    isProbe?: boolean
    /**
     * The model that actually produced this message, as the relay read it off
     * the response — not the one that was asked for. The two differ whenever a
     * failover happened, which is exactly when the reader wants to know.
     *
     * Absent on the reader's own messages, and on every message stored before
     * v13. Absent means "unknown", never "the current model".
     */
    model?: string
    /** Epoch milliseconds. */
    ts: number
  }[]
  /** ISO 8601. */
  createdAt: string
  updatedAt: string
}

export const DB_NAME = 'reading-buddy'

/**
 * Declared as an intersection rather than a `class … { books!: Table<…> }`
 * subclass on purpose: with `useDefineForClassFields` (on by default at our
 * target), class fields would emit `books = undefined` at construction and
 * clobber the tables Dexie assigns. This is Dexie's documented way around it.
 */
export type ReadingBuddyDB = Dexie & {
  books: Table<BookMeta, BookId>
  manifests: Table<Manifest, BookId>
  chapters: Table<StoredChapterIndex, [BookId, string]>
  sections: Table<StoredSection, [BookId, SectionPath]>
  positions: Table<ReadingPosition, BookId>
  sources: Table<StoredSource, BookId>
  assets: Table<StoredAsset, [BookId, string]>
  quotes: Table<StoredQuote, [BookId, string]>
  folders: Table<StoredFolder, string>
  bookmarks: Table<StoredBookmark, [BookId, string]>
  notes: Table<StoredNote, [BookId, string]>
  tutor: Table<StoredTutorThread, [BookId, string]>
}

/**
 * Schema history. Never edit a shipped version — add a new `.version(n)` block
 * instead, so existing installs migrate rather than lose data.
 *
 * In each store string the first entry is the primary key; the rest are
 * secondary indexes. `[bookId+path]` is a compound key — the exact address.
 */
function defineSchema(db: Dexie): void {
  db.version(1).stores({
    books: 'id, title, type, importedAt',
    manifests: 'bookId',
    chapters: '[bookId+chapter], bookId',
    sections: '[bookId+path], bookId, chapter',
  })

  // v2 — `contentHash` indexed, so "have I already got this file?" is a direct
  // lookup at import rather than a scan of every book. Books imported under v1
  // simply have no hash; they are never reported as duplicates, which is the
  // right way round — a false "already on your shelf" is worse than a missed one.
  db.version(2).stores({
    books: 'id, title, type, importedAt, contentHash',
  })

  // v3 — `textSignature` indexed. Unlike `contentHash` this one can be filled
  // in for books that predate it, because it is derived from the stored text
  // rather than from the original file, which we never keep.
  db.version(3).stores({
    books: 'id, title, type, importedAt, contentHash, textSignature',
  })

  // v4 — where you stopped reading (WP-15). `at` is indexed rather than left as
  // a plain field so "continue reading" and a recently-opened list can be an
  // ordered read of a few rows instead of a scan of every book on the shelf.
  db.version(4).stores({
    positions: 'bookId, at',
  })

  // v5 — the file each book was imported from, so a parser fix can be applied
  // without the reader deleting the book and hunting down the file again. Only
  // `bookId` is indexed: this table is never searched, only fetched by book.
  // Books imported before v5 have no row here and can only be brought up to
  // date the old way — which the shelf says out loud rather than leaving the
  // reader to discover.
  db.version(5).stores({
    sources: 'bookId',
  })

  // v6 — the pictures inside a book (WP-39). Addressed exactly like a section,
  // `[bookId+path]`, because that is how a figure names its image; `bookId`
  // alone is indexed too, so deleting a book can drop all of its pictures
  // without listing them. Books imported before v6 have no rows here and show
  // captions only, until they are re-imported.
  db.version(6).stores({
    assets: '[bookId+path], bookId',
  })

  // v7 — favorite quotes (WP-48). `[bookId+id]` matches every other per-book
  // table's shape; `bookId` alone is indexed too, so deleting a book can drop
  // its quotes without listing them first, same as `assets`.
  db.version(7).stores({
    quotes: '[bookId+id], bookId',
  })

  // v8 — folders the reader makes themselves, and `folderId` indexed on a book
  // so "show me this folder" is a lookup rather than a scan of the shelf.
  //
  // No migration step: a book with no `folderId` is loose in the library, which
  // is exactly what every book already is. Nothing has to be rewritten, and a
  // reader who never makes a folder never sees one.
  db.version(8).stores({
    folders: 'id, name, createdAt',
    books: 'id, title, type, importedAt, contentHash, textSignature, folderId',
  })

  // v9 — a book may be in several folders. `*folderIds` is a *multiEntry* index:
  // one index entry per id in the array, so `where('folderIds').equals(id)` is
  // still a direct lookup rather than a scan, exactly as the single `folderId`
  // was. The old index is dropped in the same breath — leaving both would mean
  // two answers to "which folder is this in" and no rule about which wins.
  //
  // This one *does* need a migration, where v8 didn't: a book filed under v8
  // carries `folderId` and nothing else, so without the upgrade below every
  // folder the reader had made would read as empty. `upgrade` runs once, inside
  // the version change transaction, over the books table only.
  db.version(9)
    .stores({
      books: 'id, title, type, importedAt, contentHash, textSignature, *folderIds',
    })
    .upgrade((tx) =>
      tx
        .table<BookMeta & { folderId?: string }>('books')
        .toCollection()
        .modify((book) => {
          if (book.folderId === undefined) return
          // Written before the old field is removed, and never merged with an
          // existing `folderIds` — under v8 there cannot be one.
          book.folderIds = [book.folderId]
          delete book.folderId
        }),
    )

  // v10 — bookmarks (WP-14). `[bookId+id]` and a plain `bookId`, the same shape
  // as `quotes` and `assets`, for the same two reasons: the compound key is the
  // exact address, and the loose index is what lets `deleteBook` drop a book's
  // bookmarks without listing them first.
  //
  // No migration and nothing to backfill. A book with no bookmark rows has no
  // bookmarks, which is true of every book there has ever been.
  db.version(10).stores({
    bookmarks: '[bookId+id], bookId',
  })

  db.version(11).stores({
    notes: '[bookId+id], bookId',
  })

  // v12 — conversations with the tutor. The same shape as notes and for the
  // same reasons: `[bookId+id]` is the exact address, and the loose `bookId`
  // is what lets `deleteBook` drop a book's threads without listing them.
  // The passage's words are a plain field, not an index — "which thread is
  // about these words?" scans one book's few threads, and an index over long
  // strings would cost more than it saves.
  db.version(12).stores({
    tutor: '[bookId+id], bookId',
  })

  // v13 — the model that wrote each tutor message.
  //
  // No `stores` change: the field rides inside `messages`, which is already a
  // plain field on the row, so there is nothing to index and nothing to
  // migrate. The version bump exists to mark the shape change for anyone
  // reading this list.
  //
  // Old messages have no `model`, and that is the correct state for them
  // rather than a gap to backfill — nothing recorded which model answered, so
  // any value written in now would be a guess presented as a fact. They draw
  // with no label. See `StudyLamp`.
  db.version(13).stores({})
}

export function createDb(name: string = DB_NAME): ReadingBuddyDB {
  const db = new Dexie(name) as ReadingBuddyDB
  defineSchema(db)
  return db
}

/** The app-wide instance. Tests build their own via `createDb`. */
export const db: ReadingBuddyDB = createDb()
