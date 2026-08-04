import { coverInitial, coverSwatch } from './cover.ts'
import styles from './Cover.module.css'

/**
 * A book's cover — real cover art when `src` is available, a generated
 * placeholder otherwise. Most books don't have an extractable cover yet
 * (PDF, docx, and plain text have no cover step, and plenty of epubs simply
 * carry none), so the placeholder is the common case, not a fallback for
 * failure.
 *
 * Decorative rather than informative: every place this is used already shows
 * the title as text right next to it, so a screen reader would otherwise
 * announce the same title twice.
 */
export function Cover({ title, src }: { title: string; src?: string }) {
  if (src) {
    return <img className={styles.cover} src={src} alt="" />
  }

  return (
    <div
      className={styles.cover}
      style={{ backgroundColor: coverSwatch(title) }}
      aria-hidden="true"
    >
      <span className={styles.initial}>{coverInitial(title)}</span>
    </div>
  )
}
