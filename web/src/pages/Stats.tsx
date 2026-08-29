import { useEffect, useMemo, useState } from 'react'

import BooksTimeChart from '../stats/BooksTimeChart.tsx'
import GenreBars from '../stats/GenreBars.tsx'
import Heatmap from '../stats/Heatmap.tsx'
import RangeCalendar from '../stats/RangeCalendar.tsx'
import { loadStats } from '../stats/load.ts'
import { dayKey } from '../stats/sessions.ts'
import { splitTime, spanDays, summariseAll, summarisePeriod, type StatsSources } from '../stats/gather.ts'
import {
  customPeriod,
  periodOf,
  previousPeriod,
  type Period,
  type Scope,
} from '../stats/period.ts'
import styles from '../stats/stats.module.css'

/**
 * The Statistics screen, built from `design-inspiration/reading-buddy-stats.html`.
 *
 * ## What the scope toggle does and does not touch
 *
 * It drives three cards: the period summary, the Veda card and the chart. It
 * deliberately does not touch the streak, the heatmap or the genres — those
 * three answer questions about a habit and a shelf, and "this week" is not a
 * sensible slice of either. That separation is the whole information design of
 * the screen, so the two `useMemo`s below are split along exactly that line.
 *
 * ## Everything is read once
 *
 * One load, then all the arithmetic happens in memory as the toggle moves. The
 * alternative — a query per scope change — would put a database round trip
 * behind a segmented control, and a segmented control has to feel instant.
 *
 * The screen is deliberately loud in a way the old one refused to be. That was
 * a considered reversal, not an oversight: the earlier build said "no streaks,
 * no pressure" and the reader asked for the streak by name.
 */

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; sources: StatsSources }
  | { status: 'failed'; message: string }

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const MONTHS_SHORT = [
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
]

