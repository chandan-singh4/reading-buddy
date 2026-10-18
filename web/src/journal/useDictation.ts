/**
 * Speech to text, through the browser's own recogniser.
 *
 * Free, and no key — which is the whole reason the journal can exist in a free
 * app. The cost is that the audio goes to the browser maker's servers, which
 * the reader accepted (`docs/decisions.md`, 2026-10-18).
 *
 * ## The two kinds of result
 *
 * The recogniser speaks twice about the same words. An **interim** result is a
 * guess: no punctuation, no capitals, and it may change entirely on the next
 * event. A **final** result is settled, punctuated and never revised. This hook
 * keeps them apart — `settled` and `guess` — so the screen can show the guess
 * in grey and let it firm into black, which is what makes the words look like
 * they are being typed as you speak.
 *
 * ## Why the restarting matters
 *
 * Chrome ends a recognition session on its own after a stretch of silence, and
 * a long ramble has silences in it. Left alone, the microphone would die in the
 * middle of a thought. `onend` therefore starts it again whenever the reader
 * has not asked to stop — and `results` is reset by that restart, which is why
 * the settled text accumulates in a ref of our own rather than being read back
 * off the event.
 *
 * None of these types are in TypeScript's DOM library. The shapes this file
 * needs are declared at the bottom, structurally, rather than as a global
 * augmentation that would collide the day they are added.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** What went wrong, in words a screen can show without translating them. */
export type DictationFault =
  | 'unsupported'
  | 'blocked'
  | 'no-microphone'
  | 'network'
  | 'unavailable'

export interface Dictation {
  /** Words the recogniser has settled on, with its punctuation. */
  settled: string
  /** Its current guess — no punctuation, and it may change. */
  guess: string
  listening: boolean
  /** False where the browser has no recogniser; the caller hides the button. */
  supported: boolean
  fault: DictationFault | null
  start: () => void
  stop: () => void
  /** Throw the words away and begin again. */
  reset: () => void
}

/**
 * A restart loop that fails immediately is not a silence — it is a recogniser
 * that cannot run. Five of those inside a second and we stop, rather than
 * hammer the service and hold the screen awake for nothing.
 */
const RESTART_FLOOR_MS = 400
const RESTART_LIMIT = 5

/** Faults that mean "do not start again". The rest are worth another go. */
const FATAL: Record<string, DictationFault> = {
  'not-allowed': 'blocked',
  'service-not-allowed': 'blocked',
  'audio-capture': 'no-microphone',
}

export function useDictation(): Dictation {
  const [settled, setSettled] = useState('')
  const [guess, setGuess] = useState('')
  const [listening, setListening] = useState(false)
  const [fault, setFault] = useState<DictationFault | null>(null)
  const [supported, setSupported] = useState(false)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  /** What the reader wants, which is not what the recogniser is doing. */
  const wantedRef = useRef(false)
  /** The settled words, kept here because a restart empties `event.results`. */
  const settledRef = useRef('')
  const lastStartRef = useRef(0)
  const quickRestartsRef = useRef(0)

  useEffect(() => {
    const Recogniser = recogniserClass()
    if (!Recogniser) {
      setSupported(false)
      return
    }
    setSupported(true)

    const recognition = new Recogniser()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.lang = navigator.language || 'en-US'

    recognition.onresult = (event) => {
      let settledNow = ''
      let guessNow = ''

      // From `resultIndex`, not from zero: everything before it was handed over
      // in an earlier event and is already in `settledRef`.
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (!result) continue
        const words = result[0]?.transcript ?? ''
        if (result.isFinal) settledNow += words
        else guessNow += words
      }
      if (settledNow) {
        settledRef.current = join(settledRef.current, settledNow)
        setSettled(settledRef.current)
      }
      // Whatever is left is the phrase after the settled one, or nothing. The
      // loop has already taken the settled words out of it, so the screen never
      // shows the same phrase twice, once black and once grey.
      setGuess(guessNow.trim())
    }

    recognition.onerror = (event) => {
      const fatal = FATAL[event.error]
      if (fatal) {
        wantedRef.current = false
        setFault(fatal)
        return
      }
      // 'no-speech' and 'aborted' are ordinary. A network fault is worth
      // saying, because the recogniser needs a signal and the reader may be on
      // a train — but `onend` still restarts, so it may clear itself.
      if (event.error === 'network') setFault('network')
    }

    recognition.onend = () => {
      setListening(false)
      if (!wantedRef.current) return

      const now = Date.now()
      if (now - lastStartRef.current < RESTART_FLOOR_MS) {
        quickRestartsRef.current += 1
        if (quickRestartsRef.current >= RESTART_LIMIT) {
          wantedRef.current = false
          setFault('unavailable')
          return
        }
      } else {
        quickRestartsRef.current = 0
      }
      begin(recognition)
      setListening(true)
    }

    recognitionRef.current = recognition
    return () => {
      // Not `stop()`: `stop` waits for the recogniser to finish what it is
      // hearing, and this component is already gone. `abort` ends it now.
      wantedRef.current = false
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        // Already dead. Nothing to undo.
      }
      recognitionRef.current = null
    }

    function begin(target: SpeechRecognitionLike): void {
      lastStartRef.current = Date.now()
      try {
        target.start()
      } catch {
        // `start()` on a recogniser that is already running throws, and means
        // the thing we wanted is already true.
      }
    }
  }, [])

  const start = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
    setFault(null)
    quickRestartsRef.current = 0
    wantedRef.current = true
    lastStartRef.current = Date.now()
    try {
      recognition.start()
    } catch {
      // Already listening.
    }
    setListening(true)
  }, [])

  const stop = useCallback(() => {
    wantedRef.current = false
    setListening(false)
    setGuess('')
    try {
      // `stop`, not `abort`: the reader has finished a sentence and the
      // recogniser is owed the chance to settle it before it closes.
      recognitionRef.current?.stop()
    } catch {
      // Not running.
    }
  }, [])

  const reset = useCallback(() => {
    settledRef.current = ''
    setSettled('')
    setGuess('')
    setFault(null)
  }, [])

  return { settled, guess, listening, supported, fault, start, stop, reset }
}

/**
 * Add a chunk to what is already there, with one space between.
 *
 * The recogniser hands over phrases, not a stream, and it does not say how they
 * join. Without this the words run together — "I went to the shops" becomes
 * "I wentto the shops". It does not add a space before punctuation, which some
 * recognisers return as a chunk of its own.
 */
function join(before: string, addition: string): string {
  const next = addition.trim()
  if (!next) return before
  if (!before) return next
  if (/^[,.;:!?’']/.test(next)) return before + next
  return `${before} ${next}`
}

function recogniserClass(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const holder = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return holder.SpeechRecognition ?? holder.webkitSpeechRecognition ?? null
}

/* ---- the parts of the Web Speech API this file touches ---- */

interface SpeechAlternativeLike {
  transcript: string
}

interface SpeechResultLike {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: SpeechAlternativeLike | undefined
}

interface SpeechResultListLike {
  readonly length: number
  readonly [index: number]: SpeechResultLike | undefined
}

interface SpeechResultEventLike {
  readonly resultIndex: number
  readonly results: SpeechResultListLike
}

interface SpeechErrorEventLike {
  readonly error: string
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechResultEventLike) => void) | null
  onerror: ((event: SpeechErrorEventLike) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike
