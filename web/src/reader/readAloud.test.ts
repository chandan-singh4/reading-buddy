import { describe, expect, it, vi } from 'vitest'
import { AloudReader, msToSpeak, planOf, startOf } from './readAloud.ts'
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
    onboundary: null,
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

  /*
   * The reported fault: "I select something in the middle of the paragraph and
   * it starts reading from the start of the paragraph, no matter where I
   * select." An anchor names a paragraph. The words say which sentence.
   */
  it('starts at the sentence the reader picked, not the paragraph', () => {
    expect(startOf(plan, anchor('a1'), 'Two.')).toBe(1)
  })

  it('starts at the sentence a part-selection begins in', () => {
    const long: Utterance[] = [
      { anchor: anchor('p1'), text: 'The first sentence of the paragraph.', at: 0 },
      { anchor: anchor('p1'), text: 'The second one, which was chosen.', at: 1 },
    ]
    expect(startOf(long, anchor('p1'), 'second one, which was chos')).toBe(1)
  })

  it('starts at the first of the sentences a wide selection covers', () => {
    const long: Utterance[] = [
      { anchor: anchor('p1'), text: 'Alpha beta gamma delta.', at: 0 },
      { anchor: anchor('p1'), text: 'Epsilon zeta eta theta.', at: 1 },
    ]
    expect(startOf(long, anchor('p1'), 'Alpha beta gamma delta. Epsilon zeta')).toBe(0)
  })

  it('ignores spacing and case, which the page and the store disagree on', () => {
    expect(startOf(plan, anchor('a1'), '  two.  ')).toBe(1)
  })

  it('falls back to the paragraph when the words are not among its sentences', () => {
    expect(startOf(plan, anchor('a1'), 'words from another book entirely')).toBe(0)
  })
})

describe('msToSpeak', () => {
  it('is longer for more text and shorter for a faster voice', () => {
    expect(msToSpeak(200)).toBeGreaterThan(msToSpeak(100))
    expect(msToSpeak(200, 2)).toBeLessThan(msToSpeak(200, 1))
  })

  it('puts ordinary prose in the range a person actually reads it', () => {
    // 100 characters is about 18 words. Between five and ten seconds is the
    // band every real reading falls in; tighter than that is false precision.
    expect(msToSpeak(600)).toBeGreaterThan(30_000)
    expect(msToSpeak(600)).toBeLessThan(60_000)
  })

  it('answers zero for nothing, and treats a nonsense rate as normal', () => {
    expect(msToSpeak(0)).toBe(0)
    expect(msToSpeak(100, 0)).toBe(msToSpeak(100, 1))
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
    const reader = new AloudReader(fake.speech, fake.make, { onPlace: (at) => places.push(at) })
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
    const reader = new AloudReader(fake.speech, fake.make, { onFinished: done })

    reader.start(plan)
    reader.stop()
    expect(done).not.toHaveBeenCalled()

    reader.start(plan)
    fake.finish()
    fake.finish()
    fake.finish()
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('reports each word, with how far into the sentence it is', () => {
    const fake = fakeSpeech()
    const words: [string, number][] = []
    const reader = new AloudReader(fake.speech, fake.make, {
      onWord: (line, at) => words.push([line.text, at]),
    })
    reader.start(plan)
    fake.said[0]?.onboundary?.({ charIndex: 0 })
    fake.said[0]?.onboundary?.({ charIndex: 4 })
    expect(words).toEqual([
      ['One.', 0],
      ['One.', 4],
    ])
  })

  it('ignores a word reported by a sentence it has abandoned', () => {
    const fake = fakeSpeech()
    const words: number[] = []
    const reader = new AloudReader(fake.speech, fake.make, {
      onWord: (_line, at) => words.push(at),
    })
    reader.start(plan)
    reader.stop()
    fake.said[0]?.onboundary?.({ charIndex: 2 })
    expect(words).toEqual([])
  })

  it('does not say the plan is finished when a skip runs off an end', () => {
    const fake = fakeSpeech()
    const done = vi.fn()
    const reader = new AloudReader(fake.speech, fake.make, { onFinished: done })
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
    const reader = new AloudReader(fake.speech, fake.make, { onPlace: place })
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
