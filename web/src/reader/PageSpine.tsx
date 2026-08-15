/**
 * The gutter shadow: the soft darkening where a page dives into the binding.
 *
 * ## Why this is separate from `PageDecks`
 *
 * Pick up a paperback and there are two different things at the left edge, and
 * they behave in opposite ways.
 *
 * The **binding** — the glued block of paper the sheets are attached to — does
 * not move. Turn a page and the binding stays exactly where it was. That is
 * `PageDecks`, which is nailed to the viewport.
 *
 * The **gutter shadow** — the curve of the sheet as it bends down into that
 * binding — belongs to the sheet. It travels with the page it is on, because it
 * *is* the page, seen edge-on. So this carries `data-page-furniture`, the same
 * attribute `StatusLine` and `RunningHead` use, and `reader/pageTurn.ts` copies
 * it into the flip. The shadow leans away with the paper and the binding holds
 * still, which is what the eye is expecting without being able to say so.
 *
 * Splitting them was not the first instinct — one dark edge looks like one
 * thing. But a single element cannot both flip and hold still, and making it
 * flip alone would have torn the binding off the book on every page turn.
 *
 * Purely decorative: no text, no target, `aria-hidden`.
 */

import styles from './PageSpine.module.css'

export function PageSpine() {
  return <div className={styles.spine} data-page-furniture="" aria-hidden="true" />
}
