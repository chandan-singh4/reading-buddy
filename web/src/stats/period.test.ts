// The calendar arithmetic behind the scope toggle. Every case here is a local
// date, because the one fault this module exists to avoid is a day sliding by
// one for a reader who is not on UTC.

import { describe, expect, it } from 'vitest'

import {
  bucketsOf,
  currentBucket,
  customPeriod,
  daysBetween,
  hourLabel,
  periodOf,
  previousPeriod,
  startOfWeek,
} from './period.ts'

/** A Friday. Picked because it is mid-week, so a part-week is visible. */
const FRIDAY = new Date(2026, 7, 28, 14, 30)

describe('startOfWeek', () => {
  it('goes back to Monday', () => {
    expect(startOfWeek(FRIDAY)).toEqual(new Date(2026, 7, 24))
  })

  it('treats Sunday as the end of a week, not the start of one', () => {
    expect(startOfWeek(new Date(2026, 7, 30))).toEqual(new Date(2026, 7, 24))
  })

  it('leaves a Monday where it is', () => {
    expect(startOfWeek(new Date(2026, 7, 24, 23, 59))).toEqual(new Date(2026, 7, 24))
  })
})

describe('periodOf', () => {
  it('a day is one day', () => {
    const period = periodOf('day', FRIDAY)
    expect(period.start).toEqual(new Date(2026, 7, 28))
    expect(period.end).toEqual(new Date(2026, 7, 28))
  })

  it('a week runs Monday to Sunday even when Sunday has not happened', () => {
    const period = periodOf('week', FRIDAY)
    expect(period.start).toEqual(new Date(2026, 7, 24))
    expect(period.end).toEqual(new Date(2026, 7, 30))
    // `through` is where the data stops, `end` is where the chart stops.
    expect(period.through).toEqual(new Date(2026, 7, 28))
  })

  it('a month runs to its own last day', () => {
    const period = periodOf('month', FRIDAY)
    expect(period.start).toEqual(new Date(2026, 7, 1))
    expect(period.end).toEqual(new Date(2026, 7, 31))
  })

  it('a year runs to 31 December', () => {
    const period = periodOf('year', FRIDAY)
    expect(period.start).toEqual(new Date(2026, 0, 1))
    expect(period.end).toEqual(new Date(2026, 11, 31))
  })
})

describe('previousPeriod', () => {
  it('compares like with like, not a part-week against a whole one', () => {
    // Friday is day 5 of the week. The comparison must be last Monday to last
    // Friday — five days against five, never five against seven.
    const previous = previousPeriod(periodOf('week', FRIDAY))
    expect(previous?.start).toEqual(new Date(2026, 7, 17))
    expect(previous?.through).toEqual(new Date(2026, 7, 21))
  })

  it('a day compares with yesterday', () => {
    const previous = previousPeriod(periodOf('day', FRIDAY))
    expect(previous?.start).toEqual(new Date(2026, 7, 27))
    expect(previous?.through).toEqual(new Date(2026, 7, 27))
  })

  it('clamps a long month back onto a short one', () => {
    // 31 March, elapsed 31 days. February has 28, so the comparison must stop
    // at 28 February rather than spilling into March and counting a day twice.
    const previous = previousPeriod(periodOf('month', new Date(2026, 2, 31)))
    expect(previous?.start).toEqual(new Date(2026, 1, 1))
    expect(previous?.through).toEqual(new Date(2026, 1, 28))
  })

  it('has nothing to compare a hand-picked range to', () => {
    expect(previousPeriod(customPeriod(new Date(2026, 7, 1), new Date(2026, 7, 9)))).toBeUndefined()
  })
})

describe('bucketsOf', () => {
  it('a year is twelve months', () => {
    const buckets = bucketsOf(periodOf('year', FRIDAY), FRIDAY)
    expect(buckets).toHaveLength(12)
    expect(buckets.map((b) => b.label)).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ])
    // September onwards has not happened. The chart drops those to the baseline.
    expect(buckets.filter((b) => b.future).map((b) => b.label)).toEqual([
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ])
  })

  it('a week is seven weekdays, Monday first', () => {
    const buckets = bucketsOf(periodOf('week', FRIDAY), FRIDAY)
    expect(buckets.map((b) => b.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(buckets.filter((b) => b.future).map((b) => b.label)).toEqual(['Sat', 'Sun'])
  })

  it('a month is each of its own days', () => {
    const buckets = bucketsOf(periodOf('month', FRIDAY), FRIDAY)
    expect(buckets).toHaveLength(31)
    expect(buckets[0].label).toBe('1')
    expect(buckets[30].label).toBe('31')
  })

  it('a day is twenty-four hours', () => {
    const buckets = bucketsOf(periodOf('day', FRIDAY), FRIDAY)
    expect(buckets).toHaveLength(24)
    expect(buckets[0].label).toBe('12a')
    expect(buckets[23].label).toBe('11p')
  })

  it('a custom range is one column per day, both ends included', () => {
    const buckets = bucketsOf(customPeriod(new Date(2026, 7, 10), new Date(2026, 7, 20)), FRIDAY)
    expect(buckets).toHaveLength(11)
    expect(buckets[0].label).toBe('8/10')
    expect(buckets[10].label).toBe('8/20')
  })
})

describe('currentBucket', () => {
  it('finds the hour the reader is standing in', () => {
    // 14:30 on the Friday falls in the 14:00 bucket, which is index 14.
    expect(currentBucket(bucketsOf(periodOf('day', FRIDAY), FRIDAY), FRIDAY)).toBe(14)
  })

  it('reports -1 when now is outside the period entirely', () => {
    const buckets = bucketsOf(customPeriod(new Date(2026, 0, 1), new Date(2026, 0, 3)), FRIDAY)
    expect(currentBucket(buckets, FRIDAY)).toBe(-1)
  })
})

describe('the small pieces', () => {
  it('counts both ends of a day span', () => {
    expect(daysBetween(new Date(2026, 7, 10), new Date(2026, 7, 10))).toBe(1)
    expect(daysBetween(new Date(2026, 7, 10), new Date(2026, 7, 20))).toBe(11)
  })

  it('labels hours the way the reference does', () => {
    expect(hourLabel(0)).toBe('12a')
    expect(hourLabel(9)).toBe('9a')
    expect(hourLabel(12)).toBe('12p')
    expect(hourLabel(23)).toBe('11p')
  })
})
