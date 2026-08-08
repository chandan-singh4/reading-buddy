/**
 * Looking for a word inside a book (WP-14).
 *
 * Pure: it is handed a book's sections and a query, and hands back places. No
 * storage, no rendering, no debouncing — all three belong to the reading page.
 * That split is what makes the awkward parts here testable, and the awkward
 * parts are all about *snippets*, not about finding the match.
 *
 * ## Why it searches the text rather than an index
 *
 * A real index — trigrams, a token table, anything precomputed — would be
 * faster and would have to be built at import, versioned, migrated, and rebuilt
 * whenever the parser changed. A phone scanning a novel it has already loaded
 * takes a few milliseconds, because this is a `indexOf` loop over a few hundred
 * kilobytes of text that is already in memory by the time the reader has typed
 * the second letter. Build the index when a book is big enough to need one; no
 * book anyone has put in this app is.
 *
 * ## What a result is
 *
 * One per *occurrence*, not one per paragraph. "12 results" has to mean twelve
 * places the word appears, or the count is a lie — and a paragraph that uses the
 * word three times genuinely has three things to show, each in its own context.
 * They all point at the same anchor, which is correct: the anchor is the finest
 * address the app has, and jumping to the paragraph is what the reader wanted.
 */

import type { Anchor, Section } from '../structure/index.ts'

/** One occurrence, with enough of its surroundings to recognise it. */
export interface SearchHit {
  /** Stable across renders: the anchor plus where in it the match falls. */
  key: string
  anchor: Anchor
  chapter: number
  section: number
  /** The text just before the match, opening with an ellipsis if it was cut. */
  before: string
  /** The matched text itself, in the book's own casing rather than the query's. */
  match: string
  /** The text just after, closing with an ellipsis if it was cut. */
  after: string
}

/**
 * Below this, a query matches so much of a book that the answer is noise. One
 * letter in an English novel is tens of thousands of hits and several seconds of
 * building snippets for them.
 */
export const MIN_QUERY = 2

/** How much of the sentence to keep either side of a match. */
const CONTEXT = 48

/**
 * A ceiling on results, because the list is scrolled by a thumb.
 *
 * Not a performance guard — the scan is cheap either way — but an honesty one:
 * a common word in a long book has hundreds of hits, and a reader is not going
 * to scroll through them looking for the right one. When this bites, the answer
 * the interface should give is "narrow it down", which is why `searchBook`
 * reports that it stopped rather than silently handing back a short list.
 */
export const MAX_HITS = 200

export interface SearchOutcome {
  hits: SearchHit[]
  /** Total occurrences found, which may be more than `hits.length`. */
  total: number
  /** Whether `MAX_HITS` cut the list short. */
  capped: boolean
}

/**
 * Whitespace made uniform, so a match can span what was a line break in the
 * source and a snippet never contains a stray newline.
 *
 * Done once per paragraph rather than once per match: the offsets a match
 * reports have to address *this* string, so the normalisation has to happen
 * before the search, not after.
 */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Cut the run-up to a match back to a word boundary.
 *
 * A snippet that begins mid-word ("…ther the way you breathe") reads as damage;
 * one that begins at a word looks deliberate. The ellipsis is only added when
 * something was actually removed — a match near the start of a paragraph should
 * show that it is near the start.
 */
function runUp(text: string, from: number): string {
  if (from === 0) return ''
  const start = Math.max(0, from - CONTEXT)
  const raw = text.slice(start, from)
  if (start === 0) return raw

  const space = raw.indexOf(' ')
  return `…${space === -1 ? raw : raw.slice(space + 1)}`
}

/** The same, the other way round. */
function runOn(text: string, from: number): string {
  const end = Math.min(text.length, from + CONTEXT)
  const raw = text.slice(from, end)
  if (end === text.length) return raw

  const space = raw.lastIndexOf(' ')
  return `${space === -1 ? raw : raw.slice(0, space)}…`
}

/**
 * Every occurrence of `query` in a book, in the book's own order.
 *
 * Case-insensitive, because nobody searching a book means the capital letter.
 * Deliberately *not* accent-insensitive: folding accents would make "resume"
 * find "résumé", which is occasionally wanted and would also quietly make it
 * impossible to search for the accented word on purpose. The narrower rule is
 * the one that can be widened later without surprising anyone who relied on it.
 *
 * Not a regular expression, so a reader can search for "(" or "?" or "a.b"
 * without the punctuation being read as syntax — the one input where a book
 * genuinely contains every character a regex cares about.
 */
export function searchBook(
  sections: readonly Section[],
  query: string,
): SearchOutcome {
  const needle = flatten(query).toLowerCase()
  if (needle.length < MIN_QUERY) return { hits: [], total: 0, capped: false }

  const hits: SearchHit[] = []
  let total = 0

  for (const section of sections) {
    for (const paragraph of section.paragraphs) {
      const text = flatten(paragraph.text)
      const haystack = text.toLowerCase()

      // `indexOf` from the last match's end, so overlapping runs of the same
      // word are counted once each rather than once per character.
      let at = haystack.indexOf(needle)
      while (at !== -1) {
        total += 1
        if (hits.length < MAX_HITS) {
          hits.push({
            key: `${paragraph.anchor}:${at}`,
            anchor: paragraph.anchor,
            chapter: section.chapter,
            section: section.section,
            before: runUp(text, at),
            // From the book, not from the query: the reader should see the
            // word as it is printed, capitals and all.
            match: text.slice(at, at + needle.length),
            after: runOn(text, at + needle.length),
          })
        }
        at = haystack.indexOf(needle, at + needle.length)
      }
    }
  }

  return { hits, total, capped: total > hits.length }
}
