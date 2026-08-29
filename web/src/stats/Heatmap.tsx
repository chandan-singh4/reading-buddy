import { useEffect, useRef, useState } from 'react'

import DayLog from './DayLog.tsx'
import type { DayActivity, HeatDay } from './gather.ts'
import styles from './stats.module.css'

/**
 * A rolling twelve months, one square per day, shaded by how long you read.
 *
 * Independent of the scope toggle by design: a year of days is the one view on
 * this screen that shows a *habit* rather than a total, and slicing it to "this
 * week" would leave seven squares and no habit.
 *
 * The grid is columns of weeks, not rows of days, because that is the shape
 * that fits a phone: 53 columns scroll sideways, 53 rows would not fit at all.
 */

const CELL = 13
const GAP = 3
/** One column's full width — what the month labels are measured against. */
const COLUMN = CELL + GAP

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const LEVEL_CLASS = ['', styles.l1, styles.l2, styles.l3, styles.l4] as const

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
}: {
  days: readonly HeatDay[]
  today: string
  trackingStart: string | undefined
  /** Every day's reading, grouped by book. A tapped square opens its day. */
  log: ReadonlyMap<string, DayActivity>
}) {
  const [picked, setPicked] = useState<HeatDay | undefined>()
  const scroller = useRef<HTMLDivElement>(null)

  // Today is the point of the whole strip, and it is at the far right. Opening
  // scrolled to January would show a year of history and hide this week.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [days.length])

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

  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>Days you read</div>

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

      <div className={styles.hmLegend} aria-hidden="true">
        Less
        <span className={styles.cell} />
        <span className={`${styles.cell} ${styles.l1}`} />
        <span className={`${styles.cell} ${styles.l2}`} />
        <span className={`${styles.cell} ${styles.l3}`} />
        <span className={`${styles.cell} ${styles.l4}`} />
        More
      </div>

      <div className={styles.cap}>Rolling 12 months · shade = minutes read that day.</div>
    </div>
  )
}
