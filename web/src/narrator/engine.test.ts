// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NarratorEngine } from './NarratorEngine.ts'
import type { ToWorker } from './messages.ts'

/**
 * The engine's queueing, with the browser stubbed out.
 *
 * What is proved here is the bookkeeping: what the worker is asked for, in what
 * order, and what survives. That is where the "insanely long pause between
 * every sentence" lived, and it was invisible from outside — the audio was
 * correct, the order was correct, and every sentence still waited.
 *
 * The audio itself is not proved here and could not be: jsdom has no
 * `AudioContext`, and a fake one would be a test of the fake.
 */

let sent: ToWorker[] = []

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  postMessage(message: ToWorker) {
    sent.push(message)
  }
  terminate() {}
}

beforeEach(() => {
  sent = []
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const line = (text: string) => ({ text, voice: 'af_heart', speed: 1 })

/** Just the sentences the worker was asked to make, in the order it was asked. */
const asked = () =>
  sent.filter((one): one is Extract<ToWorker, { type: 'speak' }> => one.type === 'speak')

const cancelled = () =>
  sent.filter((one): one is Extract<ToWorker, { type: 'cancel' }> => one.type === 'cancel')

describe('priming', () => {
  it('asks for a sentence once, however often it is primed', () => {
    /*
     * The screen primes the next three sentences every time the reading moves,
     * so the same sentence is primed three times over. Asking the model for it
     * three times is not merely waste — the duplicates queue ahead of the line
     * the reader is actually waiting for.
     */
    const engine = new NarratorEngine()

    const first = engine.prime(line('One.'))
    const again = engine.prime(line('One.'))

    expect(again).toBe(first)
    expect(asked()).toHaveLength(1)
  })

  it('treats a different voice or speed as a different sentence', () => {
    const engine = new NarratorEngine()

    engine.prime(line('One.'))
    engine.prime({ text: 'One.', voice: 'bm_george', speed: 1 })
    engine.prime({ text: 'One.', voice: 'af_heart', speed: 1.5 })

    expect(asked()).toHaveLength(3)
  })
})

describe('what survives the cap', () => {
  it('keeps the sentence about to be spoken', () => {
    /*
     * The regression. The cap used to drop the *oldest* unplayed job, and the
     * oldest unplayed job is always the next one to be spoken. So the lookahead
     * destroyed itself one step before it was used, every sentence arrived as a
     * miss, and the reader waited for it to be made from scratch.
     */
    const engine = new NarratorEngine()

    engine.prime(line('One.'))
    engine.prime(line('Two.'))
    engine.prime(line('Three.'))

    expect(cancelled()).toHaveLength(0)

    engine.play(line('One.'), {})

    // Nothing new was asked for: the sentence was already made and waiting.
    expect(asked().map((one) => one.text)).toEqual(['One.', 'Two.', 'Three.'])
  })

  it('drops an orphan once it is older than the whole lookahead', () => {
    // A sentence cut in half by a page break leaves the whole one unclaimed.
    // It must go eventually, or an hour of listening keeps an hour of audio.
    const engine = new NarratorEngine()

    const orphan = engine.prime(line('Orphaned by a page break.'))
    for (const text of ['One.', 'Two.', 'Three.', 'Four.']) engine.prime(line(text))

    expect(cancelled().map((one) => one.job)).toContain(orphan)
  })
})

describe('a sentence the reader is waiting on', () => {
  it('jumps the queue when it was never primed', () => {
    /*
     * A miss means a first play, a skip, or the half-sentence after a page
     * turn. Queued behind the lookahead it would be made third, so the reader
     * would wait for two sentences they have not reached yet.
     */
    const engine = new NarratorEngine()

    engine.prime(line('Later one.'))
    engine.prime(line('Later two.'))
    engine.play(line('Now, please.'), {})

    const urgent = asked().filter((one) => one.urgent)
    expect(urgent.map((one) => one.text)).toEqual(['Now, please.'])
  })

  it('does not jump the queue when it was already made', () => {
    const engine = new NarratorEngine()

    engine.prime(line('One.'))
    engine.play(line('One.'), {})

    expect(asked().filter((one) => one.urgent)).toHaveLength(0)
  })
})
