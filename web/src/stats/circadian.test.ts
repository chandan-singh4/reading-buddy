// When in the day the reading happened. The point of these cases is that a
// sitting belongs to every hour it touched, not only to the one it began in.

import { describe, expect, it } from 'vitest'

import { circadianOf, hourName, windowName } from './circadian.ts'

const at = (h: number, m = 0): number => new Date(2026, 7, 28, h, m).getTime()

const sitting = (fromH: number, fromM: number, toH: number, toM: number) => ({
  startedAt: at(fromH, fromM),
  endedAt: at(toH, toM),
  activeMs: at(toH, toM) - at(fromH, fromM),
})

describe('circadianOf', () => {
  it('spreads a sitting across every hour it covered', () => {
    // 8:48 pm to 9:51 pm is twelve minutes of the eight o'clock hour and
    // fifty-one of the nine. Filing all 63 to 8 pm would draw a spike at the
    // wrong hour.
    const { hours } = circadianOf([sitting(20, 48, 21, 51)])
    expect(hours[20].minutes).toBe(12)
    expect(hours[21].minutes).toBe(51)
    expect(hours[19].minutes).toBe(0)
  })

  it('spreads the reading time, not the time the book was open', () => {
    // Two hours open, one hour read. Half of each hour, not a full first hour.
    const paused = { startedAt: at(10), endedAt: at(12), activeMs: 60 * 60_000 }
    const { hours, totalMinutes } = circadianOf([paused])
    expect(totalMinutes).toBe(60)
    expect(hours[10].minutes).toBe(30)
    expect(hours[11].minutes).toBe(30)
  })

  it('finds the window around the busiest hour', () => {
    const { peak } = circadianOf([sitting(20, 0, 23, 0), sitting(9, 0, 9, 10)])
    expect(peak).toEqual({ from: 20, to: 22, percent: 95 })
  })

  it('describes nothing when there was no reading', () => {
    const empty = circadianOf([])
    expect(empty.peak).toBeUndefined()
    expect(empty.totalMinutes).toBe(0)
    expect(empty.hours).toHaveLength(24)
  })

  it('crosses midnight without losing the minutes', () => {
    const overran = {
      startedAt: new Date(2026, 7, 28, 23, 41).getTime(),
      endedAt: new Date(2026, 7, 29, 0, 25).getTime(),
      activeMs: 44 * 60_000,
    }
    const { hours, totalMinutes } = circadianOf([overran])
    expect(totalMinutes).toBe(44)
    expect(hours[23].minutes).toBe(19)
    expect(hours[0].minutes).toBe(25)
  })
})

describe('naming the hours', () => {
  it('uses the screen’s own clock', () => {
    expect(hourName(0)).toBe('12 am')
    expect(hourName(9)).toBe('9 am')
    expect(hourName(12)).toBe('12 pm')
    expect(hourName(20)).toBe('8 pm')
  })

  it('names the window by the hour it ends, not the hour it last touched', () => {
    // Buckets 20–22 run until 11 pm. "8 pm – 10 pm" would hide an hour.
    expect(windowName(20, 22)).toBe('8 pm – 11 pm')
    expect(windowName(22, 23)).toBe('10 pm – 12 am')
  })
})

describe('a period’s own hours', () => {
  it('draws only the part of a midnight sitting that fell inside the period', () => {
    // The 29th owns twenty-five minutes of this sitting, all of them in the
    // midnight hour. Last night's eleven o'clock belongs to the 28th.
    const overnight = {
      startedAt: new Date(2026, 7, 28, 23, 41).getTime(),
      endedAt: new Date(2026, 7, 29, 0, 25).getTime(),
      activeMs: 44 * 60_000,
    }
    const { hours, totalMinutes } = circadianOf(
      [overnight],
      new Date(2026, 7, 29).getTime(),
      new Date(2026, 7, 30).getTime(),
    )
    expect(totalMinutes).toBe(25)
    expect(hours[0].minutes).toBe(25)
    expect(hours[23].minutes).toBe(0)
  })
})
