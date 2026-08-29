import { useEffect, useRef, useState } from 'react'

import DayLog from './DayLog.tsx'
import type { DayActivity, HeatDay } from './gather.ts'
import styles from './stats.module.css'

/**
 * One calendar year, one square per day, shaded by how long you read.
 *
 * Independent of the scope toggle by design: a year of days is the one view on
 * this screen that shows a *habit* rather than a total, and slicing it to "this
 * week" would leave seven squares and no habit. The year picker at the top
 * right is its own control for that reason — it moves this card and nothing
 * else on the screen.
 *
 * The grid is columns of weeks, not rows of days, because that is the shape
 * that fits a phone: 53 columns scroll sideways, 53 rows would not fit at all.
 *
 * ## Two sizes
 *
 * It opens as one week: seven squares, no scrolling, no controls. That is the
 * answer to "how am I doing?", and it costs the screen one line instead of a
 * third of it. Tapping it opens the year, with the picker and the key.
 *
 * Collapsing again keeps the reader's place. If a day is selected, the strip
 * shows *that* day's week rather than snapping back to this one — the year is
 * a way to travel, and a card should not undo the journey when it shrinks.
 */

const CELL = 13
const GAP = 3
/** One column's full width — what the month labels are measured against. */
const COLUMN = CELL + GAP

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const LEVEL_CLASS = ['', styles.l1, styles.l2, styles.l3, styles.l4] as const

/** Monday first, to match the grid's own rows. */
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** `2026-08-28` to `Aug 28` without going near a timezone. */
function label(day: string): string {
  const [, month, date] = day.split('-')
  return `${MONTHS[Number(month) - 1]} ${Number(date)}`
}

