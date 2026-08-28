import { useState } from 'react'

import { currentBucket } from './period.ts'
import type { ChartPoint } from './gather.ts'
import styles from './stats.module.css'

/**
 * Books read and time read, on one set of axes with two scales.
 *
 * ## Why two axes and not two charts
 *
 * The question the card answers is "did the hours turn into books?", and that
 * is a question about the *shape* of two lines against each other. On separate
 * charts it becomes an exercise in reading two pictures and holding one in your
 * head, which on a phone nobody does.
 *
 * The cost of a dual axis is the usual one: the crossing point of the two lines
 * means nothing, because the scales are arbitrary. That is why each series owns
 * its own side and its own colour, and why the gridlines belong to exactly one
 * of them at a time (below).
 *
 * ## Hiding a series hides its axis
 *
 * Books own the left axis and the gridlines; time owns the right. Turn books
 * off and the gridlines move to time's scale, so the horizontal lines on screen
 * always mean *something* you can still see. Leaving books' gridlines behind
 * would draw a grid for a line that is not there.
 *
 * The last visible series cannot be hidden. An empty chart with a legend is a
 * dead end the reader has to guess their way out of.
 *
 * Drawn as SVG by hand rather than through a chart library: it is two
 * polylines, and the app carries no charting dependency for this one screen.
 */

const GREEN = '#3F5A38'
const AMBER = '#C77D3A'
const RULE = '#E2D6BD'
const FAINT = '#9A9184'
const AXIS = '#B7A98C'
const INK = '#33302A'

const WIDTH = 340
const HEIGHT = 210
const PAD_L = 26
const PAD_R = 30
const PAD_T = 14
const PAD_B = 44

