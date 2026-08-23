/**
 * What kind of book this is, and which tutor chips that earns.
 *
 * ## Why a genre at all
 *
 * Four of the eight task modules only make sense for some books. "Still true?"
 * on a novel is a category error, and "What's happening here?" on a textbook
 * asks about a scene that does not exist. The chip row has room for about six,
 * so the four genre-neutral ones are always there and the genre decides which
 * others join them.
 *
 * ## Why it is guessed and not asked
 *
 * The plan preferred asking the reader once, on import. Import is the one
 * moment where a question is worst: a dropped folder imports thirty books at a
 * time, and thirty modal questions in a row is not a welcome, it is a toll
 * gate. So the genre is guessed from what the book already carries, and the
 * reader corrects it in one tap from the book's own screen. A wrong guess costs
 * them one unhelpful chip beside four good ones, never an answer.
 *
 * The guess reads four things the book already has, weakest last:
 *
 *   1. `tutorGenre`, when the reader has set it. Nothing overrules a person.
 *   2. `subjects` — the publisher's own headings, which are specific and free.
 *   3. `genre` — the catalogue's coarse Fiction / Non-fiction label.
 *   4. `type` — the app's own light-fiction / dense-technical split.
 */

import type { TutorIntent } from './tutor.ts'
import type { BookGenre, BookMeta } from '../structure/index.ts'

export type { BookGenre }

/** In the order the book's own screen offers them. */
export const GENRES: readonly BookGenre[] = [
  'general',
  'fiction',
  'nonfiction',
  'history',
  'poetry',
]

/** Whether a stored word is still one of ours. Rows outlive enums. */
export function isBookGenre(value: unknown): value is BookGenre {
  return typeof value === 'string' && (GENRES as readonly string[]).includes(value)
}

export const GENRE_LABELS: Record<BookGenre, string> = {
  general: 'Not sure',
  fiction: 'Fiction',
  nonfiction: 'Nonfiction or science',
  history: 'History or an older work',
  poetry: 'Poetry, scripture or philosophy',
}

/**
 * The extra chips each genre earns, in the order they are offered.
 *
 * Two at most. Four neutral chips plus two is six, which is the row's whole
 * budget on a phone.
 */
export const GENRE_INTENTS: Record<BookGenre, readonly TutorIntent[]> = {
  general: [],
  fiction: ['happening'],
  nonfiction: ['stilltrue'],
  history: ['historical', 'stilltrue'],
  poetry: ['interpret'],
}

/**
 * Words in a publisher's subject heading that name a genre.
 *
 * Order matters: the first genre with a hit wins, so the narrow kinds are
 * tested before the broad ones. "Poetry" and "History" are both nonfiction to a
 * catalogue, and both want a different chip.
 */
const MARKS: readonly (readonly [BookGenre, readonly string[]])[] = [
  ['poetry', ['poetry', 'scripture', 'religio', 'philosoph', 'theolog', 'sacred']],
  ['history', ['history', 'historical', 'antiquit', 'medieval', 'classics']],
  ['fiction', ['fiction', 'novel', 'fantasy', 'romance', 'thriller', 'mystery']],
  ['nonfiction', ['science', 'psycholog', 'econom', 'technolog', 'medic', 'nature', 'health']],
]

/**
 * The book's genre: the reader's own answer, or the best guess from its record.
 *
 * Never throws and never returns nothing. `general` means "no chips beyond the
 * four", which is the safe answer for a book whose record says little.
 */
export function genreOf(
  book: Pick<BookMeta, 'tutorGenre' | 'subjects' | 'genre' | 'type'> | undefined,
): BookGenre {
  if (!book) return 'general'
  if (book.tutorGenre) return book.tutorGenre

  const said = (book.subjects ?? []).join(' ').toLowerCase()
  if (said) {
    for (const [genre, marks] of MARKS) {
      if (marks.some((mark) => said.includes(mark))) return genre
    }
  }

  // The catalogue's own label. It says only fiction or not, and it says it for
  // every matched book — `Juvenile Fiction` counts, `Non-fiction` does not.
  const label = book.genre?.toLowerCase() ?? ''
  if (label.includes('non')) return 'nonfiction'
  if (label.includes('fiction')) return 'fiction'

  // The coarse fallback. `light-fiction` is the classifier's word for a book
  // read for the story, and `dense-technical` for one read to learn something.
  if (book.type === 'light-fiction') return 'fiction'
  if (book.type === 'dense-technical') return 'nonfiction'
  return 'general'
}

/** The chips this book gets, neutral ones first. */
export function intentsFor(genre: BookGenre, neutral: readonly TutorIntent[]): TutorIntent[] {
  return [...neutral, ...GENRE_INTENTS[genre]]
}
