import { describe, expect, it, vi } from 'vitest'
import { AloudReader, planOf, startOf } from './readAloud.ts'
import type { SpeechLike, SpokenLike, Utterance } from './readAloud.ts'
import type { Anchor, Paragraph } from '../structure/index.ts'

const block = (over: Partial<Paragraph>): Paragraph =>
  ({ kind: 'prose', anchor: 'a1', text: '', ...over }) as Paragraph

/** A speech engine that says nothing but remembers what it was asked to say. */
function fakeSpeech() {
  const said: SpokenLike[] = []
  const calls: string[] = []
  const speech: SpeechLike = {
    speak: (one) => {
      said.push(one)
      calls.push('speak')
    },
    cancel: () => calls.push('cancel'),
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
  }
  const make = (text: string): SpokenLike => ({
    text,
    voice: null,
    rate: 1,
    onend: null,
    onerror: null,
  })
  /** What a real engine does when a sentence finishes — or when it is cancelled. */
  const finish = (at = said.length - 1) => said[at]?.onend?.()
  return { speech, make, said, calls, finish, spoken: () => said.map((one) => one.text) }
}

const anchor = (name: string) => name as unknown as Anchor

const plan: Utterance[] = [
  { anchor: anchor('a1'), text: 'One.', at: 0 },
  { anchor: anchor('a1'), text: 'Two.', at: 1 },
  { anchor: anchor('a2'), text: 'Three.', at: 0 },
]

describe('planOf', () => {
  it('cuts a paragraph into sentences and keeps its anchor', () => {
    const made = planOf([block({ anchor: anchor('p1'), text: 'One. Two.' })])
    expect(made).toEqual([
      { anchor: anchor('p1'), text: 'One.', at: 0 },
      { anchor: anchor('p1'), text: 'Two.', at: 1 },
    ])
  })

  it('reads a list one line at a time', () => {
    const made = planOf([block({ kind: 'list', anchor: anchor('p1'), text: 'Milk\nEggs' })])
    expect(made.map((one) => one.text)).toEqual(['Milk', 'Eggs'])
  })

  it('reads a heading', () => {
    expect(planOf([block({ kind: 'heading', text: 'Chapter One' })])).toHaveLength(1)
  })

  it('skips a table, a code block and a figure', () => {
    const made = planOf([
      block({ kind: 'table', text: 'a b c' }),
      block({ kind: 'code', text: 'let x = 1' }),
      block({ kind: 'figure', text: '[Figure]' }),
    ])
    expect(made).toEqual([])
  })

  it('skips an empty paragraph', () => {
    expect(planOf([block({ text: '   ' })])).toEqual([])
  })
})

describe('startOf', () => {
  it('finds the first sentence of a paragraph', () => {
    expect(startOf(plan, anchor('a2'))).toBe(2)
  })

  it('starts at the top when the anchor is absent or missing', () => {
    expect(startOf(plan, anchor('nowhere'))).toBe(0)
    expect(startOf(plan, undefined)).toBe(0)
  })
})