const dayLabel = (d: Date): string => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`

const SCOPES: { key: Exclude<Scope, 'custom'>; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
]

export default function Stats() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [scope, setScope] = useState<Scope>('week')
  const [custom, setCustom] = useState<{ start: Date; end: Date } | undefined>()
  const [calendarOpen, setCalendarOpen] = useState(false)

  /*
   * "Now" is pinned once, when the screen mounts.
   *
   * A fresh `new Date()` inside a `useMemo` would make the memo lie: it would
   * recompute on every render and return a different answer each time, so the
   * chart's "you are here" dot could move mid-interaction. One moment, held for
   * the visit, is what makes every card on the screen agree with every other.
   */
  const now = useMemo(() => new Date(), [])

  useEffect(() => {
    let cancelled = false

    loadStats()
      .then((sources) => {
        if (!cancelled) setState({ status: 'ready', sources })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const sources = state.status === 'ready' ? state.sources : undefined

  const allTime = useMemo(
    () => (sources ? summariseAll(sources, now) : undefined),
    [sources, now],
  )

  const period: Period = useMemo(
    () =>
      scope === 'custom' && custom !== undefined
        ? customPeriod(custom.start, custom.end)
        : periodOf(scope === 'custom' ? 'week' : scope, now),
    [scope, custom, now],
  )

  const stats = useMemo(
    () => (sources ? summarisePeriod(sources, period, previousPeriod(period), now) : undefined),
    [sources, period, now],
  )

  if (state.status === 'loading') {
    return (
      <div className={styles.shell}>
        <Header />
        <p className={styles.empty}>Loading…</p>
      </div>
    )
  }

  if (state.status === 'failed') {
    return (
      <div className={styles.shell}>
        <Header />
        <div role="alert">
          <p>Couldn’t load your stats.</p>
          <p className={styles.empty}>{state.message}</p>
        </div>
      </div>
    )
  }

  if (allTime === undefined || stats === undefined) return null

  const trackingStart =
    allTime.trackingStart === undefined
      ? undefined
      : // `YYYY-MM-DD` split by hand: `new Date('2026-08-28')` parses as UTC and
        // lands on the 27th for anyone west of London.
        (([y, m, d]) => new Date(Number(y), Number(m) - 1, Number(d)))(
          allTime.trackingStart.split('-'),
        )

  const time = splitTime(stats.minutes)

  return (
    <div className={styles.shell}>
      <Header />

      {/* 1 — Streak. Independent of the toggle. */}
      <div className={styles.card}>
        <div className={styles.streak}>
          <div className={styles.flame} aria-hidden="true">
            🔥
          </div>
          <div>
            <div className={styles.streakN}>
              {allTime.streak.current} day{allTime.streak.current === 1 ? '' : 's'} streak
            </div>
            <div className={styles.streakT}>
              You’ve read {allTime.streak.daysOfLast30} of the last 30 days.
            </div>
          </div>
        </div>
      </div>

      {/* 2 — Heatmap. Independent of the toggle. */}
      <Heatmap
        days={allTime.heatmap}
        today={dayKey(now)}
        trackingStart={allTime.trackingStart}
        log={allTime.log}
      />

      {/* 3 — Scope */}
      <div className={styles.divide}>
        <span>Break it down</span>
      </div>

      <div className={styles.scope}>
        <div className={styles.seg} role="group" aria-label="Period">
          {SCOPES.map((option) => (
            <button
              type="button"
              key={option.key}
              className={scope === option.key ? styles.segOn : undefined}
              aria-pressed={scope === option.key}
              onClick={() => setScope(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`${styles.calBtn} ${scope === 'custom' ? styles.calBtnOn : ''}`}
          aria-label="Custom range"
          // Nothing to pick before anything was recorded — the window would be
          // empty, and an empty calendar is a puzzle, not a control.
          disabled={trackingStart === undefined}
          onClick={() => setCalendarOpen(true)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
            <path d="M3 9h18M8 2.5v4M16 2.5v4" />
          </svg>
        </button>
      </div>

      <div className={styles.rangeLine}>{rangeLine(period)}</div>

      {/* 4 — Period summary */}
      <div className={`${styles.card} ${styles.hero}`}>
        <div className={styles.big}>
          {time.hours > 0 && (
            <>
              {time.hours}
              <span className={styles.unit}>h</span>{' '}
            </>
          )}
          {time.minutes}
          <span className={styles.unit}>m</span>
        </div>
        <div className={styles.sub}>
          reading ·{' '}
          <span
            className={`${styles.delta} ${
              stats.deltaPercent === undefined
                ? ''
                : stats.deltaPercent >= 0
                  ? styles.up
                  : styles.down
            }`}
          >
            {deltaLine(period, stats.deltaPercent)}
          </span>
        </div>
        <div className={styles.trio}>
          <div className={styles.trioCell}>
            <div className={styles.trioN}>{stats.sessions}</div>
            <div className={styles.trioT}>sessions</div>
          </div>
          <div className={styles.trioCell}>
            <div className={styles.trioN}>{shortTime(stats.averageSession)}</div>
            <div className={styles.trioT}>avg session</div>
          </div>
          <div className={styles.trioCell}>
            <div className={styles.trioN}>{shortTime(stats.longestSession)}</div>
            <div className={styles.trioT}>longest</div>
          </div>
        </div>
      </div>

      {/* 5 — Veda */}
      <div className={`${styles.card} ${styles.veda}`}>
        <div className={styles.cardLabel}>With Veda · this period</div>

        {/* One figure, not two. "Answers from Veda" sat here and was the same
            number as the questions on every real day, because a reply follows a
            question — a second tile reporting the first tile's fact. */}
        <div className={styles.qa}>
          <div className={styles.qaCell}>
            <div className={styles.qaN}>{stats.questions}</div>
            <div className={styles.qaT}>
              question{stats.questions === 1 ? '' : 's'} asked &amp; answered
            </div>
          </div>
        </div>

        <div className={styles.depthLabel}>
          <span>
            {stats.chats} chat{stats.chats === 1 ? '' : 's'}
          </span>
          <span>chat depth</span>
        </div>
        <div className={styles.depthBar} aria-hidden="true">
          <i
            className={styles.depthSingle}
            style={{ width: stats.chats === 0 ? 0 : `${(stats.singleChats / stats.chats) * 100}%` }}
          />
          <i
            className={styles.depthDeep}
            style={{ width: stats.chats === 0 ? 0 : `${(stats.deepChats / stats.chats) * 100}%` }}
          />
        </div>
        <div className={styles.depthKey}>
          <span>
            <span className={styles.dot} style={{ background: 'var(--veda-lite)' }} />
            <b>{stats.singleChats}</b> single Q&amp;A
          </span>
          <span>
            <span className={styles.dot} style={{ background: 'var(--veda)' }} />
            <b>{stats.deepChats}</b> went deeper
          </span>
        </div>

        <div className={styles.vedaGrid}>
          <div>
            <div className={styles.vstatN}>{stats.concepts}</div>
            <div className={styles.vstatT}>concepts explored</div>
          </div>
          <div>
            <div className={styles.vstatN}>{stats.passages}</div>
            <div className={styles.vstatT}>passages explained</div>
          </div>
          <div>
            {/* Not the reference's "explain-backs done". That counted only the
                replies to Veda's own Socratic probes, which are rare — so the
                tile read zero on days full of conversation and taught the
                reader to distrust the card. */}
            <div className={styles.vstatN}>{stats.chaptersSummarised}</div>
            <div className={styles.vstatT}>chapters summarised</div>
          </div>
          <div>
            {/* Not the reference's "revision flags cleared" — nothing in the app
                sets or clears one. These are the tags Veda wrote when it
                summarised a chapter, which is what the reader takes to Obsidian. */}
            <div className={styles.vstatN}>{stats.tags}</div>
            <div className={styles.vstatT}>tags created</div>
          </div>
        </div>
      </div>

      {/* 6 — Books & time */}
      <BooksTimeChart points={stats.chart} suffix={chartSuffix(period)} now={now} />

      {/* 7 — Genres. Independent of the toggle. */}
      <GenreBars
        genres={allTime.genres}
        books={allTime.readBooks}
        uncounted={allTime.uncountedGenres}
        fiction={allTime.fiction}
        nonfiction={allTime.nonfiction}
      />

      {calendarOpen && trackingStart !== undefined && (
        <RangeCalendar
          trackingStart={trackingStart}
          today={now}
          onCancel={() => setCalendarOpen(false)}
          onApply={(start, end) => {
            setCustom({ start, end })
            setScope('custom')
            setCalendarOpen(false)
          }}
        />
      )}
    </div>
  )
}

function Header() {
  return (
    // A plain div, not a <header>: `AppShell` already provides the page's
    // banner landmark, and a second one is a screen reader announcing two
    // headers for one screen.
    <div className={styles.header}>
      {/* No kicker. The app's name is already in the bar directly above this,
          and printing it twice makes the reader read it twice. */}
      <h1 className={styles.h1}>Statistics</h1>
    </div>
  )
}

/** `1h 12m`, or `47m`. The trio and the chart both want the compact form. */
function shortTime(minutes: number): string {
  const { hours, minutes: rest } = splitTime(minutes)
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`
}

