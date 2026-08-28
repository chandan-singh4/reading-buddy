/**
 * Conversations with the tutor, kept on the device.
 *
 * Not on `Repository`, and deliberately — the whole argument is written out at
 * the top of `storage/notes.ts` and applies here word for word: the cloud
 * backend has no tutor table, and adding a method to `Repository` is a cloud
 * table, a cached read and an outbox entry, not one method. When the cloud
 * grows one, these functions move there and every caller keeps its signature.
 *
 * One rule lives here rather than in the UI: **one thread per passage.**
 * `findThread` is how the lamp asks "have we talked about these words?", and
 * the Reader always asks before it creates. Same anchor, same words — same
 * conversation, resumed.
 */

import { db as defaultDb, type ReadingBuddyDB, type StoredTutorThread } from './db.ts'
import type { PassageAnchor, TutorMessage } from '../reader/tutor.ts'
import type { BookId } from '../structure/index.ts'

/** Built against a database so tests can hand it a scratch one. */
export function createTutorStore(database: ReadingBuddyDB = defaultDb) {
  return {
    /**
     * Start a thread. Returns the row — the id is invented in here and the
     * caller has to be able to name it again, as with notes and bookmarks.
     */
    async addThread(
      bookId: BookId,
      passage: PassageAnchor,
      messages: TutorMessage[],
    ): Promise<StoredTutorThread> {
      const now = new Date().toISOString()
      const row: StoredTutorThread = {
        bookId,
        id: crypto.randomUUID(),
        anchor: passage.anchor,
        excerpt: passage.excerpt,
        kind: passage.kind,
        messages,
        createdAt: now,
        updatedAt: now,
      }
      await database.tutor.put(row)
      return row
    },

    /** Replace a thread's messages — the lamp appends, this persists. */
    async setMessages(bookId: BookId, id: string, messages: TutorMessage[]): Promise<void> {
      await database.tutor.update([bookId, id], {
        messages,
        updatedAt: new Date().toISOString(),
      })
    },

    /** Every thread in a book, unordered — the page orders them by the book. */
    async listThreads(bookId: BookId): Promise<StoredTutorThread[]> {
      return database.tutor.where('bookId').equals(bookId).toArray()
    },

    /**
     * Every thread in the library. Only the Stats screen asks for this — it
     * counts questions across all books, not inside one.
     *
     * A whole-table read, unlike everything else here. The messages are the
     * bulk of the row and the Stats screen loads once, so it is a page of text
     * per thread, not a book.
     */
    async allThreads(): Promise<StoredTutorThread[]> {
      return database.tutor.toArray()
    },

    async deleteThread(bookId: BookId, id: string): Promise<void> {
      await database.tutor.delete([bookId, id])
    },
  }
}

/** The app-wide store. */
export const tutorStore = createTutorStore()

/** The thread already holding these words, if one does. */
export function findThread(
  threads: readonly StoredTutorThread[],
  passage: Pick<PassageAnchor, 'anchor' | 'excerpt'>,
): StoredTutorThread | undefined {
  return threads.find(
    (thread) => thread.anchor === passage.anchor && thread.excerpt === passage.excerpt,
  )
}
