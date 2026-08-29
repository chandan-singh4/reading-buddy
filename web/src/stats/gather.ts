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
  StoredNote,
  StoredSession,
  StoredTutorThread,
} from '../storage/db.ts'
import type { BookId, BookMeta } from '../structure/index.ts'

/** Everything the screen reads, handed in together. */
export interface StatsSources {
  books: readonly BookMeta[]
  sessions: readonly StoredSession[]
  threads: readonly StoredTutorThread[]
  summaries: readonly StoredChapterSummary[]
  /** Notes and highlights together — a highlight is a note with a colour. */
  notes: readonly StoredNote[]
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

/**
 * One session, told in full, for the day's activity feed.
 *
 * The reason it exists: a day of "63 min" is a number the reader cannot check.
 * The sittings behind it are a record they can recognise — which book, when,
 * for how long, how far they got, and what they marked while they were there.
 */
export interface ReadingSession {
  id: string
  bookId: BookId
  /** Epoch milliseconds. */
  startTime: number
  endTime: number
  durationMinutes: number
  chapterTitle: string | undefined
  sectionTitle: string | undefined
  highlightCount: number
  noteCount: number
  /**
   * Under a minute. Squashed in the feed rather than shown, because a reader
   * who opens a book to check one word makes a row that is true and says
   * nothing — and enough of them bury the reading.
   */
  micro: boolean
}

/** A day's sessions in one book, in the order they happened. */
export interface BookActivity {
  bookId: BookId
  bookTitle: string | undefined
  author: string | undefined
  totalMinutes: number
  sessions: ReadingSession[]
}

export interface DayActivity {
  /** `YYYY-MM-DD`. */
  date: string
  totalMinutes: number
  books: BookActivity[]
}

/** Under this, a session is a lookup rather than a sitting. */
export const MICRO_MS = 60_000

/**
 * Every day's reading, grouped by book — what a tapped heatmap square opens.
 *
 * Grouped rather than listed flat because a day is usually one or two books,
 * and the book is the thing the reader recognises first. A flat list repeats
 * the title on every row and still makes "how long on this one?" a sum the
 * reader has to do in their head.
 */
export function activityByDay(
  sessions: readonly StoredSession[],
  books: readonly BookMeta[],
  notes: readonly StoredNote[],
): Map<string, DayActivity> {
  const meta = new Map(books.map((book) => [book.id, book]))

  // Marks are counted by when they were made, against the session that was
  // running at the time. A highlight carries a colour and a note does not —
  // that is the app's own way of telling them apart (see `StoredNote.colour`).
  const marks: { bookId: BookId; at: number; highlight: boolean }[] = []
  for (const note of notes) {
    const at = Date.parse(note.createdAt)
    if (Number.isFinite(at)) {
      marks.push({ bookId: note.bookId, at, highlight: note.colour !== undefined })
    }
  }

  const days = new Map<string, DayActivity>()

  for (const session of sessions) {
    const made = marks.filter(
      (mark) =>
        mark.bookId === session.bookId &&
        mark.at >= session.startedAt &&
        mark.at <= session.endedAt,
    )

    const line: ReadingSession = {
      id: session.id,
      bookId: session.bookId,
      startTime: session.startedAt,
      endTime: session.endedAt,
      // Rounded per session here, unlike the day total: this row has to match
      // what the reader remembers sitting through, not add up to the day's
      // figure. A day of six one-minute visits shows six rows of 1 min and a
      // total of 5, and that is the honest report of both facts.
      durationMinutes: Math.round(session.activeMs / 60_000),
      chapterTitle: session.chapterTitle,
      sectionTitle: session.sectionTitle,
      highlightCount: made.filter((mark) => mark.highlight).length,
      noteCount: made.filter((mark) => !mark.highlight).length,
      micro: session.activeMs < MICRO_MS,
    }

    let day = days.get(session.day)
    if (day === undefined) {
      day = { date: session.day, totalMinutes: 0, books: [] }
      days.set(session.day, day)
    }

    let book = day.books.find((entry) => entry.bookId === session.bookId)
    if (book === undefined) {
      const found = meta.get(session.bookId)
      book = {
        bookId: session.bookId,
        // A deleted book leaves its sessions behind on purpose — the reading
        // happened. So there may be no title to give.
        bookTitle: found?.title,
        author: found?.author,
        totalMinutes: 0,
        sessions: [],
      }
      day.books.push(book)
    }
    book.sessions.push(line)
  }

  // Totals are summed from milliseconds and rounded once, so a day of short
  // visits is not rounded away one row at a time.
  const msOf = (id: string): number => sessions.find((s) => s.id === id)?.activeMs ?? 0
  for (const day of days.values()) {
    let dayMs = 0
    for (const book of day.books) {
      book.sessions.sort((a, b) => a.startTime - b.startTime)
      const bookMs = book.sessions.reduce((sum, line) => sum + msOf(line.id), 0)
      book.totalMinutes = Math.round(bookMs / 60_000)
      dayMs += bookMs
    }
    // The book read most that day leads. On a day with one book this is a
    // no-op, which is most days.
    day.books.sort((a, b) => b.totalMinutes - a.totalMinutes)
    day.totalMinutes = Math.round(dayMs / 60_000)
  }

  return days
}

export interface AllTimeStats {
  streak: Streak
  heatmap: HeatDay[]
  /** Every day's reading, grouped by book — what a tapped square opens. */
  log: Map<string, DayActivity>
  /** The books with a recorded session — what the genre bars count. */
  readBooks: BookMeta[]
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

  /*
   * Genres count books the reader has actually *read*, not everything on the
   * shelf. An import is an intention; a session is the fact. Counting the shelf
   * made one hour with one book report "Philosophy 14", which is a description
   * of the library rather than of the reading — and tapping the bar then listed
   * thirteen books that were never opened.
   */
  const opened = new Set(sources.sessions.map((s) => s.bookId))
  const readBooks = sources.books.filter((book) => opened.has(book.id))

  const { counts, uncounted } = countGenres(readBooks)
  const split = splitFiction(readBooks)

  return {
    streak: streakOf(byDay, today),
    heatmap: heatmapOf(byDay, today),
    log: activityByDay(sources.sessions, sources.books, sources.notes),
    readBooks,
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
  chats: number
  singleChats: number
  deepChats: number
  concepts: number
  passages: number
  /** Chapters Veda summarised in the period. */
  chaptersSummarised: number
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
  //
  // Only the reader's turns are counted. Veda's replies were counted too, on a
  // second tile, and the two were the same number on every real day — a reply
  // follows a question. Two tiles reporting one fact is decoration.
  let questions = 0
  const touched: StoredTutorThread[] = []

  for (const thread of sources.threads) {
    let inPeriod = false
    for (const message of thread.messages) {
      if (!inWindow(message.ts, from, to)) continue
      inPeriod = true
      if (message.role === 'you') questions += 1
    }
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
  let chaptersSummarised = 0
  for (const summary of sources.summaries) {
    const ts = Date.parse(summary.recapAt)
    if (!Number.isFinite(ts) || !inWindow(ts, from, to)) continue
    chaptersSummarised += 1
    for (const concept of summary.concepts) tags.add(concept.name.trim().toLowerCase())
  }

  return {
    minutes: Math.round(ms / 60_000),
    deltaPercent,
    sessions: sessions.length,
    averageSession: sessions.length === 0 ? 0 : Math.round(ms / sessions.length / 60_000),
    longestSession: Math.round(longest / 60_000),
    questions,
    chats: touched.length,
    singleChats,
    deepChats: touched.length - singleChats,
    concepts,
    passages: touched.length,
    chaptersSummarised,
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
