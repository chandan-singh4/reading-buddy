import { useState } from 'react'

import { Portal } from '../app/Portal.tsx'
import { startOfDay } from './period.ts'
import styles from './stats.module.css'

/**
 * A one-month range picker for the Custom scope.
 *
 * ## The window is [tracking start, today], and it is enforced twice
 *
 * A day outside it is disabled, *and* the month arrows stop once they would
 * leave it. Disabling only the days would let a reader page back to 2019 and
 * find an entire month greyed out, which reads as a broken calendar rather than
 * as a boundary. Both walls are the same fact stated at two zoom levels.
 *
 * Before any reading has been recorded there is no window at all. The button
 * that opens this is disabled in that case, so this never renders empty.
 *
 * ## Two taps make a range, one tap makes a day
 *
 * First tap sets the start and clears the end. Second tap sets the end, unless
 * it lands before the start — then it becomes the new start, because a reader
 * who taps backwards is correcting themselves, not asking for a reversed range.
 * Apply with only a start selected means that single day.
 */

const MONTH_NAMES = [
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

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Months since year zero — the only sane way to compare two month boxes. */
const monthKey = (d: Date): number => d.getFullYear() * 12 + d.getMonth()

export default function RangeCalendar({
  trackingStart,
  today,
  onApply,
  onCancel,
}: {
  trackingStart: Date
  today: Date
  onApply: (start: Date, end: Date) => void
  onCancel: () => void
}) {
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [start, setStart] = useState<Date | undefined>()
  const [end, setEnd] = useState<Date | undefined>()

  const floor = startOfDay(trackingStart)
  const ceiling = startOfDay(today)

  const pick = (date: Date): void => {
    if (start === undefined || end !== undefined) {
      setStart(date)
      setEnd(undefined)
    } else if (date >= start) {
      setEnd(date)
    } else {
      setStart(date)
      setEnd(undefined)
    }
  }

  const firstWeekday = new Date(view.getFullYear(), view.getMonth(), 1).getDay()
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()

  return (
    <Portal>
      {/* The backdrop dismisses, but only when the tap is the backdrop itself —
          a tap that started inside the card and drifted out must not close it. */}
      <div
        className={styles.backdrop}
        onClick={(event) => {
          if (event.target === event.currentTarget) onCancel()
        }}
      >
        <div className={styles.cal} role="dialog" aria-modal="true" aria-label="Pick a date range">
          <div className={styles.calHead}>
            <button
              type="button"
              className={styles.nav}
              aria-label="Previous month"
              disabled={monthKey(view) <= monthKey(floor)}
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            >
              ‹
            </button>
            <div className={styles.calMonth}>
              {MONTH_NAMES[view.getMonth()]} {view.getFullYear()}
            </div>
            <button
              type="button"
              className={styles.nav}
              aria-label="Next month"
              disabled={monthKey(view) >= monthKey(ceiling)}
              onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            >
              ›
            </button>
          </div>

          <div className={styles.calHint}>
            Tracking began {SHORT[floor.getMonth()]} {floor.getDate()}, {floor.getFullYear()}.
          </div>

          <div className={styles.dow} aria-hidden="true">
            <span>S</span>
            <span>M</span>
            <span>T</span>
            <span>W</span>
            <span>T</span>
            <span>F</span>
            <span>S</span>
          </div>

          <div className={styles.calGrid}>
            {Array.from({ length: firstWeekday }, (_, i) => (
              <div className={`${styles.day} ${styles.dayEmpty}`} key={`pad-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => {
              const date = new Date(view.getFullYear(), view.getMonth(), i + 1)
              const outside = date < floor || date > ceiling
              const isEnd =
                (start !== undefined && +date === +start) || (end !== undefined && +date === +end)
              const inside =
                start !== undefined && end !== undefined && date >= start && date <= end

              return (
                <button
                  type="button"
                  key={date.toDateString()}
                  disabled={outside}
                  className={[
                    styles.day,
                    inside ? styles.inRange : '',
                    isEnd ? styles.dayEnd : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => pick(date)}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>

          <div className={styles.calActions}>
            <button type="button" className={styles.calCancel} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.calApply}
              disabled={start === undefined}
              onClick={() => {
                if (start !== undefined) onApply(start, end ?? start)
              }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
