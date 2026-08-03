import { coverInitial, coverSwatch } from './cover.ts'
import styles from './Cover.module.css'

/**
 * A book's cover — a generated placeholder today, real cover art later.
 *
 * Decorative rather than informative: every place this is used already shows
 * the title as text right next to it, so a screen reader would otherwise
 * announce the same title twice.
 */
export function Cover({ title }: { title: string }) {
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
