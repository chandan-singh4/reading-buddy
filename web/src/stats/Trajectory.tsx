import { daysBetween } from './period.ts'
import type { Trajectory } from './trajectory.ts'
import styles from './trajectory.module.css'

/**
 * The pacing card at the foot of a book's details.
 *
 * It answers one question — "when will I finish this?" — from two measured
 * facts: the minutes logged and how far through the book the position says the
 * reader is. The minutes are reading minutes: time spent talking to Veda is
 * taken out first, because it advances no percentage and would make the book
 * look slower than it is. See `trajectory.ts` for the arithmetic and for the one assumption
 * the drawn curve makes.
 *
 * The card is deliberately quiet about the past and clear about the future. The
 * solid line is effort already spent; the dashed one is a projection, and it is
 * drawn as a projection so it is never mistaken for a record.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `Sep 5`. */
function shortDate(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** `4h 18m`, or `47m`. */
function spell(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/* The drawing box. Room at the top for the 100% line and at the foot for the
   day labels, which sit outside the plot rather than crowding it. */
const LEFT = 26
const RIGHT = 340
const TOP = 20
const BOTTOM = 90

export default function TrajectoryCard({ data, title }: { data: Trajectory; title: string }) {
  const spanDays = data.path.length - 1
  const finishDay = data.finishOn === undefined ? spanDays : spanDays + data.daysRemaining
  const targetDay = daysBetween(data.startedOn, data.targetOn) - 1

  // The x-axis runs to whichever comes last: the finish, or the month the
  // monthly goal allows. Neither may fall off the right-hand edge.
  const lastDay = Math.max(finishDay, targetDay, 1)

  const x = (day: number): number => LEFT + (day / lastDay) * (RIGHT - LEFT)
  const y = (percent: number): number => BOTTOM - (Math.min(percent, 100) / 100) * (BOTTOM - TOP)

  const past = data.path.map((point) => `${x(point.day)},${y(point.percent)}`).join(' ')

  const finishLabel = data.finishOn === undefined ? undefined : shortDate(data.finishOn)

  return (
    <section className={styles.card} aria-labelledby="pacing-title">
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>Pacing trajectory</div>
          <h2 className={styles.title} id="pacing-title">
            {title}
          </h2>
        </div>
        <span className={`${styles.tag} ${data.calibrating ? styles.tagQuiet : ''}`}>
          {data.status}
        </span>
      </div>

      {data.calibrating ? (
        <>
          <div className={styles.bar} aria-hidden="true">
            <i style={{ width: `${Math.max(data.percent, 1)}%` }} />
          </div>
          <p className={styles.note}>
            Reading Buddy is still learning how fast you read this book. It needs about a quarter of
            an hour of reading, and 5% of the book, before a finish date is worth printing.
          </p>
          <p className={styles.sub}>
            {spell(data.minutesLogged)} logged · {Math.round(data.percent)}% read
          </p>
        </>
      ) : (
        <>
          <div className={styles.metrics}>
            <div>
              <div className={styles.value}>
                {spell(data.minutesLogged)}{' '}
                <span className={styles.unit}>/ {spell(data.estimatedTotalMinutes)}</span>
              </div>
              <div className={styles.label}>Logged ({Math.round(data.percent)}%)</div>
            </div>
            <div>
              <div className={styles.value}>
                {data.velocity} <span className={styles.unit}>m/d</span>
              </div>
              <div className={styles.label}>
                {data.velocityIsAllTime ? 'All-time pace' : '7-day pace'}
              </div>
            </div>
            <div>
              <div className={`${styles.value} ${styles.green}`}>{finishLabel ?? '—'}</div>
              <div className={styles.label}>Est. finish</div>
            </div>
          </div>

          <svg
            viewBox="0 0 360 112"
            className={styles.chart}
            role="img"
            aria-label={
              'Progress ' +
              Math.round(data.percent) +
              '%, projected to finish ' +
              (finishLabel ?? 'at an unknown date')
            }
          >
            <line x1={LEFT} y1={BOTTOM} x2={RIGHT} y2={BOTTOM} className={styles.axis} />
            <line x1={LEFT} y1={TOP} x2={RIGHT} y2={TOP} className={styles.axisTop} />
            <text x={LEFT - 6} y={TOP + 4} className={styles.tick} textAnchor="end">
              100%
            </text>
            <text x={LEFT - 6} y={BOTTOM + 3} className={styles.tick} textAnchor="end">
              0%
            </text>

            {/* A book a month, the monthly goal drawn as a line. It is a
                reference, not a demand — hence the faintest ink on the card. */}
            <line x1={x(0)} y1={y(0)} x2={x(targetDay)} y2={y(100)} className={styles.ideal} />

            <polyline points={past} className={styles.pastLine} />

            {data.finishOn !== undefined && (
              <line
                x1={x(spanDays)}
                y1={y(data.percent)}
                x2={x(finishDay)}
                y2={y(100)}
                className={styles.future}
              />
            )}

            <circle cx={x(0)} cy={y(0)} r="3" className={styles.nodeStart} />
            <circle cx={x(spanDays)} cy={y(data.percent)} r="4.5" className={styles.nodeNow} />
            {data.finishOn !== undefined && (
              <circle cx={x(finishDay)} cy={y(100)} r="4.5" className={styles.nodeEnd} />
            )}

            {/* Dropped when "Today" would sit on top of it — which happens
                early in a book, where the two nodes are days apart. */}
            {spanDays > lastDay / 5 && (
              <text x={x(0)} y={106} className={styles.xLabel}>
                {shortDate(data.startedOn)}
              </text>
            )}
            <text x={x(spanDays)} y={106} className={styles.xNow} textAnchor="middle">
              Today ({Math.round(data.percent)}%)
            </text>
            {/* Dropped when it would sit on top of "Today" — two labels in one
                place is worse than one label missing. */}
            {finishLabel !== undefined && finishDay - spanDays > lastDay / 6 && (
              <text x={x(finishDay)} y={106} className={styles.xEnd} textAnchor="end">
                {finishLabel}
              </text>
            )}
          </svg>

          <div className={styles.callout}>
            <span className={styles.spark} aria-hidden="true">
              ✦
            </span>
            <span>
              {data.finishOn === undefined ? (
                <>
                  You haven’t read this one lately, so there is no pace to project from. Pick it up
                  and the finish date comes back.
                </>
              ) : (
                <>
                  At {data.velocityIsAllTime ? 'your all-time' : 'your 7-day'} pace of{' '}
                  <b>{data.velocity} min/day</b>, you will finish this book in{' '}
                  <b>
                    {data.daysRemaining} day{data.daysRemaining === 1 ? '' : 's'}
                  </b>
                  .
                </>
              )}
            </span>
          </div>

          {/* Said plainly, because the line looks like a record and is not. */}
          <p className={styles.small}>
            The curve follows the minutes you read, scaled to today’s real percentage. Reading Buddy
            doesn’t record where you were on an earlier day. Time under the lamp with Veda is left
            out of the pace — it is reading, but it turns no pages.
          </p>
        </>
      )}
    </section>
  )
}
