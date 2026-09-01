import { describe, expect, it } from 'vitest'

import type { BookId } from '../structure/index.ts'
import { assemble, order } from './serve.ts'
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

  it('serves easiest first inside a seam, and never shows the difficulty', () => {
    const list = order([
      question({ id: 'hard', difficulty: 3 }),
      question({ id: 'easy', difficulty: 1 }),
      question({ id: 'mid', difficulty: 2 }),
    ])
    expect(list.map((q) => q.id)).toEqual(['easy', 'mid', 'hard'])
  })

  it('never puts two questions on one seam back to back', () => {
    const { questions } = assemble(
      [
        question({ id: 'a1', concept: 'anima-vs-shadow' }),
        question({ id: 'a2', concept: 'anima-vs-shadow' }),
        question({ id: 'b1', concept: 'projection-vs-judgment' }),
      ],
      [],
    )
    // All three are served. None is dropped for sharing a seam — the bank is
    // paid for, and the reader can keep going as long as they like.
    expect(questions.map((q) => q.id)).toEqual(['a1', 'b1', 'a2'])
  })

  it('puts a flagged seam at the front rather than at the back of the queue', () => {
    const bank = [
      question({ id: 'ordinary', concept: 'ordinary-seam' }),
      question({ id: 'fresh', concept: 'fixed-symbol' }),
    ]
    const { questions, resurfaced } = assemble(bank, [miss('fixed-symbol')])
    expect(questions.map((q) => q.id)).toEqual(['fresh', 'ordinary'])
    expect(resurfaced.has('fixed-symbol')).toBe(true)
  })

  it('leaves a question the reader has already answered out of the sitting', () => {
    const { questions } = assemble([question({ id: 'seen' })], [], new Set(['seen']))
    expect(questions).toEqual([])
  })

  it('never serves the same card twice, however often a concept is flagged', () => {
    const bank = [question({ id: 'only', concept: 'fixed-symbol' })]
    const { questions } = assemble(bank, [miss('fixed-symbol')], new Set(['only']))
    expect(questions).toEqual([])
  })
})

describe('a chapter that never runs out on a fixed count', () => {
  it('keeps every question, however many share a seam', () => {
    // The old bank served one card per seam and dropped the rest. A growing
    // bank must not throw away work already paid for.
    const bank = [
      question({ id: 'a1', concept: 'seam-a' }),
      question({ id: 'a2', concept: 'seam-a' }),
      question({ id: 'a3', concept: 'seam-a' }),
      question({ id: 'b1', concept: 'seam-b' }),
    ]
    const { questions } = assemble(bank, [])
    expect(questions).toHaveLength(4)
    expect(new Set(questions.map((q) => q.id)).size).toBe(4)
  })

  it('retires an answered question for good', () => {
    const bank = [question({ id: 'a1' }), question({ id: 'a2', concept: 'seam-b' })]
    const first = assemble(bank, [], new Set())
    expect(first.questions).toHaveLength(2)

    const after = assemble(bank, [], new Set(['a1', 'a2']))
    expect(after.questions).toEqual([])
  })

  it('spreads a long run of one seam out across the others', () => {
    const { questions } = assemble(
      [
        question({ id: 'a1', concept: 'seam-a' }),
        question({ id: 'a2', concept: 'seam-a' }),
        question({ id: 'a3', concept: 'seam-a' }),
        question({ id: 'b1', concept: 'seam-b' }),
        question({ id: 'c1', concept: 'seam-c' }),
      ],
      [],
    )
    // No two neighbours share a seam until seam-a is the only one left.
    const seams = questions.map((q) => q.concept)
    expect(seams.slice(0, 3)).toEqual(['seam-a', 'seam-b', 'seam-c'])
  })
})
