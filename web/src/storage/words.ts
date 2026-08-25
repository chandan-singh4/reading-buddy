/**
 * Looked-up words, and kept ones.
 *
 * Device-local, and on `Repository` for exactly the reasons `notes.ts` sets out
 * at its head — the same three-function shape against the same Dexie database,
 * ready to move when the cloud gains tables for them.
 *
 * The two halves are deliberately not one table. `definitions` is a copy of
 * something Merriam-Webster said: droppable, refetchable, worth nothing to
 * anyone but this device. `vocabulary` is a decision the reader made, and
 * losing it would be losing their work. Keeping them apart means a future
 * "clear the dictionary cache" can never take the word list with it.
 */

import { db as defaultDb, type ReadingBuddyDB, type StoredDefinition, type StoredWord } from './db.ts'
import type { Anchor, BookId } from '../structure/index.ts'

/** Where a saved word was met. Both optional — a word can be saved from anywhere. */
export interface WordFrom {
  bookId?: BookId
  anchor?: Anchor
  gloss?: string
}

/** Built against a database so tests can hand it a scratch one. */
export function createWordStore(database: ReadingBuddyDB = defaultDb) {
  return {
    /**
     * The parsed entry for a word, if it has been looked up before.
     *
     * Returns `undefined` rather than throwing when the database cannot be
     * read. A dictionary panel that fails to open because the *cache* failed
     * would be worse than one that simply goes to the network.
     */
    async cachedDefinition(word: string): Promise<StoredDefinition | undefined> {
      try {
        return await database.definitions.get(word.trim().toLowerCase())
      } catch {
        return undefined
      }
    },

    /** Keep a parsed entry. Looking the same word up again costs nothing after this. */
    async cacheDefinition(word: string, entry: unknown): Promise<void> {
      try {
        await database.definitions.put({
          word: word.trim().toLowerCase(),
          entry,
          fetchedAt: new Date().toISOString(),
        })
      } catch {
        /* A full disk is not a reason to refuse to show the word. */
      }
    },

    /** Save a word to the reader's list. Saving one twice saves it once. */
    async saveWord(word: string, from: WordFrom = {}): Promise<StoredWord> {
      const row: StoredWord = {
        word: word.trim().toLowerCase(),
        ...(from.bookId ? { bookId: from.bookId } : {}),
        ...(from.anchor ? { anchor: from.anchor } : {}),
        ...(from.gloss ? { gloss: from.gloss } : {}),
        savedAt: new Date().toISOString(),
      }
      await database.vocabulary.put(row)
      return row
    },

    /** Whether a word is already on the list, for a button that says so. */
    async isSaved(word: string): Promise<boolean> {
      try {
        return (await database.vocabulary.get(word.trim().toLowerCase())) !== undefined
      } catch {
        return false
      }
    },

    /** Take a word off the list. */
    async forgetWord(word: string): Promise<void> {
      await database.vocabulary.delete(word.trim().toLowerCase())
    },

    /** The reader's saved words, newest first. */
    async savedWords(): Promise<StoredWord[]> {
      try {
        const rows = await database.vocabulary.orderBy('savedAt').toArray()
        return rows.reverse()
      } catch {
        return []
      }
    },
  }
}

export type WordStore = ReturnType<typeof createWordStore>

/** The app-wide instance. Tests build their own via `createWordStore`. */
export const wordStore: WordStore = createWordStore()
