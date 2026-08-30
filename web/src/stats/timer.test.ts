// @vitest-environment jsdom

// Which screen a session is filed under. The rule under test is that a visit
// is named by where the reader spent the time, not by where they left from.

import { describe, expect, it, vi } from 'vitest'

import { FLUSH_MS, startSession, type Place } from './timer.ts'
import { answerSteppedAway, answerStillHere, forgetVigil, snapshot } from './vigil.ts'
import { forgetPlace, placeIn, reportPlace } from './place.ts'
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

describe('the last sign of life', () => {
  /**
   * A visit of `minutes`, with a tap after `tapAt` minutes when given, and an
   * answer to the check-in after `answerAt` minutes when given.
   */
  function watched(
    minutes: number,
    tapAt?: number,
    answer?: { at: number; say: 'here' | 'away' },
  ): StoredSession | undefined {
    const store = spy()
    let at = Date.parse('2026-08-30T22:00:00.000Z')
    const timers = vi.useFakeTimers({ now: at })
    const session = startSession('b1' as BookId, { store: store as never, now: () => at })

    for (let m = 1; m <= minutes; m += 1) {
      at += 60_000
      timers.advanceTimersByTime(60_000)
      if (m === tapAt) document.dispatchEvent(new Event('pointerdown'))
      if (answer && m === answer.at) {
        if (answer.say === 'here') answerStillHere()
        else answerSteppedAway()
      }
    }
    session.stop()
    vi.useRealTimers()
    forgetVigil()
    return store.last()
  }

  it('is the moment the book opened when nothing was ever touched', () => {
    const row = watched(5)
    expect(row?.lastSeenAt).toBe(row?.startedAt)
  })

  it('moves to the last touch, not to the end of the session', () => {
    const row = watched(8, 5)
    expect(row?.lastSeenAt).toBe((row?.startedAt ?? 0) + 5 * 60_000)
  })
})

describe('the check-in', () => {
  /** As above, but reporting what the row was credited with. */
  function visit(
    minutes: number,
    tapAt?: number,
    answer?: { at: number; say: 'here' | 'away' },
  ): { active: number; away: number; asked: boolean } {
    const store = spy()
    let at = Date.parse('2026-08-30T22:00:00.000Z')
    const timers = vi.useFakeTimers({ now: at })
    const session = startSession('b1' as BookId, { store: store as never, now: () => at })
    let asked = false

    for (let m = 1; m <= minutes; m += 1) {
      at += 60_000
      timers.advanceTimersByTime(60_000)
      if (snapshot().askedAt !== undefined) asked = true
      if (m === tapAt) document.dispatchEvent(new Event('pointerdown'))
      if (answer && m === answer.at) {
        // No pointer event: a tap on the bar is ignored by the clock on
        // purpose, so that answering does not erase the silence being
        // answered for. See `VIGIL_MARK` in `timer.ts`.
        if (answer.say === 'here') answerStillHere()
        else answerSteppedAway()
      }
    }
    session.stop()
    vi.useRealTimers()
    forgetVigil()
    const row = store.last()
    return {
      active: Math.round((row?.activeMs ?? 0) / 60_000),
      away: Math.round((row?.awayMs ?? 0) / 60_000),
      asked,
    }
  }

  it('asks nothing of a reader who is turning pages', () => {
    // Nine minutes of silence is a page of Jung, not a nap.
    expect(visit(9).asked).toBe(false)
  })

  it('asks after ten quiet minutes, and keeps counting while it waits', () => {
    expect(visit(11).asked).toBe(true)
  })

  it('gives every minute back when the reader says they are here', () => {
    const row = visit(18, undefined, { at: 12, say: 'here' })
    expect(row.active).toBe(18)
    expect(row.away).toBe(0)
  })

  it('trims from the last sign of life when the reader stepped away', () => {
    // A page turned at the fifth minute, then nothing. The question goes up at
    // the fifteenth, and the reader answers it at the seventeenth. The twelve
    // minutes since that page turn are the ones that were not reading — not
    // the two since the question, and not the whole session.
    const row = visit(25, 5, { at: 17, say: 'away' })
    expect(row.away).toBe(12)
    expect(row.active).toBe(13)
  })

  it('trims from the question when nobody ever answers it', () => {
    // The sleeper. The ten minutes before the question are still credited —
    // they may well have been reading — and the rest is not.
    const row = visit(60)
    expect(row.away).toBe(50)
    expect(row.active).toBe(10)
  })

  it('takes a touch on the page as an answer', () => {
    // A reader deep in a long passage is not made to tap a button to go on
    // being counted. Touching the page is the proof the question wanted.
    const row = visit(20, 15)
    expect(row.away).toBe(0)
    expect(row.active).toBe(20)
  })

  it('asks again if the silence comes back', () => {
    // Touched at the fifteenth minute, quiet from then on. The second question
    // goes up at the twenty-fifth and is never answered.
    const row = visit(40, 15)
    expect(row.away).toBe(15)
    expect(row.active).toBe(25)
  })
})

describe('time with Veda', () => {
  const VEDA: Place = { chapterTitle: 'Approaching the Unconscious', activity: 'veda' }

  /**
   * A visit in flush-sized steps, reporting the measured conversation.
   *
   * The screen is reported through `reportPlace`, the way the reading screen
   * reports it, so this also covers the part that matters most: the clock
   * closing off a stretch the moment the lamp shuts, rather than at its next
   * flush.
   */
  function conversation(steps: Place[]): number {
    const store = spy()
    let at = Date.parse('2026-08-30T22:00:00.000Z')
    const timers = vi.useFakeTimers({ now: at })
    const session = startSession('b1' as BookId, {
      store: store as never,
      now: () => at,
      place: () => placeIn('b1' as BookId),
    })

    for (const step of steps) {
      reportPlace('b1' as BookId, step)
      at += FLUSH_MS
      timers.advanceTimersByTime(FLUSH_MS)
    }
    session.stop()
    vi.useRealTimers()
    forgetPlace()
    forgetVigil()
    return Math.round((store.last()?.vedaMs ?? 0) / 1000)
  }

  it('says nothing about a sitting that never opened the lamp', () => {
    expect(conversation([READING, READING])).toBe(0)
  })

  it('counts every second the lamp was open', () => {
    // Two flushes with the lamp open, one without. The reading of the last
    // answer is inside those two, which is exactly what the old estimate from
    // the message times could never see.
    expect(conversation([READING, VEDA, VEDA, READING])).toBe(60)
  })

  it('stops counting the moment the lamp shuts', () => {
    expect(conversation([VEDA, READING, READING, READING])).toBe(30)
  })
})
