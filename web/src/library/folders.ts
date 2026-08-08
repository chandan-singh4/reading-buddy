/**
 * Reading a book's folder membership, and building the one list of folders every
 * control on the library screen offers.
 *
 * Small, but it earns its own file for the reason `status.ts` does: three
 * separate places used to reach into `book.folderId` directly, and the moment a
 * book could be in *several* folders that became three places that each had to
 * remember the field is now a list, might be absent, and might name a folder
 * that has since been deleted. Asked once here, they cannot each get it slightly
 * differently.
 */

import type { BookMeta } from '../structure/index.ts'
import type { StoredFolder } from '../storage/index.ts'
import { SYSTEM_FOLDERS, type FolderChoice } from './systemFolders.ts'

/**
 * The folders a book is in, ignoring any that no longer exist.
 *
 * A dangling id is filtered out rather than treated as an error. `deleteFolder`
 * strips the id from every book in the same transaction, so this should not
 * happen — but a book that half-fails its way into pointing at a folder that has
 * gone should read as being in one fewer folder, never as a badge with no name
 * on it, and never as missing from the library.
 */
export function foldersOf(
  book: BookMeta,
  known: ReadonlyMap<string, StoredFolder>,
): StoredFolder[] {
  if (!book.folderIds || book.folderIds.length === 0) return []
  return book.folderIds
    .map((id) => known.get(id))
    .filter((folder): folder is StoredFolder => folder !== undefined)
}

/** Just the ids, for a membership test that doesn't need the names. */
export function folderIdsOf(book: BookMeta): readonly string[] {
  return book.folderIds ?? []
}

/**
 * Every folder the reader can choose between: the two computed ones first, then
 * their own, alphabetically as `listFolders` returns them.
 *
 * One list rather than "system folders, and also the real ones" at each call
 * site, because from the reader's side there is no such distinction — they are
 * looking at a list of folders. Only the two places that would *write* to a
 * folder need to know the difference, and both check `system` explicitly.
 */
export function folderChoices(folders: readonly StoredFolder[]): FolderChoice[] {
  return [
    ...SYSTEM_FOLDERS,
    ...folders.map((folder) => ({ id: folder.id, name: folder.name, system: false })),
  ]
}
