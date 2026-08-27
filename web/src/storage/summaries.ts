/**
 * What the Librarian and the Scribe left behind, kept on the device.
 *
 * The same shape and the same reasoning as `storage/digests.ts`: not on
 * `Repository`, because the cloud backend has no table for any of this, and
 * adding one method there is a cloud table, a cached read and an outbox entry
 * rather than one method. When the cloud grows them, these functions move and
 * every caller keeps its signature.
 *
 * Three stores in one file because they are written together. A chapter that
 * finishes writes a summary, may add to the vocabulary, and raises an alert —
 * and the rule that ties them is in `summary/engine.ts`, not here. This file
 * only reads and writes rows.
 */

import {
  db as defaultDb,
  type ReadingBuddyDB,
  type StoredAlert,
  type StoredChapterSummary,
  type StoredConcept,
} from './db.ts'
import type { BookId } from '../structure/index.ts'

/** Built against a database so tests can hand it a scratch one. */
export function createSummaryStore(database: ReadingBuddyDB = defaultDb) {
  return {
    /** One chapter's summary, or nothing if neither model has run on it. */
    async get(bookId: BookId, chapterId: string): Promise<StoredChapterSummary | undefined> {
      return database.summaries.get([bookId, chapterId])
    },

    /** Every summary in a book, unordered — the page orders them by the spine. */
    async list(bookId: BookId): Promise<StoredChapterSummary[]> {
      return database.summaries.where('bookId').equals(bookId).toArray()
    },

    /**
     * Write a chapter's summary, replacing whatever was there.
     *
     * `put`, not `update`, for the reason the digest store gives: a half-written
     * row — a new recap beside a stale conversation count — reads as fresh and
     * would never be rebuilt.
     */
    async save(row: StoredChapterSummary): Promise<void> {
      await database.summaries.put(row)
    },

    async remove(bookId: BookId, chapterId: string): Promise<void> {
      await database.summaries.delete([bookId, chapterId])
    },
  }
}

/**
 * The controlled vocabulary both prompts read.
 *
 * Library-wide. See `StoredConcept` for why deleting a book must not touch it.
 */
export function createConceptStore(database: ReadingBuddyDB = defaultDb) {
  return {
    /** Every canonical name, oldest first. This is what goes into a prompt. */
    async names(): Promise<string[]> {
      const rows = await database.concepts.orderBy('addedAt').toArray()
      return rows.map((row) => row.name)
    },

    /**
     * Add names that are not already there, and report which were new.
     *
     * The caller hands over everything the Librarian marked `new-addition`.
     * This still checks, because two chapters running close together can both
     * be told a name is new, and the vocabulary must not gain it twice.
     *
     * Case-insensitive on the way in. The prompt asks for lowercase names, and
     * a model that returns "The Unconscious" once must not create a second note
     * beside "the unconscious" in the reader's vault.
     */
    async add(names: string[], firstBookId: BookId, at: string): Promise<string[]> {
      const existing = new Set((await this.names()).map((name) => name.toLowerCase()))
      const fresh: StoredConcept[] = []
      for (const name of names) {
        const key = name.trim().toLowerCase()
        if (key === '' || existing.has(key)) continue
        existing.add(key)
        fresh.push({ name: name.trim(), addedAt: at, firstBookId })
      }
      if (fresh.length > 0) await database.concepts.bulkPut(fresh)
      return fresh.map((row) => row.name)
    },
  }
}

/** The bell on the Home screen. */
export function createAlertStore(database: ReadingBuddyDB = defaultDb) {
  return {
    /** Newest first, which is the order the bell shows them in. */
    async list(): Promise<StoredAlert[]> {
      const rows = await database.alerts.orderBy('at').toArray()
      return rows.reverse()
    },

    /** How many the reader has not looked at. The number on the bell. */
    async unseen(): Promise<number> {
      const rows = await database.alerts.toArray()
      return rows.filter((row) => !row.seen).length
    },

    /** `put`, so a chapter that runs twice replaces its line instead of adding one. */
    async save(row: StoredAlert): Promise<void> {
      await database.alerts.put(row)
    },

    async markSeen(id: string): Promise<void> {
      const row = await database.alerts.get(id)
      if (row) await database.alerts.put({ ...row, seen: true })
    },

    async markAllSeen(): Promise<void> {
      const rows = await database.alerts.toArray()
      await database.alerts.bulkPut(rows.map((row) => ({ ...row, seen: true })))
    },

    async remove(id: string): Promise<void> {
      await database.alerts.delete(id)
    },
  }
}

/** The app-wide stores. */
export const summaryStore = createSummaryStore()
export const conceptStore = createConceptStore()
export const alertStore = createAlertStore()
