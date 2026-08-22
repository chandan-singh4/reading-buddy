/**
 * The little menu a *held* conversation slip raises: continue it, or throw it
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
 * A tap on the slip already means "reopen", and that is the thing the reader
 * does a hundred times more often than deleting. It keeps the tap. A hold is
 * the phone's own idiom for "show me what else I can do with this", and it
 * costs the common action nothing.
 *
 * ## Why it looks like iOS and not like the study lamp
 *
 * It is the platform's context menu, borrowed on purpose: a rounded translucent
 * card, a hairline between rows, the label at the leading edge and the glyph at
 * the trailing edge, and the destructive row in red. A reader who has used a
 * phone already knows what this is and which row is the dangerous one, and none
 * of that knowledge has to be taught by a house style.
 *
 * The glyphs are drawn as inline SVG rather than set as text. An emoji is a
 * different picture on every platform and a font icon is a download; these are
 * two paths, they inherit `currentColor`, and so the delete row's glyph turns
 * red with its label for free.
 *
 * ## Why it is placed by hand rather than anchored
 *
 * It appears at the finger, not at the slip. It flips to sit above the finger
 * in the lower half of the screen, so it never opens under the hand that
 * raised it.
 */

import { createPortal } from 'react-dom'

import styles from './ThreadMenu.module.css'

export interface ThreadMenuProps {
  /** The first words of the passage, so the reader can see what they hold. */
  excerpt: string
  /** Where the finger was, in viewport coordinates. */
  at: { x: number; y: number }
  onContinue: () => void
  onDelete: () => void
  onClose: () => void
}

/** Kept clear of the screen edges — the card is about 15rem wide. */
const EDGE = 120

/** A speech bubble: the conversation, carried on. */
function BubbleGlyph() {
  return (
    <svg className={styles.glyph} viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M4 3.5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9.5L6 17.5V14.5H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** A waste basket, as every phone draws it. */
function TrashGlyph() {
  return (
    <svg className={styles.glyph} viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.5 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-10M8.5 8.5v6M11.5 8.5v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

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
        style={below ? { top: at.y + 16, left } : { bottom: height - at.y + 16, left }}
      >
        <p className={styles.about}>“{excerpt}”</p>
        <button type="button" className={styles.action} onClick={onContinue}>
          <span className={styles.label}>Continue</span>
          <BubbleGlyph />
        </button>
        <button type="button" className={`${styles.action} ${styles.remove}`} onClick={onDelete}>
          <span className={styles.label}>Delete</span>
          <TrashGlyph />
        </button>
      </div>
    </>,
    document.body,
  )
}
