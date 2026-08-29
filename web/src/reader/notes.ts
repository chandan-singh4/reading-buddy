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
  /**
   * The tutor thread a line of Veda's was kept from.
   *
   * Only a kept line has one. It is the whole of the difference between the two
   * Veda chips: a conversation is an exchange the reader had, a quote is one
   * sentence out of it that they thought was worth keeping on its own.
   */
  fromThread?: string
}

/**
 * The chips over the notes list. Every one of them narrows it.
 *
 * `chapter` used to be here and is not a filter — it is a *grouping*, and it
 * was the odd chip in the row: the other four answered "which of these?" and it
 * answered "arranged how?". Sitting among them it also read as a near-duplicate
 * of All, because it showed exactly the same notes. It is now a toggle beside
 * the chips, and it applies to whichever chip is chosen — see `groupByChapter`.
 *
 * `vedaQuotes` took the place it left. See `NOTE_FILTERS` for what the five
 * are, and `notesUnder` for how the two Veda chips are told apart.
 */
export type NoteFilter = 'all' | 'you' | 'claude' | 'vedaQuotes' | 'words'

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
 * **Veda's Quotes** is the same idea one voice over: lines the reader picked out
 * of what Veda said. The pair reads straight across — Quotes are the book's
 * best sentences, Veda's Quotes are hers — and it is why the new chip sits next
 * to the old one rather than at the end.
 *
 * See `docs/decisions.md` for what each of the five is for.
 */
export const NOTE_FILTERS: { value: NoteFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'you', label: 'Quotes' },
  { value: 'claude', label: 'Veda' },
  { value: 'vedaQuotes', label: 'Veda’s Quotes' },
  { value: 'words', label: 'Words' },
]

/** Chapter headings make no sense over the kept words: a word has no anchor. */
export function canGroupByChapter(filter: NoteFilter): boolean {
  return filter !== 'words'
}

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

/**
 * Notes newest first — the order the flat list reads in.
 *
 * The list has two jobs and they want opposite orders. Grouped under chapter
 * headings it is a way through the book, so it follows the book. Flat, it is a
 * record of what the reader has been doing, and the thing they want is almost
 * always the thing they just marked. Book order buried it: a reader forty pages
 * into a long book had to scroll past everything they had ever kept to reach
 * this morning's highlight.
 *
 * Ties fall back to the anchor, so the order is total and the list never
 * reshuffles itself between renders. A note with no date sorts last: it is
 * older than anything that can prove its age.
 */
export function inRecentOrder<T extends NoteLike>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => {
    const later = (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    if (later !== 0) return later

    const left = tryParseAnchor(a.anchor)
    const right = tryParseAnchor(b.anchor)
    if (!left || !right) return 0
    return (
      left.chapter - right.chapter ||
      left.section - right.section ||
      left.paragraph - right.paragraph
    )
  })
}

/**
 * Which notes a chip leaves on screen.
 *
 * The two Veda chips split one author. Both hold rows written by the tutor, and
 * `fromThread` is the whole of the difference — a kept line names the thread it
 * came out of, a conversation does not. It is a stored fact and not a guess at
 * the text, for the same reason `author` is: the reader must never be shown one
 * thing labelled as the other.
 */
export function notesUnder<T extends NoteLike>(
  notes: readonly T[],
  filter: NoteFilter,
): T[] {
  if (filter === 'all') return [...notes]
  // 'words' is not a kind of note. The saved words are a different list from a
  // different table, and the panel draws them instead of this one.
  if (filter === 'words') return []
  if (filter === 'vedaQuotes') {
    return notes.filter((note) => note.author === 'claude' && note.fromThread !== undefined)
  }
  if (filter === 'claude') {
    return notes.filter((note) => note.author === 'claude' && note.fromThread === undefined)
  }
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
