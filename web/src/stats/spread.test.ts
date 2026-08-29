// Where a sitting's minutes land. The case that drove this: the reader started
// at 11:41 pm and read past midnight, and the new day showed nothing.

import { describe, expect, it } from 'vitest'

import { msInWindow } from './spread.ts'

const min = (n: number): number => n * 60_000

const overnight = {
  startedAt: new Date(2026, 7, 28, 23, 41).getTime(),
  endedAt: new Date(2026, 7, 29, 0, 25).getTime(),
  activeMs: min(44),
}

const midnight = (date: number): number => new Date(2026, 7, date).getTime()

describe('msInWindow', () => {
  it('gives each day the part that happened in it', () => {
    // Floating-point close, not exact: these are proportions of a span, and
    // every caller rounds to whole minutes.
    expect(msInWindow(overnight, midnight(28), midnight(29))).toBeCloseTo(min(19), 3)
    expect(msInWindow(overnight, midnight(29), midnight(30))).toBeCloseTo(min(25), 3)
  })

  it('never loses or invents a minute', () => {
    const parts =
      msInWindow(overnight, midnight(28), midnight(29)) +
      msInWindow(overnight, midnight(29), midnight(30))
    expect(parts).toBeCloseTo(overnight.activeMs, 3)
  })

  it('spreads the reading time, not the time the book was open', () => {
    // Two hours open, one hour of reading: half an hour lands in each hour.
    const paused = {
      startedAt: new Date(2026, 7, 28, 10).getTime(),
      endedAt: new Date(2026, 7, 28, 12).getTime(),
      activeMs: min(60),
    }
    const first = new Date(2026, 7, 28, 10).getTime()
    expect(msInWindow(paused, first, first + min(60))).toBe(min(30))
  })

  it('is nothing at all for a window the sitting never touched', () => {
    expect(msInWindow(overnight, midnight(20), midnight(21))).toBe(0)
  })

  it('keeps an instant rather than dropping it', () => {
    // A row whose ends are the same moment still happened.
    const instant = { startedAt: midnight(28), endedAt: midnight(28), activeMs: min(3) }
    expect(msInWindow(instant, midnight(28), midnight(29))).toBe(min(3))
  })
})
