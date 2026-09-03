/**
 * Reading out something that is not the book.
 *
 * Veda's answers, a chapter summary, a note. Three screens, one need: a button
 * that speaks a piece of text, and stops when pressed again.
 *
 * ## Why this is not `useReadAloud`
 *
 * That hook reads *a book*. Almost everything in it is about the book — a plan
 * built from parsed paragraphs, a sentence cut in half when it runs off the
 * page, the move into the next chapter when this one ends, a place the reader
 * can be marked at. None of that means anything for a paragraph in a bubble.
 *
 * ## Why it still uses the same rules underneath
 *
 * `AloudReader` is given a plan and says it, one sentence at a time, and it
 * knows the awkward parts: that `cancel()` fires `onend` and so an abandoned
 * utterance must be ignored by generation, that stopping is not the same event
 * as finishing. Those are the same here. So the plan is built from plain text
 * instead of from paragraphs, and the rules are handed it unchanged.
 *
 * The parts of `Utterance` that describe a place in a book are filled with a
 * stand-in anchor. Nothing reads them on this path — no page turns here, and
 * nothing to mark — and inventing a second, nearly identical type to avoid two
 * unused fields would cost more than it saves.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { AloudReader, type Utterance } from '../reader/readAloud.ts'
import { sentences } from '../reader/context.ts'
import type { Anchor } from '../structure/index.ts'
import type { NarratorStatus } from './NarratorEngine.ts'
import { speechOf, utteranceOf } from './speech.ts'
import { acquireNarrator, releaseNarrator } from './shared.ts'
import { DEFAULT_NARRATOR } from './voices.ts'

/** How many sentences ahead to make. The same reasoning as the reading screen. */
const AHEAD = 3

/**
 * The anchor an utterance carries when it did not come from a book.
 *
 * Never resolved and never displayed. It exists because `Utterance` describes a
 * place in a book and this text has none.
 */
const NOWHERE = 'spoken' as Anchor

export interface Speech {
  /** Which thing is being spoken, or `null`. The caller's own id. */
  speakingId: string | null
  /** Speak this, or stop it if it is the thing already being spoken. */
  toggle: (id: string, text: string, voice?: string) => void
  stop: () => void
  /** How the narrator is doing, so a button can wait while the model arrives. */
  narrator: NarratorStatus
}

export function useSpeech(): Speech {
  const [speakingId, setSpeakingId] = useState<string | null>(null)

  const engineRef = useRef(acquireNarrator())
  const engine = engineRef.current

  const [narrator, setNarrator] = useState<NarratorStatus>(engine.now)

  useEffect(() => {
    const stop = engine.watch(setNarrator)
    return () => {
      stop()
      releaseNarrator()
    }
  }, [engine])

  /** The plan being spoken, for the lookahead to read ahead in. */
  const plan = useRef<readonly Utterance[]>([])
  const voice = useRef(DEFAULT_NARRATOR)

  const reader = useRef<AloudReader | null>(null)
  if (!reader.current) {
    reader.current = new AloudReader(speechOf(engine), utteranceOf, {
      onPlace: (at) => {
        if (at === null) {
          setSpeakingId(null)
          return
        }
        // The same lookahead as the reading screen, and deferred for the same
        // reason: the rules report the move before they speak, so priming from
        // here would put sentences nobody is waiting for in front of the one
        // somebody is. See `useReadAloud`.
        const ahead = plan.current.slice(at + 1, at + 1 + AHEAD)
        const speed = 1
        const id = voice.current
        queueMicrotask(() => {
          for (const next of ahead) engine.prime({ text: next.text, voice: id, speed })
        })
      },
      // Reaching the end is the same as being stopped, here. There is no next
      // chapter to go on to and nothing to report — the button just comes back.
      onFinished: () => setSpeakingId(null),
    })
  }

  const stop = useCallback(() => {
    reader.current?.stop()
    setSpeakingId(null)
  }, [])

  const toggle = useCallback(
    (id: string, text: string, chosen?: string) => {
      // Pressing the button that is already speaking means stop. The same
      // button both ways, because a separate stop button would appear and
      // disappear beside every bubble in the thread.
      if (speakingId === id) {
        stop()
        return
      }

      const lines = sentences(text)
        .map((one) => one.trim())
        .filter(Boolean)
        .map((one, at) => ({ anchor: NOWHERE, text: one, at }))

      if (lines.length === 0) return

      engine.wake()
      plan.current = lines
      voice.current = chosen ?? DEFAULT_NARRATOR
      setSpeakingId(id)
      // `start` silences whatever was playing first, so pressing a second
      // button while the first is speaking swaps rather than overlaps.
      reader.current?.start(lines, 0, { voice: { id: voice.current }, rate: 1 })
    },
    [engine, speakingId, stop],
  )

  /** Leaving the screen silences it, exactly as it does in the reader. */
  useEffect(() => () => reader.current?.stop(), [])

  return { speakingId, toggle, stop, narrator }
}
