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

/**
 * The parser behind a cached definition. Raise it whenever a change here or in
 * `reader/dictionary.ts` would produce a *different* entry from the same MW
 * JSON — a new field, a fixed URL, a better etymology chain.
 *
 * ## Why a cache needs a version at all
 *
 * What is cached is the parsed entry, not MW's JSON, and the cache is read
 * before the network. So a parsing bug does not end when it is fixed: every
 * device keeps serving the old broken entry for those words, forever, and the
 * fix appears to work everywhere except where it matters.
 *
 * That is not hypothetical. The audio path was wrong until 2026-08-24
 * (`/audio/pronunciation/mp3/` answers 403; `/audio/prons/en/us/mp3/` answers
 * 200). The path was fixed, the tests passed, and the reader's phone went on
 * playing the 403 for every word it had already looked up — reported
 * 2026-08-25 against "fundamental". Raising this number is what actually
 * delivers a parser fix to a device.
 *
 * Same idea as `PARSER_VERSION`, and for the same reason.
 *
 * - 1 — implied, every row written before this constant existed.
 * - 2 — 2026-08-25. Re-fetch everything, to clear the 403 audio URLs.
 */
export const DEFINITION_VERSION = 2

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
        const kept = await database.definitions.get(word.trim().toLowerCase())
        /* A row from an older parser is a miss, not a hit. See
         * `DEFINITION_VERSION`. The row is left where it is: the next lookup
         * overwrites it, and a reader with no signal keeps something to read
         * rather than nothing. */
        return kept && kept.v === DEFINITION_VERSION ? kept : undefined
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
          v: DEFINITION_VERSION,
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
