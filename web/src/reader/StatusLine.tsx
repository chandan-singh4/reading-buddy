/**
 * "Page 84 of 350" on the left, "24%" on the right, at the foot of the page.
 *
 * The only part of the interface that is always on screen — and deliberately
 * not part of the interface at all. Everything in `Chrome.tsx` is a panel: it
 * has a background, an edge and a shadow, and it sits *over* the book. This has
 * none of those. It is a line of small grey text at the foot of the page,
 * exactly as a page number is printed at the foot of a printed page.
 *
 * ## Why it lives here rather than in `Chrome.tsx`
 *
 * It used to be rendered by the overlay, as a stray fragment alongside it, with
 * a comment explaining that it was deliberately outside. That worked until the
 * page learned to shrink out of the toolbar's way (`.stage` in
 * `pages/Reader.module.css`): the text moved and the page number stayed nailed
 * to the screen, because they were in different boxes.
 *
 * A page number belongs to the sheet it is printed on. So it is its own
 * component now, rendered *inside* the sheet, and it moves with the page for
 * the same reason it already turns with the page — see `data-page-furniture`
 * below.
 *
 * Still the control it always was: tapping it cycles through the page number,
 * the pages left in this chapter, and nothing at all. The third state is
 * escapable because the button stays there, empty, to be tapped.
 */

import { advanceBar, barLabel, showsPercent, type BarState } from './bar.ts'
import { progressLabel, type Pages } from './progress.ts'
import type { SectionRef } from './navigation.ts'
import type { Manifest } from '../structure/index.ts'
import styles from './StatusLine.module.css'

export interface StatusLineProps {
  manifest: Manifest
  here: SectionRef
  /** Where you are in pages, or `null` for a book that doesn't know its own
      length yet — in which case the line falls back to naming the chapter. */
  pages: Pages | null
  barState: BarState
  onBarStateChange: (state: BarState) => void
}

export function StatusLine({
  manifest,
  here,
  pages,
  barState,
  onBarStateChange,
}: StatusLineProps) {
  const label = barLabel(barState, pages, progressLabel(manifest, here))

  return (
    /*
     * `data-page-furniture` marks this as belonging to the *page*, not to the
     * app around it — so a page turn takes it with it. A printed page number
     * turns over with the sheet it is printed on; it does not hover in place
     * while the paper moves out from under it. `reader/pageTurn.ts` reads this
     * attribute and nothing else, so anything else that comes to belong to the
     * page — a running header, a footnote rule — joins the flip by carrying it.
     */
    <div className={styles.statusLine} data-page-furniture="">
      <button
        type="button"
        className={styles.status}
        onClick={() => onBarStateChange(advanceBar(barState))}
        aria-label={label ?? 'Show where you are in the book'}
      >
        {label}
      </button>

      <span className={styles.percent}>
        {showsPercent(barState) && pages ? `${pages.percent}%` : ''}
      </span>
    </div>
  )
}
