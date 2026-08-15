/**
 * The book's title, printed small and grey across the top margin of the page.
 *
 * The mirror of `StatusLine`, and built the same way for the same reasons: it
 * is *printed furniture*, not interface. A printed book puts the title (or the
 * author, or the chapter) in the head margin of every page, so that a reader
 * who looks up from a paragraph is told where they are without having to ask.
 *
 * Everything true of the status line is true here, so read that file first if
 * this looks under-explained:
 *
 * - `position: fixed`, and rendered *outside* `.stage`, so it neither shrinks
 *   with the sheet when the toolbar comes up nor gets fixed to a transformed
 *   box instead of to the screen.
 * - `data-page-furniture` so `reader/pageTurn.ts` copies it into the flip. The
 *   status line's own comment named "a running header" as the thing that would
 *   one day join it by carrying that attribute. This is that.
 *
 * Unlike the status line it is not a control — nothing to tap, no state. That
 * is deliberate: a reader's eye passes over the head margin constantly, and a
 * thing that reacts to being touched up there would be a thing to avoid
 * touching.
 */

import styles from './RunningHead.module.css'

export interface RunningHeadProps {
  /**
   * The book's title, and only ever that.
   *
   * The chapter was the obvious alternative and is the wrong choice: the
   * chapter's own name is already printed at the head of the chapter, so a
   * running head repeating it would say the same words twice on the same
   * screen. The volume is the thing the page cannot otherwise tell you.
   */
  title: string
}

export function RunningHead({ title }: RunningHeadProps) {
  const label = title
  if (!label) return null

  return (
    /*
     * `aria-hidden`: the same words are already announced by the chapter
     * heading and by the document title, and a screen reader that read the
     * running head would repeat them on every single page turn. A printed
     * running head is a visual convenience; this keeps it exactly that.
     */
    <div className={styles.runningHead} data-page-furniture="" aria-hidden="true">
      <span className={styles.label}>{label}</span>
    </div>
  )
}
