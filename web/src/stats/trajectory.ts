/**
 * How long this book will take, worked out from the reading itself.
 *
 * ## Why it is empirical
 *
 * The reader has no page count to divide. The reader's books reflow, so "page
 * 142 of 300" depends on the font size — see `docs/decisions.md`. What the app
 * *does* have is minutes actually spent and a position that knows how far
 * through the book it is. Those two give the whole forecast:
 *
 *     total = logged / (percent / 100)
 *
 * It needs no word counts, no reading-speed guess and no per-book calibration.
 * It gets better every session, because both of its inputs are measured.
 *
 * ## The one assumption, stated
 *
 * The curve of past progress is drawn from cumulative *minutes*, scaled so that
 * today's point is today's real percentage. The app has never recorded what
 * percentage the reader was at last Tuesday, so the shape of that line is the
 * shape of the reading — flat on days not read, steep on long evenings — and
 * not a record of the position. It is honest about the effort, which is the
 * part it measured. The screen says so under the chart.
 *
 * ## The guardrails
 *
 * Under 5% read, or under fifteen minutes logged, the forecast is not shown at
 * all. Dividing by a small percentage multiplies its error: at 2%, one wrong
 * minute becomes fifty. A number that will be badly wrong is worse than no
 * number, because the reader has no way to know which one they are looking at.
 */

import { addDays, daysBetween, startOfDay } from './period.ts'
import { dayKey } from './sessions.ts'
import { msInWindow, type Span } from './spread.ts'

/** Under this much read, the division is too unstable to publish. */
export const MIN_PERCENT = 5
/** Under this many minutes, the same. */
export const MIN_MINUTES = 15
/** The month the reader gives a book, from the monthly goal of one book. */
export const TARGET_DAYS = 30
/** Days off the target before the pace is called anything but on track. */
const SLACK_DAYS = 2

export type TrajectoryStatus = 'Ahead' | 'On track' | 'Behind' | 'Calibrating'

/** One day on the chart: how far through the book the reading had got. */
export interface TrajectoryPoint {
  /** Days since the first session. */
  day: number
  percent: number
}

export interface Trajectory {
  /** Local midnight of the first recorded session on this book. */
  startedOn: Date
  percent: number
  minutesLogged: number
  /** True until there is enough read to divide by. Everything below is 0. */
  calibrating: boolean
  estimatedTotalMinutes: number
  remainingMinutes: number
  /** Minutes a day over the last seven days, or all-time if that is empty. */
  velocity: number
  /** Whether the velocity fell back to the all-time average. */
  velocityIsAllTime: boolean
  daysRemaining: number
  finishOn: Date | undefined
  /** The day the monthly goal would have this book finished. */
  targetOn: Date
  status: TrajectoryStatus
  /** The past, one point per day, ending at today. */
  path: TrajectoryPoint[]
}

export function trajectoryOf(
  sessions: readonly Span[],
  percent: number,
  today: Date,
): Trajectory | undefined {
  if (sessions.length === 0) return undefined

  const first = sessions.reduce((min, s) => Math.min(min, s.startedAt), Infinity)
  const startedOn = startOfDay(new Date(first))
  const now = startOfDay(today)
  const targetOn = addDays(startedOn, TARGET_DAYS)

  const totalMs = sessions.reduce((sum, s) => sum + s.activeMs, 0)
  const minutesLogged = Math.round(totalMs / 60_000)

  const calibrating = percent < MIN_PERCENT || minutesLogged < MIN_MINUTES

  // Minutes per day, from the first day of reading to today inclusive. Days the
  // book was not opened count as zero — they are days it did not advance.
  const byDay = new Map<string, number>()
  for (const session of sessions) {
    let cursor = startOfDay(new Date(session.startedAt))
    const last = startOfDay(new Date(Math.max(session.endedAt, session.startedAt)))
    while (cursor <= last) {
      const ms = msInWindow(session, cursor.getTime(), addDays(cursor, 1).getTime())
      if (ms > 0) byDay.set(dayKey(cursor), (byDay.get(dayKey(cursor)) ?? 0) + ms)
      cursor = addDays(cursor, 1)
    }
  }

  const span = Math.max(daysBetween(startedOn, now), 1)

  let recentMs = 0
  for (let i = 0; i < 7; i += 1) {
    recentMs += byDay.get(dayKey(addDays(now, -i))) ?? 0
  }
  const rolling = recentMs / 7 / 60_000
  const allTime = totalMs / span / 60_000
  const velocityIsAllTime = rolling <= 0
  const velocity = Math.round(velocityIsAllTime ? allTime : rolling)

  // The path. Cumulative minutes, scaled so today's point is today's real
  // percentage — see the header. One point per day, so a gap reads as a gap.
  const path: TrajectoryPoint[] = []
  let running = 0
  for (let i = 0; i < span; i += 1) {
    const day = addDays(startedOn, i)
    running += byDay.get(dayKey(day)) ?? 0
    path.push({ day: i, percent: totalMs === 0 ? 0 : (running / totalMs) * percent })
  }

  if (calibrating) {
    return {
      startedOn,
      percent,
      minutesLogged,
      calibrating: true,
      estimatedTotalMinutes: 0,
      remainingMinutes: 0,
      velocity,
      velocityIsAllTime,
      daysRemaining: 0,
      finishOn: undefined,
      targetOn,
      status: 'Calibrating',
      path,
    }
  }

  const estimatedTotalMinutes = Math.round(minutesLogged / (percent / 100))
  const remainingMinutes = Math.max(estimatedTotalMinutes - minutesLogged, 0)
  // A reader with a velocity of zero has stopped, and no number of days will
  // finish the book. Saying "Infinity days" is worse than saying nothing.
  const daysRemaining = velocity > 0 ? Math.ceil(remainingMinutes / velocity) : 0
  const finishOn = velocity > 0 ? addDays(now, daysRemaining) : undefined

  let status: TrajectoryStatus = 'Behind'
  if (finishOn !== undefined) {
    const off = daysBetween(targetOn, finishOn) - 1
    status = off < -SLACK_DAYS ? 'Ahead' : off <= SLACK_DAYS ? 'On track' : 'Behind'
  }

  return {
    startedOn,
    percent,
    minutesLogged,
    calibrating: false,
    estimatedTotalMinutes,
    remainingMinutes,
    velocity,
    velocityIsAllTime,
    daysRemaining,
    finishOn,
    targetOn,
    status,
    path,
  }
}
