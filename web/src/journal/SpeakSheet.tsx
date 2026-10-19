/**
 * Speak a thought, and keep it (WP-60).
 *
 * A sheet over the page rather than a screen of its own: a thought arrives in
 * the middle of something else, and taking the reader somewhere to write it
 * down is the friction this feature exists to remove.
 *
 * What is saved is the raw transcript and nothing else. No audio is stored —
 * there is none to store, because the recogniser returns words. The shaping
 * models are WP-62; a tie to a passage is WP-63.
 *
 * ## The words are editable the moment the reader stops
 *
 * While the recogniser is listening the transcript is read-only: a cursor in a
 * field that is rewriting itself is a fight the reader cannot win. The moment
 * they stop, the same words become a text box. They can fix what was misheard
 * — "Om" comes back as "umm" — and then press the circle again, and the next
 * sentence is added after their correction.
 *
 * This takes nothing away from "the raw transcript is canonical"
 * (`decisions.md`, 2026-10-18). That rule says a *model* may not overwrite the
 * reader's words. Here there is no entry yet, and the hand on the keyboard is
 * the reader's own.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { entryStore, type StoredEntry } from '../storage/index.ts'
import { useDictation, type DictationFault } from './useDictation.ts'
import { useWakeLock } from './useWakeLock.ts'
import styles from './SpeakSheet.module.css'

/** Said plainly, and with what the reader can do about it. */
const FAULT_WORDS: Record<DictationFault, string> = {
  unsupported: 'This browser cannot listen. You can still type an entry.',
  blocked: 'The microphone is blocked. Allow it in your browser settings, then try again.',
  'no-microphone': 'No microphone was found.',
  network: 'Listening needs a signal, and there isn’t one right now.',
  unavailable: 'The recogniser kept stopping. Try again in a moment.',
}

const BAR_COUNT = 9

export interface SpeakSheetProps {
  open: boolean
  onClose: () => void
  /** Called with the saved row, so a list can show it without re-reading. */
  onSaved?: (entry: StoredEntry) => void
}

