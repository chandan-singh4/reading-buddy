/**
 * The Pace Horizon: the trajectory strip, drawn instead of listed.
 *
 * The strip used to be two numbers and two labels. Both facts were true and
 * neither answered the question the reader asks at the front door, which is not
 * "how fast am I reading?" but "is this going anywhere?" A number cannot show a
 * slump; a line can.
 *
 * ## It draws what the big chart draws
 *
 * This is a small copy of the pacing card on a book's details page, not a
 * second opinion. Both plot the same axes from the same `Trajectory`: days
 * across, percent of the book up. Solid where the reading happened, dashed
 * where the forecast takes over, ending where the book ends.
 *
 * The first version plotted minutes-per-day instead — a wave that rose and
 * fell. It was an honest picture of a different thing, and putting it next to a
 * chart that only ever climbs made the app look like it held two views about
 * one book. One question, one shape, wherever it is asked.
 *
 * ## Why the pin is not in the SVG
 *
 * The chart stretches to the card, and card width varies with the phone. An SVG
 * that stretches is an SVG whose circles turn into ellipses and whose strokes
 * thin out on one axis. So the line is drawn with `preserveAspectRatio="none"`,
 * where that distortion is invisible on a smooth curve, and the pin is an HTML
 * dot positioned over it — always round, always the same weight.
 */

import type { CSSProperties } from 'react'

import styles from './paceHorizon.module.css'

export type PaceStatus = 'ahead' | 'on_track' | 'behind'

/** One day of the past: how far through the book the reader was. */
export interface ProgressPoint {
  day: number
  percent: number
}

export interface PaceHorizonProps {
  /** The past, one point per day, ending at today. `Trajectory.path`. */
  progress: readonly ProgressPoint[]
  /** Days left at the current pace. */
  projectedDays: number
  /** Already formatted for display, e.g. `Sep 18`. */
  estimatedFinishDate: string
  /** Already formatted for display, e.g. `77m / day`. */
  pacePerDay: string
  status: PaceStatus
}

const LABELS: Record<PaceStatus, string> = {
  ahead: 'Ahead',
  on_track: 'On track',
  behind: 'Behind',
}

/*
 * The drawing grid. Only the ratios matter — the SVG is stretched to the card,
 * so these are proportions written as numbers, not pixels.
 */
const W = 100
const H = 32
/** Kept clear top and bottom so 0% and 100% are not drawn on the edge. */
const PAD = 4

/**
 * Turn a run of points into one smooth path.
 *
 * A Catmull-Rom spline converted to cubic beziers: each control point is set
 * from the slope between a point's two neighbours, which is what makes the line
 * pass *through* every day rather than near it.
 */
function smooth(points: readonly [number, number][]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0]![0]} ${points[0]![1]}`

  let d = `M ${points[0]![0]} ${points[0]![1]}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]!
    const p1 = points[i]!
    const p2 = points[i + 1]!
    const p3 = points[i + 2] ?? p2
    // A sixth of the neighbour span is the standard Catmull-Rom tension. Higher
    // and the curve overshoots a step into a loop, which on a line that only
    // climbs would draw the reader going backwards.
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(p2[0])} ${round(p2[1])}`
  }
  return d
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

export function PaceHorizon({
  progress,
  projectedDays,
  estimatedFinishDate,
  pacePerDay,
  status,
}: PaceHorizonProps) {
  // A reader on their first day has one point, which is a dot and not a line.
  // Treat it as a start at nothing, so there is always something to draw from.
  const path = progress.length > 0 ? progress : [{ day: 0, percent: 0 }]
  const today = path[path.length - 1]!
  // The axis runs from the first session to the forecast finish, so where the
  // solid line stops *is* how far through the book's whole life the reader is.
  const lastDay = Math.max(today.day + projectedDays, 1)

  const x = (day: number): number => round((day / lastDay) * W)
  const y = (percent: number): number =>
    round(H - PAD - (Math.min(Math.max(percent, 0), 100) / 100) * (H - PAD * 2))

  const points = path.map((point) => [x(point.day), y(point.percent)] as [number, number])
  const past = smooth(points)
  const here = points[points.length - 1]!
  const endY = y(100)
  // One control point, not two: the guess is a single easing from where you are
  // to the end of the book. A wavier projection would invent detail.
  const projection = `M ${here[0]} ${here[1]} C ${round((here[0] + W) / 2)} ${here[1]}, ${round((here[0] + W) / 2)} ${endY}, ${W} ${endY}`
  const area = `${past} L ${here[0]} ${H} L ${points[0]![0]} ${H} Z`

  // The pin rides the chart's own box, so it stays on the line's end at any
  // width. Percent of the viewBox height, because the box is what stretches.
  const pinStyle = { '--pin-y': `${(endY / H) * 100}%` } as CSSProperties

  return (
    <div className={styles.horizon}>
      <div className={styles.head}>
        <span className={styles.kicker}>Trajectory</span>
        <span className={`${styles.badge} ${styles[status]}`}>{LABELS[status]}</span>
      </div>

      {/* Decoration: every fact in it is written in words underneath. */}
      <div className={styles.chart} aria-hidden="true">
        <svg
          className={styles.svg}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          focusable="false"
        >
          <defs>
            {/* Gradient ids are global whatever the CSS module does, so this one
                is named for the component rather than hashed. */}
            <linearGradient id="paceHorizonFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--horizon-accent)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--horizon-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#paceHorizonFill)" />
          {/* `vector-effect` keeps the stroke one weight while the box stretches. */}
          <path d={past} className={styles.line} />
          <path d={projection} className={`${styles.line} ${styles.projected}`} />
        </svg>
        <span className={styles.pin} style={pinStyle} />
      </div>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <span className={styles.value}>{estimatedFinishDate}</span>
          <span className={styles.label}>Est. finish ({projectedDays}d)</span>
        </div>
        <div className={`${styles.fact} ${styles.factEnd}`}>
          <span className={`${styles.value} ${styles.rate}`}>{pacePerDay}</span>
        </div>
      </div>
    </div>
  )
}
