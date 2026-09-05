/**
 * The folder the reader imports books from, kept between visits.
 *
 * A store of its own rather than a pair of methods on `Repository`, and the
 * reason is that `Repository` has two implementations. The cloud one would have
 * to implement these, and there is nothing it could honestly do: a
 * `FileSystemDirectoryHandle` is a key to a folder on *this* device. Uploaded,
 * it would point at nothing on the reader's other phone. So it stays out of the
 * shape the cloud has to satisfy — the same reasoning `notes.ts` and `words.ts`
 * use for their own tables, one step further.
 *
 * There is one row. A list of folders would be a different feature: the button
 * says "check the folder", and a reader with four of them needs a screen to
 * choose between, which nobody has asked for.
 */

import { db as defaultDb, type ReadingBuddyDB, type StoredHandle } from './db.ts'

/** The one key in `handles`. */
const IMPORT_FOLDER = 'importFolder'

export interface HandleStore {
  rememberImportFolder(handle: FileSystemDirectoryHandle): Promise<void>
  importFolder(): Promise<StoredHandle | undefined>
  forgetImportFolder(): Promise<void>
}

export function createHandleStore(database: ReadingBuddyDB = defaultDb): HandleStore {
  return {
    /**
     * Keep this folder, replacing whatever was kept before.
     *
     * Called again after every successful scan, which is what keeps `at`
     * honest — it is "when we last read it", not "when it was first chosen".
     */
    async rememberImportFolder(handle: FileSystemDirectoryHandle): Promise<void> {
      await database.handles.put({
        id: IMPORT_FOLDER,
        handle,
        name: handle.name,
        at: new Date().toISOString(),
      })
    },

    async importFolder(): Promise<StoredHandle | undefined> {
      return await database.handles.get(IMPORT_FOLDER)
    },

    /** After a refusal, or a folder that has moved and cannot be found again. */
    async forgetImportFolder(): Promise<void> {
      await database.handles.delete(IMPORT_FOLDER)
    },
  }
}

/** The app-wide store. Tests build their own against a scratch database. */
export const handleStore: HandleStore = createHandleStore()
