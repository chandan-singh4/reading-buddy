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

/**
 * Where in the plan to start, given what the reader picked.
 *
 * The anchor alone is not enough, and that was a reported fault: a reader who
 * selected the fourth sentence of a paragraph and asked to be read to heard the
 * paragraph from its first word. An anchor names a *paragraph*, and a paragraph
 * is many sentences.
 *
 * So the words matter too. Among that paragraph's sentences, this looks for the
 * one the selection begins in — the selection may be part of a sentence, a whole
 * sentence, or several of them, and all three start in the same place.
 *
 * Falls back to the paragraph's first sentence, which is what it always did.
 * That is the honest answer when the words cannot be matched: the reader still
 * gets read to, from somewhere sensible and nearby.
 */
export function startOf(
  plan: readonly Utterance[],
  anchor: Anchor | undefined,
  excerpt?: string,
): number {
  if (!anchor) return 0
  const first = plan.findIndex((one) => one.anchor === anchor)
  if (first < 0) return 0

  const wanted = plainly(excerpt ?? '')
  if (!wanted) return first

  for (let at = first; at < plan.length && plan[at]?.anchor === anchor; at += 1) {
    const line = plainly(plan[at]?.text ?? '')
    if (!line) continue
    /*
     * Either way round, because a selection and a sentence can be either size.
     * A reader who dragged across half a sentence gives words *inside* it; a
     * reader who tapped Paragraph gives words that *contain* it.
     *
     * The opening of the selection rather than the whole of it: a selection
     * that runs over three sentences matches none of them whole, and it is the
     * first of the three the reading should start at.
     */
    if (line.includes(wanted.slice(0, MATCH_ON)) || wanted.startsWith(line)) return at
  }

  return first
}

/**
 * How much of a selection has to be recognised in a sentence.
 *
 * Long enough not to match the wrong sentence — "the" would match most of
 * them — and short enough to survive a selection that starts mid-word, which a
 * drag often does.
 */
const MATCH_ON = 24

/** One spacing, one case. What the page shows and what was stored differ in both. */
function plainly(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * How long a run of text takes to say, in milliseconds.
 *
 * An estimate, and it exists because the exact answer is not available. The
 * page has to turn as the voice reaches the foot of it, and the engine is
 * supposed to say where it is by reporting each word — but several engines,
 * iOS among them, report nothing at all. On those the clock is the only thing
 * left to follow.
 *
 * `CHARS_PER_SECOND` is measured against ordinary English prose read at a
 * normal pace: about 160 words a minute, and about 5.5 characters a word with
 * its space. It is wrong for a page of long names and wrong for a page of
 * dialogue, and being a little wrong is the point — a page turned a beat early
 * or a beat late is a small fault, and a page not turned at all is the fault
 * being fixed.
 */
export function msToSpeak(characters: number, rate = 1): number {
  const pace = CHARS_PER_SECOND * (rate > 0 ? rate : 1)
  return Math.max(0, (characters / pace) * 1000)
}

const CHARS_PER_SECOND = 14.7

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
  /**
   * Reported as each word starts, with how far into the sentence it is.
   *
   * Optional in practice as well as in name: several engines never fire it, and
   * an engine that does not is the reason nothing important may depend on it.
   * Here it decides only *when* the page turns, and the page turns at the next
   * sentence regardless.
   */
  onboundary?: ((event: { charIndex: number }) => void) | null
}

/** How the voice is set up for one sentence. */
export interface Voicing {
  voice?: SpeechSynthesisVoice | null
  rate?: number
}

/**
 * What the reader reports, and to whom.
 *
 * An object rather than three positional arguments. They are all optional, they
 * are all functions, and `new AloudReader(speech, make, undefined, undefined,
 * fn)` is not something anybody should have to write or read.
 */
export interface Told {
  /** The place in the plan when it moves, and `null` when it stops. */
  onPlace?: (at: number | null) => void
  /** The plan was read to its end. Not called when the reader stops it. */
  onFinished?: () => void
  /** Each word as it is said. Silent on an engine that reports no boundaries. */
  onWord?: (line: Utterance, charIndex: number) => void
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
  /** Told which word is being said, and how far into the sentence it is. */
  private readonly onWord: (line: Utterance, charIndex: number) => void
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

  constructor(speech: SpeechLike, make: (text: string) => SpokenLike, told: Told = {}) {
    this.speech = speech
    this.make = make
    this.onPlace = told.onPlace ?? (() => {})
    this.onFinished = told.onFinished ?? (() => {})
    this.onWord = told.onWord ?? (() => {})
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

    /*
     * Where the voice is *inside* the sentence.
     *
     * The page used to turn on the sentence after the one that ran off it: a
     * long sentence that began at the foot of a page was read to its end while
     * the reader looked at the words above it. The engine reports each word, so
     * the page can turn as the last word on it is said.
     *
     * Same generation guard as the ending: an abandoned utterance can report a
     * boundary or two before the engine has finished stopping it, and a page
     * turn from a sentence nobody is listening to is a page turn out of
     * nowhere.
     */
    spoken.onboundary = (event) => {
      if (mine !== this.generation || !this.speaking) return
      this.onWord(line, event.charIndex)
    }

    spoken.onend = next
    // An engine that fails on one sentence must not end the reading. Moving on
    // is right: the usual cause is a single unpronounceable token, and the
    // sentence after it is fine.
    spoken.onerror = next

    this.speech.speak(spoken)
  }
}
