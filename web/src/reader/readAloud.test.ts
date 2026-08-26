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

/*
 * A sentence that runs off the foot of the page.
 *
 * The reported fault, twice over: the page turned a sentence late, because
 * knowing where the voice was inside a sentence depended first on an event many
 * engines never send, and then on a guess at how fast prose is spoken. The
 * sentence is cut at the page break instead, and the engine's own "this
 * utterance ended" says exactly when to turn.
 */
describe('a sentence that runs off the page', () => {
  const long: Utterance[] = [
    { anchor: anchor('p1'), text: 'Half of this is here and half is over there.', at: 0 },
    { anchor: anchor('p1'), text: 'After.', at: 1 },
  ]

  /** The page ends after "here and ". */
  const breakAt = (_line: Utterance, from: number) => (from === 0 ? 25 : null)

  it('says the part on this page first, then turns, then says the rest', () => {
    const fake = fakeSpeech()
    const turns: number[] = []
    const reader = new AloudReader(fake.speech, fake.make, {
      breakAt,
      onCross: (_line, at) => turns.push(at),
    })

    reader.start(long)
    expect(fake.spoken()).toEqual(['Half of this is here and '])
    expect(turns).toEqual([])

    fake.finish()
    expect(turns).toEqual([25])
    expect(fake.spoken()).toEqual(['Half of this is here and ', 'half is over there.'])
  })

  it('goes on to the next sentence after the far half', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make, { breakAt })
    reader.start(long)
    fake.finish()
    fake.finish()
    expect(fake.spoken()[2]).toBe('After.')
  })

  it('does not turn the page for a sentence that fits', () => {
    const fake = fakeSpeech()
    const turns: number[] = []
    const reader = new AloudReader(fake.speech, fake.make, {
      onCross: (_line, at) => turns.push(at),
    })
    reader.start(plan)
    fake.finish()
    expect(turns).toEqual([])
    expect(fake.spoken()).toEqual(['One.', 'Two.'])
  })

  it('refuses a break that would say nothing, or that is past the end', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make, {
      // Both are answers a measurement can honestly give, and both would leave
      // the reading stuck asking the same question of the same words.
      breakAt: () => 0,
    })
    reader.start(long)
    expect(fake.spoken()).toEqual(['Half of this is here and half is over there.'])

    const other = fakeSpeech()
    new AloudReader(other.speech, other.make, { breakAt: (line) => line.text.length }).start(long)
    expect(other.spoken()).toEqual(['Half of this is here and half is over there.'])
  })

  it('does not turn the page from a sentence it has abandoned', () => {
    const fake = fakeSpeech()
    const turns: number[] = []
    const reader = new AloudReader(fake.speech, fake.make, {
      breakAt,
      onCross: (_line, at) => turns.push(at),
    })
    reader.start(long)
    reader.stop()
    fake.finish()
    expect(turns).toEqual([])
  })

  it('starts the far half again when a pause lands in it', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make, { breakAt })
    reader.start(long)
    fake.finish()
    reader.pause()
    reader.resume()
    expect(fake.spoken()[fake.spoken().length - 1]).toBe('half is over there.')
  })

  it('starts a skipped-to sentence at its beginning, not mid-way', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make, { breakAt })
    reader.start(long)
    fake.finish()
    reader.skip(1)
    expect(fake.spoken()[fake.spoken().length - 1]).toBe('After.')
  })
})

describe('the chosen voice', () => {
  it('sets the language as well as the voice', () => {
    const fake = fakeSpeech()
    const reader = new AloudReader(fake.speech, fake.make)
    const voice = { name: 'Daniel', lang: 'en-GB' } as SpeechSynthesisVoice
    reader.start(plan, 0, { voice })
    // Several engines pick a voice from the language and ignore `voice` when
    // the language is unset. That is the "I choose a voice and nothing changes"
    // fault, reported from the phone.
    expect(fake.said[0]?.lang).toBe('en-GB')
    expect(fake.said[0]?.voice).toBe(voice)
  })

  it('leaves the language alone when no voice is chosen', () => {
    const fake = fakeSpeech()
    new AloudReader(fake.speech, fake.make).start(plan)
    expect(fake.said[0]?.lang).toBeUndefined()
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
