import { describe, expect, it } from 'vitest'

import type { ReadingPosition } from '../storage/db.ts'
import type { Anchor, BookId, ChapterIndex } from '../structure/index.ts'
import { booksByRecency, finishedChapters, plan, titledSections } from './queue.ts'

/*
 * The rules the reader stated, in order:
 *
 * 1. Summarise chapters that are finished.
 * 2. The most recently opened book goes first, and runs on its own.
 * 3. Every other book waits for a yes in the bell.
 *
 * All three are here, because all three cost money when they are wrong.
 */

const A = 'book-a' as BookId
const B = 'book-b' as BookId

function chapters(...numbers: number[]): ChapterIndex[] {
  return numbers.map((chapter) => ({
    chapter,
    title: `Chapter ${chapter}`,
    path: `ch0${chapter}` as ChapterIndex['path'],
    sections: [],
  }))
}

function at(bookId: BookId, anchor: string, when: string, percent?: number): ReadingPosition {
  return { bookId, anchor: anchor as Anchor, at: when, ...(percent === undefined ? {} : { percent }) }
}

const NOTHING_DONE = new Set<string>()

describe('which chapters are finished', () => {
  it('counts the chapters before the one being read', () => {
    // Reading inside chapter 4: one, two and three are behind them.
    expect(finishedChapters(chapters(1, 2, 3, 4, 5), at(A, '[ch04-s02-p007]', '2026-08-27'))).toEqual([
      1, 2, 3,
    ])
  })

  it('does not count the chapter being read', () => {
    // The load-bearing one. A chapter in progress would be summarised now and
    // be wrong within the hour, having cost a call to be wrong.
    const done = finishedChapters(chapters(1, 2, 3), at(A, '[ch02-s01-p001]', '2026-08-27'))
    expect(done).not.toContain(2)
  })

  it('counts the last chapter once the book is finished', () => {
    // Without this, the final chapter of every book the reader ever finishes
    // would never be summarised — the anchor never moves past it.
    expect(
      finishedChapters(chapters(1, 2, 3), at(A, '[ch03-s04-p020]', '2026-08-27', 100)),
    ).toEqual([1, 2, 3])
  })

  it('finds nothing in a book that was never opened', () => {
    expect(finishedChapters(chapters(1, 2, 3), undefined)).toEqual([])
  })

  it('finds nothing when the stored anchor cannot be read', () => {
    // A corrupt position must not be read as "chapter zero, everything done".
    expect(finishedChapters(chapters(1, 2, 3), at(A, 'not-an-anchor', '2026-08-27'))).toEqual([])
  })
})

describe('which book goes first', () => {
  it('puts the most recently opened book first', () => {
    const order = booksByRecency([
      at(A, '[ch01-s01-p001]', '2026-08-20T10:00:00.000Z'),
      at(B, '[ch01-s01-p001]', '2026-08-27T10:00:00.000Z'),
    ])
    expect(order).toEqual([B, A])
  })
})

describe('the plan', () => {
  const positions = [
    at(A, '[ch03-s01-p001]', '2026-08-20T10:00:00.000Z'),
    at(B, '[ch03-s01-p001]', '2026-08-27T10:00:00.000Z'),
  ]
  const spine = () => chapters(1, 2, 3, 4)

  it('runs only the most recently opened book on its own', () => {
    const jobs = plan(positions, spine, NOTHING_DONE)

    // B was opened last, so B runs. A waits to be asked.
    expect(jobs.filter((job) => job.automatic).map((job) => job.bookId)).toEqual([B, B])
    expect(jobs.filter((job) => !job.automatic).map((job) => job.bookId)).toEqual([A, A])
  })

  it('runs chapters in reading order', () => {
    // Both prompts match new concepts against the vocabulary built so far. Out
    // of order, chapter 2 would be judged against a list missing chapter 1's
    // names, and the reader's vault would grow two notes for one idea.
    const jobs = plan(positions, spine, NOTHING_DONE)
    expect(jobs.filter((job) => job.bookId === B).map((job) => job.chapter)).toEqual([1, 2])
  })

  it('skips a chapter that already has a summary', () => {
    // A summary is a paid call. Rebuilding one that nothing changed is money
    // for the same words back.
    const jobs = plan(positions, spine, new Set([`${B}:1`]))
    expect(jobs.filter((job) => job.bookId === B).map((job) => job.chapter)).toEqual([2])
  })

  it('has nothing to do when every finished chapter is summarised', () => {
    const everything = new Set([`${A}:1`, `${A}:2`, `${B}:1`, `${B}:2`])
    expect(plan(positions, spine, everything)).toEqual([])
  })
})

describe('the sections inside a finished chapter', () => {
  function withSections(...titles: (string | undefined)[]): ChapterIndex {
    return {
      chapter: 1,
      title: 'One',
      path: 'ch01' as ChapterIndex['path'],
      sections: titles.map((title, index) => ({
        section: index + 1,
        ...(title === undefined ? {} : { title }),
        path: `ch01-s0${index + 1}` as ChapterIndex['sections'][number]['path'],
      })),
    }
  }

  it('offers the ones the author named', () => {
    expect(titledSections(withSections('Ego', 'Shadow', 'Anima'))).toEqual([
      { section: 1, title: 'Ego' },
      { section: 2, title: 'Shadow' },
      { section: 3, title: 'Anima' },
    ])
  })

  it('leaves unnamed breaks alone', () => {
    // A row reading "Chapter 4, part 3" tells the reader nothing, and every
    // summary is a paid call.
    expect(titledSections(withSections(undefined, undefined))).toEqual([])
    expect(titledSections(withSections('Ego', undefined, 'Anima'))).toEqual([
      { section: 1, title: 'Ego' },
      { section: 3, title: 'Anima' },
    ])
  })

  it('treats a blank title as no title', () => {
    expect(titledSections(withSections('   ', 'Shadow'))).toEqual([])
  })

  it('does not split a chapter that has only one named part', () => {
    // It would cover the same ground as the chapter recap above it: the same
    // call, charged twice, for near-identical words.
    expect(titledSections(withSections('Ego'))).toEqual([])
  })

  it('has nothing to offer for a chapter that is not in the book', () => {
    expect(titledSections(undefined)).toEqual([])
  })
})
