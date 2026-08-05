/**
 * "A new version is ready."
 *
 * The app used to update itself silently: the new worker took over, the page
 * reloaded underneath whoever was reading, and they arrived somewhere slightly
 * different with no idea why. This is the other half of that change — the
 * moment made visible, and given a little warmth, because it is the one time
 * the app has something of its own to say.
 *
 * Everything about it is deliberate about *not* being an ordinary web modal:
 * the book stays on screen behind it, blurred rather than blacked out, so the
 * reader can see they have not lost their place.
 */

import { useEffect, useRef, useState } from 'react'

import { applyUpdate, onUpdateReady } from './updates.ts'
import styles from './UpdatePrompt.module.css'

export function UpdatePrompt() {
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const confirm = useRef<HTMLButtonElement>(null)

  useEffect(() => onUpdateReady(() => setReady(true)), [])

  const showing = ready && !dismissed

  // Focus moves to the panel so the keyboard and a screen reader both land on
  // it rather than staying somewhere underneath the blur.
  useEffect(() => {
    if (showing) confirm.current?.focus()
  }, [showing])

  // Escape defers, exactly as "Later" does. A panel that can only be answered
  // one way is a trap, and this one can arrive mid-paragraph.
  useEffect(() => {
    if (!showing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showing])

  if (!showing) return null

  return (
    <div
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
      // Tapping the blur defers too — the same answer as Escape and "Later",
      // so every way out of the panel means the same thing.
      onClick={() => setDismissed(true)}
    >
      <div
        className={styles.panel}
        // The panel is not the scrim; a tap inside it must not be read as a
        // tap outside it.
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.mark} aria-hidden="true">
          ☕
        </div>

        <h2 id="update-title" className={styles.title}>
          Something new
        </h2>

        <p className={styles.body}>
          A fresh version of Reading Buddy is ready. It takes a moment, and
          you&rsquo;ll come back to exactly the page you&rsquo;re on.
        </p>

        <div className={styles.actions}>
          <button
            ref={confirm}
            type="button"
            className={styles.primary}
            onClick={() => applyUpdate()}
          >
            Update now
          </button>
          <button type="button" className={styles.secondary} onClick={() => setDismissed(true)}>
            Later
          </button>
        </div>
      </div>
    </div>
  )
}
