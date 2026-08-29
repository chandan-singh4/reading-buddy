// The arithmetic behind every number on the Stats screen.
//
// The cases that matter here are the ones a reader would notice and could not
// explain: a streak broken by a morning, a part-week compared with a whole one,
// a book sliding into the wrong month.

import { describe, expect, it } from 'vitest'

import {
  chartOf,
  logByDay,
  summariseAll,
  heatmapOf,
  levelOf,
  minutesByDay,
  streakOf,
  summarisePeriod,
  type StatsSources,
} from './gather.ts'
import { customPeriod, periodOf, previousPeriod } from './period.ts'
import type { StoredSession, StoredTutorThread } from '../storage/db.ts'
import type { BookId, BookMeta } from '../structure/index.ts'

const FRIDAY = new Date(2026, 7, 28, 14, 30)

const pad = (n: number): string => String(n).padStart(2, '0')
const key = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function session(day: Date, minutes: number, hour = 10): StoredSession {
  const started = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour)
  return {
    id: `${key(day)}-${hour}`,
    bookId: 'b1' as BookId,
    day: key(day),
    startedAt: started.getTime(),
    endedAt: started.getTime() + minutes * 60_000,
    activeMs: minutes * 60_000,
  }
}

const empty: StatsSources = { books: [], sessions: [], threads: [], summaries: [], concepts: [] }

describe('levelOf', () => {
  it('draws the reference’s five bands on their exact boundaries', () => {
    expect(levelOf(0)).toBe(0)
    expect(levelOf(1)).toBe(1)
    expect(levelOf(14)).toBe(1)
    expect(levelOf(15)).toBe(2)
    expect(levelOf(29)).toBe(2)
    expect(levelOf(30)).toBe(3)
    expect(levelOf(59)).toBe(3)
    expect(levelOf(60)).toBe(4)
  })
})

describe('minutesByDay', () => {
  it('adds a day’s sessions together', () => {
    const day = new Date(2026, 7, 28)
    const byDay = minutesByDay([session(day, 20, 9), session(day, 25, 19)])
    expect(byDay.get('2026-08-28')).toBe(45)
  })

  it('rounds once at the end, so short visits are not rounded away one by one', () => {
    // Six fifty-second visits. Rounded per session that is 0 minutes; rounded
    // once at the end it is the 5 minutes the reader actually spent.
    const day = new Date(2026, 7, 28)
    const sessions = Array.from({ length: 6 }, (_, i) => ({
      ...session(day, 1, 8 + i),
      activeMs: 50_000,
    }))
    expect(minutesByDay(sessions).get('2026-08-28')).toBe(5)
  })
})

describe('streakOf', () => {
  const days = (...offsets: number[]): Map<string, number> =>
    new Map(
      offsets.map((back) => {
        const d = new Date(2026, 7, 28 - back)
        return [key(d), 30]
      }),
    )

  it('counts back from today', () => {
    expect(streakOf(days(0, 1, 2), FRIDAY).current).toBe(3)
  })

  it('does not break a streak just because today is not read yet', () => {
    // It is half past two in the afternoon and the reader has not opened a book.
    // Yesterday and the day before still count.
    expect(streakOf(days(1, 2, 3), FRIDAY).current).toBe(3)
  })

  it('is zero once a whole day has been missed', () => {
    // Last read the day before yesterday. Yesterday is a real gap.
    expect(streakOf(days(2, 3, 4), FRIDAY).current).toBe(0)
  })

  it('stops at the first gap rather than counting every day there is', () => {
    expect(streakOf(days(0, 1, 3, 4, 5), FRIDAY).current).toBe(2)
  })

  it('counts the last thirty days regardless of gaps', () => {
    expect(streakOf(days(0, 5, 10, 29, 30, 40), FRIDAY).daysOfLast30).toBe(4)
  })
})

describe('heatmapOf', () => {
  const map = heatmapOf(new Map([['2026-08-28', 42]]), FRIDAY)

  it('covers a rolling year and stops at today', () => {
    expect(map.at(-1)?.day).toBe('2026-08-28')
    expect(map.length).toBeGreaterThan(365)
  })

  it('starts on a Monday, so no week column is ragged', () => {
    const [y, m, d] = map[0].day.split('-').map(Number)
    expect(new Date(y, m - 1, d).getDay()).toBe(1)
  })

  it('shades a day by its own minutes', () => {
    expect(map.at(-1)).toEqual({ day: '2026-08-28', minutes: 42, level: 3 })
  })
})