describe('AloudReader', () => {
  it('says one sentence, then the next when it ends', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    reader.start(plan)
    expect(fake.spoken()).toEqual(['One.'])
    fake.finish()
    expect(fake.spoken()).toEqual(['One.', 'Two.'])
  })

  it('reports the place as it moves, and null at the end', () => {
    const fake = fakeSpeech()
    const places: (number | null)[] = []
    const reader = new AloudReader(fake.speech, fake.make, (at) => places.push(at))
    reader.start(plan)
    fake.finish()
    fake.finish()
    fake.finish()
    expect(places).toEqual([0, 1, 2, null])
    expect(reader.playing).toBe(false)
  })

  /*
   * The reported fault, and the reason the two endings are separate callbacks.
   *
   * Stop and "read to the end" both leave the reader silent with no place. They
   * mean opposite things. While one callback carried both, pressing stop was
   * read as "this section is finished", so the screen moved to the next chapter
   * and started reading it — and pressing stop again moved on again.
   */
  it('says the plan is finished only when it is read to the end', () => {
    const fake = fakeSpeech()
    const done = vi.fn()
    const reader = new AloudReader(fake.speech, fake.make, () => {}, done)

    reader.start(plan)
    reader.stop()
    expect(done).not.toHaveBeenCalled()

    reader.start(plan)
    fake.finish()
    fake.finish()
    fake.finish()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('does not say the plan is finished when a skip runs off an end', () => {
    const fake = fakeSpeech()
    const done = vi.fn()
    const reader = new AloudReader(fake.speech, fake.make, () => {}, done)
    reader.start(plan)
    reader.skip(-1)
    expect(done).not.toHaveBeenCalled()
  })

  it('starts part way in', () => {
    const fake = fakeSpeech()
    new AloudReader(fake.speech, fake.make).start(plan, 2)
    expect(fake.spoken()).toEqual(['Three.'])
  })

  it('does not carry on after the sentence a stop cancelled ends', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    reader.start(plan)
    reader.stop()
    // A real engine fires onend for the utterance cancel() cut short.
    fake.finish()
    expect(fake.spoken()).toEqual(['One.'])
    expect(reader.playing).toBe(false)
  })

  it('does not carry on after the sentence a pause cancelled ends', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    reader.start(plan)
    reader.pause()
    fake.finish()
    expect(fake.spoken()).toEqual(['One.'])
    expect(reader.playing).toBe(false)
  })

  it('says the paused sentence again on resume', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    reader.start(plan)
    fake.finish()
    reader.pause()
    reader.resume()
    expect(fake.spoken()).toEqual(['One.', 'Two.', 'Two.'])
    expect(reader.playing).toBe(true)
  })

  it('ignores a resume when it is already playing', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    reader.start(plan)
    reader.resume()
    expect(fake.spoken()).toEqual(['One.'])
  })

  it('skips forward and back while playing', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    reader.start(plan)
    reader.skip(1)
    expect(fake.spoken()).toEqual(['One.', 'Two.'])
    reader.skip(-1)
    expect(fake.spoken()).toEqual(['One.', 'Two.', 'One.'])
  })

  it('moves the place but stays quiet when a paused reader skips', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    reader.start(plan)
    reader.pause()
    reader.skip(1)
    expect(fake.spoken()).toEqual(['One.'])
    expect(reader.index).toBe(1)
  })

  it('stops when a skip runs off either end', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    reader.start(plan)
    reader.skip(-1)
    expect(reader.playing).toBe(false)
    reader.start(plan, 2)
    reader.skip(1)
    expect(reader.playing).toBe(false)
  })

  it('uses the new voice and speed from the next sentence', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    const voice = { name: 'Daniel' } as SpeechSynthesisVoice
    reader.start(plan, 0, { rate: 1 })
    reader.revoice({ voice, rate: 1.5 })
    const last = fake.said[fake.said.length - 1]
    expect(last?.text).toBe('One.')
    expect(last?.rate).toBe(1.5)
    expect(last?.voice).toBe(voice)
  })

  it('leaves a paused reader quiet when the voice changes', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    reader.start(plan)
    reader.pause()
    reader.revoice({ rate: 2 })
    expect(fake.spoken()).toEqual(['One.'])
  })

  it('moves on when the engine fails on one sentence', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    reader.start(plan)
    fake.said[0]?.onerror?.()
    expect(fake.spoken()).toEqual(['One.', 'Two.'])
  })

  it('says nothing for an empty plan', () => {
    const fake = fakeSpeech()
    const place = vi.fn()
    const reader = new AloudReader(fake.speech, fake.make, place)
    reader.start([])
    expect(fake.spoken()).toEqual([])
    expect(place).toHaveBeenCalledWith(null)
    expect(reader.playing).toBe(false)
  })

  it('clears the old sentence before it starts somewhere else', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    reader.start(plan)
    reader.start(plan, 2)
    expect(fake.calls.filter((one) => one === 'cancel')).toHaveLength(2)
    expect(fake.spoken()).toEqual(['One.', 'Three.'])
  })
})
