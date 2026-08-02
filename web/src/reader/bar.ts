/**
 * The bottom bar's three states, and what each one says.
 *
 * Modelled directly on Google Books, which the reader uses daily: tapping the
 * bar cycles *where you are* → *how much of this chapter is left* → *nothing at
 * all*. The third state is the point of the other two — it is how you get to a
 * bare page without hunting for a setting, and one more tap brings it back.
 *
 * Kept apart from `Chrome.tsx` because it is the one piece here with rules
 * worth testing: the cycle, the fallbacks, and the singular/plural.
 *
 * Note the two independent switches. Focus Mode decides whether the *whole*
 * overlay is showing when you arrive; this decides what the bar says once it is.
 * A reader who wants only the percentage keeps the chrome and cycles the bar; a
 * reader who wants nothing uses Focus Mode.
 */

import type { Pages } from './progress.ts'

/**
 * `pages` — "Page 250 of 338" · `left` — "20 pages left in this chapter" ·
 * `bare` — the number is gone and only the book is on screen.
 */
export type BarState = 'pages' | 'left' | 'bare'

const CYCLE: Record<BarState, BarState> = {
  pages: 'left',
  left: 'bare',
  bare: 'pages',
}

export function advanceBar(state: BarState): BarState {
  return CYCLE[state]
}

/**
 * What the bar reads in this state, or `null` for the bare state.
 *
 * `chapterLabel` is the fallback, not a fourth state: a book imported before
 * word counts existed has no page number until it is backfilled, and a reader
 * should see "Chapter 5 of 12" rather than a blank bar or an invented figure.
 */
export function barLabel(
  state: BarState,
  pages: Pages | null,
  chapterLabel: string,
): string | null {
  if (state === 'bare') return null

  if (!pages) return chapterLabel

  if (state === 'left') {
    const left = pages.leftInChapter
    return left === 1 ? '1 page left in this chapter' : `${left} pages left in this chapter`
  }

  return `Page ${pages.page} of ${pages.pageCount}`
}

/** The percentage rides with the two visible states and leaves with the third. */
export function showsPercent(state: BarState): boolean {
  return state !== 'bare'
}
