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

/**
 * The sorts, grouped the way the shelf's controls present them: one chip per
 * `group`, holding that group's `label`s.
 *
 * **Two sorts were dropped rather than hidden**, and both for the same reason —
 * they had become a different control on the same row.
 *
 * - *Reading progress* is now a filter with bands (0–25%, 25–50%, …). "Show me
 *   the books I am half way through" is what a reader actually wants there, and
 *   ordering the whole library by percentage never answered it.
 * - *Folder* is now the folder control, which shows one folder at a time. A sort
 *   that grouped by folder was the nearest thing available before there was a
 *   way to open a folder; there is one now.
 *
 * A stored preference naming either simply fails `isSort` and falls back to the
 * default, which is the same graceful path a status removed in a later version
 * takes. Nothing has to be migrated.
 */
export const SORT_OPTIONS: readonly { value: SortKey; group: string; label: string }[] = [
  { value: 'title-asc', group: 'Title', label: 'A → Z' },
  { value: 'title-desc', group: 'Title', label: 'Z → A' },
  { value: 'author-asc', group: 'Author', label: 'A → Z' },
  { value: 'author-desc', group: 'Author', label: 'Z → A' },
  { value: 'recently-opened', group: 'Recently', label: 'Recently opened' },
  { value: 'recently-added', group: 'Recently', label: 'Recently added' },
]

/**
 * How one ordering reads as a phrase: "Title A → Z", but "Recently added"
 * rather than "Recently Recently added".
 *
 * The groups exist so the shelf can give each question its own control, and a
 * group name is sometimes a word the labels under it already start with. Stated
 * once here because three places render these — the chip, the chip's panel, and
 * the sheet — and two of them getting it right is not good enough.
 */
export function sortPhrase(option: { group: string; label: string }): string {
  return option.label.startsWith(option.group) ? option.label : `${option.group} ${option.label}`
}

/**
 * How far through a book is, in quarters — a filter, not a sort.
 *
 * Bands rather than a slider because this is a phone and because the question is
 * categorical: "which books have I barely started" and "which am I nearly
 * finished with" are the two things anyone asks. Four bands answer both without
 * a control that needs two thumbs.
 *
 * Boundaries are **lower-inclusive, upper-exclusive**, except the last which has
 * to take 100 or a finished book would fall through every band. So 25% is in
 * 25–50%, and it is in exactly one band, which is the property that matters:
 * overlapping bands would show the same book under two filters and make the
 * counts disagree with the shelf.
 */
export type ProgressBand = '0-25' | '25-50' | '50-75' | '75-100'

export const PROGRESS_OPTIONS: readonly {
  value: ProgressBand
  label: string
  from: number
  to: number
}[] = [
  { value: '0-25', label: '0–25%', from: 0, to: 25 },
  { value: '25-50', label: '25–50%', from: 25, to: 50 },
  { value: '50-75', label: '50–75%', from: 50, to: 75 },
  { value: '75-100', label: '75–100%', from: 75, to: 100 },
]

/**
 * Whether a book's percentage falls in a band.
 *
 * A book with **no recorded percentage matches no band at all**, and that is
 * deliberate rather than an oversight. `status.ts` is emphatic that an unknown
 * percentage is not 0% — it means the book was never opened, or was opened
 * before its spine had built. Sweeping those into "0–25%" would answer "which
 * books have I barely started" with a list of books never touched, and the
 * reader already has Unread for those.
 */
export function inBand(band: ProgressBand, percent: number | undefined): boolean {
  if (percent === undefined) return false
  const option = PROGRESS_OPTIONS.find((entry) => entry.value === band)
  if (!option) return false
  // The top band closes at 100 rather than running off the end; every other
  // band stops short of the next one's start, so no book is in two.
  return percent >= option.from && (percent < option.to || (option.to === 100 && percent >= 100))
}

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
  /**
   * How far through, in quarters. **Empty means all of them**, exactly as
   * `statuses` does — the reader unticking the last band is asking to stop
   * filtering, not for an empty shelf.
   */
  bands: ProgressBand[]
  /** A folder to show on its own, or `undefined` for the whole library. */
  folderId?: string
  sort: SortKey
}

export const DEFAULT_PREFS: LibraryPrefs = {
  view: 'list',
  statuses: [],
  shelves: [],
  bands: [],
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
      bands: knownMembers<ProgressBand>(
        parsed.bands,
        PROGRESS_OPTIONS.map((option) => option.value),
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
  return (
    prefs.statuses.length > 0 ||
    prefs.shelves.length > 0 ||
    prefs.bands.length > 0 ||
    prefs.folderId !== undefined
  )
}