function rangeLine(period: Period) {
  switch (period.scope) {
    case 'day':
      return (
        <>
          Today · <b>{dayLabel(period.start)}</b>
        </>
      )
    case 'week':
      return (
        <>
          This week · <b>{`${dayLabel(period.start)} – ${period.end.getDate()}`}</b>
        </>
      )
    case 'month':
      return (
        <>
          {MONTHS_LONG[period.start.getMonth()]} · <b>{`1 – ${period.through.getDate()}`}</b>
        </>
      )
    case 'year':
      return (
        <>
          {period.start.getFullYear()} · <b>year to date</b>
        </>
      )
    case 'custom':
      return (
        <>
          Custom · <b>{`${dayLabel(period.start)} – ${dayLabel(period.end)}`}</b>
        </>
      )
  }
}

/**
 * The line under the hero number.
 *
 * A custom range gets "over N days" rather than a delta, because there is no
 * honest previous period for a hand-picked window. A period with nothing before
 * it gets "no reading before this" for the same reason: a percentage against
 * zero is arithmetic, not information.
 */
function deltaLine(period: Period, deltaPercent: number | undefined): string {
  if (period.scope === 'custom') {
    const days = spanDays(period)
    return `over ${days} day${days === 1 ? '' : 's'}`
  }

  const against =
    period.scope === 'day'
      ? 'yesterday'
      : period.scope === 'week'
        ? 'last week'
        : period.scope === 'month'
          ? 'last month'
          : 'last year'

  if (deltaPercent === undefined) return `nothing read ${against}`
  return `${deltaPercent >= 0 ? '↑' : '↓'} ${Math.abs(deltaPercent)}% vs ${against}`
}

function chartSuffix(period: Period): string {
  switch (period.scope) {
    case 'day':
      return 'today'
    case 'week':
      return 'this week'
    case 'month':
      return MONTHS_LONG[period.start.getMonth()]
    case 'year':
      return String(period.start.getFullYear())
    case 'custom':
      return `${dayLabel(period.start)}–${dayLabel(period.end)}`
  }
}
