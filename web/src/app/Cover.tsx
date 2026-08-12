import { useSyncExternalStore } from 'react'

import { coverInitial, coverSwatch } from './cover.ts'
import { useScreenActive } from './screenActive.tsx'
import { coversAreNamed, coversAreNeverNamed, coverName, watchCoverNaming } from './shelfTransition.ts'
import type { BookId } from '../structure/index.ts'
import styles from './Cover.module.css'

/**
 * A book's cover — real cover art when `src` is available, a generated
 * placeholder otherwise. Most books don't have an extractable cover yet
 * (PDF, docx, and plain text have no cover step at all, and plenty of epubs
 * simply carry none), so the placeholder is the common case, not a fallback for
 * failure.
 *
 * Decorative rather than informative: every place this is used already shows
 * the title as text right next to it, so a screen reader would otherwise
 * announce the same title twice.
 *
 * ## `bookId`, and why it isn't just for the key
 *
 * Pass it wherever the book can move — which is every shelf, and Stats when it
 * gains covers. While a shelf move is running it becomes this cover's
 * `view-transition-name`, and the browser then animates the cover from wherever
 * it was to wherever it now is, *even across a remount*. That is the whole of
 * the fix for the covers flashing when a book changed shelf; the reasoning, and
 * why the name is temporary rather than permanent, is in `shelfTransition.ts`.
 *
 * Optional because one caller genuinely has no move to make: a book's own
 * details page shows exactly one cover and it never goes anywhere.
 */
export function Cover({ title, src, bookId }: { title: string; src?: string; bookId?: BookId }) {
  const naming = useSyncExternalStore(watchCoverNaming, coversAreNamed, coversAreNeverNamed)

  // Only the screen on show may claim a name. Two elements sharing one
  // `view-transition-name` abandons the whole transition, and during a tab swipe
  // there really are two screens on screen at once — the arriving one and the
  // one fading out over it — each holding its own copy of the same book.
  const active = useScreenActive()

  const style =
    naming && active && bookId ? { viewTransitionName: coverName(bookId) } : undefined

  if (src) {
    return <img className={styles.cover} src={src} alt="" style={style} />
  }

  return (
    <div
      className={styles.cover}
      style={{ ...style, backgroundColor: coverSwatch(title) }}
      aria-hidden="true"
    >
      <span className={styles.initial}>{coverInitial(title)}</span>
    </div>
  )
}
