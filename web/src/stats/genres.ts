/**
 * Collapsing the publisher's subject headings into a genre a bar chart can
 * count.
 *
 * ## Why a mapping table and not the raw headings
 *
 * `BookMeta.subjects` holds BISAC, which is a *path*, is multi-valued, and is
 * chosen to help a bookshop shelve a book rather than to describe it. One book
 * arrives as "Philosophy / Mind & Body", "Body, Mind & Spirit / Inspiration &
 * Personal Growth" and "Self-Help / Motivational & Inspirational" all at once.
 * Counted verbatim, a library of thirty books produces sixty bars of one, which
 * is a list of strings, not a picture of what somebody reads.
 *
 * So every heading is reduced to one of a fixed set below. The set is
 * deliberately short and deliberately coarse — the bar chart is meant to be
 * read at a glance on a phone, and a genre nobody can name is not a genre.
 *
 * ## One book, one genre
 *
 * A book counts once, under its best match, rather than once per subject. Bars
 * that sum to more than the library is a chart that cannot be read: "3
 * Philosophy" has to mean three books. The order of `GENRES` is the tie-break,
 * so the more specific label wins over the vaguer one when a book matches both.
 */

import type { BookMeta } from '../structure/index.ts'

/**
 * The fixed set, most specific first — the order *is* the tie-break.
 *
 * Each entry lists the lowercased fragments that select it. They are matched as
 * substrings of the whole heading, so "Business & Economics / Economic History"
 * finds `economic` without needing its own row.
 */
export const GENRES: readonly { name: string; match: readonly string[] }[] = [
  { name: 'Philosophy', match: ['philosophy', 'ethics', 'metaphysics', 'logic'] },
  { name: 'Psychology', match: ['psychology', 'psychiatry', 'mental health', 'cognitive'] },
  { name: 'Science', match: ['science', 'mathematics', 'nature', 'medical', 'technology'] },
  { name: 'History', match: ['history', 'historical', 'archaeology', 'antiquities'] },
  { name: 'Biography', match: ['biography', 'autobiography', 'memoir'] },
  { name: 'Economics', match: ['economic', 'business', 'finance', 'management'] },
  { name: 'Politics', match: ['political', 'politics', 'social science', 'sociology', 'law'] },
  { name: 'Religion', match: ['religion', 'religious', 'theology', 'buddhis', 'hindu'] },
  /*
   * Split out of Religion, which used to hold `body, mind` and so filed an
   * astrology book as religion. A publisher shelves astrology, meditation and
   * non-dual writing under "Body, Mind & Spirit", and a reader looking at that
   * bar does not read those as religion. Religion keeps the word religion.
   */
  {
    name: 'Spirituality',
    match: [
      'body, mind',
      'body mind',
      'spiritual',
      'meditation',
      'mindfulness',
      'astrology',
      'occult',
      'new age',
      'yoga',
    ],
  },
  { name: 'Self-help', match: ['self-help', 'self help', 'personal growth', 'motivational'] },
  { name: 'Literature', match: ['literary criticism', 'literary collections', 'poetry', 'drama'] },
  { name: 'Art', match: ['art', 'music', 'photography', 'design', 'performing arts'] },
  { name: 'Fiction', match: ['fiction', 'novel', 'fantasy', 'thriller', 'mystery', 'romance'] },
]

/**
 * The genre a book counts under, or `undefined` when the catalogue never
 * matched it and there are no headings to read.
 *
 * `undefined` is a real answer and the screen says so out loud ("n books
 * uncounted"). Bundling unmatched books into an "Other" bar would make a
 * missing lookup look like a reading habit.
 */
export function genreOf(book: BookMeta): string | undefined {
  const headings = (book.subjects ?? []).map((s) => s.toLowerCase())
  if (headings.length === 0) return undefined

  // The top-level BISAC segment is tried first, across every heading, before any
  // qualifier is looked at. Without this pass, "Business & Economics / Economic
  // History" lands on History — a trailing qualifier outranking the shelf the
  // book is actually filed on. The leading segment is the publisher's answer to
  // "what is this book", and it wins.
  const tops = headings.map((h) => h.split('/')[0].trim())
  for (const genre of GENRES) {
    if (tops.some((t) => genre.match.some((m) => t.includes(m)))) return genre.name
  }

  // Nothing recognised at the top level. Now the whole path is fair game — a
  // heading like "Science / Life Sciences / Marine Biology" is worth catching
  // even when its first segment is one this table has never heard of.
  for (const genre of GENRES) {
    if (headings.some((h) => genre.match.some((m) => h.includes(m)))) return genre.name
  }
  return undefined
}

export interface GenreCount {
  name: string
  books: number
}

/** Book counts per genre, biggest first, with empty genres dropped. */
export function countGenres(books: readonly BookMeta[]): {
  counts: GenreCount[]
  uncounted: number
} {
  const tally = new Map<string, number>()
  let uncounted = 0

  for (const book of books) {
    const genre = genreOf(book)
    if (genre === undefined) uncounted += 1
    else tally.set(genre, (tally.get(genre) ?? 0) + 1)
  }

  const counts = [...tally]
    .map(([name, count]) => ({ name, books: count }))
    .sort((a, b) => b.books - a.books || a.name.localeCompare(b.name))

  return { counts, uncounted }
}

/**
 * The fiction / nonfiction split, from `BookMeta.genre` rather than from the
 * headings above.
 *
 * A separate field and a separate rule on purpose: `genre` is set from *any*
 * category carrying a Fiction heading (see `structure/types.ts`), which is the
 * one question BISAC answers reliably. The bars below it answer a different
 * question and are allowed to disagree — a novel about the French Revolution is
 * Fiction here and History there.
 */
export function splitFiction(books: readonly BookMeta[]): {
  fiction: number
  nonfiction: number
  unknown: number
} {
  let fiction = 0
  let nonfiction = 0
  let unknown = 0
  for (const book of books) {
    const g = book.genre?.toLowerCase()
    if (g === undefined) unknown += 1
    else if (g.includes('nonfiction') || g.includes('non-fiction')) nonfiction += 1
    else if (g.includes('fiction')) fiction += 1
    else unknown += 1
  }
  return { fiction, nonfiction, unknown }
}
