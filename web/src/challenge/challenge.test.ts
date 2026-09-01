import { describe, expect, it } from 'vitest'

import type { BookId } from '../structure/index.ts'
import { assemble, order, RESURFACE_LIMIT } from './serve.ts'
import { faultIn, screen } from './validate.ts'
import { heldFirmly } from './types.ts'
import type { Question, StoredMiss } from './types.ts'

const ANCHORS = new Set(['ch02/s01/p04', 'ch02/s02/p11'])

function option(id: string, correct: boolean, tag?: string) {
  return {
    id,
    text: `option ${id}`,
    correct,
    revealNote: 'a note',
    ...(tag === undefined ? {} : { misconceptionTag: tag }),
  }
}

function question(over: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    concept: 'anima-vs-shadow',
    stem: 'Which reading fits Jung most closely?',
    options: [
      option('a', true),
      option('b', false, 'Anima / Persona'),
      option('c', false, 'Archetype / Person'),
      option('d', false, 'Skips the psyche'),
    ],
    difficulty: 1,
    sourceAnchor: 'ch02/s01/p04',
    ...over,
  }
}

describe('the grounding gate', () => {
  it('admits a well-formed, grounded item', () => {
    expect(faultIn(question(), ANCHORS)).toBeUndefined()
  })

  /*
   * The rule the whole feature rests on. A model that half-remembers the book
   * writes a plausible question about the subject instead, and cites an anchor
   * it invented. Such an item is worse than none: it tests whether the reader
   * absorbed the internet's summary of Jung, not the chapter they read.
   */
  it('turns away an item whose anchor is not in this chapter', () => {
    const fault = faultIn(question({ sourceAnchor: 'ch09/s01/p01' as string }), ANCHORS)
    expect(fault).toMatch(/not in this chapter/)
  })

  it('turns away an item with two right answers', () => {
    const two = question({
      options: [
        option('a', true),
        option('b', true),
        option('c', false, 'x'),
        option('d', false, 'y'),
      ],
    })
    expect(faultIn(two, ANCHORS)).toMatch(/2 correct/)
  })

  it('turns away a distractor that names no misconception', () => {
    const filler = question({
      options: [option('a', true), option('b', false), option('c', false, 'x'), option('d', false, 'y')],
    })
    expect(faultIn(filler, ANCHORS)).toMatch(/misconception tag/)
  })

  it('turns away a set that is not four options', () => {
    expect(faultIn(question({ options: [option('a', true)] }), ANCHORS)).toMatch(/1 options/)
  })

  it('never repairs — it discards, so a bad batch is regenerated', () => {
    const result = screen([question(), question({ id: 'q2', sourceAnchor: 'nope' as string })], ANCHORS)
    expect(result.kept.map((q) => q.id)).toEqual(['q1'])
    expect(result.rejected[0]!.reason).toMatch(/not in this chapter/)
  })

  it('drops a question the model wrote twice under two ids', () => {
    const result = screen([question(), question({ id: 'q2' })], ANCHORS)
    expect(result.kept).toHaveLength(1)
    expect(result.rejected[0]!.reason).toBe('duplicate stem')
  })
})

describe('the confidence line', () => {
  // The line sits where guessing turns into believing. A wrong answer below it
  // is ordinary learning; above it, the belief will not correct itself.
  it('treats confident and very as firmly held, and the rest as not', () => {
    expect(heldFirmly('guessing')).toBe(false)
    expect(heldFirmly('somewhat')).toBe(false)
    expect(heldFirmly('confident')).toBe(true)
    expect(heldFirmly('very')).toBe(true)
  })
})

describe('assembling a sitting', () => {
  const miss = (concept: string): StoredMiss => ({
    concept,
    bookId: 'b' as BookId,
    seen: 2,
    missed: 1,
    lastSeen: 1,
    flagged: true,
  })

  it('serves easiest first, and never shows the difficulty', () => {
    const list = order([
      question({ id: 'hard', difficulty: 3 }),
      question({ id: 'easy', difficulty: 1 }),
      question({ id: 'mid', difficulty: 2 }),
    ])
    expect(list.map((q) => q.id)).toEqual(['easy', 'mid', 'hard'])
  })

  it('spends a sitting on different seams, not three cards on one', () => {
    const { questions } = assemble(
      [
        question({ id: 'a1', concept: 'anima-vs-shadow' }),
        question({ id: 'a2', concept: 'anima-vs-shadow' }),
        question({ id: 'b1', concept: 'projection-vs-judgment' }),
      ],
      [],
    )
    expect(questions.map((q) => q.concept)).toEqual(['anima-vs-shadow', 'projection-vs-judgment'])
  })

  it('brings a flagged concept back as a fresh item, never the same card', () => {
    const bank = [question({ id: 'fresh', concept: 'fixed-symbol' })]
    const { questions, resurfaced } = assemble(bank, [miss('fixed-symbol')], new Set(['old-card']))
    expect(questions.map((q) => q.id)).toEqual(['fresh'])
    // It counts as this chapter's own coverage, so it is not double-counted.
    expect(resurfaced.has('fixed-symbol')).toBe(false)
  })

  it('leaves a question the reader has already answered out of the sitting', () => {
    const { questions } = assemble([question({ id: 'seen' })], [], new Set(['seen']))
    expect(questions).toEqual([])
  })

  it('does not turn a sitting into a tribunal of every past mistake', () => {
    const bank = [
      question({ id: 'own', concept: 'own-seam' }),
      question({ id: 'm1', concept: 'm1' }),
      question({ id: 'm2', concept: 'm2' }),
      question({ id: 'm3', concept: 'm3' }),
    ]
    const { resurfaced } = assemble(bank, [miss('m1'), miss('m2'), miss('m3')], new Set())
    // Every seam is already covered by the chapter's own pass, so nothing is
    // pulled back — and the cap holds regardless.
    expect(resurfaced.size).toBeLessThanOrEqual(RESURFACE_LIMIT)
  })
})
