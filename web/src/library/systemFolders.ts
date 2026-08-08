/**
 * "Unread" and "Finished" — two folders the reader never has to file anything
 * into, because nothing is filed into them at all.
 *
 * ## Why these are computed and not stored
 *
 * The brief asks for two folders whose membership follows reading progress: a
 * book leaves Unread and joins Finished when it is finished, and goes back if
 * the reader resets their place. The obvious build is two real rows in the
 * `folders` table and some code that moves books between them whenever progress
 * changes.
 *
 * That build has a failure mode with no floor to it. Membership would be a
 * *copy* of a fact that already exists — the reading position — and every copy
 * needs every writer to remember to update it. Miss one path (a position saved
 * on a background tab, a book re-imported, a position row cleared, a percent
 * that arrives late because the spine hadn't built) and the shelf quietly
 * disagrees with itself: a book showing "✓ Finished" on its cover and sitting in
 * Unread. There is no way for the reader to correct that and no way for them to
 * even tell which of the two is lying.
 *
 * So membership is not stored. These two folders are a **question asked of the
 * progress map at the moment the shelf is drawn**, which is the same source the
 * "Finished" badge already reads. They cannot drift, because there is nothing to
 * drift from — a book that becomes finished is in Finished on the very next
 * render, and a reset puts it back with no code run in between. "Moving between
 * them" is not an operation this app performs; it is what the answer changing
 * looks like.
 *
 * ## What the reader gets, and the one thing they don't
 *
 * From the reader's side these behave like the folders they made themselves:
 * they are in the same list, they narrow the shelf the same way, and a book
 * opens from them the same way. The one difference is deliberate and is enforced
 * in the repository as well as hidden in the UI — **they cannot be renamed,
 * deleted, or filed into by hand.** A "move this book into Unread" that had to
 * either lie or un-read the book is not a thing worth offering.
 *
 * The ids are namespaced `system:` so they can never collide with a
 * `crypto.randomUUID()` from `createFolder`, and so a stored `prefs.folderId`
 * naming one is recognisable without a lookup.
 */

import type { ReadingStatus } from './status.ts'

export const UNREAD_FOLDER_ID = 'system:unread'
export const FINISHED_FOLDER_ID = 'system:finished'

/**
 * A folder as the library's controls see one — the reader's own and the two
 * computed ones, in a single shape so nothing that merely *lists* folders has to
 * know the difference.
 */
export interface FolderChoice {
  id: string
  name: string
  /** True for Unread and Finished: not editable, and not filed into by hand. */
  system: boolean
}

/**
 * Which reading status each system folder holds. One entry per folder, so the
 * mapping is stated once and both the filter and any future third folder read
 * it from here.
 */
const HOLDS: Record<string, ReadingStatus> = {
  [UNREAD_FOLDER_ID]: 'unread',
  [FINISHED_FOLDER_ID]: 'finished',
}

/**
 * Listed before the reader's own folders, and in this order.
 *
 * Unread first because it is where a library begins, Finished last because it is
 * where a book ends — the two ends of the same journey, with everything the
 * reader has organised themselves in between. There is deliberately no
 * "Currently reading" here: Home already leads with it, and a folder list is for
 * finding a book you are *not* in the middle of.
 */
export const SYSTEM_FOLDERS: readonly FolderChoice[] = [
  { id: UNREAD_FOLDER_ID, name: 'Unread', system: true },
  { id: FINISHED_FOLDER_ID, name: 'Finished', system: true },
]

/** Whether an id names one of the computed folders rather than a stored one. */
export function isSystemFolder(id: string): boolean {
  return id in HOLDS
}

/**
 * Whether a book with this reading status is in this system folder.
 *
 * `false` for an id that isn't a system folder at all, rather than throwing: the
 * caller is a filter running over every book on the shelf, and an id it doesn't
 * recognise means "no books", which is the same shape of answer as "no matches".
 */
export function inSystemFolder(id: string, status: ReadingStatus): boolean {
  return HOLDS[id] === status
}
