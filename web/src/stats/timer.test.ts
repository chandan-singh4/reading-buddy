// @vitest-environment jsdom

// Which screen a session is filed under. The rule under test is that a visit
// is named by where the reader spent the time, not by where they left from.

import { describe, expect, it, vi } from 'vitest'

import { FLUSH_MS, startSession, type Place } from './timer.ts'
import type { StoredSession } from '../storage/db.ts'
import type { BookId } from '../structure/index.ts'

/** A store that keeps only the last row written, which is the row that counts. */
function spy(): { last: () => StoredSession | undefined; put: (s: StoredSession) => Promise<void> } {
  let row: StoredSession | undefined
  return {
    last: () => row,
    put: async (session) => {
      row = session
    },
  }
}

/**
 * Run a visit made of `steps`, each one flush long, and give back the final row.
 * The clock moves in flush-sized jumps because that is the grain the timer
 * samples at.
 */
function visit(steps: (Place | undefined)[]): StoredSession | undefined {
  const store = spy()
  let at = Date.parse('2026-08-29T20:00:00.000Z')
  let step = 0
  const timers = vi.useFakeTimers({ now: at })

  const session = startSession('b1' as BookId, {
    store: store as never,
    now: () => at,
    place: () => steps[Math.min(step, steps.length - 1)],
  })

  for (const _ of steps) {
    at += FLUSH_MS
    timers.advanceTimersByTime(FLUSH_MS)
    step += 1
  }
  session.stop()
  vi.useRealTimers()
  return store.last()
}

const READING: Place = { chapterTitle: 'Approaching the Unconscious', activity: 'reading' }
const NOTES: Place = { chapterTitle: 'Approaching the Unconscious', activity: 'notes' }
// The reading screen keeps reporting the chapter after the reader taps away —
// see `stats/place.ts` — so the details screen carries it too.
const DETAILS: Place = { chapterTitle: 'Approaching the Unconscious', activity: 'details' }

describe('the screen a session is named after', () => {
  it('says nothing when the visit was the pages', () => {
    expect(visit([READING, READING])?.activity).toBeUndefined()
  })

  it('names the book details when that is all the visit was', () => {
    expect(visit([DETAILS, DETAILS])?.activity).toBe('details')
  })

  it('is still reading when the notes were only a glance', () => {
    expect(visit([READING, READING, READING, NOTES])?.activity).toBeUndefined()
  })

  it('is the notes when the notes had the visit', () => {
    expect(visit([NOTES, NOTES, NOTES, READING])?.activity).toBe('notes')
  })

  it('keeps the place the reader reached whichever screen they ended on', () => {
    // The chapter and the screen answer two different questions. Going to the
    // details must not lose the chapter the reader was in.
    expect(visit([READING, READING, READING, DETAILS])?.chapterTitle).toBe(
      'Approaching the Unconscious',
    )
  })
})
