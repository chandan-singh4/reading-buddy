/**
 * Speaking a question instead of typing it.
 *
 * ## What this uses, and what that costs
 *
 * The browser's own Web Speech API — `SpeechRecognition`, and on Safari and
 * Chrome its `webkit` prefix. Nothing is sent to our relay, and no audio
 * touches this app: the phone hands back text and keeps the sound.
 *
 * The catch is that support is uneven. Safari on iOS and Chrome have it;
 * Firefox does not. So the whole feature is drawn only when the browser admits
 * to it — `dictationSupported()` — and the composer is unchanged where it is
 * missing. A microphone button that does nothing is worse than no button.
 *
 * The first tap raises the platform's own microphone permission prompt. A
 * refusal comes back as an error event, which stops the listening state rather
 * than leaving a button lit forever waiting for words.
 *
 * ## Interim words, and why the base text is held
 *
 * Recognition arrives twice: a rough guess while the reader is still speaking,
 * then a corrected final. Both must land in the same place in the box, or the
 * guess would be typed and then the correction typed after it.
 *
 * So a dictation run remembers what was in the box when it started, and every
 * event rewrites *everything after that point*. The reader sees words appear
 * and then tidy themselves, which is what dictation looks like everywhere else.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** The shape of the browser's recogniser, in the parts this file touches. */
interface Recogniser {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

interface SpeechEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

type RecogniserClass = new () => Recogniser

/**
 * The browser's recogniser constructor, whatever it is called here.
 *
 * Read through `window` rather than the global, because the unprefixed name is
 * not in the DOM typings and the prefixed one exists nowhere at build time.
 */
export function recogniserClass(): RecogniserClass | undefined {
  const scope = window as unknown as {
    SpeechRecognition?: RecogniserClass
    webkitSpeechRecognition?: RecogniserClass
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition
}

export function dictationSupported(): boolean {
  try {
    return recogniserClass() !== undefined
  } catch {
    // A locked-down browser can throw on the property read itself.
    return false
  }
}

/**
 * Everything heard so far, in one string.
 *
 * The API hands back a growing list of chunks, each with its own alternatives.
 * Only the first alternative of each chunk is used — the others are the
 * recogniser's second guesses, and showing them would be noise.
 */
export function transcriptOf(event: SpeechEvent): string {
  let said = ''
  for (let index = 0; index < event.results.length; index++) {
    said += event.results[index]?.[0]?.transcript ?? ''
  }
  return said.trim()
}

/**
 * What the box should say: what was already there, then what was heard.
 *
 * A single space between them, and never a leading one — dictating into an
 * empty box must not start the question with a blank.
 */
export function joinSaid(base: string, said: string): string {
  const kept = base.trimEnd()
  const heard = said.trim()
  if (!heard) return base
  if (!kept) return heard
  return `${kept} ${heard}`
}

export interface Dictation {
  /** False on a browser without the API. The button is not drawn at all then. */
  supported: boolean
  listening: boolean
  /** Start if idle, stop if listening. */
  toggle: () => void
  /** Stop without waiting for a tap — used when the question is sent. */
  stop: () => void
}

export function useDictation(options: {
  /** What is in the box now. Read once, when a run starts. */
  baseText: () => string
  onText: (text: string) => void
}): Dictation {
  const [supported] = useState(dictationSupported)
  const [listening, setListening] = useState(false)
  const machine = useRef<Recogniser | null>(null)
  const base = useRef('')
  // Held in a ref so the recogniser's callbacks always call today's function,
  // not the one that existed when the run started.
  const latest = useRef(options)
  latest.current = options

  const stop = useCallback(() => {
    machine.current?.stop()
    machine.current = null
    setListening(false)
  }, [])

  // A run that outlives its component would keep the microphone open with
  // nowhere to put the words.
  useEffect(() => () => machine.current?.abort(), [])

  const toggle = useCallback(() => {
    if (machine.current) {
      stop()
      return
    }

    const Machine = recogniserClass()
    if (!Machine) return

    const machinery = new Machine()
    machinery.continuous = true
    machinery.interimResults = true
    // The page's language, so a reader of a French book is not transcribed as
    // if they were speaking English.
    machinery.lang = document.documentElement.lang || navigator.language || 'en-US'

    base.current = latest.current.baseText()
    machinery.onresult = (event) => {
      latest.current.onText(joinSaid(base.current, transcriptOf(event)))
    }
    machinery.onerror = () => {
      // Refused permission, no microphone, or silence timed out. All three end
      // the run; none of them is worth a message over the reader's question.
      machine.current = null
      setListening(false)
    }
    machinery.onend = () => {
      machine.current = null
      setListening(false)
    }

    try {
      machinery.start()
    } catch {
      return
    }
    machine.current = machinery
    setListening(true)
  }, [stop])

  return { supported, listening, toggle, stop }
}
