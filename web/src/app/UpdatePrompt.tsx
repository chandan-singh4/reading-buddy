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
 * ## One button, two things behind it
 *
 * The books used to have an update of their own, on a card two tabs away. A
 * reader who had just updated the app then found the Library announcing that 32
 * books needed updating — which reads as the update not having worked, and is
 * exactly the confusion this panel exists to prevent.
 *
 * So both live here now, in that order, because the order is forced: a new
 * build re-parses books *differently*, so the books can only be done by the
 * build that knows how. Taking the app update reloads the page, and the reload
 * carries the reader's consent with it (see `bookUpdate.ts`) — so the second
 * phase does not ask again. It reports.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  findOutdated,
  rememberConsent,
  reparseBooks,
  tookConsent,
  type Outdated,
} from './bookUpdate.ts'
import { applyUpdate, onUpdateReady } from './updates.ts'
import { forgetCovers } from './useCovers.ts'
import { forgetLibraryMemory } from './libraryMemory.ts'
import { forgetShelfMemory } from './shelfMemory.ts'
import styles from './UpdatePrompt.module.css'

const STAGE_LABEL: Record<string, string> = {
  reading: 'Reading',
  parsing: 'Parsing',
  saving: 'Saving',
}

type Phase =
  /** Nothing to say. */
  | { kind: 'none' }
  /** A new build is waiting. */
  | { kind: 'app' }
  /** Books are behind, and the reader has not been asked yet. */
  | { kind: 'books'; outdated: Outdated }
  /** Books are being re-read, either just agreed to or carried over a reload. */
  | { kind: 'working'; done: number; total: number; title: string; stage: string }
  /** Finished, with something worth a sentence. */
  | { kind: 'finished'; updated: number; failed: number }

export function UpdatePrompt() {
  const [phase, setPhase] = useState<Phase>({ kind: 'none' })
  const [dismissed, setDismissed] = useState(false)
  const [taking, setTaking] = useState(false)
  const confirm = useRef<HTMLButtonElement>(null)

  const runBooks = useCallback(async (updatable: Outdated['updatable']) => {
    setPhase({
      kind: 'working',
      done: 0,
      total: updatable.length,
      title: updatable[0]?.title ?? '',
      stage: 'reading',
    })

    const outcomes = await reparseBooks(updatable, {
      onProgress: (progress) => {
        setPhase({
          kind: 'working',
          done: progress.index,
          total: progress.total,
          title: progress.title,
          stage: progress.stage,
        })
      },
    })

    // The shelf is holding art and row positions for books that have just been
    // rebuilt. Named rather than wholesale: a book that was not touched must
    // keep the cover it already has on the device.
    const rebuilt = outcomes.filter((one) => one.status === 'updated')
    forgetCovers(rebuilt.map((one) => one.bookId))
    forgetShelfMemory()
    forgetLibraryMemory()

    setPhase({
      kind: 'finished',
      updated: rebuilt.length,
      failed: outcomes.length - rebuilt.length,
    })
  }, [])

  // A new build waiting always wins: it has to be taken before the books can be.
  useEffect(() => onUpdateReady(() => setPhase({ kind: 'app' })), [])

  useEffect(() => {
    let live = true

    void (async () => {
      const consented = tookConsent()
      const outdated = await findOutdated()
      if (!live) return
      if (outdated.updatable.length === 0 && outdated.stranded === 0) return

      // Never over an app update — that one is first, and this effect and the
      // subscription above can resolve in either order.
      setPhase((current) => {
        if (current.kind !== 'none') return current
        if (consented && outdated.updatable.length > 0) {
          void runBooks(outdated.updatable)
          return current
        }
        return { kind: 'books', outdated }
      })
    })()

    return () => {
      live = false
    }
  }, [runBooks])

  const showing = phase.kind !== 'none' && !dismissed
  // While books are being re-read there is no way out: the work is on the main
  // thread and the shelf behind is mid-rewrite.
  const locked = taking || phase.kind === 'working'

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
          {phase.kind === 'finished' ? 'All caught up' : 'Something new'}
        </h2>

        <Message phase={phase} taking={taking} />

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

          {phase.kind === 'books' && phase.outdated.updatable.length > 0 && (
            <button
              ref={confirm}
              type="button"
              className={styles.primary}
              onClick={() => void runBooks(phase.outdated.updatable)}
            >
              Update now
            </button>
          )}

          {!locked && phase.kind !== 'finished' && (
            <button type="button" className={styles.secondary} onClick={() => setDismissed(true)}>
              Later
            </button>
          )}

          {phase.kind === 'finished' && (
            <button
              ref={confirm}
              type="button"
              className={styles.primary}
              onClick={() => setDismissed(true)}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Message({ phase, taking }: { phase: Phase; taking: boolean }) {
  if (phase.kind === 'app') {
    return (
      <p className={styles.body}>
        {taking
          ? 'Fetching it now. The app will restart on its own in a moment.'
          : 'A fresh version of Reading Buddy is ready. It takes a moment, and you’ll come back to exactly the page you’re on.'}
      </p>
    )
  }

  if (phase.kind === 'books') {
    const { updatable, stranded } = phase.outdated
    const count = updatable.length
    return (
      <>
        {count > 0 && (
          <p className={styles.body}>
            {count === 1 ? 'One book was' : `${count} books were`} read by an older version.
            Updating re-reads {count === 1 ? 'it' : 'them'} from the original{' '}
            {count === 1 ? 'file' : 'files'} — links, pictures and chapter breaks all improve, and
            your place in {count === 1 ? 'it' : 'each one'} is kept.
          </p>
        )}
        {stranded > 0 && (
          <p className={styles.body}>
            {stranded === 1 ? 'One book was' : `${stranded} books were`} imported before Reading
            Buddy kept the original file, so {stranded === 1 ? 'it' : 'they'} can’t be updated in
            place — remove and re-import {stranded === 1 ? 'it' : 'them'} from the Library to bring{' '}
            {stranded === 1 ? 'it' : 'them'} up to date.
          </p>
        )}
      </>
    )
  }

  if (phase.kind === 'working') {
    return (
      <p className={styles.body} role="status">
        Bringing your books up to date — {phase.done || 1} of {phase.total}.
        <br />
        {STAGE_LABEL[phase.stage] ?? 'Reading'} “{phase.title}”.
      </p>
    )
  }

  if (phase.kind === 'finished') {
    return (
      <p className={styles.body}>
        {phase.updated === 1 ? 'One book has' : `${phase.updated} books have`} been re-read with the
        new version.
        {phase.failed > 0 &&
          ` ${phase.failed === 1 ? 'One' : phase.failed} couldn’t be updated — you’ll find ${
            phase.failed === 1 ? 'it' : 'them'
          } still marked in the Library.`}
      </p>
    )
  }

  return null
}
