/**
 * When in the day the reading happens — twenty-four buckets, one per hour.
 *
 * ## Why the minutes are spread, not filed
 *
 * A session that runs 8:48 pm to 9:51 pm belongs to two hours, not to one. So
 * each session's reading is spread across the wall-clock hours it covers, in
 * proportion to how much of the session fell in each. Filing the whole hour to
 * `startedAt` would draw an 8 pm spike for a reader who mostly reads at 10.
 *
 * The *active* minutes are spread, not the wall-clock span. A session is paused
 * time as well as reading time, and only the reading is a fact worth drawing.
 * Spreading it evenly across the span is an assumption, and the honest one: we
 * do not record which minute inside a sitting the reader was looking away.
 *
 * ## The peak window
 *
 * The run of hours around the busiest one, kept while an hour still holds a
 * real share of the busiest. It is a description of a habit, so it is stated as
 * a window and a percentage, never as a target.
 */

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

interface Span {
  startedAt: number
  endedAt: number
  activeMs: number
}

export function circadianOf(sessions: readonly Span[]): Circadian {
  const ms = new Array<number>(24).fill(0)

  for (const s of sessions) {
    if (s.activeMs <= 0) continue

    const span = Math.max(s.endedAt - s.startedAt, 1)
    // A row whose active time exceeds its span (a clock corrected mid-session,
    // or an older row) is spread over the span it claims, not beyond it.
    const rate = Math.min(s.activeMs / span, 1)

    let cursor = s.startedAt
    const end = Math.max(s.endedAt, s.startedAt + 1)
    while (cursor < end) {
      const at = new Date(cursor)
      const nextHour = new Date(
        at.getFullYear(),
        at.getMonth(),
        at.getDate(),
        at.getHours() + 1,
      ).getTime()
      const until = Math.min(nextHour, end)
      ms[at.getHours()] += (until - cursor) * rate
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
  let from = top
  let to = top
  while (from > 0 && minutes[from - 1] >= busiest * PEAK_SHARE) from -= 1
  while (to < 23 && minutes[to + 1] >= busiest * PEAK_SHARE) to += 1

  let inside = 0
  for (let h = 0; h < 24; h += 1) {
    if (h >= from && h <= to) {
      hours[h].level = 'peak'
      inside += minutes[h]
    } else if (minutes[h] >= busiest * WARM_SHARE) {
      hours[h].level = 'warm'
    }
  }

  return {
    hours,
    totalMinutes: total,
    peak: { from, to, percent: Math.round((inside / total) * 100) },
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
