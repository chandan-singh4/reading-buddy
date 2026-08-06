/**
 * Search → filter → sort, as one pure function over the books.
 *
 * All of it lives here, apart from the screen, for the reason `homeShelves.ts`
 * does: this is the part that can be *wrong* rather than merely ugly, and a
 * wrong library is a reader who believes a book has been deleted. It takes
 * plain data and returns plain data, so every rule below is testable without
 * mounting anything.
 *
 * **Extending it.** The filters are a chain of independent predicates and the
 * sorts are a lookup table. A new filter (tags, favourites, "has a cover") is a
 * field on `LibraryPrefs`, a validator in `prefs.ts`, and one more clause in
 * `matchesFilters` — nothing else in the app changes, because the screen passes
 * the whole prefs object through rather than picking it apart.
 */

import { shelfOf } from '../import/index.ts'
import type { BookId, BookMeta } from '../structure/index.ts'
import type { StoredFolder } from '../storage/index.ts'
import type { LibraryPrefs, SortKey } from './prefs.ts'
import { progressOf, type BookProgress } from './status.ts'

/** Everything the pipeline needs beyond the books and the reader's choices. */
export interface LibraryContext {
  progress: ReadonlyMap<BookId, BookProgress>
  /** folder id → folder, for searching and sorting by folder name. */
  folders: ReadonlyMap<string, StoredFolder>
}

export const EMPTY_CONTEXT: LibraryContext = {
  progress: new Map(),
  folders: new Map(),
}

/**
 * Everything about a book that a search should look through.
 *
 * Title, author and folder name today; **tags are listed here the day they
 * exist** and nowhere else — that is the whole point of building the haystack
 * in one place rather than inlining it into the filter.
 */
function haystack(book: BookMeta, context: LibraryContext): string {
  const folder = book.folderId ? context.folders.get(book.folderId) : undefined
  return [book.title, book.author ?? '', folder?.name ?? ''].join(' ').toLowerCase()
}

/**
 * Books matching a typed query.
 *
 * Every word must match, in any of the searched fields — so "jung red" finds
 * *The Red Book* by Jung, which a single substring test across the whole phrase
 * would miss. Words rather than a phrase is also what makes searching across
 * *different* fields work at all: "philosophy kuhn" is a folder and an author.
 */
export function matchesSearch(
  book: BookMeta,
  query: string,
  context: LibraryContext = EMPTY_CONTEXT,
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true

  const text = haystack(book, context)
  return words.every((word) => text.includes(word))
}

/**
 * Books passing every active filter.
 *
 * An empty list means "all of them" throughout — see `LibraryPrefs.statuses`.
 * The reader unticking the last status is asking to stop filtering, not asking
 * for an empty shelf.
 */
function matchesFilters(
  book: BookMeta,
  prefs: LibraryPrefs,
  context: LibraryContext,
): boolean {
  if (prefs.statuses.length > 0) {
    const { status } = progressOf(book, context.progress)
    if (!prefs.statuses.includes(status)) return false
  }

  if (prefs.shelves.length > 0 && !prefs.shelves.includes(shelfOf(book))) return false

  // A folder the reader has since deleted filters nothing, rather than hiding
  // the whole library behind a name that no longer exists.
  if (prefs.folderId !== undefined && context.folders.has(prefs.folderId)) {
    if (book.folderId !== prefs.folderId) return false
  }

  return true
}

/** Case- and accent-insensitive, so "Émile" sorts where a reader expects. */
function byText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

/**
 * A book with no author, or never opened, sorts last whichever direction is
 * asked for — "Z → A" is a request to reverse the *books that have* authors,
 * not a request to promote the ones that don't.
 */
function missingLast(a: string | undefined, b: string | undefined): number | undefined {
  if (a === undefined && b === undefined) return 0
  if (a === undefined) return 1
  if (b === undefined) return -1
  return undefined
}

type Comparator = (a: BookMeta, b: BookMeta, context: LibraryContext) => number

const COMPARATORS: Record<SortKey, Comparator> = {
  'title-asc': (a, b) => byText(a.title, b.title),
  'title-desc': (a, b) => byText(b.title, a.title),

  'author-asc': (a, b) => missingLast(a.author, b.author) ?? byText(a.author!, b.author!),
  'author-desc': (a, b) => missingLast(a.author, b.author) ?? byText(b.author!, a.author!),

  'recently-opened': (a, b, context) => {
    const left = progressOf(a, context.progress).openedAt
    const right = progressOf(b, context.progress).openedAt
    return missingLast(left, right) ?? right!.localeCompare(left!)
  },

  'recently-added': (a, b) => b.importedAt.localeCompare(a.importedAt),

  // Furthest through first: "reading progress" as a heading over a list
  // starting at 0% would be a list of books the reader hasn't started.
  'progress': (a, b, context) => {
    const left = progressOf(a, context.progress).percent ?? -1
    const right = progressOf(b, context.progress).percent ?? -1
    return right - left
  },

  // Folders alphabetically, loose books last — they are the library's default
  // state, so they belong at the end rather than under a blank heading at the
  // top. Within a folder, by title, because "grouped by folder and then in
  // import order" is not an order anybody can scan.
  'folder': (a, b, context) => {
    const left = a.folderId ? context.folders.get(a.folderId)?.name : undefined
    const right = b.folderId ? context.folders.get(b.folderId)?.name : undefined
    const missing = missingLast(left, right)
    if (missing !== undefined && missing !== 0) return missing
    const byFolder = missing === 0 ? 0 : byText(left!, right!)
    return byFolder !== 0 ? byFolder : byText(a.title, b.title)
  },
}

/**
 * The whole pipeline, in the order the reader thinks in: what am I looking
 * for, which of those do I want to see, and how should they be laid out.
 *
 * Sorting last is what makes the order stable under a search — filtering after
 * sorting would give the same result here, but only because nothing below
 * depends on position, and that is not a property worth relying on silently.
 */
export function arrange(
  books: readonly BookMeta[],
  query: string,
  prefs: LibraryPrefs,
  context: LibraryContext = EMPTY_CONTEXT,
): BookMeta[] {
  const kept = books.filter(
    (book) => matchesSearch(book, query, context) && matchesFilters(book, prefs, context),
  )

  // Copied before sorting: `books` is the screen's state and sorting in place
  // would mutate it, which React is entitled to not re-render for.
  return kept.sort((a, b) => COMPARATORS[prefs.sort](a, b, context))
}
