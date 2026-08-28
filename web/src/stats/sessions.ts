/**
 * Reading sessions, kept on the device.
 *
 * Not on `Repository`, and deliberately — the argument at the top of
 * `storage/notes.ts` applies word for word: the cloud backend has no sessions
 * table, and adding a method to `Repository` is a Supabase table, a cached read
 * and an outbox entry, not one method. When the cloud grows one, these
 * functions move there and every caller keeps its signature.
 *
 * The cost is real and accepted: the Stats screen does not follow the reader to
 * a second device.
 *
 * **Sessions do not cascade on a deleted book.** Every other per-book table
 * does. This one follows `vocabulary` instead: the reading happened, and a
 * streak is a fact about the reader, not about a book still on the shelf.
 * Deleting a book must not rewrite the days you read.
 */

import { db as defaultDb, type ReadingBuddyDB, type StoredSession } from '../storage/db.ts'
import type { BookId } from '../structure/index.ts'

/**
 * A local calendar day as `YYYY-MM-DD`.
 *
 * Built by hand rather than through `toISOString`, which converts to UTC first
 * and so files an evening's reading under tomorrow for anyone east of London.
 * The day a reader read is the day on *their* wall.
 */
export function dayKey(at: Date | number): string {
  const d = typeof at === 'number' ? new Date(at) : at
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Built against a database so tests can hand it a scratch one. */
export function createSessionStore(database: ReadingBuddyDB = defaultDb) {
  return {
    /**
     * Write a session, creating it or overwriting it.
     *
     * One method rather than an add/update pair because the timer calls it
     * repeatedly for the *same* id while a book is open — every write is the
     * same session grown a little longer. A crash between writes therefore
     * costs at most the flush interval, not the whole visit.
     */
    async put(session: StoredSession): Promise<void> {
      await database.sessions.put(session)
    },

    /** Every session that started within `[from, to]`, by day key, inclusive. */
    async between(from: string, to: string): Promise<StoredSession[]> {
      return database.sessions.where('day').between(from, to, true, true).toArray()
    },

    /** Every session there is, oldest first. The heatmap wants a whole year. */
    async all(): Promise<StoredSession[]> {
      return database.sessions.orderBy('startedAt').toArray()
    },

    /**
     * The first day any reading was recorded, or `undefined` before there is
     * any — which is what the calendar reads to know where its window starts.
     *
     * Derived rather than stored. A stored "tracking start" is a second copy of
     * a fact the rows already hold, and a second copy is a thing that can
     * disagree; this cannot. It is one indexed lookup, not a scan.
     */
    async trackingStart(): Promise<string | undefined> {
      const first = await database.sessions.orderBy('day').first()
      return first?.day
    },

    async forBook(bookId: BookId): Promise<StoredSession[]> {
      return database.sessions.where('bookId').equals(bookId).toArray()
    },
  }
}

export type SessionStore = ReturnType<typeof createSessionStore>

/** The app-wide instance. Tests build their own via `createSessionStore`. */
export const sessionStore: SessionStore = createSessionStore()