describe('logByDay — the heatmap tip’s ledger', () => {
  const day = new Date(2026, 7, 28)
  const morning = { ...session(day, 20, 9), chapterTitle: 'Of Anger', sectionTitle: 'ii' }
  const evening = { ...session(day, 43, 20), bookId: 'b2' as BookId }
  const books = [
    { id: 'b1' as BookId, title: 'On the Shortness of Life' } as BookMeta,
    { id: 'b2' as BookId, title: 'Letters' } as BookMeta,
  ]

  it('tells each sitting in full, in the order they happened', () => {
    const lines = logByDay([evening, morning], books).get('2026-08-28')
    expect(lines?.map((l) => [l.book, l.minutes])).toEqual([
      ['On the Shortness of Life', 20],
      ['Letters', 43],
    ])
    expect(lines?.[0].chapterTitle).toBe('Of Anger')
    expect(lines?.[0].sectionTitle).toBe('ii')
  })

  it('leaves the place empty for a session recorded before it was tracked', () => {
    expect(logByDay([evening], books).get('2026-08-28')?.[0].chapterTitle).toBeUndefined()
  })

  it('says nothing rather than guessing when the book has been deleted', () => {
    // Sessions deliberately outlive their book. The title cannot.
    expect(logByDay([morning], []).get('2026-08-28')?.[0].book).toBeUndefined()
  })
})

describe('summariseAll — genres', () => {
  const shelf = [
    { id: 'b1' as BookId, title: 'read', subjects: ['Philosophy / Ethics'] } as BookMeta,
    { id: 'b2' as BookId, title: 'unread', subjects: ['Philosophy / Logic'] } as BookMeta,
  ]

  it('counts only the books that were actually opened', () => {
    // The reported fault: a shelf of 14 imports and one hour of reading said
    // "Philosophy 14", then listed thirteen books that were never opened.
    const all = summariseAll(
      { ...empty, books: shelf, sessions: [session(new Date(2026, 7, 28), 60)] },
      FRIDAY,
    )
    expect(all.genres).toEqual([{ name: 'Philosophy', books: 1 }])
    expect(all.readBooks.map((b) => b.title)).toEqual(['read'])
  })

  it('counts nothing at all before any reading is recorded', () => {
    expect(summariseAll({ ...empty, books: shelf }, FRIDAY).genres).toEqual([])
  })
})

describe('summarisePeriod — time', () => {
  const sources: StatsSources = {
    ...empty,
    sessions: [
      // This week (Mon 24 to Fri 28)
      session(new Date(2026, 7, 24), 30),
      session(new Date(2026, 7, 26), 60),
      session(new Date(2026, 7, 28), 30),
      // Last week, the same five weekdays
      session(new Date(2026, 7, 17), 30),
      session(new Date(2026, 7, 19), 30),
      // Last week's weekend — outside the elapsed window, must not count
      session(new Date(2026, 7, 22), 600),
    ],
  }

  const week = periodOf('week', FRIDAY)
  const stats = summarisePeriod(sources, week, previousPeriod(week), FRIDAY)

  it('totals only the sessions inside the period', () => {
    expect(stats.minutes).toBe(120)
    expect(stats.sessions).toBe(3)
    expect(stats.averageSession).toBe(40)
    expect(stats.longestSession).toBe(60)
  })

  it('compares against the same elapsed days, not the whole previous week', () => {
    // 120 this week against 60 in last week's Monday-to-Friday. The ten hours
    // on last Saturday are outside the comparison and would have made this -80%.
    expect(stats.deltaPercent).toBe(100)
  })

  it('states no percentage when there was nothing before', () => {
    const only = { ...empty, sessions: [session(new Date(2026, 7, 28), 30)] }
    expect(summarisePeriod(only, week, previousPeriod(week), FRIDAY).deltaPercent).toBeUndefined()
  })

  it('has no delta at all for a hand-picked range', () => {
    const custom = customPeriod(new Date(2026, 7, 10), new Date(2026, 7, 20))
    expect(summarisePeriod(sources, custom, previousPeriod(custom), FRIDAY).deltaPercent).toBeUndefined()
  })
})

