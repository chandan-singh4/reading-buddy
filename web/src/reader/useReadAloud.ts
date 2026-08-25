/**
 * The reading voice, wired to the page.
 *
 * `readAloud.ts` holds the rules — what to say and what comes next. This holds
 * the parts that only make sense inside a screen: the browser's engine, the
 * list of voices it offers, the sentence the page has to mark, and the move to
 * the next section when this one runs out.
 *
 * ## It stops when the reader leaves
 *
 * `speechSynthesis` belongs to the tab, not to this screen. Nothing used to
 * silence it, so closing the book left the voice reading the page that was no
 * longer there, and the only way to stop it was to close the tab. The cleanup
 * below is that fix, and it is the reason this is a hook at all.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AloudReader,
  planOf,
  startOf,
  type SpeechLike,
  type SpokenLike,
  type Utterance,
} from './readAloud.ts'
import type { Anchor, Paragraph } from '../structure/index.ts'

export interface AloudControls {
  /** True while the voice is speaking. False when paused and when stopped. */
  playing: boolean
  /** True once a reading has started, until it stops. Drives the transport. */
  running: boolean
  /** The sentence being said, so the page can mark it. */
  saying: Utterance | null
  /** The voices this browser offers. Empty until the engine reports them. */
  voices: SpeechSynthesisVoice[]
  start: (from?: Anchor) => void
  pause: () => void
  resume: () => void
  stop: () => void
  skip: (by: number) => void
}

export interface AloudOptions {
  /** The section on screen. A new array means new words to read. */
  paragraphs: readonly Paragraph[]
  /** The chosen voice, by name. Anything else falls back to the engine's own. */
  voiceName?: string | undefined
  rate: number
  /** Called for each sentence, so the page can turn to it. */
  onSaying?: (utterance: Utterance) => void
  /**
   * Asked for the next section when this one is finished.
   *
   * Returns `true` if it moved. The reading then waits, quietly, until the new
   * paragraphs arrive and starts again at their top — which is how "read this
   * book to me" is one instruction and not one per chapter.
   */
  onSectionEnd?: () => boolean
}

export function useReadAloud(options: AloudOptions): AloudControls {
  const { paragraphs, voiceName, rate, onSaying, onSectionEnd } = options

  const [playing, setPlaying] = useState(false)
  const [running, setRunning] = useState(false)
  const [place, setPlace] = useState<number | null>(null)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  const plan = useMemo(() => planOf(paragraphs), [paragraphs])

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
  const planNow = useRef(plan)
  planNow.current = plan

  /** Set when a section ended mid-reading: the next one starts on arrival. */
  const carryOn = useRef(false)

  const engine = typeof window === 'undefined' ? undefined : window.speechSynthesis

  /*
   * The one place the reader's small interface meets the browser's large one.
   *
   * `SpeechSynthesisUtterance` carries a dozen members the reader has no use
   * for, and its handlers are given an event the reader ignores. Widening
   * `SpokenLike` to match would make it a copy of the browser type and the seam
   * would buy nothing. So the adapting happens here, once, in the file that
   * already owns the browser.
   */
  const asSpeech = (one: SpeechSynthesis) => one as unknown as SpeechLike
  const utteranceOf = (text: string) =>
    new SpeechSynthesisUtterance(text) as unknown as SpokenLike

  const reader = useRef<AloudReader | null>(null)
  if (!reader.current && engine) {
    reader.current = new AloudReader(
      asSpeech(engine),
      utteranceOf,
      (at) => {
        setPlace(at)
        if (at === null) {
          // Quiet, and nothing on the page marked. Whether the book goes on is
          // the *other* callback's business — see it below.
          setPlaying(false)
          setRunning(false)
          return
        }
        const line = planNow.current[at]
        if (line) saying.current?.(line)
      },
      () => {
        // The section was read to its end. This never runs when the reader
        // presses stop, which is the whole reason it is a separate callback:
        // stop used to be indistinguishable from "finished", so it carried the
        // reader into the next chapter instead of ending the reading.
        const moved = sectionEnd.current?.() ?? false
        carryOn.current = moved
        setPlaying(moved)
        setRunning(moved)
      },
    )
  }

  /** The engine's voices, which several browsers report a moment late. */
  useEffect(() => {
    if (!engine) return
    const read = () => setVoices(engine.getVoices())
    read()
    engine.addEventListener?.('voiceschanged', read)
    return () => engine.removeEventListener?.('voiceschanged', read)
  }, [engine])

  const voicing = useMemo(
    () => ({ voice: voices.find((one) => one.name === voiceName) ?? null, rate }),
    [voices, voiceName, rate],
  )

  const start = useCallback(
    (from?: Anchor) => {
      const one = reader.current
      if (!one || plan.length === 0) return
      setRunning(true)
      setPlaying(true)
      one.start(plan, startOf(plan, from), voicing)
    },
    [plan, voicing],
  )

  const pause = useCallback(() => {
    reader.current?.pause()
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
   * Not on the first run. The voice list arrives a moment after the screen
   * does, so `voicing` changes identity once for reasons that have nothing to
   * do with the reader — and re-voicing says the current sentence again.
   */
  const voicedOnce = useRef(false)
  useEffect(() => {
    if (!voicedOnce.current) {
      voicedOnce.current = true
      return
    }
    reader.current?.revoice(voicing)
  }, [voicing])

  /** The whole point of the hook: leaving the screen silences the voice. */
  useEffect(() => () => reader.current?.stop(), [])

  return {
    playing,
    running,
    saying: place === null ? null : (plan[place] ?? null),
    voices,
    start,
    pause,
    resume,
    stop,
    skip,
  }
}
