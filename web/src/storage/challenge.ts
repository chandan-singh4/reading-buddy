/**
 * What the examination leaves on the device.
 *
 * Two stores with opposite lifetimes, and the difference is the point.
 *
 * `questionBanks` is a cache of written work. It exists so a chapter is written
 * for once instead of once per visit, and it may be thrown away at any time —
 * the cost is money, not memory.
 *
 * `misses` is the reader's record. It is what makes a concept come back weeks
 * later in a new question, and it must survive everything short of the reader
 * asking for it to go. It is not on `Repository` for the same reason the
 * summary stores are not: the cloud backend has no table for either.
 */

import type { StoredMiss, StoredQuestionBank, Confidence } from '../challenge/types.ts'
import { db as defaultDb, type ReadingBuddyDB } from './db.ts'
import type { BookId } from '../structure/index.ts'

/** Built against a database so tests can hand it a scratch one. */
export function createBankStore(database: ReadingBuddyDB = defaultDb) {
  return {
    async get(bookId: BookId, chapterId: string): Promise<StoredQuestionBank | undefined> {
      return database.questionBanks.get([bookId, chapterId])
    },

    async save(row: StoredQuestionBank): Promise<void> {
      await database.questionBanks.put(row)
    },

    async forBook(bookId: BookId): Promise<StoredQuestionBank[]> {
      return database.questionBanks.where('bookId').equals(bookId).toArray()
    },

    async remove(bookId: BookId, chapterId: string): Promise<void> {
      await database.questionBanks.delete([bookId, chapterId])
    },
  }
}

export function createMissStore(database: ReadingBuddyDB = defaultDb) {
  return {
    async get(concept: string): Promise<StoredMiss | undefined> {
      return database.misses.get(concept)
    },

    /** Every concept still unresolved, newest first. Drives resurfacing. */
    async flagged(): Promise<StoredMiss[]> {
      const rows = await database.misses.toArray()
      return rows.filter((row) => row.flagged).sort((a, b) => b.lastSeen - a.lastSeen)
    },

    async all(): Promise<StoredMiss[]> {
      return database.misses.toArray()
    },

    /**
     * Record one answer against its concept.
     *
     * The whole miss loop is these six lines. A correct answer clears the flag
     * whatever it was before — the concept is considered to hold for now. A
     * wrong answer sets it only when the reader was sure, because a shaky guess
     * is normal learning and hunting it down just teaches anxiety.
     */
    async record(
      concept: string,
      bookId: BookId,
      correct: boolean,
      confidence: Confidence,
      now: number = Date.now(),
    ): Promise<void> {
      const firm = confidence === 'confident' || confidence === 'very'
      const before = await database.misses.get(concept)
      await database.misses.put({
        concept,
        bookId: before?.bookId ?? bookId,
        seen: (before?.seen ?? 0) + 1,
        missed: (before?.missed ?? 0) + (correct ? 0 : 1),
        lastConfidence: confidence,
        lastSeen: now,
        flagged: correct ? false : firm || (before?.flagged ?? false),
      })
    },
  }
}

/** The app-wide stores. */
export const bankStore = createBankStore()
export const missStore = createMissStore()
