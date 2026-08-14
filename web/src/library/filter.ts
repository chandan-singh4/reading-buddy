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
import { foldersOf, folderIdsOf } from './folders.ts'
import { inBand, type LibraryPrefs, type SortKey } from './prefs.ts'
import { progressOf, type BookProgress } from './status.ts'
import { inSystemFolder, isSystemFolder } from './systemFolders.ts'

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
 * Title, author and **every** folder name it is in — searching "philosophy"
 * finds a book filed under Philosophy and For the course alike, which is the
 * point of letting it be in both.
 */
function haystack(book: BookMeta, context: LibraryContext): string[] {
  const names = foldersOf(book, context.folders).map((folder) => folder.name)
  return wordsOf([book.title, book.author ?? '', ...names].join(' '))
}

/**
 * Text cut into comparable words: lower-cased, stripped of accents, split on
 * anything that isn't a letter or a digit.
 *
 * Splitting on punctuation rather than on spaces is what makes "help" find
 * *Self-Help* and "love" find *On Love:* — a reader typing a word does not
 * think about the hyphen or the colon that happens to be next to it. Accents
 * are folded for the same reason `byText` sorts with `sensitivity: 'base'`:
 * "emile" has to find *Émile*, because most keyboards can't easily type the
 * accent and nobody thinks of it as a different letter.
 */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/**
 * Books matching a typed query.
 *
 * **Each typed word must begin a word** in one of the searched fields. Typing
 * "o" offers every book with a word starting in O, "on" narrows that to *On
 * Love* and *Ongoingness*, "on l" narrows it again — the shelf shrinks with
 * each keystroke, which is the behaviour that makes a search feel like it is
 * listening. A plain substring test does not do this: "on" also matched
 * *Wittgenstein* and *Confessions*, so the first letters of a title thinned the
 * shelf out far too slowly to be worth typing.
 *
 * The start of *any* word, not the start of the title: nobody looking for *The
 * Prophet* types "the" first. That is also what keeps searching by author and
 * by folder working.
 *
 * Every typed word must match, though not necessarily the same field — so
 * "jung red" finds *The Red Book* by Jung, and "philosophy kuhn" is a folder
 * and an author at once.
 */
export function matchesSearch(
  book: BookMeta,
  query: string,
  context: LibraryContext = EMPTY_CONTEXT,
): boolean {
  const typed = wordsOf(query)
  if (typed.length === 0) return true

  const text = haystack(book, context)
  return typed.every((word) => text.some((candidate) => candidate.startsWith(word)))
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

  // Any one of the ticked bands is enough. A book with no recorded percentage
  // is in none of them, on purpose — see `inBand`.
  if (prefs.bands.length > 0) {
    const { percent } = progressOf(book, context.progress)
    if (!prefs.bands.some((band) => inBand(band, percent))) return false
  }

  if (prefs.folderId !== undefined) {
    // Unread and Finished hold no ids: membership is the reading status,
    // answered fresh here rather than stored anywhere. See `systemFolders.ts`.
    if (isSystemFolder(prefs.folderId)) {
      const { status } = progressOf(book, context.progress)
      if (!inSystemFolder(prefs.folderId, status)) return false
    } else if (context.folders.has(prefs.folderId)) {
      // In *any* of its folders is enough. A book in Philosophy and For the
      // course belongs on both shelves, and appears once on each of them.
      if (!folderIdsOf(book).includes(prefs.folderId)) return false
    }
    // A folder the reader has since deleted filters nothing, rather than hiding
    // the whole library behind a name that no longer exists.
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
