/**
 * Reopening where you left off (WP-15).
 *
 * The pure half: what a saved place means and whether it can still be trusted.
 * Reading and writing the row is the repository's job; scrolling to it is
 * `Reader.tsx`'s. Kept apart because the only interesting decisions here are
 * decisions — and they are all about *refusing* a saved place.
 *
 * Why an anchor rather than a page number: an anchor is permanent and a page
 * number isn't. `WORDS_PER_PAGE` could change, or a book could be re-imported by
 * a smarter parser, and every stored page number would then point somewhere
 * slightly wrong with no way to tell. `[ch02-s03-p013]` names a paragraph, so
 * either that paragraph is still there or it plainly isn't.
 */

import type { Anchor, Manifest } from '../structure/index.ts'
import { tryParseAnchor } from '../structure/index.ts'
import type { SectionRef } from './navigation.ts'

/** Where a book should open, and where to scroll once it has. */
export interface Place {
  here: SectionRef
  anchor: Anchor
}

/**
 * How long a saved place is worth restoring. Two minutes: below it, the reader
 * almost certainly just tapped into the library and back, and being dropped
 * where they already were is what they expect anyway.
 *
 * It exists for the other direction — see `isFresh`.
 */
const STALE_AFTER_MS = 2 * 60 * 1000

/**
 * Turn a saved anchor into somewhere to open, or `undefined` if it can't be
 * trusted.
 *
 * Both refusals are real cases, not defensive padding:
 *
 * - **A malformed anchor.** Data written by an older build, or edited by hand
 *   in the browser's storage inspector.
 * - **A chapter the book no longer has.** Re-importing a book replaces its
 *   sections; if the new parse finds fewer chapters, the old anchor addresses
 *   nothing. Left unchecked, the reader opens their book to "That part of the
 *   book is missing" — the one failure that looks like the book itself broke.
 *
 * A missing *section* or *paragraph* is not checked here, because that would
 * mean loading the chapter index to find out. The renderer already handles a
 * missing section, and landing at the top of a real chapter is a mild miss
 * rather than a wrong-looking error.
 */
export function placeOf(anchor: string, manifest: Manifest): Place | undefined {
  const parts = tryParseAnchor(anchor)
  if (!parts) return undefined

  const known = manifest.chapters.some((chapter) => chapter.chapter === parts.chapter)
  if (!known) return undefined

  return {
    here: { chapter: parts.chapter, section: parts.section },
    anchor: anchor as Anchor,
  }
}

/**
 * Was this position saved just now?
 *
 * Used to decide whether to *say* anything about it. Reopening a book you were
 * reading a minute ago should be silent; reopening one from last week is worth
 * a word, because otherwise landing on page 190 of a book you don't remember
 * starting reads as a bug.
 */
export function isFresh(at: string, now: number = Date.now()): boolean {
  const saved = Date.parse(at)
  if (Number.isNaN(saved)) return false
  return now - saved < STALE_AFTER_MS
}
