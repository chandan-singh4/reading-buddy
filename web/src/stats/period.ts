/**
 * Turning the scope toggle into dates: which days a period covers, which days
 * the one before it covered, and which buckets the chart draws.
 *
 * Pure and calendar-aware. Every boundary here is a *local* midnight, arrived
 * at through the `Date` constructor rather than by adding 86,400,000 to a
 * timestamp — the two disagree twice a year, and reading is filed by the day on
 * the reader's wall.
 */

export type Scope = 'day' | 'week' | 'month' | 'year' | 'custom'

export interface Period {
  scope: Scope
  /** Local midnight of the first day, inclusive. */
  start: Date
  /**
   * Local midnight of the last day, inclusive — the *calendar* end, which for
   * Week, Month and Year is usually in the future. The chart needs it, because
   * a week is seven columns on Tuesday as much as on Sunday.
   */
  end: Date
  /** The last day that can hold data: `end`, or today if today comes first. */
  through: Date
}

const DAY_MS = 86_400_000

/** Local midnight of whatever day `d` falls in. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Monday of `d`'s week. Weeks start on Monday, as the reference's chart does. */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d)
  // `getDay()` is Sunday-first; `(day + 6) % 7` re-bases it on Monday.
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() + 6) % 7))
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** Whole days from `a` to `b`, inclusive of both ends. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS) + 1
}

/** The period a scope names, relative to `today`. */
export function periodOf(scope: Exclude<Scope, 'custom'>, today: Date): Period {
  const t = startOfDay(today)
  switch (scope) {
    case 'day':
      return { scope, start: t, end: t, through: t }
    case 'week': {
      const start = startOfWeek(t)
      return { scope, start, end: addDays(start, 6), through: t }
    }
    case 'month': {
      const start = new Date(t.getFullYear(), t.getMonth(), 1)
      return { scope, start, end: new Date(t.getFullYear(), t.getMonth() + 1, 0), through: t }
    }
    case 'year': {
      const start = new Date(t.getFullYear(), 0, 1)
      return { scope, start, end: new Date(t.getFullYear(), 11, 31), through: t }
    }
  }
}

/** A reader-chosen range. Both ends are days, and both are included. */
export function customPeriod(start: Date, end: Date): Period {
  const a = startOfDay(start)
  const b = startOfDay(end)
  return { scope: 'custom', start: a, end: b, through: b }
}

/**
 * The equivalent stretch one period earlier — what the delta compares against.
 *
 * It is matched on *elapsed length*, not on the calendar. On a Tuesday, three
 * days of this week are compared with the first three days of last week, never
 * with all seven. Comparing a part-week against a whole one is not a fair
 * reading of "up 22%", it is an arithmetic guarantee of "down".
 *
 * Custom ranges have no previous period. The screen shows "over N days"
 * instead, because there is no honest thing to compare a hand-picked window to.
 */
export function previousPeriod(period: Period): { start: Date; through: Date } | undefined {
  if (period.scope === 'custom') return undefined

  const elapsed = daysBetween(period.start, period.through)
  switch (period.scope) {
    case 'day': {
      const start = addDays(period.start, -1)
      return { start, through: start }
    }
    case 'week': {
      const start = addDays(period.start, -7)
      return { start, through: addDays(start, elapsed - 1) }
    }
    case 'month': {
      const start = new Date(period.start.getFullYear(), period.start.getMonth() - 1, 1)
      // A short month clamps: 31 March back-compares with all of February
      // rather than spilling into March, which would double-count a day.
      const lastOfPrev = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
      return { start, through: addDays(start, Math.min(elapsed, lastOfPrev) - 1) }
    }
    case 'year': {
      const start = new Date(period.start.getFullYear() - 1, 0, 1)
      return { start, through: addDays(start, elapsed - 1) }
    }
  }
}

/** One column of the books-and-time chart. */
export interface Bucket {
  label: string
  /** Epoch ms, inclusive. */
  from: number
  /** Epoch ms, exclusive. */
  to: number
  /** True when the bucket has not happened yet — drawn at the baseline. */
  future: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * The chart's x-axis, which follows the scope: a year is twelve months, a
 * month is its own days, a week is seven weekdays, a day is twenty-four hours,
 * and a custom range is one column per day.
 */
export function bucketsOf(period: Period, now: Date): Bucket[] {
  const nowMs = now.getTime()
  const mark = (from: Date, to: Date, label: string): Bucket => ({
    label,
    from: from.getTime(),
    to: to.getTime(),
    future: from.getTime() > nowMs,
  })

  if (period.scope === 'year') {
    const y = period.start.getFullYear()
    return MONTHS.map((label, m) =>
      mark(new Date(y, m, 1), new Date(y, m + 1, 1), label),
    )
  }

  if (period.scope === 'day') {
    const d = period.start
    return Array.from({ length: 24 }, (_, h) =>
      mark(
        new Date(d.getFullYear(), d.getMonth(), d.getDate(), h),
        new Date(d.getFullYear(), d.getMonth(), d.getDate(), h + 1),
        hourLabel(h),
      ),
    )
  }

  // Month, week and custom are all "one column per day"; only the label differs.
  const n = daysBetween(period.start, period.end)
  return Array.from({ length: n }, (_, i) => {
    const from = addDays(period.start, i)
    const to = addDays(period.start, i + 1)
    const label =
      period.scope === 'week'
        ? WEEKDAYS[i]
        : period.scope === 'month'
          ? String(from.getDate())
          : `${from.getMonth() + 1}/${from.getDate()}`
    return mark(from, to, label)
  })
}

/** `0` → `12a`, `13` → `1p`. The reference's own compact hour. */
export function hourLabel(h: number): string {
  if (h === 0) return '12a'
  if (h < 12) return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
}

/** The index of the bucket the reader is standing in, or `-1`. */
export function currentBucket(buckets: readonly Bucket[], now: Date): number {
  const t = now.getTime()
  return buckets.findIndex((b) => t >= b.from && t < b.to)
}
