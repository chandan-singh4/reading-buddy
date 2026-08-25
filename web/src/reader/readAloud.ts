/**
 * Reading the book out loud.
 *
 * The phone already had a "say this bit" button: one selection, one utterance,
 * no way to stop it. This is the other thing — a voice that keeps going,
 * paragraph after paragraph, while the reader listens.
 *
 * ## Sentences, not paragraphs
 *
 * The whole section could be handed to the speech engine as one string, and on
 * a good day it would read it. Three things go wrong when it does.
 *
 *   - **Nothing can follow it.** The engine reports progress as a character
 *     offset into the utterance it was given, and turning that back into a
 *     place in the book means keeping a separate map of the section. A sentence
 *     at a time, the place *is* the utterance.
 *   - **Stopping is not immediate.** A reader who pauses in the middle of a
 *     chapter should not hear the rest of the paragraph first.
 *   - **Long utterances are unreliable.** Several engines stop partway through
 *     a few thousand characters, and the failure is silent.
 *
 * So a section is cut into sentences up front, each keeping the anchor of the
 * paragraph it came from. That list is the plan, and the place in it is the
 * place in the book.
 *
 * ## What is not read
 *
 * A table, a code block and a figure are skipped. Read out, a table is a run of
 * unrelated words and a figure is the word "Figure". A heading *is* read: it is
 * what the author called the next part, and hearing it is how a listener knows
 * they have arrived at one.
 */

import { sentences } from './context.ts'
import type { Anchor, Paragraph } from '../structure/index.ts'

/** One thing to say, and where in the book it comes from. */
export interface Utterance {
  anchor: Anchor
  text: string
  /** Which sentence of its paragraph this is. Needed to find it on the page. */
  at: number
}

/** Blocks whose text is prose when read out. The rest are skipped. */
const SPOKEN = new Set(['prose', 'heading', 'quote', 'list'])

/**
 * The reading plan for a run of blocks.
 *
 * A list is read one line per utterance rather than one sentence per utterance:
 * its items are rarely sentences, and splitting on full stops turns "1. Milk"
 * into two of them.
 */
export function planOf(paragraphs: readonly Paragraph[]): Utterance[] {
  const plan: Utterance[] = []

  for (const block of paragraphs) {
    if (!SPOKEN.has(block.kind)) continue
    const text = block.text.trim()
    if (!text) continue

    const parts = block.kind === 'list' ? text.split('\n') : sentences(text)
    parts
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part, at) => plan.push({ anchor: block.anchor, text: part, at }))
  }

  return plan
}

/** Where in the plan a paragraph's first sentence sits. `0` when it is absent. */
export function startOf(plan: readonly Utterance[], anchor: Anchor | undefined): number {
  if (!anchor) return 0
  const at = plan.findIndex((one) => one.anchor === anchor)
  return at < 0 ? 0 : at
}

/**
 * The parts of `speechSynthesis` this module uses.
 *
 * Named rather than reached for globally, so a test can drive the reader.
 * Every browser implementation of this API has at least one bug in it, and
 * none of them reproduce in jsdom.
 */
export interface SpeechLike {
  speak(utterance: SpokenLike): void
  cancel(): void
  pause(): void
  resume(): void
}

export interface SpokenLike {
  text: string
  voice: SpeechSynthesisVoice | null
  rate: number
  /*
   * No argument. The reader ignores the event, and declaring one would make
   * this interface a near-copy of `SpeechSynthesisUtterance` — which is exactly
   * what a seam is for avoiding. The real utterance is adapted at the one place
   * the two meet; see `useReadAloud`.
   */
  onend: (() => void) | null
  onerror: (() => void) | null
}

/** How the voice is set up for one sentence. */
export interface Voicing {
  voice?: SpeechSynthesisVoice | null
  rate?: number
}

/**
 * A reader that says a plan out loud, one sentence at a time.
 *
 * Deliberately a plain object rather than a hook. The rules here — what plays
 * next, what a pause means, which endings are real — are worth testing on their
 * own, and a hook drags a renderer into every one of those tests.
 *
 * ## Why an ended utterance cannot simply advance
 *
 * `cancel()` fires `onend` on the utterance it stopped. So the obvious loop —
 * "when one ends, speak the next" — starts reading again the instant a reader
 * presses stop. Every utterance therefore carries the *generation* it was made
 * in, and one that ends from an older generation is ignored. Pausing, stopping,
 * skipping and changing voice all move the generation on.
 */
