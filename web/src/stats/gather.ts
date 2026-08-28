/**
 * Every number on the Stats screen, computed from stored rows.
 *
 * Split in two on purpose, because the screen is:
 *
 * - `summariseAll` — the streak, the heatmap and the genres. These ignore the
 *   scope toggle entirely. A streak is not a fact about "this week".
 * - `summarisePeriod` — the period card, the Veda card and the chart. These are
 *   recomputed every time the toggle moves.
 *
 * Everything here is pure: it takes rows and returns numbers, so the arithmetic
 * can be tested without a database. The reads live in `load.ts`.
 */

import { dayKey } from './sessions.ts'
import { addDays, bucketsOf, daysBetween, startOfDay, type Bucket, type Period } from './period.ts'
import { countGenres, splitFiction, type GenreCount } from './genres.ts'
import type {
  StoredChapterSummary,
  StoredConcept,
  StoredSession,
  StoredTutorThread,
} from '../storage/db.ts'
import type { BookMeta } from '../structure/index.ts'

/** Everything the screen reads, handed in together. */
export interface StatsSources {
  books: readonly BookMeta[]
  sessions: readonly StoredSession[]
  threads: readonly StoredTutorThread[]
  summaries: readonly StoredChapterSummary[]
  concepts: readonly StoredConcept[]
}

// --- The parts the scope toggle does not touch -------------------------------

export interface HeatDay {
  /** `YYYY-MM-DD`. */
  day: string
  minutes: number
  /** 0 to 4 — the reference's five shades. */
  level: 0 | 1 | 2 | 3 | 4
}

/**
 * The reference's five bands: none, under a quarter hour, under half an hour,
 * under an hour, an hour or more.
 */
export function levelOf(minutes: number): HeatDay['level'] {
  if (minutes <= 0) return 0
  if (minutes < 15) return 1
  if (minutes < 30) return 2
  if (minutes < 60) return 3
  return 4
}

/** Minutes read per day, keyed `YYYY-MM-DD`. */
export function minutesByDay(sessions: readonly StoredSession[]): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const session of sessions) {
    byDay.set(session.day, (byDay.get(session.day) ?? 0) + session.activeMs)
  }
  // Rounded once, at the end. Rounding each session first turns six fifty-second
  // visits into zero minutes instead of five.
  return new Map([...byDay].map(([day, ms]) => [day, Math.round(ms / 60_000)]))
}

export interface Streak {
  /** Consecutive days ending today, or ending yesterday if today is still empty. */
  current: number
  /** Days with any reading in the last 30, today included. */
  daysOfLast30: number
}

/**
 * The streak, counted back from today.
 *
 * Today not being read *yet* must not break a streak — it may be nine in the
 * morning. So the count starts at today when today has reading and at yesterday
 * when it does not, and only a gap before that ends it. A reader whose last day
 * was the day before yesterday has a streak of zero, which is the honest answer.
 */
export function streakOf(byDay: ReadonlyMap<string, number>, today: Date): Streak {
  const has = (d: Date): boolean => (byDay.get(dayKey(d)) ?? 0) > 0

  const start = startOfDay(today)
  let cursor = has(start) ? start : addDays(start, -1)
  let current = 0
  while (has(cursor)) {
    current += 1
    cursor = addDays(cursor, -1)
  }

  let daysOfLast30 = 0
  for (let i = 0; i < 30; i += 1) {
    if (has(addDays(start, -i))) daysOfLast30 += 1
  }

  return { current, daysOfLast30 }
}

/**
 * A rolling 12 months of days, oldest first, aligned so the first entry is a
 * Monday — the heatmap draws whole week-columns, and a ragged first column
 * would put Tuesday at the top of it.
 *
 * Days before the first recorded session come back as `level: 0`, like any
 * other empty day. Whether to grey those out is a question about presentation,
 * and the screen answers it; this function only reports minutes.
 */
export function heatmapOf(byDay: ReadonlyMap<string, number>, today: Date): HeatDay[] {
  const end = startOfDay(today)
  const rough = addDays(end, -364)
  const start = addDays(rough, -((rough.getDay() + 6) % 7))

  const out: HeatDay[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const key = dayKey(day)
    const minutes = byDay.get(key) ?? 0
    out.push({ day: key, minutes, level: levelOf(minutes) })
  }
  return out
}

export interface AllTimeStats {
  streak: Streak
  heatmap: HeatDay[]
  /** `YYYY-MM-DD`, or `undefined` before anything was ever recorded. */
  trackingStart: string | undefined
  genres: GenreCount[]
  /** Books with no usable subject heading — said out loud, never folded in. */
  uncountedGenres: number
  fiction: number
  nonfiction: number
}

export function summariseAll(sources: StatsSources, today: Date): AllTimeStats {
  const byDay = minutesByDay(sources.sessions)
  const { counts, uncounted } = countGenres(sources.books)
  const split = splitFiction(sources.books)

  return {
    streak: streakOf(byDay, today),
    heatmap: heatmapOf(byDay, today),
    trackingStart: [...byDay.keys()].sort()[0],
    genres: counts,
    uncountedGenres: uncounted,
    fiction: split.fiction,
    nonfiction: split.nonfiction,
  }
}

// --- The parts the scope toggle drives ---------------------------------------

export interface ChartPoint extends Bucket {
  books: number
  minutes: number
}