export default function SpeakSheet({ open, onClose, onSaved }: SpeakSheetProps) {
  const { settled, guess, listening, supported, fault, start, stop, replace, reset } =
    useDictation()
  /*
   * What the box holds. It follows `settled` while the recogniser is working,
   * and leads it the moment the reader types — which is why it is state here
   * and not read straight off the hook.
   */
  const [draft, setDraft] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [saving, setSaving] = useState(false)
  /*
   * When the reader began, not when they stopped. A ten-minute ramble belongs
   * to the hour it started in — and `stop` and `save` are two separate taps,
   * so the clock at save time can be a minute adrift of the thought.
   */
  const startedAtRef = useRef<Date | null>(null)
  const circleRef = useRef<HTMLButtonElement | null>(null)

  useWakeLock(open && listening)

  // Fresh every time the sheet opens. A half-finished thought from an entry
  // the reader abandoned must not turn up at the top of the next one.
  useEffect(() => {
    if (!open) return
    reset()
    setDraft('')
    setSeconds(0)
    setSaving(false)
    startedAtRef.current = null
    circleRef.current?.focus()
  }, [open, reset])

  // The recogniser has heard more. The box shows it, unless the reader has
  // taken the words over — in which case `settled` is their text already.
  useEffect(() => {
    setDraft(settled)
  }, [settled])

  useEffect(() => {
    if (!listening) return
    const tick = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(tick)
  }, [listening])

  const close = useCallback(() => {
    stop()
    onClose()
  }, [onClose, stop])

  /*
   * A tap on the scrim, or Escape, closes an empty sheet and does nothing to a
   * full one. Losing a spoken thought to a stray tap is the one failure that
   * would teach the reader not to trust this, and Discard is right there.
   */
  const closeIfEmpty = useCallback(() => {
    if (draft.trim() || guess.trim()) return
    close()
  }, [close, draft, guess])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeIfEmpty()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeIfEmpty, open])

  if (!open) return null

  const words = draft.trim()
  /*
   * Not while listening. Pressing Keep mid-sentence would save the words the
   * recogniser had settled and throw away the phrase still in its mouth —
   * `stop()` is what makes that last phrase final, and it does not finish
   * before this handler reads `settled`. The circle is how a thought ends.
   */
  const canKeep = words.length > 0 && !saving && !listening

  /**
   * Hand the typed words to the hook before anything else happens to them.
   *
   * Speaking again adds to whatever the box holds, so the correction has to be
   * the base before the next session opens — otherwise the recogniser's own
   * older copy is still the base, and the correction is lost on the next word.
   */
  function commit(): void {
    if (draft !== settled) replace(draft)
  }

  function toggle(): void {
    if (listening) {
      stop()
      return
    }
    commit()
    startedAtRef.current ??= new Date()
    start()
  }

  async function keep(): Promise<void> {
    if (!canKeep) return
    setSaving(true)
    stop()
    commit()
    try {
      const row = await entryStore.addEntry({
        raw: words,
        at: startedAtRef.current ?? new Date(),
      })
      onSaved?.(row)
      onClose()
    } catch {
      // The words are still on screen, so nothing is lost yet. Letting the
      // reader press Keep again is a better answer than a dialog they cannot
      // act on.
      setSaving(false)
    }
  }

  return (
    <div
      className={styles.scrim}
      // Only when the tap is on the scrim itself: a tap that began inside the
      // sheet and drifted out must not count.
      onClick={(event) => {
        if (event.target === event.currentTarget) closeIfEmpty()
      }}
    >
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Speak a thought">
        <span className={styles.handle} aria-hidden="true" />

        <div className={styles.head}>
          <h2 className={styles.title}>Speak a thought</h2>
          {listening && <span className={styles.awake}>Screen stays awake</span>}
          <span className={styles.timer}>{clock(seconds)}</span>
        </div>

        {!supported && <p className={styles.fault}>{FAULT_WORDS.unsupported}</p>}
        {supported && fault && <p className={styles.fault}>{FAULT_WORDS[fault]}</p>}

        {/*
         * Two states of one thing, not two things. While the recogniser is
         * working the words are read-only, because a cursor in a field that
         * rewrites itself cannot be held. The moment it stops, the same words
         * in the same place become a box the reader can type in.
         *
         * The live one is announced politely rather than assertively: a
         * transcript that interrupts a screen reader on every word is
         * unusable, and the reader knows they are speaking.
         */}
        {listening ? (
          <p className={styles.transcript} aria-live="polite">
            {words || guess ? (
              <>
                {words}
                {guess && (
                  <>
                    {words ? ' ' : ''}
                    <span className={styles.guess}>{guess}</span>
                  </>
                )}
              </>
            ) : (
              <span className={styles.waiting}>Listening…</span>
            )}
          </p>
        ) : (
          <textarea
            className={styles.editor}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            placeholder="Press the circle and talk, or type here."
            aria-label="Your words"
            rows={4}
          />
        )}

        <div className={styles.controls}>
          <button
            ref={circleRef}
            type="button"
            className={listening ? `${styles.circle} ${styles.on}` : styles.circle}
            onClick={toggle}
            disabled={!supported || fault === 'blocked' || fault === 'no-microphone'}
            aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Start listening'}
          >
            <span aria-hidden="true" />
          </button>

          <span className={listening ? `${styles.bars} ${styles.on}` : styles.bars} aria-hidden="true">
            {Array.from({ length: BAR_COUNT }, (_, i) => (
              <i key={i} />
            ))}
          </span>

          <span className={styles.actions}>
            <button type="button" className={styles.button} onClick={close}>
              {words ? 'Discard' : 'Close'}
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.keep}`}
              onClick={() => void keep()}
              disabled={!canKeep}
            >
              Keep
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

/** m:ss. Minutes do not pad, because a one-digit minute is a real minute. */
function clock(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
