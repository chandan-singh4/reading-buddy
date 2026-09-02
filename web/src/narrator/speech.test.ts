import { describe, expect, it } from 'vitest'

import { AloudReader, type Utterance } from '../reader/readAloud.ts'
import type { NarratorEngine, Saying } from './NarratorEngine.ts'
import { speechOf, utteranceOf } from './speech.ts'
import { DEFAULT_NARRATOR } from './voices.ts'

/**
 * A narrator that records what it was asked to say and ends it on command.
 *
 * The real engine needs a Worker and an `AudioContext`, neither of which jsdom
 * has and both of which would be testing the browser rather than this code. The
 * thing worth proving is the wiring: what the reading rules ask for, what the
 * engine is told, and — the one that bit — how many times a sentence advances.
 */
function fakeEngine() {
  const asked: Saying[] = []
  const ends: (() => void)[] = []
  const errors: ((message: string) => void)[] = []
  let stops = 0

  const engine = {
    play(saying: Saying, told: { onEnd?: () => void; onError?: (message: string) => void }) {
      asked.push(saying)
      if (told.onEnd) ends.push(told.onEnd)
      if (told.onError) errors.push(told.onError)
      return asked.length
    },
    stop() {
      stops += 1
    },
  } as unknown as NarratorEngine

  return {
    engine,
    asked,
    errors,
    get stops() {
      return stops
    },
    /** The sentence being said finishes, the way real audio running out does. */
    end() {
      ends.shift()?.()
    },
  }
}

const plan: Utterance[] = [
  { anchor: 'ch01/s01/p01' as Utterance['anchor'], text: 'One.', at: 0 },
  { anchor: 'ch01/s01/p01' as Utterance['anchor'], text: 'Two.', at: 1 },
  { anchor: 'ch01/s01/p02' as Utterance['anchor'], text: 'Three.', at: 0 },
]

describe('the narrator behind the reading rules', () => {
  it('says the sentences in order, one at a time', () => {
    const fake = fakeEngine()
    const reader = new AloudReader(speechOf(fake.engine), utteranceOf)

    reader.start(plan)
    expect(fake.asked.map((one) => one.text)).toEqual(['One.'])

    fake.end()
    fake.end()
    expect(fake.asked.map((one) => one.text)).toEqual(['One.', 'Two.', 'Three.'])
  })

  it('passes the chosen voice and speed straight through', () => {
    const fake = fakeEngine()
    const reader = new AloudReader(speechOf(fake.engine), utteranceOf)

    reader.start(plan, 0, { voice: { id: 'bm_george' }, rate: 1.25 })
    expect(fake.asked[0]).toEqual({ text: 'One.', voice: 'bm_george', speed: 1.25 })
  })

  it('falls back to the default voice when none was chosen', () => {
    const fake = fakeEngine()
    new AloudReader(speechOf(fake.engine), utteranceOf).start(plan)
    expect(fake.asked[0]?.voice).toBe(DEFAULT_NARRATOR)
  })

  it('does not take a failure as a second ending', () => {
    /*
     * The regression this guards. The reading rules set `onend` and `onerror`
     * to the same function, because a browser engine fires exactly one of them.
     * This engine reports a failure *and then* reports the sentence as done —
     * so passing both through would skip two sentences for one fault.
     */
    const fake = fakeEngine()
    new AloudReader(speechOf(fake.engine), utteranceOf).start(plan)

    expect(fake.errors).toHaveLength(0)

    fake.end()
    expect(fake.asked.map((one) => one.text)).toEqual(['One.', 'Two.'])
  })

  it('silences the narrator when the reader stops', () => {
    const fake = fakeEngine()
    const reader = new AloudReader(speechOf(fake.engine), utteranceOf)

    reader.start(plan)
    reader.stop()

    expect(fake.stops).toBeGreaterThan(0)
    // And nothing new was asked for. `stop` used to be indistinguishable from
    // "this section finished", which carried the reader into the next chapter.
    expect(fake.asked).toHaveLength(1)
  })
})