export interface PeriodStats {
  minutes: number
  /** Whole-number percent against the period before, or `undefined`. */
  deltaPercent: number | undefined
  sessions: number
  /** Minutes. */
  averageSession: number
  /** Minutes. */
  longestSession: number
  questions: number
  answers: number
  chats: number
  singleChats: number
  deepChats: number
  concepts: number
  passages: number
  explainBacks: number
  tags: number
  chart: ChartPoint[]
}

const inWindow = (ts: number, from: number, to: number): boolean => ts >= from && ts < to

/** Local midnight after `d` — the exclusive end of an inclusive day range. */
const endOf = (d: Date): number => addDays(startOfDay(d), 1).getTime()

export function summarisePeriod(
  sources: StatsSources,
  period: Period,
  previous: { start: Date; through: Date } | undefined,
  now: Date,
): PeriodStats {
  const from = period.start.getTime()
  const to = endOf(period.through)

  const sessions = sources.sessions.filter((s) => inWindow(s.startedAt, from, to))
  const ms = sessions.reduce((sum, s) => sum + s.activeMs, 0)
  const longest = sessions.reduce((max, s) => Math.max(max, s.activeMs), 0)

  let deltaPercent: number | undefined
  if (previous !== undefined) {
    const previousFrom = previous.start.getTime()
    const previousTo = endOf(previous.through)
    const before = sources.sessions
      .filter((s) => inWindow(s.startedAt, previousFrom, previousTo))
      .reduce((sum, s) => sum + s.activeMs, 0)
    // No previous reading means there is no percentage to state. "Up 100% from
    // nothing" is worse than saying nothing, because it looks measured.
    deltaPercent = before > 0 ? Math.round(((ms - before) / before) * 100) : undefined
  }

  // --- Veda ---------------------------------------------------------------
  //
  // Scoped by the timestamp on each *message*, not by the thread's own dates: a
  // thread opened last month and followed up on today is one question today,
  // not a whole conversation retroactively moved into this week.
  let questions = 0
  let answers = 0
  let explainBacks = 0
  const touched: StoredTutorThread[] = []

  for (const thread of sources.threads) {
    let inPeriod = false
    thread.messages.forEach((message, i) => {
      if (!inWindow(message.ts, from, to)) return
      inPeriod = true
      if (message.role === 'you') {
        questions += 1
        // An explain-back is done when Veda asked the reader to say it back and
        // the reader answered. The probe alone is Veda talking; the reply is the
        // reader doing the work, which is the part worth counting.
        if (thread.messages[i - 1]?.isProbe === true) explainBacks += 1
      } else {
        answers += 1
      }
    })
    if (inPeriod) touched.push(thread)
  }

  // Depth is a property of the whole thread, not of the slice inside the period:
  // a chat that went five questions deep did go deep, whichever week you look at
  // it from.
  let singleChats = 0
  for (const thread of touched) {
    if (thread.messages.filter((m) => m.role === 'you').length <= 1) singleChats += 1
  }

  const concepts = sources.concepts.filter((concept) => {
    const ts = Date.parse(concept.addedAt)
    return Number.isFinite(ts) && inWindow(ts, from, to)
  }).length

  // The tags Veda wrote for the reader's vault, counted distinctly: one idea
  // named in three chapters is one note in Obsidian, so it is one tag here.
  const tags = new Set<string>()
  for (const summary of sources.summaries) {
    const ts = Date.parse(summary.recapAt)
    if (!Number.isFinite(ts) || !inWindow(ts, from, to)) continue
    for (const concept of summary.concepts) tags.add(concept.name.trim().toLowerCase())
  }

  return {
    minutes: Math.round(ms / 60_000),
    deltaPercent,
    sessions: sessions.length,
    averageSession: sessions.length === 0 ? 0 : Math.round(ms / sessions.length / 60_000),
    longestSession: Math.round(longest / 60_000),
    questions,
    answers,
    chats: touched.length,
    singleChats,
    deepChats: touched.length - singleChats,
    concepts,
    passages: touched.length,
    explainBacks,
    tags: tags.size,
    chart: chartOf(sources, period, now),
  }
}

/**
 * The dual-axis chart's points.
 *
 * "Books read" is counted on `finishedAt` — the day the book was finished,
 * written once and never moved. Deriving it from a position's date instead
 * would slide a book into whichever week the reader last opened it to check a
 * quote, which is the exact fault `finishedAt` exists to prevent.
 */
export function chartOf(sources: StatsSources, period: Period, now: Date): ChartPoint[] {
  const buckets = bucketsOf(period, now)

  const finished: number[] = []
  for (const book of sources.books) {
    if (book.finishedAt === undefined) continue
    const ts = Date.parse(book.finishedAt)
    if (Number.isFinite(ts)) finished.push(ts)
  }

  return buckets.map((bucket) => ({
    ...bucket,
    books: bucket.future ? 0 : finished.filter((ts) => inWindow(ts, bucket.from, bucket.to)).length,
    minutes: bucket.future
      ? 0
      : Math.round(
          sources.sessions
            .filter((s) => inWindow(s.startedAt, bucket.from, bucket.to))
            .reduce((sum, s) => sum + s.activeMs, 0) / 60_000,
        ),
  }))
}

/** Minutes split for display. The reference never prints a bare count above 59. */
export function splitTime(minutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 }
}

/** How many days a custom range covers — the line that replaces the delta. */
export function spanDays(period: Period): number {
  return daysBetween(period.start, period.end)
}