export default function Heatmap({
  days,
  today,
  trackingStart,
  log,
  year,
  years,
  onYear,
  weekFor,
}: {
  days: readonly HeatDay[]
  today: string
  trackingStart: string | undefined
  /** Every day's reading, grouped by book. A tapped square opens its day. */
  log: ReadonlyMap<string, DayActivity>
  year: number
  /** Every year there is anything to show, newest first. */
  years: readonly number[]
  onYear: (year: number) => void
  /** The seven days around a chosen day, or around today when none is chosen. */
  weekFor: (anchor: string | undefined) => readonly HeatDay[]
}) {
  const [picked, setPicked] = useState<HeatDay | undefined>()
  const [open, setOpen] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  /*
   * The current year opens scrolled to today, which is near the right. A past
   * year opens at January, because all of it is behind us and the beginning is
   * where a finished year is read from.
   */
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollLeft = today.startsWith(String(year)) ? el.scrollWidth : 0
    // `open` is a dependency because the scroller does not exist while the card
    // is collapsed: the year has to find today the moment it is unfolded.
  }, [days.length, year, today, open])

  // The picked day belongs to the year that was on screen when it was tapped.
  useEffect(() => setPicked(undefined), [year])

  // Whole weeks, Monday at the top. `heatmapOf` guarantees the first day is a
  // Monday, so no column is ever ragged.
  const weeks: HeatDay[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

  // A month label sits over the first week that falls in it, and is exactly as
  // wide as the run of weeks it owns — so a short month cannot push the next
  // label off its own column.
  const marks: { at: number; name: string }[] = []
  let lastMonth = ''
  weeks.forEach((week, index) => {
    const month = week[0].day.slice(0, 7)
    if (month !== lastMonth) {
      marks.push({ at: index, name: MONTHS[Number(month.slice(5)) - 1] })
      lastMonth = month
    }
  })

  /*
   * The grid starts on the Monday before January 1, so the first column can
   * still belong to December. One column is too narrow for a label, and "Dec"
   * printed there collides with "Jan". The days stay; only the label goes.
   */
  if (marks.length > 1 && marks[1].at < 2) {
    marks[1].at = 0
    marks.shift()
  }

  return (
    <div className={styles.card}>
      <div className={styles.hmTop}>
        <div className={styles.cardLabel}>{open ? 'Days you read' : 'This week'}</div>
        {open && (
          <>
            {/* A native select: on a phone this is the system's own year wheel,
                which is better than anything drawn here and already accessible. */}
            <select
              className={styles.hmYear}
              aria-label="Year"
              value={year}
              onChange={(event) => onYear(Number(event.target.value))}
            >
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.hmFold}
              aria-label="Show this week only"
              aria-expanded={true}
              onClick={() => setOpen(false)}
            >
              ⌃
            </button>
          </>
        )}
      </div>

      {!open && (
        <button
          type="button"
          className={styles.hmWeekStrip}
          aria-label="Show the whole year"
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          {weekFor(picked?.day).map((day, i) => (
            <span className={styles.hmWeekDay} key={day.day}>
              <span className={styles.hmDow} aria-hidden="true">
                {DOW[i]}
              </span>
              <span
                className={[
                  styles.cell,
                  LEVEL_CLASS[day.level],
                  day.day > today ? styles.ahead : '',
                  picked?.day === day.day ? styles.cellOn : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            </span>
          ))}
        </button>
      )}

      {open && (
        <>
      <div className={styles.hmScroll} ref={scroller}>
        <div className={styles.hmGrid}>
          <div className={styles.hmMonths} aria-hidden="true">
            {marks.map((mark, i) => (
              <span
                key={mark.at}
                style={{ width: ((marks[i + 1]?.at ?? weeks.length) - mark.at) * COLUMN }}
              >
                {mark.name}
              </span>
            ))}
          </div>

          <div className={styles.hmBody}>
            {/* Only three of the seven are labelled, as the reference has it —
                seven stacked labels at 10px is noise, not a key. */}
            <div className={styles.hmDays} aria-hidden="true">
              <span>Mon</span>
              <span />
              <span>Wed</span>
              <span />
              <span>Fri</span>
              <span />
              <span />
            </div>

            <div className={styles.hmWeeks}>
              {weeks.map((week) => (
                <div className={styles.hmWeek} key={week[0].day}>
                  {week.map((day) => {
                    const ahead = day.day > today
                    const untracked = trackingStart === undefined || day.day < trackingStart
                    const className = [
                      styles.cell,
                      LEVEL_CLASS[day.level],
                      ahead ? styles.ahead : '',
                      !ahead && untracked ? styles.untracked : '',
                      picked?.day === day.day ? styles.cellOn : '',
                    ]
                      .filter(Boolean)
                      .join(' ')

                    return (
                      <button
                        type="button"
                        key={day.day}
                        className={className}
                        disabled={ahead || untracked}
                        aria-label={`${label(day.day)}, ${day.minutes} minutes`}
                        onClick={() => setPicked(day)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Directly under the grid it explains. It used to sit after the day's
          log, so tapping a square pushed the key hundreds of pixels away from
          the squares whose colours it was there to name. */}
      <div className={styles.hmLegend} aria-hidden="true">
        Less
        <span className={styles.cell} />
        <span className={`${styles.cell} ${styles.l1}`} />
        <span className={`${styles.cell} ${styles.l2}`} />
        <span className={`${styles.cell} ${styles.l3}`} />
        <span className={`${styles.cell} ${styles.l4}`} />
        More
      </div>

      <div className={styles.cap}>Shade = minutes read that day.</div>
        </>
      )}

      {/* `aria-live` because the tip is the only place a tapped square reports
          itself, and a tap that says nothing aloud is a tap that did nothing. */}
      <div className={styles.hmTip} aria-live="polite">
        {picked === undefined ? (
          'Tap a square to see that day.'
        ) : (
          <>
            <b>{label(picked.day)}</b>
            {picked.minutes > 0 ? ` — ${picked.minutes} min of reading` : ' — no reading'}
          </>
        )}
      </div>

      {/* The day itself, told as a commit log — the reader's own analogy. It
          sits outside the tip because the tip is one live line for a screen
          reader, and a whole day announced on every tap is not a tip. */}
      {picked !== undefined && <DayLog day={log.get(picked.day)} />}

    </div>
  )
}
