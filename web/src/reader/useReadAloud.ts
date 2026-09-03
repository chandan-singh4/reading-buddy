/**
 * The reading voice, wired to the page.
 *
 * `readAloud.ts` holds the rules — what to say and what comes next. This holds
 * the parts that only make sense inside a screen: the engine that makes the
 * sound, the voices it offers, the sentence the page has to mark, and the move
 * to the next section when this one runs out.
 *
 * ## The voice is the app's now, not the phone's
 *
 * This used to be `window.speechSynthesis`. That was free and it was there, and
 * both of those were the whole of its case. Against it: a different set of
 * voices on every device, names like "Microsoft Zira Desktop" that tell a
 * reader nothing, several Android phones listing a dozen names that are one
 * engine underneath, and a quality that makes an hour of listening a chore.
 *
 * The narrator is a neural model that runs on the device (`src/narrator/`). It
 * costs 86 MB once, and after that it is the same voice on every device, works
 * with no network, and sends nothing anywhere. The rules below did not change
 * to accommodate it — see `narrator/speech.ts` for why they did not have to.
 *
 * ## It stops when the reader leaves
 *
 * The engine outlives a render but not the screen. Nothing used to silence the
 * old one, so closing the book left the voice reading a page that was no longer
 * there. The cleanup below is that fix, and it is the reason this is a hook.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AloudReader, planOf, startOf, type Utterance } from './readAloud.ts'
import type { NarratorStatus } from '../narrator/NarratorEngine.ts'
import { acquireNarrator, releaseNarrator } from '../narrator/shared.ts'
import { speechOf, utteranceOf } from '../narrator/speech.ts'
import { DEFAULT_NARRATOR, resolveVoice, type NarratorVoice } from '../narrator/voices.ts'
import type { Anchor, Paragraph } from '../structure/index.ts'

export interface AloudControls {
  /** True while the voice is speaking. False when paused and when stopped. */
  playing: boolean
  /** True once a reading has started, until it stops. Drives the transport. */
  running: boolean
  /** The sentence being said, so the page can mark it. */
  saying: Utterance | null
  /** The voices the narrator offers. The same list on every device. */
  voices: NarratorVoice[]
  /**
   * How the narrator itself is doing: loading, ready, or unavailable.
   *
   * Shown to the reader once, on the first ever play, while 86 MB of weights
   * arrive. After that it is `ready` before anyone can look at it — the model is
   * in the browser's cache and there is nothing to wait for.
   */
  narrator: NarratorStatus
  /**
   * Read from here. `from` names the paragraph; `excerpt` is what the reader
   * actually picked, so the reading starts at their sentence and not at the
   * paragraph's first one.
   */
  start: (from?: Anchor, excerpt?: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  skip: (by: number) => void
  /**
   * Say one short line in a voice, so the reader can hear it before choosing.
   *
   * Every voice picker does this. Here it does a second job: 28 names in a list
   * tell a reader nothing about how any of them sound, and the difference
   * between two of them is the difference between finishing a book by ear and
   * giving up on it.
   *
   * Does nothing while the book is being read. The change is already audible in
   * the next sentence, and two voices at once helps nobody.
   */
  sample: (voiceId?: string) => void
}

export interface AloudOptions {
  /** The section on screen. A new array means new words to read. */
  paragraphs: readonly Paragraph[]
  /** The chosen voice, by the narrator's own id. Falls back when it is gone. */
  voiceName?: string | undefined
  rate: number
  /** Called for each sentence, so the page can turn to it. */
  onSaying?: (utterance: Utterance) => void
  /**
   * Where the sentence runs off the page, counted from its own start.
   *
   * Only the screen can answer it, so only the screen is asked. `null` — the
   * ordinary answer — means the rest of the sentence is on this page.
   */
  breakAt?: (utterance: Utterance, from: number) => number | null
  /** The voice has read the last words on the page. Turn it. */
  onCross?: (utterance: Utterance, at: number) => void
  /** Called whenever the voice goes quiet, so the page can drop any timer. */
  onStopped?: () => void
  /**
   * Asked for the next section when this one is finished.
   *
   * Returns `true` if it moved. The reading then waits, quietly, until the new
   * paragraphs arrive and starts again at their top — which is how "read this
   * book to me" is one instruction and not one per chapter.
   */
  onSectionEnd?: () => boolean
}

