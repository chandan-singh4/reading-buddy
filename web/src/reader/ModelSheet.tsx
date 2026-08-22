/**
 * Which model answers, chosen from an iOS-style sheet.
 *
 * ## Why this replaced a native `<select>`
 *
 * The picker used to be a bare `<select>`, and the comment above it argued the
 * platform's own picker beats anything drawn by hand. That is true of the
 * *mechanism* and wrong about the *room*. The lamp is a dark, deliberate place
 * the reader has stepped into, and tapping the one control in it threw up a
 * white browser list with the page's fonts and none of its light. The seam was
 * the whole complaint.
 *
 * So the list is drawn here, in the phone's own idiom rather than the book's:
 * a sheet rising from the bottom edge, translucent, blurred over what it
 * covers, hairline-separated, with a tick against the current choice. Same
 * furniture as `ThreadMenu`, in its dark colours.
 *
 * ## What is kept from the native control
 *
 * Everything that made the native one safe. Escape closes it. The scrim takes a
 * tap. The rows are real `<button>`s inside a `role="dialog"`, so the sheet is
 * one tab stop after another rather than a div that only a mouse understands.
 * Focus lands on the current pick when the sheet opens, which is where a
 * platform picker puts it too.
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import styles from './ModelSheet.module.css'
import { modelLabel } from './tutor.ts'
import type { TutorModel } from './models.ts'

export interface ModelSheetProps {
  models: readonly TutorModel[]
  /** The current choice, ticked. Absent means none is. */
  pick?: string
  onPick: (id: string) => void
  onClose: () => void
}

/** iOS's tick. Drawn, not typed — a ✓ glyph is a different weight in every font. */
function Tick() {
  return (
    <svg
      className={styles.tick}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function ModelSheet({ models, pick, onPick, onClose }: ModelSheetProps) {
  const chosen = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    chosen.current?.focus()
  }, [])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // The lamp closes on Escape too, and it is underneath. Only the top
        // layer should answer a key press.
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])

  return createPortal(
    <>
      <div className={styles.scrim} onPointerDown={onClose} aria-hidden="true" />
      <div className={styles.sheet} role="dialog" aria-label="Which model answers">
        <span className={styles.grab} aria-hidden="true" />
        <p className={styles.title}>Which model answers</p>

        <div className={styles.list}>
          {models.map((row) => {
            const here = row.id === pick
            return (
              <button
                key={row.id}
                ref={here ? chosen : undefined}
                type="button"
                className={styles.row}
                aria-pressed={here}
                onClick={() => onPick(row.id)}
              >
                <span className={styles.name}>
                  {row.name || modelLabel(row.id)}
                  {/* The reader is entitled to know which choice costs money,
                      and to see it before they tap, not after. */}
                  {row.paid && <em className={styles.paid}>paid</em>}
                </span>
                {here && <Tick />}
              </button>
            )
          })}
        </div>

        <button type="button" className={styles.cancel} onClick={onClose}>
          Cancel
        </button>
      </div>
    </>,
    document.body,
  )
}
