/**
 * The single public entry point for persistence. Import from here — never from
 * `db.ts` directly, so the database stays swappable behind the repository.
 *
 * This is the one line that decides which of the two backends the app is
 * talking to. Everything else in the app imports `repository` from here and is
 * unaware there is a choice — which is what the `Repository` type was for. See
 * `backend.ts` for why the switch takes a page reload.
 */

import { activeBackend } from './backend.ts'
import { createCloudRepository } from './cloud/index.ts'
import { repository as deviceRepository, type Repository } from './repository.ts'

export { DB_NAME, createDb } from './db.ts'
export type {
  ReadingBuddyDB,
  ReadingPosition,
  StoredAsset,
  StoredBookmark,
  StoredChapterIndex,
  StoredFolder,
  StoredQuote,
  StoredSection,
  StoredSource,
} from './db.ts'

export { COVER_ASSET_PATH, createRepository } from './repository.ts'
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
 * library never opens a Supabase connection.
 */
export const repository: Repository =
  activeBackend() === 'cloud' ? createCloudRepository() : deviceRepository
