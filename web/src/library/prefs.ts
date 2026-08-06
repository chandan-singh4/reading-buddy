/**
 * How the reader likes their library arranged: list or grid, which books are
 * showing, and in what order.
 *
 * One object, one `localStorage` key — the same shape and the same defensive
 * reading as `reader/readerSettings.ts`, because these are the same kind of
 * thing: a preference about how a screen looks, not data about the books. It
 * belongs in `localStorage` rather than the database for the reason focus mode
 * does — it is about this device, it is read synchronously on first paint, and
 * losing it costs nothing.
 *
 * **Adding a filter later is meant to be cheap.** A new one is a field on
 * `LibraryPrefs`, a default, a validator below, and a clause in `filter.ts` —
 * no caller changes, because everything downstream takes the whole object. The
 * planned next ones are tags and favourites; `folderId` is already this shape.
 */

import type { Shelf } from '../structure/index.ts'
import type { ReadingStatus } from './status.ts'

export type ViewMode = 'list' | 'grid'

/**
 * Every way the library can be ordered.
 *
 * One flat list rather than a field plus a direction. Two fields would allow
 * "recently added, A→Z", which is not a thing — direction only means something
 * for title and author, and a menu that offers meaningless combinations is a
 * menu the reader has to think their way past.
 */
export type SortKey =
  | 'title-asc'
  | 'title-desc'
  | 'author-asc'
  | 'author-desc'
  | 'recently-opened'
  | 'recently-added'
  | 'progress'
  | 'folder'

export const SORT_OPTIONS: readonly { value: SortKey; group: string; label: string }[] = [
  { value: 'title-asc', group: 'Title', label: 'A → Z' },
  { value: 'title-desc', group: 'Title', label: 'Z → A' },
  { value: 'author-asc', group: 'Author', label: 'A → Z' },
  { value: 'author-desc', group: 'Author', label: 'Z → A' },
  { value: 'recently-opened', group: 'Recently opened', label: 'Recently opened' },
  { value: 'recently-added', group: 'Recently added', label: 'Recently added' },
  { value: 'progress', group: 'Reading progress', label: 'Reading progress' },
  { value: 'folder', group: 'Folder', label: 'Folder' },
]

export const STATUS_OPTIONS: readonly { value: ReadingStatus; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Currently reading' },
  { value: 'finished', label: 'Finished' },
]

export const SHELF_OPTIONS: readonly { value: Shelf; label: string; singular: string }[] = [
  { value: 'book', label: 'Books', singular: 'Book' },
  { value: 'paper', label: 'Research papers', singular: 'Research paper' },
  { value: 'document', label: 'Documents', singular: 'Document' },
]

export interface LibraryPrefs {
  view: ViewMode
  /**
   * Which reading statuses to show. An **empty list means all of them**, not
   * none — "no filter" is the default state and the reader reaches it by
   * unticking everything, which must never leave them staring at a blank shelf.
   * The same rule holds for `shelves`.
   */
  statuses: ReadingStatus[]
  shelves: Shelf[]
  /** A folder to show on its own, or `undefined` for the whole library. */
  folderId?: string
  sort: SortKey
}

export const DEFAULT_PREFS: LibraryPrefs = {
  view: 'list',
  statuses: [],
  shelves: [],
  sort: 'recently-added',
}

const KEY = 'reading-buddy:library-prefs'

function isView(value: unknown): value is ViewMode {
  return value === 'list' || value === 'grid'
}

function isSort(value: unknown): value is SortKey {
  return SORT_OPTIONS.some((option) => option.value === value)
}

/**
 * Keeps only the members it recognises, rather than rejecting the whole list.
 *
 * A status removed in a later version of the app would otherwise reset the
 * reader's other choices along with it — one field degrading at a time is the
 * rule the reader settings established.
 */
function knownMembers<T>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return []
  return allowed.filter((option) => value.includes(option))
}

export function readLibraryPrefs(): LibraryPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (!raw) return DEFAULT_PREFS

    const parsed = JSON.parse(raw) as Partial<Record<keyof LibraryPrefs, unknown>>
    return {
      view: isView(parsed.view) ? parsed.view : DEFAULT_PREFS.view,
      statuses: knownMembers<ReadingStatus>(
        parsed.statuses,
        STATUS_OPTIONS.map((option) => option.value),
      ),
      shelves: knownMembers<Shelf>(
        parsed.shelves,
        SHELF_OPTIONS.map((option) => option.value),
      ),
      // Not validated against the folders that exist: they are read
      // asynchronously from the database, long after this runs. A folder that
      // has since been deleted simply matches nothing, and `filter.ts` treats
      // an unknown folder as "show everything" rather than an empty shelf.
      folderId: typeof parsed.folderId === 'string' ? parsed.folderId : undefined,
      sort: isSort(parsed.sort) ? parsed.sort : DEFAULT_PREFS.sort,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writeLibraryPrefs(prefs: LibraryPrefs): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* Same as the reader's settings: the preference simply won't persist. */
  }
}

/** True when anything is narrowing the library — what the filter button shows. */
export function isFiltered(prefs: LibraryPrefs): boolean {
  return prefs.statuses.length > 0 || prefs.shelves.length > 0 || prefs.folderId !== undefined
}
