// The target each scope is measured against. The cases here are the ones where
// a naive target would say something untrue.

import { describe, expect, it } from 'vitest'

import { booksFinished, goalFor } from './goal.ts'
import { customPeriod, periodOf } from './period.ts'
import type { BookMeta } from '../structure/index.ts'

const book = (title: string, finishedAt?: string): BookMeta =>
  ({ id: title, title, finishedAt }) as unknown as BookMeta

describe('goalFor · day', () => {
  const period = periodOf('day', new Date(2026, 7, 29, 21, 0))

  it('counts down to two hours', () => {
    const goal = goalFor(period, 63, [])
    expect(goal?.progress).toBe('1h 03m / 2h')
    expect(goal?.percent).toBe(53)
    expect(goal?.met).toBe(false)
    expect(goal?.status).toBe('57 min left today.')
  })

  it('keeps counting past the target rather than stopping at 100', () => {
    // The bar clamps; the number must not. A three-hour day is a fact.
    const goal = goalFor(period, 180, [])
    expect(goal?.percent).toBe(150)
    expect(goal?.met).toBe(true)
    expect(goal?.status).toBe('Goal met, with 1h 00m over.')
  })
})

describe('goalFor · week', () => {
  it('is seven days of the daily target, spread over the days that are left', () => {
    // Thursday: today and three more days to come.
    const period = periodOf('week', new Date(2026, 7, 27, 21, 0))
    const goal = goalFor(period, 405, [])
    expect(goal?.title).toBe('Weekly goal · 14 hours')
    expect(goal?.progress).toBe('6h 45m / 14h')
    expect(goal?.status).toBe('7h 15m left, over 4 days.')
  })
})

describe('goalFor · month', () => {
  const period = periodOf('month', new Date(2026, 7, 29))

  it('names the book that was finished', () => {
    const goal = goalFor(period, 900, [book('Man and His Symbols', '2026-08-20T10:00:00Z')])
    expect(goal?.progress).toBe('1 / 1 book')
    expect(goal?.met).toBe(true)
    expect(goal?.status).toBe('Finished Man and His Symbols.')
  })

  it('does not count a book finished in another month', () => {
    const goal = goalFor(period, 900, [book('Walden', '2026-07-20T10:00:00Z')])
    expect(goal?.current).toBe(0)
    expect(goal?.status).toBe('No book finished yet this month.')
  })
})

describe('goalFor · year', () => {
  it('measures pace against the part of the year that has passed', () => {
    // Mid-February. Twelve books over a year is half a book due by now, so one
    // book is fine. Rounding the half-book gap up to "1 book behind" would
    // scold a reader who is doing well.
    const period = periodOf('year', new Date(2026, 1, 15))
    const goal = goalFor(period, 600, [book('Walden', '2026-01-20T10:00:00Z')])
    expect(goal?.progress).toBe('1 / 12 books')
    expect(goal?.status).toBe('On schedule.')
  })

  it('says so plainly when the reader is behind', () => {
    const period = periodOf('year', new Date(2026, 10, 15))
    const goal = goalFor(period, 600, [book('Walden', '2026-01-20T10:00:00Z')])
    expect(goal?.status).toBe('9 books behind schedule.')
  })
})

describe('goalFor · custom', () => {
  it('gives a hand-picked range no target at all', () => {
    // The reader invented the window, so no target it could be measured
    // against was ever agreed.
    const period = customPeriod(new Date(2026, 2, 3), new Date(2026, 3, 19))
    expect(goalFor(period, 600, [])).toBeUndefined()
  })
})

describe('booksFinished', () => {
  it('ignores a book that was never finished', () => {
    const period = periodOf('year', new Date(2026, 7, 29))
    expect(booksFinished([book('In progress')], period)).toHaveLength(0)
  })

  it('includes a book finished on the period’s last day', () => {
    const period = periodOf('month', new Date(2026, 7, 29))
    const finished = booksFinished([book('Walden', new Date(2026, 7, 31, 23, 0).toISOString())], period)
    expect(finished).toHaveLength(1)
  })
})