/**
 * How many sentences ahead the narrator is asked to make.
 *
 * Three. Making a sentence costs about as long as saying one on a device with
 * graphics acceleration, and several times that on one without — so the
 * lookahead is the only thing standing between the reader and a pause at every
 * full stop.
 *
 * Not more, because every page turn and every pause throws the lookahead away.
 * A reader who stops after two sentences has paid for five, and on the slow
 * path that wasted work is competing for the same processor as the sentence
 * they are actually listening to.
 *
 * `NarratorEngine` keeps one more than this. See `KEEP` there — holding fewer
 * than the lookahead is what caused the long pause between every sentence.
 */
const AHEAD = 3

export function useReadAloud(options: AloudOptions): AloudControls {
  const { paragraphs, voiceName, rate, onSaying, breakAt, onCross, onStopped, onSectionEnd } =
    options

  const [playing, setPlaying] = useState(false)
  const [running, setRunning] = useState(false)
  const [place, setPlace] = useState<number | null>(null)

  const plan = useMemo(() => planOf(paragraphs), [paragraphs])

  /*
   * The narrator, shared with every other screen that speaks.
   *
   * Not one per screen. Veda's answers, the chapter summaries and the notes can
   * all be read aloud now, and an engine each would be a worker each and 86 MB
   * of model each — on a phone. See `narrator/shared.ts`.
   *
   * Taking it costs nothing: no worker starts and nothing downloads until
   * somebody presses play. See `NarratorEngine.wake`.
   */
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

  /*
   * The callbacks as refs, and the reason is the reader below.
   *
   * `AloudReader` is built once and lives for the life of the screen — it holds
   * what is being said, and rebuilding it would cut the voice off. So it cannot
   * close over a callback that changes every render. It reads these instead.
   */
  const saying = useRef(onSaying)
  saying.current = onSaying
  const sectionEnd = useRef(onSectionEnd)
  sectionEnd.current = onSectionEnd
  const breaks = useRef(breakAt)
  breaks.current = breakAt
  const cross = useRef(onCross)
  cross.current = onCross
  const stopped = useRef(onStopped)
  stopped.current = onStopped
  const planNow = useRef(plan)
  planNow.current = plan

  /** Set when a section ended mid-reading: the next one starts on arrival. */
  const carryOn = useRef(false)

  /** The voice and speed as they stand, for the lookahead to read. */
  const voicing = useMemo(() => {
    const chosen = resolveVoice(narrator.roster, voiceName)
    return { voice: { id: chosen.id ?? DEFAULT_NARRATOR }, rate }
  }, [narrator.roster, voiceName, rate])
  const voicingNow = useRef(voicing)
  voicingNow.current = voicing

  const reader = useRef<AloudReader | null>(null)
  if (!reader.current) {
    reader.current = new AloudReader(speechOf(engine), utteranceOf, {
      onPlace: (at) => {
        setPlace(at)
        if (at === null) {
          // Quiet, and nothing on the page marked. Whether the book goes on
          // is the *other* callback's business — see `onFinished` below.
          stopped.current?.()
          setPlaying(false)
          setRunning(false)
          return
        }
        const line = planNow.current[at]
        if (line) saying.current?.(line)

        /*
         * Make the next sentences while this one plays.
         *
         * Here rather than anywhere else because this is the one place that
         * knows the reading moved, and it fires for every cause of a move —
         * finishing a sentence, skipping, seeking, a new section. A lookahead
         * hung off `start` alone would run dry the moment a reader skipped.
         *
         * ## Why this waits for the end of the turn
         *
         * `onPlace` runs *before* the sentence it announced is handed to the
         * narrator — the rules report the move, then speak. So priming straight
         * from here puts three sentences nobody is waiting for into the worker
         * ahead of the one somebody is. The worker takes them one at a time and
         * cannot be interrupted mid-sentence, so the reader waits for a
         * sentence they have not reached before hearing the one they asked for.
         *
         * Measured, on the slow path: 57 seconds to the first word that way,
         * against about 20 to make the sentence itself.
         *
         * A microtask is enough. It runs after the whole synchronous chain —
         * including the `speak` that this move leads to — so the sentence the
         * reader is waiting on always reaches the worker first.
         */
        const { voice, rate: speed } = voicingNow.current
        const ahead = planNow.current.slice(at + 1, at + 1 + AHEAD)
        queueMicrotask(() => {
          for (const next of ahead) engine.prime({ text: next.text, voice: voice.id, speed })
        })
      },
      onFinished: () => {
        // The section was read to its end. This never runs when the reader
        // presses stop, which is the whole reason it is a separate callback:
        // stop used to be indistinguishable from "finished", so it carried
        // the reader into the next chapter instead of ending the reading.
        const moved = sectionEnd.current?.() ?? false
        carryOn.current = moved
        setPlaying(moved)
        setRunning(moved)
      },
      breakAt: (line, from) => breaks.current?.(line, from) ?? null,
      onCross: (line, at) => cross.current?.(line, at),
    })
  }

  const start = useCallback(
    (from?: Anchor, excerpt?: string) => {
      const one = reader.current
      if (!one || plan.length === 0) return
      // The first play is what pays for the model. Asking here means a reader
      // who never presses play never downloads it.
      engine.wake()
      setRunning(true)
      setPlaying(true)
      one.start(plan, startOf(plan, from, excerpt), voicing)
    },
    [engine, plan, voicing],
  )

  const pause = useCallback(() => {
    reader.current?.pause()
    stopped.current?.()
    setPlaying(false)
  }, [])

  const resume = useCallback(() => {
    reader.current?.resume()
    setPlaying(true)
  }, [])

  const stop = useCallback(() => {
    reader.current?.stop()
    // After the reader, not before it. `stop` reports the place as gone, and a
    // flag cleared first would be the flag this cleared, set again.
    carryOn.current = false
    setPlaying(false)
    setRunning(false)
  }, [])

  const skip = useCallback((by: number) => reader.current?.skip(by), [])

  const sample = useCallback(
    (id?: string) => {
      if (running) return
      engine.wake()
      // Whatever was being tried a moment ago stops. A reader moving down a
      // list of 28 voices taps faster than a sentence takes to say.
      engine.stop()
      engine.play({ text: SAMPLE, voice: id || DEFAULT_NARRATOR, speed: rate }, {})
    },
    [engine, rate, running],
  )

  /*
   * A new section landed while the voice was reading. Pick it up at its top.
   *
   * Guarded on `carryOn` so a reader who turns pages by hand, or jumps to a
   * bookmark, is not suddenly read to.
   */
  useEffect(() => {
    if (!carryOn.current || plan.length === 0) return
    carryOn.current = false
    reader.current?.start(plan, 0, voicing)
    setPlaying(true)
    setRunning(true)
  }, [plan, voicing])

  /*
   * A new voice or speed, without losing the place.
   *
   * Not on the first run. The roster is corrected once when the model reports
   * its own — so `voicing` changes identity for a reason that has nothing to do
   * with the reader, and re-voicing says the current sentence again.
   */
  const voicedOnce = useRef(false)
  useEffect(() => {
    if (!voicedOnce.current) {
      voicedOnce.current = true
      return
    }
    reader.current?.revoice(voicing)
  }, [voicing])

  /*
   * The whole point of the hook: leaving the screen silences the voice.
   *
   * Silenced, not closed. The engine is shared now, so this screen is not the
   * one to decide the model should go — `releaseNarrator` above does that, and
   * only when nothing else is holding it.
   */
  useEffect(() => () => reader.current?.stop(), [])

  return {
    playing,
    running,
    saying: place === null ? null : (plan[place] ?? null),
    voices: narrator.roster,
    narrator,
    start,
    pause,
    resume,
    stop,
    skip,
    sample,
  }
}

/** What a voice says when it is tried. One short line, about this book. */
const SAMPLE = 'This is how your book will sound.'
