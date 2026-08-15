/**
 * The two stacks of paper either side of the page — the book you are holding.
 *
 * ## What it is for
 *
 * Hold a paperback and you always know roughly where you are, without checking
 * and without being told. The left hand gets heavier, the right gets lighter,
 * and the answer arrives before you have thought to ask the question. A
 * percentage is the opposite kind of information: precise, and only available
 * when you go and look at it.
 *
 * So this is progress drawn as *thickness*. Both decks are sheets stacked
 * edge-on; as you read forward, sheets leave the right deck and arrive on the
 * left. There is no number, no bar, and nothing to read — the whole point is
 * that it works in the corner of the eye.
 *
 * ## Why it does not move with the page
 *
 * The decks are the *volume*, not the sheet, so unlike `PageSpine` they carry
 * no `data-page-furniture`: a book's block of pages does not swing away when
 * you turn one of them. `PageSpine`'s doc comment has the longer version.
 *
 * ## Why the space they occupy never changes
 *
 * `.stage` reserves a fixed `--page-deck` on both sides, and the decks vary
 * only *within* it — the left one fills its channel as the right one empties.
 * That is deliberate and load-bearing. The text is laid out in columns, and
 * changing the width of the column box re-decides where every page break in
 * the section falls. If the reserved space grew as you read, every page turn
 * would repaginate the book underneath you and the page you had just arrived
 * on would not be the page you left. A constant channel with a moving fill
 * costs one repaint and moves nothing.
 */

import styles from './PageDecks.module.css'

export interface PageDecksProps {
  /**
   * How far into the book you are, 0–100, or `null` for a book that has not
   * worked out its own length yet. Null draws two even decks rather than
   * nothing: a book always has two edges, and an empty channel on one side
   * would read as "you have finished" rather than as "not known yet".
   */
  percent: number | null
}

export function PageDecks({ percent }: PageDecksProps) {
  const read = percent === null ? 0.5 : Math.min(1, Math.max(0, percent / 100))

  return (
    <div className={styles.decks} aria-hidden="true">
      {/*
        Passed as a custom property rather than a width, so the CSS keeps the
        say over how thickness is drawn — how many sheets, how they are lit,
        what the minimum stub is — and this file only reports the one fact it
        actually knows.

        Neither deck ever reaches zero: even at the very first page a book has
        a cover and a few sheets on the left, and a deck that vanished would
        make the page look like it had come loose from the binding.
      */}
      <div className={styles.left} style={{ '--fill': read } as React.CSSProperties} />
      <div className={styles.right} style={{ '--fill': 1 - read } as React.CSSProperties} />
    </div>
  )
}
