/**
 * What each chapter left behind, kept on the device.
 *
 * The same shape and the same reasoning as `storage/tutor.ts`: not on
 * `Repository`, because the cloud backend has no digests table and adding one
 * method there is a cloud table, a cached read and an outbox entry, not one
 * method. When the cloud grows one, these functions move and every caller keeps
 * its signature.
 *
 * The rule about *when* to rebuild is not here — it is `work` in
 * `tutor/digest.ts`, beside the block arithmetic it depends on. This file only
 * reads and writes rows.
 */

import { db as defaultDb, type ReadingBuddyDB, type StoredDigest } from './db.ts'
import type { BookId } from '../structure/index.ts'

/** Built against a database so tests can hand it a scratch one. */
export function createDigestStore(database: ReadingBuddyDB = defaultDb) {
  return {
    /** One chapter's digest, or nothing if it has never been built. */
    async get(bookId: BookId, chapterId: string): Promise<StoredDigest | undefined> {
      return database.digests.get([bookId, chapterId])
    },

    /** Every digest in a book, unordered — the screen orders them by the spine. */
    async list(bookId: BookId): Promise<StoredDigest[]> {
      return database.digests.where('bookId').equals(bookId).toArray()
    },

    /**
     * Write a chapter's digest, replacing whatever was there.
     *
     * `put` rather than `update`, because a rebuild replaces the whole record:
     * a half-written row — new recap, old confusion count — would read as fresh
     * and never be rebuilt again.
     */
    async save(row: StoredDigest): Promise<void> {
      await database.digests.put(row)
    },

    async remove(bookId: BookId, chapterId: string): Promise<void> {
      await database.digests.delete([bookId, chapterId])
    },
  }
}

/** The app-wide store. */
export const digestStore = createDigestStore()
