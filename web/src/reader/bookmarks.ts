/**
 * Marking a place on purpose (WP-14).
 *
 * The pure half: what a bookmark is called, what order a list of them reads in,
 * and whether the page in front of the reader is already marked. Storing them is
 * the repository's job and jumping to one is `Reader.tsx`'s — the same split as
 * `position.ts`, and for the same reason. Everything here is a decision, and
 * decisions are the part worth testing.
 *
 * ## Why a bookmark is an anchor and never a page number
 *
 * The same argument `position.ts` makes, and it bites harder here because a
 * bookmark is meant to *last*. Pages are laid out from the reader's current type
 * size, so "page 214" means a different sentence the moment they make the text
 * bigger — and this app puts that control two taps away. `[ch02-s03-p013]` names
 * a paragraph, so either it is still in the book or it plainly isn't.
 */

import type { Anchor, AnchorParts } from '../structure/index.ts'
import { tryParseAnchor } from '../structure/index.ts'

/** The shape this module needs. `StoredBookmark` satisfies it. */
export interface BookmarkLike {
  id: string
  anchor: Anchor
  label: string
}

/**
 * How much of a paragraph becomes a bookmark's name when the reader doesn't
 * give one.
 *
 * Long enough to tell two marks in the same chapter apart, short enough for one
 * line on a phone. Cut on a word boundary — a name sliced mid-word reads as
 * damage rather than as an abbreviation.
 */
const LABEL_LIMIT = 60

/**
 * What to call a bookmark the reader hasn't named.
 *
 * The opening of the marked paragraph, which is the one piece of text that is
 * guaranteed to exist and guaranteed to be about the right place. A date would
 * be easier and is worthless: "14 March, 14 March, 14 March" down the list tells
 * a reader nothing about which mark is the one they want.
 *
 * Falls back to a plain word rather than an empty string. An unnamed row is one
 * a reader cannot tell from its neighbours, and a blank line in a list looks
 * like the app lost something.
 */
export function labelFor(text: string): string {
  const tidy = text.replace(/\s+/g, ' ').trim()
  if (tidy === '') return 'Bookmark'
  if (tidy.length <= LABEL_LIMIT) return tidy

  const cut = tidy.slice(0, LABEL_LIMIT)
  const lastSpace = cut.lastIndexOf(' ')
  // A single word longer than the limit has no space to cut at; hard-cut it
  // rather than hand back the whole thing.
  const stem = lastSpace > 0 ? cut.slice(0, lastSpace) : cut
  return `${stem.trimEnd()}…`
}

/**
 * Where a bookmark sits in the book, as three numbers to compare.
 *
 * `null` for an anchor that cannot be parsed — written by an older build, or
 * edited by hand in the browser's storage inspector. Those sort to the end
 * rather than being dropped: a bookmark whose anchor is broken is still a
 * bookmark the reader made, and hiding it would be deciding on their behalf that
 * it never existed. Tapping it simply doesn't move, which `Reader.tsx` already
 * handles for every other bad anchor.
 */
function positionOf(anchor: string): AnchorParts | null {
  return tryParseAnchor(anchor)
}

/**
 * A bookmark list reads in the book's order, not the order they were made.
 *
 * This is the one ordering decision here and it goes the opposite way to
 * `listQuotes`, deliberately. A quote list is a collection — the newest thing
 * you liked belongs at the top. A bookmark list is a *way of moving around a
 * book*, sitting in the same sheet as the contents, and a contents list that
 * jumped about by when you last read each chapter would be unusable. Two marks
 * in chapter 2 belong next to each other whether they were made a month apart or
 * a minute.
 *
 * Ties — two bookmarks on the same paragraph — fall back to when they were made,
 * so the order is total and a list never reshuffles itself between renders.
 */
export function inBookOrder<T extends BookmarkLike & { addedAt?: string }>(
  bookmarks: readonly T[],
): T[] {
  return [...bookmarks].sort((a, b) => {
    const left = positionOf(a.anchor)
    const right = positionOf(b.anchor)

    // Unparseable anchors keep to the end, in a stable order of their own.
    if (!left && !right) return (a.addedAt ?? '').localeCompare(b.addedAt ?? '')
    if (!left) return 1
    if (!right) return -1

    return (
      left.chapter - right.chapter ||
      left.section - right.section ||
      left.paragraph - right.paragraph ||
      (a.addedAt ?? '').localeCompare(b.addedAt ?? '')
    )
  })
}

/**
 * The bookmark on this exact paragraph, if there is one.
 *
 * What makes the ribbon a *toggle*: tapping it on a marked page removes the mark
 * rather than adding a second one. Matching on the anchor rather than on the
 * visible page is what keeps that honest — a page is a run of paragraphs whose
 * membership changes with the type size, so "is this page marked" has no stable
 * answer, while "is this paragraph marked" has exactly one.
 *
 * The consequence, and it is the right one: mark a page, make the text bigger so
 * that paragraph is now two pages back, and the ribbon reads unmarked here and
 * marked there. The mark is on the sentence the reader was looking at, which is
 * what they meant by it.
 */
export function bookmarkOn<T extends BookmarkLike>(
  bookmarks: readonly T[],
  anchor: Anchor | undefined,
): T | undefined {
  if (!anchor) return undefined
  return bookmarks.find((bookmark) => bookmark.anchor === anchor)
}
