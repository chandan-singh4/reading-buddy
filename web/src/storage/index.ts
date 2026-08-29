/**
 * The single public entry point for persistence. Import from here — never from
 * `db.ts` directly, so the database stays swappable behind the repository.
 *
 * This is the one line that decides which of the two backends the app is
 * talking to. Everything else in the app imports `repository` from here and is
 * unaware there is a choice — which is what the `Repository` type was for. See
 * `backend.ts` for why the switch takes a page reload.
 */

import type { BookId, BookMeta } from '../structure/index.ts'
import { activeBackend } from './backend.ts'
import { createCachedRepository, openableOffline } from './cloud/cached.ts'
import { createCloudRepository } from './cloud/index.ts'
import { repository as deviceRepository, type Repository } from './repository.ts'

export { DB_NAME, createDb } from './db.ts'
export type {
  NoteAuthor,
  ReadingBuddyDB,
  ReadingPosition,
  StoredAsset,
  StoredBookmark,
  StoredChapterIndex,
  StoredFolder,
  StoredNote,
  StoredQuote,
  StoredDefinition,
  StoredSection,
  StoredSource,
  StoredTutorThread,
  StoredWord,
} from './db.ts'

export { createNoteStore, noteStore } from './notes.ts'
export type { NewNote } from './notes.ts'

export { createTutorStore, findThread, tutorStore } from './tutor.ts'

export { relocate, relocateMarks } from './relocate.ts'
export type { Relocation } from './relocate.ts'

export { createWordStore, wordStore } from './words.ts'
export type { WordFrom, WordStore } from './words.ts'

export { COVER_ASSET_PATH, FETCHED_COVER_ASSET_PATH, createRepository } from './repository.ts'
export type { BookAsset, ParsedBook, Repository } from './repository.ts'

export { BACKEND_KEY, activeBackend, chooseBackend, resolveBackend } from './backend.ts'
export type { Backend } from './backend.ts'

export { copyLibrary, countBooksToCopy } from './transfer.ts'
export type { CopyFailure, CopyOptions, CopyProgress, CopyResult } from './transfer.ts'

/**
 * The library on this device, whichever backend is switched on.
 *
 * Exported so the settings screen can say "32 books are still here" while the
 * app is looking at the cloud. Nothing else should reach for it: a screen that
 * reads this instead of `repository` is a screen that ignores the reader's
 * choice.
 */
export { repository as deviceRepository } from './repository.ts'

/**
 * The app-wide repository — the device's or the cloud's, chosen at load.
 *
 * The cloud one is built only when it has been chosen, so a reader on the local
 * library never opens a Supabase connection — and it is wrapped in the offline
 * copy (WP-58), which is why nothing else in the app has to know whether the
 * words on screen came over the network or off the disk.
 */
export const repository: Repository =
  activeBackend() === 'cloud'
    ? createCachedRepository(createCloudRepository())
    : deviceRepository

/**
 * Books the shelf is showing that cannot actually be opened right now.
 *
 * The one place a screen is allowed to know that the library it is drawing came
 * from an offline copy — because it is the one thing a reader can see. With no
 * signal the shelf lists every book (`cloud/shelf.ts`), but only the ones read
 * before the signal went are readable, and a row that looks tappable and isn't
 * is worse than a row that says so.
 *
 * Always empty on the device library and always empty online, so the caller can
 * ask unconditionally. **Never throws**: it is one of the reads the library
 * screen bundles into a `Promise.all`, and a `Promise.all` fails as a group —
 * the exact fault that once blanked this screen.
 */
export async function unavailableBooks(
  books: readonly BookMeta[],
): Promise<ReadonlySet<BookId>> {
  try {
    if (activeBackend() !== 'cloud') return EMPTY
    const openable = await openableOffline()
    if (!openable) return EMPTY
    return new Set(books.filter((book) => !openable.has(book.id)).map((book) => book.id))
  } catch {
    return EMPTY
  }
}

const EMPTY: ReadonlySet<BookId> = new Set()
