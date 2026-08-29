// The arithmetic behind every number on the Stats screen.
//
// The cases that matter here are the ones a reader would notice and could not
// explain: a streak broken by a morning, a part-week compared with a whole one,
// a book sliding into the wrong month.

import { describe, expect, it } from 'vitest'

import {
  chartOf,
  activityByDay,
  summariseAll,
  heatmapOf,
  levelOf,
  minutesByDay,
  streakOf,
  summarisePeriod,
  weekOf,
  type StatsSources,
} from './gather.ts'
import { customPeriod, periodOf, previousPeriod } from './period.ts'
import type { StoredNote, StoredSession, StoredTutorThread } from '../storage/db.ts'
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

const empty: StatsSources = {
  books: [],
  sessions: [],
  threads: [],
  summaries: [],
  notes: [],
  concepts: [],
}

describe('levelOf', () => {
  it('gives one shade to each hour, on the exact boundaries', () => {
    expect(levelOf(0)).toBe(0)
    expect(levelOf(1)).toBe(1)
    expect(levelOf(59)).toBe(1)
    expect(levelOf(60)).toBe(2)
    expect(levelOf(119)).toBe(2)
    expect(levelOf(120)).toBe(3)
    expect(levelOf(179)).toBe(3)
    expect(levelOf(180)).toBe(4)
    expect(levelOf(239)).toBe(4)
    expect(levelOf(240)).toBe(5)
  })

  it('tells 88 minutes from 200', () => {
    // The reader's own two days. Under the old bands both were the darkest
    // square, because everything past an hour was.
    expect(levelOf(88)).toBe(2)
    expect(levelOf(203)).toBe(4)
  })

  it('has no shade above the darkest', () => {
    expect(levelOf(600)).toBe(5)
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
  const map = heatmapOf(new Map([['2026-08-28', 42]]), 2026)

  it('runs January to December, whatever today happens to be', () => {
    // A calendar year, not a rolling window: it must end on the 31st of
    // December even though December has not happened yet.
    expect(map.at(-1)?.day).toBe('2026-12-31')
    expect(map.some((d) => d.day === '2026-01-01')).toBe(true)
  })

  it('starts on a Monday, so no week column is ragged', () => {
    const [y, m, d] = map[0].day.split('-').map(Number)
    expect(new Date(y, m - 1, d).getDay()).toBe(1)
  })

  it('reaches back into December for that first Monday, and no further', () => {
    expect(map[0].day).toBe('2025-12-29')
  })

  it('shades a day by its own minutes', () => {
    expect(map.find((d) => d.day === '2026-08-28')).toEqual({
      day: '2026-08-28',
      minutes: 42,
      // Under an hour: the first shade. One shade is one hour.
      level: 1,
    })
  })

  it('shows another year as empty rather than borrowing this one’s days', () => {
    expect(heatmapOf(new Map([['2026-08-28', 42]]), 2025).every((d) => d.minutes === 0)).toBe(true)
  })
})

describe('activityByDay — the day’s commit log', () => {
  const day = new Date(2026, 7, 28)
  const morning = { ...session(day, 20, 9), chapterTitle: 'Of Anger', sectionTitle: 'ii' }
  const evening = { ...session(day, 43, 20), bookId: 'b2' as BookId }
  const glance = { ...session(day, 1, 22), activeMs: 12_000 }
  const books = [
    { id: 'b1' as BookId, title: 'On the Shortness of Life', author: 'Seneca' } as BookMeta,
    { id: 'b2' as BookId, title: 'Letters' } as BookMeta,
  ]
  const note = (at: Date, colour?: string): StoredNote =>
    ({
      bookId: 'b1' as BookId,
      id: `${at.getTime()}`,
      createdAt: at.toISOString(),
      ...(colour ? { colour } : {}),
    }) as StoredNote

  it('groups a day by book, longest first, and names the author', () => {
    const activity = activityByDay([morning, evening], books, [], []).get('2026-08-28')
    expect(activity?.totalMinutes).toBe(63)
    expect(activity?.books.map((b) => [b.bookTitle, b.totalMinutes])).toEqual([
      ['Letters', 43],
      ['On the Shortness of Life', 20],
    ])
    expect(activity?.books[1].author).toBe('Seneca')
  })

  it('marks a sub-minute session for squashing and leaves the rest alone', () => {
    const activity = activityByDay([morning, glance], books, [], []).get('2026-08-28')
    expect(activity?.books[0].sessions.map((s) => s.micro)).toEqual([false, true])
  })

  it('adds a squashed session to the totals even though it is not shown', () => {
    // Squashing is a way of drawing the day, not a way of discounting it.
    const activity = activityByDay([morning, glance], books, [], []).get('2026-08-28')
    expect(activity?.totalMinutes).toBe(20)
    expect(activity?.books[0].sessions).toHaveLength(2)
  })

  it('counts the highlights made while a session was running, and no others', () => {
    const marks = [
      note(new Date(2026, 7, 28, 9, 10), '#f2df6b'),
      note(new Date(2026, 7, 28, 9, 15), '#f2df6b'),
      // No colour: a note the reader typed, which is a different act.
      note(new Date(2026, 7, 28, 9, 20)),
      // After the session ended — a highlight made later belongs to no sitting.
      note(new Date(2026, 7, 28, 12, 0), '#f2df6b'),
    ]
    const line = activityByDay([morning], books, marks, []).get('2026-08-28')?.books[0].sessions[0]
    expect(line?.highlightCount).toBe(2)
  })

  it('counts the chats with Veda by when each question was asked', () => {
    const spoke = (id: string, at: number[]): StoredTutorThread =>
      ({
        bookId: 'b1' as BookId,
        id,
        messages: at.flatMap((ts) => [
          { role: 'you', text: 'q', ts },
          { role: 'claude', text: 'a', ts },
        ]),
      }) as StoredTutorThread

    // The sitting runs 9:00 to 9:20.
    const inside = new Date(2026, 7, 28, 9, 10).getTime()
    // A thread opened during the sitting and picked up again after it. Only the
    // question asked inside belongs to this session; the follow-up does not.
    const afterwards = new Date(2026, 7, 28, 9, 40).getTime()
    const elsewhere = new Date(2026, 7, 28, 14, 0).getTime()

    const line = activityByDay([morning], books, [], [
      spoke('t1', [inside, afterwards]),
      spoke('t2', [inside]),
      spoke('t3', [elsewhere]),
    ]).get('2026-08-28')?.books[0].sessions[0]

    expect(line?.chatCount).toBe(2)
    expect(line?.qaCount).toBe(2)
  })

  it('keeps the sessions in the order they happened', () => {
    const later = { ...session(day, 15, 21) }
    const order = activityByDay([later, morning], books, [], []).get('2026-08-28')?.books[0].sessions
    expect(order?.map((s) => new Date(s.startTime).getHours())).toEqual([9, 21])
  })

  it('says nothing rather than guessing when the book has been deleted', () => {
    // Sessions deliberately outlive their book. The title cannot.
    expect(activityByDay([morning], [], [], []).get('2026-08-28')?.books[0].bookTitle).toBeUndefined()
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

describe('a sitting that crossed midnight', () => {
  const overnight = {
    id: 'x',
    bookId: 'b1' as BookId,
    day: '2026-08-28',
    startedAt: new Date(2026, 7, 28, 23, 41).getTime(),
    endedAt: new Date(2026, 7, 29, 0, 25).getTime(),
    activeMs: 44 * 60_000,
  } as StoredSession

  it('lends its minutes to both days', () => {
    // The reader's own case: 24 minutes of reading on the 29th that the daily
    // goal used to score as zero.
    const byDay = minutesByDay([overnight])
    expect(byDay.get('2026-08-28')).toBe(19)
    expect(byDay.get('2026-08-29')).toBe(25)
  })

  it('is still one row, filed under the day it began', () => {
    const log = activityByDay([overnight], [], [], [])
    expect([...log.keys()]).toEqual(['2026-08-28'])
    const line = log.get('2026-08-28')!.books[0].sessions[0]
    expect(line.durationMinutes).toBe(44)
    // …but the day only counts the part that happened in it.
    expect(line.dayMinutes).toBe(19)
    expect(log.get('2026-08-28')!.totalMinutes).toBe(19)
  })
})

describe('weekOf', () => {
  it('is Monday to Sunday around the day it is given', () => {
    const byDay = new Map([['2026-08-28', 63]])
    const week = weekOf(byDay, new Date(2026, 7, 29))
    expect(week.map((d) => d.day)).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-29',
      '2026-08-30',
    ])
    expect(week[4].minutes).toBe(63)
    expect(week[4].level).toBe(2)
  })

  it('crosses the turn of the year without a gap', () => {
    const week = weekOf(new Map(), new Date(2027, 0, 1))
    expect(week[0].day).toBe('2026-12-28')
    expect(week[6].day).toBe('2027-01-03')
  })
})
