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
}

export function createDb(name: string = DB_NAME): ReadingBuddyDB {
  const db = new Dexie(name) as ReadingBuddyDB
  defineSchema(db)
  return db
}

/** The app-wide instance. Tests build their own via `createDb`. */
export const db: ReadingBuddyDB = createDb()
