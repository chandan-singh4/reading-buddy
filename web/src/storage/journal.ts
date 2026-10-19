/**
 * The journal — thoughts the reader speaks, and the shapes a model gives them.
 *
 * ## Why this is not on `Repository`
 *
 * The same reason `notes.ts` is not, set out there in full: `Repository` is a
 * type three implementations are checked against, so a method on it is a cloud
 * table, a cached read, an outbox entry and a migration — not a method.
 *
 * Entries are device-local until WP-66 does that work, and this module is the
 * whole cost of the decision. When the cloud gains an entries table these
 * functions move onto `Repository` and every caller keeps the signature it
 * already has.
 */

import {
  db as defaultDb,
  type EntryLink,
  type EntryShaped,
  type ReadingBuddyDB,
  type StoredEntry,
} from './db.ts'

/** Everything an entry needs that isn't invented in here. */
export interface NewEntry {
  /** The transcript, as the recogniser settled it. */
  raw: string
  /** Set where the entry grew out of a passage of a book (WP-63). */
  link?: EntryLink
  /** When the reader started speaking. Defaults to now. */
  at?: Date
}

/** Built against a database so tests can hand it a scratch one. */
export function createEntryStore(database: ReadingBuddyDB = defaultDb) {
  return {
    /**
     * Write an entry. Returns the row, as `addNote` does, because the id is
     * invented in here and the caller has to be able to name it again.
     */
    async addEntry(entry: NewEntry): Promise<StoredEntry> {
      const row: StoredEntry = {
        id: crypto.randomUUID(),
        // The moment the reader began speaking, not the moment they stopped.
        // A ten-minute ramble belongs to the hour it started in.
        at: (entry.at ?? new Date()).toISOString(),
        raw: entry.raw,
        // Always an array, never absent. `*tags` is a multiEntry index, and a
        // row whose indexed field is missing is in no entry of that index at
        // all — an untagged entry would be invisible to every tag query.
        tags: [],
        // Written only when it exists: an undefined field on a Dexie row is
        // stored as a present key holding nothing, which `link.bookId` would
        // then have to tell apart from a real tie to a book.
        ...(entry.link ? { link: entry.link } : {}),
      }
      await database.entries.put(row)
      return row
    },

    /**
     * Entries, newest first.
     *
     * The one order the journal is ever drawn in — unlike notes, whose order is
     * the book's rather than the clock's. A thought has no page to sit on.
     */
    async listEntries(limit?: number): Promise<StoredEntry[]> {
      const newestFirst = database.entries.orderBy('at').reverse()
      return limit === undefined ? newestFirst.toArray() : newestFirst.limit(limit).toArray()
    },

    async getEntry(id: string): Promise<StoredEntry | undefined> {
      return database.entries.get(id)
    },

    /**
     * Store a shape beside the reader's words (WP-62).
     *
     * Note what this cannot do: it cannot write `raw`. `decisions.md` settles
     * that the raw transcript is canonical and a shape is derived from it, so
     * no shaping path may touch the reader's own words. The one function that
     * writes `raw` is `setRaw`, and it is only ever called by the reader's own
     * hand on the keyboard.
     *
     * A second call replaces the shape. The reader asked for a different
     * strength, or asked again for the same one, and two shapes of one entry
     * is a choice nobody wanted to be offered.
     */
    async setShaped(id: string, shaped: EntryShaped, title?: string): Promise<void> {
      await database.entries.update(id, {
        shaped,
        // Only the two stronger levels write one, and a title from a shape the
        // reader has just replaced must not outlive it.
        ...(title ? { title } : { title: undefined }),
      })
    },

    /**
     * The reader corrected their own words (2026-10-19).
     *
     * The only function in this file that writes `raw`, and the rule it sits
     * under is "a model may not overwrite the reader", not "nobody may". The
     * recogniser mishears, and a transcript the reader cannot fix is not their
     * words either.
     *
     * The shape is deliberately left alone here. It is now derived from words
     * that no longer exist, and the caller is the one that knows whether it can
     * make a new one — see `Entry.tsx`, which re-shapes at the same strength
     * and says so when it cannot.
     */
    async setRaw(id: string, raw: string): Promise<void> {
      await database.entries.update(id, { raw })
    },

    /** Throw the shape away. The reader's own words are untouched. */
    async clearShaped(id: string): Promise<void> {
      await database.entries.update(id, { shaped: undefined, title: undefined })
    },

    async deleteEntry(id: string): Promise<void> {
      await database.entries.delete(id)
    },
  }
}

/** The app-wide entry store. */
export const entryStore = createEntryStore()
