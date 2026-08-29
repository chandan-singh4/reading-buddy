// The finish-date forecast. Its inputs are two measured facts, so most of the
// cases here are about when it should refuse to answer.

import { describe, expect, it } from 'vitest'

import { trajectoryOf } from './trajectory.ts'

const day = (d: number, h = 20): number => new Date(2026, 7, d, h).getTime()

const sat = (d: number, minutes: number) => ({
  startedAt: day(d),
  endedAt: day(d) + minutes * 60_000,
  activeMs: minutes * 60_000,
})

const today = new Date(2026, 7, 29, 22)

describe('trajectoryOf', () => {
  it('has nothing to say about a book with no sessions', () => {
    expect(trajectoryOf([], 40, today)).toBeUndefined()
  })

  it('refuses a forecast from a sliver of a book', () => {
    // At 2%, one wrong minute becomes fifty in the total. A number that will be
    // badly wrong is worse than no number.
    const data = trajectoryOf([sat(28, 60)], 2, today)!
    expect(data.calibrating).toBe(true)
    expect(data.status).toBe('Calibrating')
    expect(data.finishOn).toBeUndefined()
  })

  it('refuses a forecast from a few minutes', () => {
    const data = trajectoryOf([sat(28, 8)], 40, today)!
    expect(data.calibrating).toBe(true)
  })

  it('divides the logged time by the fraction read', () => {
    // Four hours got the reader half way, so the book is about eight hours.
    const data = trajectoryOf([sat(22, 120), sat(24, 120)], 50, today)!
    expect(data.calibrating).toBe(false)
    expect(data.minutesLogged).toBe(240)
    expect(data.estimatedTotalMinutes).toBe(480)
    expect(data.remainingMinutes).toBe(240)
  })

  it('takes its pace from the last seven days', () => {
    // 120 minutes inside the window, spread over seven days.
    const data = trajectoryOf([sat(20, 600), sat(28, 120)], 50, today)!
    expect(data.velocityIsAllTime).toBe(false)
    expect(data.velocity).toBe(17)
  })

  it('falls back to the all-time pace when the last week is empty', () => {
    // Ten days, six hours: 36 minutes a day.
    const data = trajectoryOf([sat(20, 360)], 50, today)!
    expect(data.velocityIsAllTime).toBe(true)
    expect(data.velocity).toBe(36)
  })

  it('names the day the reading would end at that pace', () => {
    const data = trajectoryOf([sat(28, 120), sat(29, 120)], 50, today)!
    // 240 minutes left at 34 a day is eight more days.
    expect(data.daysRemaining).toBe(Math.ceil(240 / data.velocity))
    // Counted forward from today, so it rolls into September on its own.
    const expected = new Date(2026, 7, 29 + data.daysRemaining)
    expect(data.finishOn?.toDateString()).toBe(expected.toDateString())
  })

  it('draws one point per day, gaps included', () => {
    const data = trajectoryOf([sat(27, 120), sat(29, 120)], 50, today)!
    expect(data.path).toHaveLength(3)
    // The 28th was a day off: the line is flat across it.
    expect(data.path[0].percent).toBeCloseTo(25, 5)
    expect(data.path[1].percent).toBeCloseTo(25, 5)
    expect(data.path[2].percent).toBeCloseTo(50, 5)
  })

  it('ends the drawn line at the percentage the reader is really at', () => {
    const data = trajectoryOf([sat(27, 60), sat(29, 180)], 40, today)!
    expect(data.path[data.path.length - 1].percent).toBeCloseTo(40, 5)
  })

  it('calls a fast reader ahead of the month a book is given', () => {
    const fast = trajectoryOf([sat(28, 240), sat(29, 240)], 80, today)!
    expect(fast.status).toBe('Ahead')
  })

  it('calls a slow one behind', () => {
    const slow = trajectoryOf([sat(1, 30), sat(29, 30)], 10, today)!
    expect(slow.status).toBe('Behind')
  })
})