export default function BooksTimeChart({
  points,
  suffix,
  now,
}: {
  points: readonly ChartPoint[]
  /** What the summary line says the period is — "this week", "August". */
  suffix: string
  now: Date
}) {
  const [showBooks, setShowBooks] = useState(true)
  const [showTime, setShowTime] = useState(true)

  const n = points.length
  const plotW = WIDTH - PAD_L - PAD_R
  const plotH = HEIGHT - PAD_T - PAD_B

  // Both scales start at 1 rather than 0 so an empty period draws a flat line on
  // a readable axis instead of dividing by zero.
  const maxBooks = Math.max(1, ...points.map((p) => p.books))
  const maxHours = Math.max(1, Math.ceil(Math.max(1, ...points.map((p) => p.minutes)) / 60))

  const x = (i: number): number => (n > 1 ? PAD_L + i * (plotW / (n - 1)) : PAD_L + plotW / 2)
  const yBooks = (v: number): number => PAD_T + plotH - (v / maxBooks) * plotH
  const yHours = (minutes: number): number =>
    PAD_T + plotH - (minutes / 60 / maxHours) * plotH

  const here = currentBucket(points, now)
  // Dots on every point only while they are far enough apart to be dots rather
  // than a thick line. Past that, only the bucket the reader is standing in.
  const allDots = n <= 14

  const hourTicks = [0, Math.round(maxHours / 2), maxHours].filter(
    (h, i, a) => a.indexOf(h) === i,
  )

  const totalBooks = points.reduce((sum, p) => sum + p.books, 0)
  const totalHours = Math.round(points.reduce((sum, p) => sum + p.minutes, 0) / 60)

  const summary: string[] = []
  if (showBooks) summary.push(`${totalBooks} book${totalBooks === 1 ? '' : 's'}`)
  if (showTime) summary.push(`${totalHours}h`)

  return (
    <div className={styles.card}>
      <div className={styles.cardLabel}>Books &amp; time</div>

      <div className={styles.chartSub}>
        {summary.map((part, i) => (
          <span key={part}>
            {i > 0 && ' · '}
            <b>{part}</b>
          </span>
        ))}
        {` · ${suffix}`}
      </div>

      <div className={styles.legend}>
        <button
          type="button"
          className={showBooks ? undefined : styles.legendOff}
          aria-pressed={showBooks}
          // Ignored rather than disabled: a disabled legend item looks broken.
          // Tapping the only visible series should simply do nothing.
          onClick={() => (showTime ? setShowBooks(!showBooks) : undefined)}
        >
          <i style={{ background: GREEN }} />
          Books read
        </button>
        <button
          type="button"
          className={showTime ? undefined : styles.legendOff}
          aria-pressed={showTime}
          onClick={() => (showBooks ? setShowTime(!showTime) : undefined)}
        >
          <i style={{ background: AMBER }} />
          Time read
        </button>
      </div>

      <div className={styles.chart}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          xmlns="http://www.w3.org/2000/svg"
          fontFamily="EB Garamond, Georgia, serif"
          role="img"
          aria-label={`Books read and time read, ${suffix}`}
        >
          {/* Gridlines belong to whichever series is on the left. */}
          {showBooks
            ? Array.from({ length: maxBooks + 1 }, (_, b) => (
                <g key={b}>
                  <line x1={PAD_L} y1={yBooks(b)} x2={PAD_L + plotW} y2={yBooks(b)} stroke={RULE} />
                  <text
                    x={PAD_L - 6}
                    y={yBooks(b) + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill={FAINT}
                  >
                    {b}
                  </text>
                </g>
              ))
            : hourTicks.map((h) => (
                <line
                  key={h}
                  x1={PAD_L}
                  y1={yHours(h * 60)}
                  x2={PAD_L + plotW}
                  y2={yHours(h * 60)}
                  stroke={RULE}
                />
              ))}

          {showBooks && (
            <text x={PAD_L - 6} y={PAD_T - 4} textAnchor="end" fontSize="10" fill={AXIS}>
              bks
            </text>
          )}

          {showTime && (
            <>
              {hourTicks.map((h) => (
                <text
                  key={h}
                  x={PAD_L + plotW + 6}
                  y={yHours(h * 60) + 4}
                  textAnchor="start"
                  fontSize="11"
                  fill={FAINT}
                >
                  {h}
                </text>
              ))}
              <text x={PAD_L + plotW + 6} y={PAD_T - 4} fontSize="10" fill={AXIS}>
                hrs
              </text>
            </>
          )}

          {showTime && (
            <polyline
              points={points.map((p, i) => `${x(i)},${yHours(p.minutes)}`).join(' ')}
              fill="none"
              stroke={AMBER}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          )}

          {showBooks && (
            <polyline
              points={points.map((p, i) => `${x(i)},${yBooks(p.books)}`).join(' ')}
              fill="none"
              stroke={GREEN}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          )}

          {showTime &&
            points.map((p, i) =>
              allDots || i === here ? (
                <circle
                  key={p.from}
                  cx={x(i)}
                  cy={yHours(p.minutes)}
                  r={i === here ? 4.5 : 3}
                  fill={AMBER}
                />
              ) : null,
            )}

          {showBooks &&
            points.map((p, i) =>
              allDots || i === here ? (
                <g key={p.from}>
                  <circle cx={x(i)} cy={yBooks(p.books)} r={i === here ? 4.5 : 3} fill={GREEN} />
                  {i === here && (
                    <circle
                      cx={x(i)}
                      cy={yBooks(p.books)}
                      r="7"
                      fill="none"
                      stroke={GREEN}
                      strokeWidth="1.2"
                      opacity="0.5"
                    />
                  )}
                </g>
              ) : null,
            )}

          {/* Labels thin out to roughly seven, and the bucket the reader is in
              is always one of them, in ink rather than grey. */}
          {points.map((p, i) => {
            const step = Math.max(1, Math.ceil(n / 7))
            if (i % step !== 0 && i !== n - 1 && i !== here) return null
            const xx = x(i)
            const yy = HEIGHT - PAD_B + 16
            return (
              <text
                key={p.from}
                x={xx}
                y={yy}
                fontSize="10.5"
                fill={i === here ? INK : FAINT}
                fontWeight={i === here ? '600' : '400'}
                textAnchor="end"
                transform={`rotate(-42 ${xx} ${yy})`}
              >
                {p.label}
              </text>
            )
          })}
        </svg>
      </div>

      <div className={styles.cap}>Follows the filter above.</div>
    </div>
  )
}
