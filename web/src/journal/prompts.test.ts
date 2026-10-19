import { describe, expect, it } from 'vitest'

import { nudgeFor } from './prompts.ts'

/** 2026-10-19 at the given hour, local. */
function at(hour: number, day = 19): Date {
  return new Date(2026, 9, day, hour, 30)
}

describe('the question on the journal half', () => {
  it('names the band of the day', () => {
    expect(nudgeFor(at(8)).label).toBe('Morning prompt')
    expect(nudgeFor(at(14)).label).toBe('Afternoon prompt')
    expect(nudgeFor(at(20)).label).toBe('Evening prompt')
    expect(nudgeFor(at(23)).label).toBe('Late')
  })

  it('holds the same question for the whole hour, so it can be read', () => {
    // The same band and the same date must give the same words. A question that
    // changed on every repaint is a question nobody finishes reading.
    expect(nudgeFor(new Date(2026, 9, 19, 20, 1)).question).toBe(
      nudgeFor(new Date(2026, 9, 19, 20, 59)).question,
    )
  })

  it('moves on with the date', () => {
    const today = nudgeFor(at(20, 19)).question
    const tomorrow = nudgeFor(at(20, 20)).question
    expect(tomorrow).not.toBe(today)
  })

  it('always asks something', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const nudge = nudgeFor(at(hour))
      expect(nudge.question.length).toBeGreaterThan(0)
      expect(nudge.question.endsWith('?')).toBe(true)
    }
  })
})
