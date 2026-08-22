/**
 * The little menu a *held* conversation mark raises: continue it, or throw it
 * away.
 *
 * ## Why it exists
 *
 * Deleting a conversation used to mean leaving the book: Notes, the Claude
 * tab, find the row, delete. The conversation is *on the page* — an ink stroke
 * under the words and a paper slip at the end of them — so the way to be rid of
 * it should be on the page too.
 *
 * ## Why a hold and not a tap
 *
 * A tap already means "reopen", and that is the thing the reader does a hundred
 * times more often than deleting. It keeps the tap. A hold is the phone's own
 * idiom for "show me what else I can do with this", and it costs the common
 * action nothing.
 *
 * ## Why it is placed by hand rather than anchored
 *
 * It appears at the finger, not at the mark. The mark can be three lines of ink
 * across a column break, which has no single sensible corner to hang a menu
 * off; the finger has exactly one position and the reader is already looking at
 * it. It flips to sit above the finger in the lower half of the screen, so it
 * never opens under the hand that raised it.
 */

import { createPortal } from 'react-dom'

import styles from './ThreadMenu.module.css'

export interface ThreadMenuProps {
  /** The first words of the passage, so the reader can see what they are about to delete. */
  excerpt: string
  /** Where the finger was, in viewport coordinates. */
  at: { x: number; y: number }
  onContinue: () => void
  onDelete: () => void
  onClose: () => void
}

/** Kept clear of the screen edges — the menu is about 180px wide. */
const EDGE = 100

export function ThreadMenu({ excerpt, at, onContinue, onDelete, onClose }: ThreadMenuProps) {
  const width = typeof window === 'undefined' ? 360 : window.innerWidth
  const height = typeof window === 'undefined' ? 640 : window.innerHeight
  const left = Math.min(Math.max(at.x, EDGE), Math.max(width - EDGE, EDGE))
  const below = at.y < height / 2

  return createPortal(
    <>
      {/*
        A full-screen backdrop, invisible. It is what makes "tap anywhere else"
        close the menu without every other control on the page having to know
        the menu exists.
      */}
      <div className={styles.backdrop} onPointerDown={onClose} aria-hidden="true" />
      <div
        className={styles.menu}
        role="dialog"
        aria-label="This conversation"
        style={
          below
            ? { top: at.y + 16, left }
            : { bottom: height - at.y + 16, left }
        }
      >
        <p className={styles.about}>“{excerpt}”</p>
        <button type="button" className={styles.action} onClick={onContinue}>
          Continue the conversation
        </button>
        <button type="button" className={`${styles.action} ${styles.remove}`} onClick={onDelete}>
          Delete the conversation
        </button>
      </div>
    </>,
    document.body,
  )
}
