/**
 * The transport for the reading voice.
 *
 * A car stereo, not a settings screen. It appears at the foot of the page while
 * the book is being read out and it holds five things: back a sentence, play or
 * pause, forward a sentence, the speed, and the way to stop. A reader listening
 * with the phone at arm's length has to hit these without looking, so they are
 * large, evenly spaced, and in a fixed order that never changes with state.
 *
 * The play button is the only one that changes what it says, and it changes to
 * the *action*, not to the state: while the voice is speaking it reads "Pause".
 * That is the rule every media player follows, and getting it backwards is the
 * classic way to make a transport unusable.
 *
 * The voice itself is chosen in the Aa tab, not here. It is a decision a reader
 * makes once, and a list of forty system voices does not belong on a bar that
 * has to stay out of the way.
 */

import styles from './AloudBar.module.css'

/** The speeds offered, and the order they cycle in. */
export const RATES = [0.8, 1, 1.25, 1.5, 2] as const

/** The next speed after this one, wrapping round. */
export function nextRate(rate: number): number {
  const at = RATES.findIndex((one) => one === rate)
  return RATES[(at + 1) % RATES.length] ?? 1
}

export interface AloudBarProps {
  playing: boolean
  rate: number
  onPlay: () => void
  onPause: () => void
  onSkip: (by: number) => void
  onRate: (rate: number) => void
  onStop: () => void
}

export function AloudBar({
  playing,
  rate,
  onPlay,
  onPause,
  onSkip,
  onRate,
  onStop,
}: AloudBarProps) {
  return (
    <div
      className={styles.bar}
      /*
        A region, and a named one. A screen reader lands on the page's words
        first; this has to be findable afterwards without hunting, and "Reading
        aloud" is what the listener would call it.
      */
      role="region"
      aria-label="Reading aloud"
      /* Furniture: it swings away with the rest while a page turns. */
      data-page-furniture=""
    >
      <button
        type="button"
        className={styles.step}
        onClick={() => onSkip(-1)}
        aria-label="Back a sentence"
      >
        <span aria-hidden="true">◀◀</span>
        <span className={styles.label}>Back</span>
      </button>

      <button
        type="button"
        className={styles.play}
        onClick={playing ? onPause : onPlay}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
      </button>

      <button
        type="button"
        className={styles.step}
        onClick={() => onSkip(1)}
        aria-label="Next sentence"
      >
        <span aria-hidden="true">▶▶</span>
        <span className={styles.label}>Next</span>
      </button>

      <button
        type="button"
        className={styles.rate}
        onClick={() => onRate(nextRate(rate))}
        aria-label={`Speed ${rate} times. Tap to change.`}
      >
        {rate}×
      </button>

      <button type="button" className={styles.stop} onClick={onStop} aria-label="Stop reading">
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}