export class AloudReader {
  private plan: readonly Utterance[] = []
  private at = 0
  private generation = 0
  private speaking = false
  private voicing: Voicing = {}

  private readonly speech: SpeechLike
  private readonly make: (text: string) => SpokenLike
  /** Told the place in the plan when it moves, and `null` when it stops. */
  private readonly onPlace: (at: number | null) => void
  /**
   * Told when the plan has been *read to the end* — and at no other time.
   *
   * Separate from `onPlace(null)`, and that separation is the fix for a real
   * fault. The two endings look identical from outside: the reading has
   * finished and there is no place any more. They mean opposite things. One is
   * "this section is done, go on to the next"; the other is "the reader
   * pressed stop". While a single callback carried both, pressing stop moved
   * the reader to the next chapter and started reading it — and pressing stop
   * again moved them on again, with no way out.
   */
  private readonly onFinished: () => void

  constructor(
    speech: SpeechLike,
    make: (text: string) => SpokenLike,
    onPlace: (at: number | null) => void = () => {},
    onFinished: () => void = () => {},
  ) {
    this.speech = speech
    this.make = make
    this.onPlace = onPlace
    this.onFinished = onFinished
  }

  get index(): number {
    return this.at
  }

  get playing(): boolean {
    return this.speaking
  }

  /** Start, or start again somewhere else. Replaces whatever was playing. */
  start(plan: readonly Utterance[], from = 0, voicing: Voicing = {}): void {
    this.silence()
    this.plan = plan
    this.at = Math.max(0, Math.min(from, Math.max(0, plan.length - 1)))
    this.voicing = voicing
    if (plan.length === 0) {
      this.onPlace(null)
      return
    }
    this.speaking = true
    this.say()
  }

  /**
   * Pause where it is.
   *
   * The engine is asked to pause as well as being silenced, because on a phone
   * pausing is instant. On resume the sentence is said again from its start
   * rather than trusted to carry on: desktop Chrome has resumed on its own
   * after a timeout for years, and a repeated sentence is a fault a listener
   * forgives where a silent stop is not.
   */
  pause(): void {
    if (!this.speaking) return
    this.speaking = false
    this.generation += 1
    this.speech.pause()
  }

  resume(): void {
    if (this.speaking || this.plan.length === 0) return
    this.speaking = true
    this.speech.resume()
    this.say()
  }

  /**
   * Stop, and forget the place.
   *
   * What a reader asks for. It never reports the plan as finished — see
   * `onFinished`.
   */
  stop(): void {
    this.silence()
    this.plan = []
    this.at = 0
    this.onPlace(null)
  }

  /** The plan was read to its end. Stop, then say so. */
  private finish(): void {
    this.stop()
    this.onFinished()
  }

  /** Move by whole sentences, playing or paused. */
  skip(by: number): void {
    if (this.plan.length === 0) return
    const to = this.at + by
    if (to < 0 || to >= this.plan.length) {
      this.stop()
      return
    }

    const wasPlaying = this.speaking
    this.silence()
    this.at = to
    this.onPlace(this.at)
    if (wasPlaying) {
      this.speaking = true
      this.say()
    }
  }

  /** A new voice or speed, from this sentence on. */
  revoice(voicing: Voicing): void {
    this.voicing = voicing
    if (!this.speaking) return
    const at = this.at
    this.silence()
    this.at = at
    this.speaking = true
    this.say()
  }

  /** Everything stops and nothing is scheduled. The plan is left alone. */
  private silence(): void {
    this.generation += 1
    this.speaking = false
    this.speech.cancel()
  }

  private say(): void {
    const line = this.plan[this.at]
    if (!line) {
      this.finish()
      return
    }

    this.onPlace(this.at)

    const mine = this.generation
    const spoken = this.make(line.text)
    spoken.voice = this.voicing.voice ?? null
    spoken.rate = this.voicing.rate ?? 1

    const next = () => {
      // The utterance that just ended may be one this reader has already
      // abandoned — `cancel()` ends it too. See the note on the class.
      if (mine !== this.generation || !this.speaking) return
      this.at += 1
      if (this.at >= this.plan.length) {
        this.finish()
        return
      }
      this.say()
    }

    spoken.onend = next
    // An engine that fails on one sentence must not end the reading. Moving on
    // is right: the usual cause is a single unpronounceable token, and the
    // sentence after it is fine.
    spoken.onerror = next

    this.speech.speak(spoken)
  }
}
