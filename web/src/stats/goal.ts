/**
 * The target the period is measured against.
 *
 * ## Why the goal changes with the scope
 *
 * A day and a year are not the same question. "Did I read for two hours?" is a
 * fact about today that the reader can still act on. "Have I read twelve books?"
 * is a fact about a year that no single evening changes. So time is the unit for
 * a day and a week, and books are the unit for a month and a year — the shortest
 * honest measure at each length.
 *
 * ## Why a custom range has no goal
 *
 * A hand-picked window has no target, because the reader invented the window.
 * Prorating twelve books over "March 3 to April 19" would produce a number with
 * no meaning behind it. The card simply does not appear.
 *
 * Everything here is pure. The targets are constants for now; they are the one
 * thing on this screen a settings page would later own.
 */

import { daysBetween, type Period } from './period.ts'
import type { BookMeta } from '../structure/index.ts'

/** Two hours a day — the reader's own target. */
export const DAILY_MINUTES = 120
/** Seven days of the daily target, not a separate number invented for weeks. */
export const WEEKLY_MINUTES = DAILY_MINUTES * 7
export const MONTHLY_BOOKS = 1
export const YEARLY_BOOKS = 12

export interface PeriodGoal {
  /** `Daily goal · 2 hours`. */
  title: string
  current: number
  target: number
  unit: 'minutes' | 'books'
  /** `1h 03m / 2h`, or `8 / 12 books`. */
  progress: string
  /** True percent, which can pass 100. The bar clamps; the number does not. */
  percent: number
  /** Whether the target is reached. Drives the green. */
  met: boolean
  /** One line under the bar: what is left, or what was finished. */
  status: string
}

/** `1h 03m`, or `47m`. Zero-padded minutes, so two rows line up. */
function clock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/** Books whose `finishedAt` falls inside the period. */
export function booksFinished(
  books: readonly BookMeta[],
  period: Period,
): BookMeta[] {
  const from = period.start.getTime()
  const to = new Date(
    period.end.getFullYear(),
    period.end.getMonth(),
    period.end.getDate() + 1,
  ).getTime()

  return books.filter((book) => {
    if (book.finishedAt === undefined) return false
    const ts = Date.parse(book.finishedAt)
    return Number.isFinite(ts) && ts >= from && ts < to
  })
}

/** How many titles to name before the line becomes a list rather than a note. */
const NAMED = 2

function namesOf(books: readonly BookMeta[]): string {
  const titles = books.map((b) => b.title)
  if (titles.length <= NAMED) return titles.join(' and ')
  return `${titles.slice(0, NAMED).join(', ')} and ${titles.length - NAMED} more`
}

export function goalFor(
  period: Period,
  minutes: number,
  books: readonly BookMeta[],
): PeriodGoal | undefined {
  if (period.scope === 'custom') return undefined

  const pct = (current: number, target: number): number =>
    target === 0 ? 0 : Math.round((current / target) * 100)

  if (period.scope === 'day') {
    const left = DAILY_MINUTES - minutes
    return {
      title: 'Daily goal · 2 hours',
      current: minutes,
      target: DAILY_MINUTES,
      unit: 'minutes',
      progress: `${clock(minutes)} / 2h`,
      percent: pct(minutes, DAILY_MINUTES),
      met: left <= 0,
      status: left > 0 ? `${left} min left today.` : `Goal met, with ${clock(-left)} over.`,
    }
  }

  if (period.scope === 'week') {
    const left = WEEKLY_MINUTES - minutes
    // Days still to come, today included — what the remaining hours spread over.
    const daysLeft = daysBetween(period.through, period.end)
    return {
      title: 'Weekly goal · 14 hours',
      current: minutes,
      target: WEEKLY_MINUTES,
      unit: 'minutes',
      progress: `${clock(minutes)} / 14h`,
      percent: pct(minutes, WEEKLY_MINUTES),
      met: left <= 0,
      status:
        left <= 0
          ? `Goal met, with ${clock(-left)} over.`
          : `${clock(left)} left, over ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
    }
  }

  const finished = booksFinished(books, period)
  const done = finished.length

  if (period.scope === 'month') {
    return {
      title: 'Monthly goal · 1 book',
      current: done,
      target: MONTHLY_BOOKS,
      unit: 'books',
      progress: `${done} / 1 book`,
      percent: pct(done, MONTHLY_BOOKS),
      met: done >= MONTHLY_BOOKS,
      status: done > 0 ? `Finished ${namesOf(finished)}.` : 'No book finished yet this month.',
    }
  }

  /*
   * A year is the one period long enough for pace to mean something. The
   * schedule is flat — twelve books spread evenly — so "ahead" is measured
   * against the fraction of the year that has passed, not against the calendar
   * month. On 15 February the reader is not behind for having read one book.
   */
  const elapsed = daysBetween(period.start, period.through)
  const total = daysBetween(period.start, period.end)
  const due = (YEARLY_BOOKS * elapsed) / total
  /*
   * Whole books only, and rounded *towards* on-schedule. Half a book off the
   * pace is not a fact about the reader, it is a fact about the arithmetic —
   * and rounding it up to "1 book behind" on 15 February would scold someone
   * who is doing fine.
   */
  const drift = done - due
  const ahead = drift >= 1 ? Math.floor(drift) : drift <= -1 ? Math.ceil(drift) : 0

  return {
    title: 'Annual goal · 12 books',
    current: done,
    target: YEARLY_BOOKS,
    unit: 'books',
    progress: `${done} / 12 books`,
    percent: pct(done, YEARLY_BOOKS),
    met: done >= YEARLY_BOOKS,
    status:
      done >= YEARLY_BOOKS
        ? 'Challenge complete.'
        : ahead > 0
          ? `${ahead} book${ahead === 1 ? '' : 's'} ahead of schedule.`
          : ahead < 0
            ? `${-ahead} book${ahead === -1 ? '' : 's'} behind schedule.`
            : 'On schedule.',
  }
}
