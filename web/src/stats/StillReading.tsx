import { useSyncExternalStore } from 'react'

import styles from './StillReading.module.css'
import {
  ASK_AFTER_MS,
  VIGIL_MARK,
  answerSteppedAway,
  answerStillHere,
  snapshot,
  subscribe,
} from './vigil.ts'

/**
 * The bar that asks whether the reader is still there.
 *
 * ## Why it is a bar and not a dialog
 *
 * A dialog would stop the reading to ask a question about the reading. This sits
 * at the foot of the screen, takes no focus, and dims nothing. A reader who is
 * awake can ignore it entirely — touching the page anywhere answers it, because
 * touching the page is the proof the question was asking for (`timer.ts`).
 *
 * ## What each answer means
 *
 * - **Yes** gives back every minute of the silence. Nothing is deducted.
 * - **I stepped away** takes off the silence from the last touch, not from the
 *   moment the question appeared. The reader knows when they put the book down.
 * - **No answer at all** — the sleeper, the flat battery — takes off the silence
 *   from the moment the question appeared. It is the cautious half: the ten
 *   minutes before the question are always credited to the reader.
 *
 * The clock keeps running throughout. Nothing is lost while the bar is up.
 */

/**
 * How long the reader has been quiet, in whole minutes.
 *
 * The silence began `ASK_AFTER_MS` before the question went up, so it is that
 * plus however long the bar has been waiting.
 */
export function quietMinutes(askedAt: number, now: number): number {
  return Math.max(1, Math.round((ASK_AFTER_MS + Math.max(0, now - askedAt)) / 60_000))
}

export default function StillReading() {
  const vigil = useSyncExternalStore(subscribe, snapshot)
  if (vigil.askedAt === undefined) return null

  // Read at render, which is the moment the reader sees the sentence.
  const quiet = quietMinutes(vigil.askedAt, Date.now())

  return (
    <div className={styles.bar} role="status" {...{ [VIGIL_MARK]: '' }}>
      <div className={styles.words}>
        <strong className={styles.ask}>Still reading?</strong>
        <span className={styles.why}>
          The page hasn’t moved for {quiet} minutes. Your time is still counting.
        </span>
      </div>
      <div className={styles.answers}>
        <button type="button" className={styles.away} onClick={answerSteppedAway}>
          I stepped away
        </button>
        <button type="button" className={styles.here} onClick={answerStillHere}>
          Still here
        </button>
      </div>
    </div>
  )
}