describe('summarisePeriod — Veda', () => {
  const at = (day: number, hour = 10): number => new Date(2026, 7, day, hour).getTime()

  const thread = (id: string, messages: StoredTutorThread['messages']): StoredTutorThread => ({
    bookId: 'b1' as BookId,
    id,
    anchor: 'ch01/s01#p1' as StoredTutorThread['anchor'],
    excerpt: 'x',
    kind: 'paragraph',
    messages,
    createdAt: '2026-08-24T10:00:00.000Z',
    updatedAt: '2026-08-28T10:00:00.000Z',
  })

  const sources: StatsSources = {
    ...empty,
    threads: [
      // One question, one answer — a single Q&A.
      thread('t1', [
        { role: 'you', text: 'what', ts: at(25) },
        { role: 'claude', text: 'this', ts: at(25) },
      ]),
      // Three questions — went deeper. One of them answers a probe.
      thread('t2', [
        { role: 'you', text: 'q1', ts: at(26) },
        { role: 'claude', text: 'a1', isProbe: true, ts: at(26) },
        { role: 'you', text: 'my go', ts: at(26) },
        { role: 'claude', text: 'a2', ts: at(26) },
        { role: 'you', text: 'q3', ts: at(27) },
        { role: 'claude', text: 'a3', ts: at(27) },
      ]),
      // Entirely last month — must not appear at all.
      thread('t3', [
        { role: 'you', text: 'old', ts: new Date(2026, 6, 3, 10).getTime() },
        { role: 'claude', text: 'old', ts: new Date(2026, 6, 3, 10).getTime() },
      ]),
    ],
  }

  const week = periodOf('week', FRIDAY)
  const stats = summarisePeriod(sources, week, previousPeriod(week), FRIDAY)

  it('counts every question the reader asked, follow-ups included', () => {
    expect(stats.questions).toBe(4)
  })

  it('counts a thread as one passage and one chat', () => {
    expect(stats.chats).toBe(2)
    expect(stats.passages).toBe(2)
  })

  it('splits chats on how deep they went', () => {
    expect(stats.singleChats).toBe(1)
    expect(stats.deepChats).toBe(1)
  })

  it('leaves a thread from another month out entirely', () => {
    // `t3` has two messages. If the scope leaked it, questions would be 5.
    expect(stats.questions).toBe(4)
  })

  it('keeps a thread’s depth even when only its follow-up falls in the period', () => {
    // The Day scope sees only the 27th, where `t2` has one message — but `t2`
    // is still a conversation that went deeper, and must not be reclassified.
    const day = periodOf('day', new Date(2026, 7, 27, 14))
    const narrow = summarisePeriod(sources, day, previousPeriod(day), new Date(2026, 7, 27, 14))
    expect(narrow.chats).toBe(1)
    expect(narrow.deepChats).toBe(1)
    expect(narrow.singleChats).toBe(0)
  })
})

describe('chartOf', () => {
  const book = (id: string, finishedAt: string): BookMeta =>
    ({ id: id as BookId, title: id, importedAt: '2026-01-01T00:00:00.000Z', finishedAt }) as BookMeta

  it('files a book in the month it was finished', () => {
    const sources: StatsSources = {
      ...empty,
      books: [book('a', new Date(2026, 2, 9, 12).toISOString()), book('b', new Date(2026, 7, 2, 12).toISOString())],
    }
    const points = chartOf(sources, periodOf('year', FRIDAY), FRIDAY)
    expect(points[2].books).toBe(1)
    expect(points[7].books).toBe(1)
    expect(points.reduce((sum, p) => sum + p.books, 0)).toBe(2)
  })

  it('drops every future bucket to the baseline', () => {
    const sources: StatsSources = { ...empty, sessions: [session(new Date(2026, 7, 28), 45)] }
    const points = chartOf(sources, periodOf('week', FRIDAY), FRIDAY)
    expect(points[4].minutes).toBe(45)
    expect(points[5]).toMatchObject({ label: 'Sat', minutes: 0, books: 0, future: true })
    expect(points[6]).toMatchObject({ label: 'Sun', minutes: 0, books: 0, future: true })
  })

  it('buckets a day by the hour reading started', () => {
    const sources: StatsSources = {
      ...empty,
      sessions: [session(new Date(2026, 7, 28), 20, 9), session(new Date(2026, 7, 28), 40, 13)],
    }
    const points = chartOf(sources, periodOf('day', FRIDAY), FRIDAY)
    expect(points[9].minutes).toBe(20)
    expect(points[13].minutes).toBe(40)
    expect(points[10].minutes).toBe(0)
  })
})
