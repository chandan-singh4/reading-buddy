/**
 * The notes page, decided: what order notes read in, which of them a filter
 * shows, and how they gather under chapter headings.
 *
 * The pure half, exactly as `bookmarks.ts` is the pure half of marking a place.
 * Storing them is `storage/notes.ts`'s job and drawing them is
 * `NotesPanel.tsx`'s.
 */

import type { NoteAuthor } from '../storage/index.ts'
import type { Anchor } from '../structure/index.ts'
import { tryParseAnchor } from '../structure/index.ts'

/** The shape this module needs. `StoredNote` satisfies it. */
export interface NoteLike {
  id: string
  anchor: Anchor
  author: NoteAuthor
  createdAt?: string
}

/**
 * The four chips over the notes list.
 *
 * Three of them narrow the list; `chapter` does not. It is a *grouping* mode —
 * every note is still there, gathered under the chapter it belongs to. A chip
 * that hid four fifths of a reader's notes and called itself "by chapter" would
 * be answering a question nobody asked.
 */
export type NoteFilter = 'all' | 'you' | 'claude' | 'chapter' | 'words'

/**
 * What each chip calls itself.
 *
 * **Quotes**, not "Yours". The chip shows the passages the reader picked out of
 * the book — highlights — and every one of them is the book's own words. "Yours"
 * named the *author* of the row, which is true and useless: it invited the
 * reader to expect things they had written, and this tab holds nothing they
 * wrote. The stored `author` is still `'you'`, because that is a fact about who
 * made the row and it stays right whatever the chip is called.
 *
 * See `docs/decisions.md` for what each of the four is for.
 */
export const NOTE_FILTERS: { value: NoteFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'you', label: 'Quotes' },
  { value: 'claude', label: 'Veda' },
  { value: 'chapter', label: 'By chapter' },
  { value: 'words', label: 'Words' },
]

/**
 * Notes read in the book's order, not the order they were written.
 *
 * The same choice `inBookOrder` makes for bookmarks, and for the same reason:
 * this list sits beside the contents, and it is a way of moving through a book.
 * Two notes on one paragraph fall back to the clock, so the order is total and
 * the list never reshuffles itself between renders.
 *
 * A note whose anchor cannot be parsed keeps to the end rather than being
 * dropped. It is still something someone wrote.
 */
export function inNoteOrder<T extends NoteLike>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => {
    const left = tryParseAnchor(a.anchor)
    const right = tryParseAnchor(b.anchor)

    if (!left && !right) return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
    if (!left) return 1
    if (!right) return -1

    return (
      left.chapter - right.chapter ||
      left.section - right.section ||
      left.paragraph - right.paragraph ||
      (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
    )
  })
}

/** Which notes a chip leaves on screen. `all` and `chapter` leave all of them. */
export function notesUnder<T extends NoteLike>(
  notes: readonly T[],
  filter: NoteFilter,
): T[] {
  if (filter === 'all' || filter === 'chapter') return [...notes]
  // 'words' is not a kind of note. The saved words are a different list from a
  // different table, and the panel draws them instead of this one.
  if (filter === 'words') return []
  return notes.filter((note) => note.author === filter)
}

/** One chapter's worth of notes, with the heading to print above them. */
export interface NoteGroup<T> {
  chapter: number
  notes: T[]
}

/**
 * Notes gathered under the chapter each falls in, in the book's order.
 *
 * Only ever called on an already-ordered list, so a chapter appears exactly
 * once: the run of notes in chapter 4 is contiguous, and the heading is opened
 * when the chapter number changes. Sorting in here as well would hide a caller
 * that forgot to sort at all.
 *
 * Chapter 0 is where an unparseable anchor lands, and `inNoteOrder` has already
 * put those at the end — where the panel labels them plainly rather than
 * pretending they belong to a chapter.
 */
export function groupByChapter<T extends NoteLike>(notes: readonly T[]): NoteGroup<T>[] {
  const groups: NoteGroup<T>[] = []

  for (const note of notes) {
    const chapter = tryParseAnchor(note.anchor)?.chapter ?? 0
    const last = groups[groups.length - 1]
    if (last && last.chapter === chapter) last.notes.push(note)
    else groups.push({ chapter, notes: [note] })
  }

  return groups
}
