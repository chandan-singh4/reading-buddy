/**
 * "Something new."
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
 *
 * ## The books are not asked about any more
 *
 * This panel used to have a second phase: having taken the app update, the
 * reader was walked through re-reading every book behind the new parser. With
 * 32 books that is a minute of frozen phone at launch, and it grows with the
 * shelf. The books now bring themselves up to date one at a time, in the
 * background and when a book is opened — see `app/bookCatchUp.ts`. Nothing
 * about that is worth a panel, so there isn't one.
 *
 * What survives of that arrangement is `rememberConsent`: the reader saying
 * yes here is what tells the catch-up, on the other side of the reload, to
 * start straight away rather than after its usual pause.
 */

import { useEffect, useRef, useState } from 'react'

import { rememberConsent } from './bookUpdate.ts'
import { applyUpdate, onUpdateReady } from './updates.ts'
import styles from './UpdatePrompt.module.css'

type Phase =
  /** Nothing to say. */
  | { kind: 'none' }
  /** A new build is waiting. */
  | { kind: 'app' }

export function UpdatePrompt() {
  const [phase, setPhase] = useState<Phase>({ kind: 'none' })
  const [dismissed, setDismissed] = useState(false)
  const [taking, setTaking] = useState(false)
  const confirm = useRef<HTMLButtonElement>(null)

  useEffect(() => onUpdateReady(() => setPhase({ kind: 'app' })), [])

  const showing = phase.kind !== 'none' && !dismissed
  // While the new build is being fetched there is no way out — the page is
  // about to reload underneath the panel either way.
  const locked = taking

  useEffect(() => {
    if (showing) confirm.current?.focus()
  }, [showing])

  // Escape defers, exactly as "Later" does. A panel that can only be answered
  // one way is a trap, and this one can arrive mid-paragraph.
  useEffect(() => {
    if (!showing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !locked) setDismissed(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showing, locked])

  if (!showing) return null

  return (
    <div
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
      // Tapping the blur defers too — the same answer as Escape and "Later",
      // so every way out of the panel means the same thing.
      onClick={() => !locked && setDismissed(true)}
    >
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <div className={styles.mark} aria-hidden="true">
          ☕
        </div>

        <h2 id="update-title" className={styles.title}>
          Something new
        </h2>

        <Message taking={taking} />

        <div className={styles.actions}>
          {phase.kind === 'app' && (
            <button
              ref={confirm}
              type="button"
              className={styles.primary}
              // Disabled rather than merely ignored, so the panel *looks* busy
              // instead of looking unresponsive. Same reason the wording changes.
              disabled={taking}
              onClick={() => {
                setTaking(true)
                // Written before the reload, read after it: the books that
                // follow are part of the same yes.
                rememberConsent()
                applyUpdate()
              }}
            >
              {taking ? 'Updating…' : 'Update now'}
            </button>
          )}

          {!locked && (
            <button type="button" className={styles.secondary} onClick={() => setDismissed(true)}>
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Message({ taking }: { taking: boolean }) {
  return (
    <p className={styles.body}>
      {taking
        ? 'Fetching it now. The app will restart on its own in a moment.'
        : 'A fresh version of Reading Buddy is ready. It takes a moment, and you’ll come back to exactly the page you’re on.'}
    </p>
  )
}
