/**
 * When in the day the reading happens — twenty-four buckets, one per hour.
 *
 * ## Why the minutes are spread, not filed
 *
 * A session that runs 8:48 pm to 9:51 pm belongs to two hours, not to one, so
 * it is spread across both — by `spread.ts`, the same rule that puts a sitting
 * that crosses midnight on both days. Filing the whole hour to `startedAt`
 * would draw an 8 pm spike for a reader who mostly reads at 10.
 *
 * ## The peak window
 *
 * The run of hours around the busiest one, kept while an hour still holds a
 * real share of the busiest. It is a description of a habit, so it is stated as
 * a window and a percentage, never as a target.
 */

import { msInWindow, type Span } from './spread.ts'

/** An hour is part of the peak window while it holds this much of the busiest. */
const PEAK_SHARE = 0.4
/** Below this share of the busiest hour, a bar is drawn as quiet. */
const WARM_SHARE = 0.15

export interface HourBucket {
  /** 0 to 23. */
  hour: number
  minutes: number
  /** How the bar is drawn: quiet, warm, or part of the peak window. */
  level: 'quiet' | 'warm' | 'peak'
}

export interface Circadian {
  hours: HourBucket[]
  totalMinutes: number
  /** The peak window, or `undefined` when there is nothing to describe. */
  peak?: {
    /** First hour, inclusive. */
    from: number
    /** Last hour, inclusive. */
    to: number
    /** Whole-number percent of the period's reading inside the window. */
    percent: number
  }
}

/**
 * `from` and `to` bound the period. A sitting that ran past midnight is counted
 * only for the hours inside them, so the Day view does not draw last night's
 * hours onto today.
 */
export function circadianOf(
  sessions: readonly Span[],
  from = -Infinity,
  to = Infinity,
): Circadian {
  const ms = new Array<number>(24).fill(0)

  for (const s of sessions) {
    if (s.activeMs <= 0) continue

    let cursor = Math.max(s.startedAt, from)
    const end = Math.min(Math.max(s.endedAt, s.startedAt + 1), to)
    while (cursor < end) {
      const at = new Date(cursor)
      const nextHour = new Date(
        at.getFullYear(),
        at.getMonth(),
        at.getDate(),
        at.getHours() + 1,
      ).getTime()
      const until = Math.min(nextHour, end)
      ms[at.getHours()] += msInWindow(s, cursor, until)
      cursor = until
    }
  }

  const minutes = ms.map((v) => Math.round(v / 60_000))
  const total = minutes.reduce((sum, v) => sum + v, 0)
  const busiest = Math.max(...minutes)

  const hours: HourBucket[] = minutes.map((value, hour) => ({
    hour,
    minutes: value,
    level: 'quiet',
  }))

  if (total === 0 || busiest === 0) return { hours, totalMinutes: 0 }

  const top = minutes.indexOf(busiest)
  let lo = top
  let hi = top
  while (lo > 0 && minutes[lo - 1] >= busiest * PEAK_SHARE) lo -= 1
  while (hi < 23 && minutes[hi + 1] >= busiest * PEAK_SHARE) hi += 1

  let inside = 0
  for (let h = 0; h < 24; h += 1) {
    if (h >= lo && h <= hi) {
      hours[h].level = 'peak'
      inside += minutes[h]
    } else if (minutes[h] >= busiest * WARM_SHARE) {
      hours[h].level = 'warm'
    }
  }

  return {
    hours,
    totalMinutes: total,
    peak: { from: lo, to: hi, percent: Math.round((inside / total) * 100) },
  }
}

/** `8 pm`, `12 am`. The screen's own 12-hour clock. */
export function hourName(h: number): string {
  if (h === 0) return '12 am'
  if (h < 12) return `${h} am`
  if (h === 12) return '12 pm'
  return `${h - 12} pm`
}

/**
 * `8 pm – 11 pm`. The window is named by the hour it starts and the hour the
 * last bucket *ends*, because "8 pm to 10 pm" for buckets 20–22 would hide the
 * last hour it is describing.
 */
export function windowName(from: number, to: number): string {
  return `${hourName(from)} – ${hourName((to + 1) % 24)}`
}
