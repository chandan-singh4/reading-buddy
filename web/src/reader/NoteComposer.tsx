/**
 * Writing a note against the words you selected.
 *
 * Deliberately small: the quote it is bound to, a box, and two buttons. A note
 * is written with a finger in the middle of a page, and every field added here
 * is a reason to close it and go back to reading.
 */

import { useEffect, useRef, useState } from 'react'

import styles from './NoteComposer.module.css'

export interface NoteComposerProps {
  /** The selected words the note is about. Shown, never edited. */
  quote: string
  onSave: (text: string) => void
  onCancel: () => void
}

export function NoteComposer({ quote, onSave, onCancel }: NoteComposerProps) {
  const [text, setText] = useState('')
  const box = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    box.current?.focus()
  }, [])

  const ready = text.trim().length > 0

  return (
    <div
      className={styles.veil}
      role="dialog"
      aria-modal="true"
      aria-label="Write a note"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <div className={styles.card}>
        <p className={styles.quote}>{quote}</p>

        <textarea
          ref={box}
          className={styles.box}
          rows={4}
          value={text}
          placeholder="Your note…"
          onChange={(event) => setText(event.target.value)}
        />

        <div className={styles.buttons}>
          <button type="button" className={styles.button} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.save}`}
            disabled={!ready}
            onClick={() => onSave(text.trim())}
          >
            Save note
          </button>
        </div>
      </div>
    </div>
  )
}
