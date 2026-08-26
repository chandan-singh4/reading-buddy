import { describe, expect, it } from 'vitest'

import {
  canGroupByChapter,
  groupByChapter,
  inNoteOrder,
  notesUnder,
  type NoteLike,
} from './notes.ts'
import type { Anchor } from '../structure/index.ts'

function note(
  id: string,
  anchor: string,
  author: 'you' | 'claude' = 'you',
  fromThread?: string,
): NoteLike {
  return {
    id,
    anchor: anchor as Anchor,
    author,
    createdAt: `2026-01-0${id}T00:00:00.000Z`,
    ...(fromThread ? { fromThread } : {}),
  }
}

describe('the order notes read in', () => {
  it('reads in the book’s order, not the order they were written', () => {
    const ordered = inNoteOrder([
      note('3', '[ch02-s01-p001]'),
      note('1', '[ch01-s01-p004]'),
      note('2', '[ch01-s02-p001]'),
    ])

    expect(ordered.map((row) => row.id)).toEqual(['1', '2', '3'])
  })

  it('keeps a note with a broken anchor, at the end', () => {
    const ordered = inNoteOrder([note('2', 'not-an-anchor'), note('1', '[ch01-s01-p001]')])

    expect(ordered.map((row) => row.id)).toEqual(['1', '2'])
  })
})

describe('the chips', () => {
  const all = [
    note('1', '[ch01-s01-p001]', 'you'),
    note('2', '[ch01-s01-p002]', 'claude'),
    note('3', '[ch02-s01-p001]', 'you'),
  ]

  it('shows one author at a time', () => {
    expect(notesUnder(all, 'you').map((row) => row.id)).toEqual(['1', '3'])
    expect(notesUnder(all, 'claude').map((row) => row.id)).toEqual(['2'])
  })

  it('hides nothing under "All"', () => {
    expect(notesUnder(all, 'all')).toHaveLength(3)
  })

  it('splits Veda’s conversations from the lines kept out of them', () => {
    /*
     * Both rows are Veda's, so `author` cannot tell them apart. `fromThread` is
     * the fact that does it: a kept line names the exchange it came out of.
     * Without this split, keeping one sentence would put a near-duplicate of
     * the whole conversation into the list beside it.
     */
    const rows = [
      note('1', '[ch01-s01-p001]', 'claude'),
      note('2', '[ch01-s01-p002]', 'claude', 'thread-9'),
      note('3', '[ch01-s01-p003]', 'you'),
    ]

    expect(notesUnder(rows, 'claude').map((row) => row.id)).toEqual(['1'])
    expect(notesUnder(rows, 'vedaQuotes').map((row) => row.id)).toEqual(['2'])
    expect(notesUnder(rows, 'all')).toHaveLength(3)
  })

  it('offers chapter grouping everywhere except the kept words', () => {
    // A word has no anchor, so it belongs to no chapter. Offering the switch
    // there would be a control that does nothing.
    expect(canGroupByChapter('all')).toBe(true)
    expect(canGroupByChapter('vedaQuotes')).toBe(true)
    expect(canGroupByChapter('words')).toBe(false)
  })
})

describe('grouping by chapter', () => {
  it('opens one group per chapter, in order', () => {
    const groups = groupByChapter([
      note('1', '[ch01-s01-p001]'),
      note('2', '[ch01-s02-p001]'),
      note('3', '[ch04-s01-p001]'),
    ])

    expect(groups.map((group) => group.chapter)).toEqual([1, 4])
    expect(groups[0]?.notes).toHaveLength(2)
  })

  it('files a broken anchor under chapter 0 rather than dropping it', () => {
    const groups = groupByChapter([note('1', '[ch01-s01-p001]'), note('2', 'rubbish')])

    expect(groups.map((group) => group.chapter)).toEqual([1, 0])
  })
})
