/**
 * "Read this to me", wherever there is something to read.
 *
 * One button, three homes: under one of Veda's answers, on a chapter summary,
 * and on a note. It is the same gesture in all three, so it is one component —
 * and it looks like whatever it is sitting in, because each of those places
 * already has a row of small actions with its own dress.
 *
 * ## Why the icon changes and the button does not
 *
 * Pressing it again stops it. So it has two states and one position, and the
 * label changes with it. A separate stop button would have to appear beside
 * every bubble in a long thread and vanish again, which is movement in the one
 * part of the screen a reader is trying to read.
 */

import styles from './speakButton.module.css'

export interface SpeakButtonProps {
  /** True when this is the thing being spoken. */
  speaking: boolean
  /** True while the model is still arriving, so the press has to wait. */
  waiting?: boolean
  onPress: () => void
  /** Dropped in beside the host's own action buttons, so it can wear them. */
  className?: string
  /** What is being read, for the label. "answer", "summary", "note". */
  what?: string
}

export function SpeakButton({
  speaking,
  waiting = false,
  onPress,
  className,
  what = 'this',
}: SpeakButtonProps) {
  return (
    <button
      type="button"
      className={className ? `${className} ${styles.speak}` : styles.speak}
      /*
       * The label says what pressing it will do, not what is happening. A
       * screen reader announces the label on focus, and "speaking" would be a
       * description of the world rather than an offer to act on it.
       */
      aria-label={speaking ? `Stop reading this ${what}` : `Read this ${what} aloud`}
      aria-pressed={speaking}
      onClick={onPress}
    >
      {speaking ? (
        <StopMark />
      ) : (
        <SpeakerMark />
      )}
      {/* Said, not drawn. The one-time model download is slow enough that a
          reader who pressed and heard nothing would press again. */}
      {waiting && <span className={styles.waiting} aria-hidden="true" />}
    </button>
  )
}

/** A speaker with one wave. Two waves at 16 px is a smudge. */
function SpeakerMark() {
  return (
    <svg
      className={styles.mark}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 9.5v5h3.2L12 18.6V5.4L7.2 9.5H4z" />
      <path d="M15.6 9.2a4 4 0 0 1 0 5.6" />
    </svg>
  )
}

/** A filled square. The universal stop, and it cannot be mistaken for a pause. */
function StopMark() {
  return (
    <svg
      className={styles.mark}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="currentColor"
    >
      <rect x="7" y="7" width="10" height="10" rx="1.6" />
    </svg>
  )
}
