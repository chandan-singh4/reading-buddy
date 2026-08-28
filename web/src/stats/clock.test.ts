// The reading clock. Small, but it is the source of truth for most of the
// Stats screen, so the two failure modes it can have are both pinned here.

import { describe, expect, it } from 'vitest'

import { MAX_SESSION_MS, openClock, total } from './clock.ts'

const start = new Date(2026, 7, 28, 20, 0).getTime()

describe('the reading clock', () => {
  it('counts the time the book was open', () => {
    expect(total(openClock(start), start + 25 * 60_000)).toBe(25 * 60_000)
  })

  it('counts a long conversation with Veda, because that is reading', () => {
    // The reason the idle rule was removed: half an hour on one paragraph looks
    // exactly like an idle phone and is not one.
    expect(total(openClock(start), start + 32 * 60_000)).toBe(32 * 60_000)
  })

  it('caps a book left open overnight', () => {
    const overnight = start + 9 * 60 * 60_000
    expect(total(openClock(start), overnight)).toBe(MAX_SESSION_MS)
  })

  it('gives the same answer however often it is asked', () => {
    const clock = openClock(start)
    const at = start + 10 * 60_000
    expect(total(clock, at)).toBe(total(clock, at))
  })

  it('reports zero rather than a negative session when the device clock moves back', () => {
    expect(total(openClock(start), start - 60_000)).toBe(0)
  })
})
