/**
 * Reading notes — yours and the tutor's — against a paragraph of a book.
 *
 * ## Why this is not on `Repository`
 *
 * Every other kind of row in this app goes through `repository`, and this one
 * deliberately does not. `Repository` is `ReturnType<typeof createRepository>`,
 * and two other implementations are checked against that type: the Supabase
 * backend and the offline cache in front of it. Adding a method there is not
 * one method — it is a cloud table, a cached read, an outbox entry for the
 * write, and a migration on a database this thread cannot reach.
 *
 * Notes are device-local until that work is done, and this module is the whole
 * of the cost of that decision: three functions against the same Dexie
 * database, in the same shape as the repository's own. When the cloud gains a
 * notes table, these three move onto `Repository` and every caller keeps the
 * signatures it already has.
 */

import { db as defaultDb, type NoteAuthor, type ReadingBuddyDB, type StoredNote } from './db.ts'
import type { Anchor, BookId } from '../structure/index.ts'

/** Everything a note needs that isn't invented in here. */
export interface NewNote {
  anchor: Anchor
  author: NoteAuthor
  text: string
  /** The selected words this note was made from, where there were any. */
  quote?: string
  /** A highlight's colour, as CSS. Only a highlight carries one. */
  colour?: string
  /** The tutor thread a kept line of Veda's was said in. */
  fromThread?: string
}

/** Built against a database so tests can hand it a scratch one. */
export function createNoteStore(database: ReadingBuddyDB = defaultDb) {
  return {
    /**
     * Write a note. Returns the row, as `addBookmark` does, because the id is
     * invented in here and the caller has to be able to name it again.
     */
    async addNote(bookId: BookId, note: NewNote): Promise<StoredNote> {
      const row: StoredNote = {
        bookId,
        id: crypto.randomUUID(),
        anchor: note.anchor,
        author: note.author,
        text: note.text,
        createdAt: new Date().toISOString(),
        // Written only when they exist: an undefined field on a Dexie row is
        // stored as a present key holding nothing, and `exists` checks later
        // would have to know the difference.
        ...(note.quote ? { quote: note.quote } : {}),
        ...(note.colour ? { colour: note.colour } : {}),
        ...(note.fromThread ? { fromThread: note.fromThread } : {}),
      }
      await database.notes.put(row)
      return row
    },

    /**
     * Every note in a book, unordered.
     *
     * Ordering is the caller's, and it is the book's order rather than the
     * clock's — see `reader/notes.ts`. Same split as bookmarks, same reason.
     */
    async listNotes(bookId: BookId): Promise<StoredNote[]> {
      return database.notes.where('bookId').equals(bookId).toArray()
    },

    /**
     * Every note and highlight in every book, unordered.
     *
     * For the Statistics screen, which counts the marks a reader made during a
     * session and so cannot ask book by book — it does not know which books
     * until it has read the sessions.
     */
    async allNotes(): Promise<StoredNote[]> {
      return database.notes.toArray()
    },

    /**
     * Change a highlight's colour, keeping the note it is part of.
     *
     * A recolour is not a new highlight. Deleting and adding would give the
     * same words a new id and a new date, and move them to the end of the
     * Quotes list — the reader changed a colour, not the passage.
     */
    async setNoteColour(bookId: BookId, id: string, colour: string): Promise<void> {
      await database.notes.update([bookId, id], { colour })
    },

    async deleteNote(bookId: BookId, id: string): Promise<void> {
      await database.notes.delete([bookId, id])
    },
  }
}

/** The app-wide note store. */
export const noteStore = createNoteStore()
